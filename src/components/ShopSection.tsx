import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, Image as ImageIcon, PackageCheck, PackageX, Plus, RefreshCw, Save, Shirt, Trash2, X } from 'lucide-react';
import { ExchangeSettings, ProductCategory, ProductItem, RateMode, ShopOrderRecord } from '../types';
import { getRateForMode } from '../validation';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  membresias: 'Membresías',
  agua_hidratacion: 'Agua e Hidratación',
  jugos_saludables: 'Jugos Saludables',
  alimentos: 'Alimentos Saludables',
  ropa_deportiva: 'Pago de Ropa (Gestor de Pagos)',
};

export const RATE_MODE_LABELS: Record<RateMode, string> = {
  auto_bcv: 'Dólar BCV',
  auto_euro: 'Euro BCV',
  manual: 'Tasa Manual',
};

interface ShopSectionProps {
  products: ProductItem[];
  settings: ExchangeSettings;
  shopOrders?: ShopOrderRecord[];
  onApproveShopOrder?: (order: ShopOrderRecord) => Promise<void>;
  onRejectShopOrder?: (orderId: string) => Promise<void>;
  onCreateClothesPayment?: (payload: {
    phone: string;
    clothesDescription: string;
    operationRef: string;
    amountBs: number;
    receiptImageUrl?: string;
  }) => Promise<void>;
  onPreviewReceipt?: (data: {
    imageUrl: string;
    title: string;
    phone: string;
    operationRef: string;
    scannedBs?: number;
    expectedBs?: number;
  }) => void;
  onSaveProductPrices: (updatedProduct: ProductItem, silent?: boolean) => Promise<void>;
  onSaveAllDraftPrices: (updatedProducts: ProductItem[]) => Promise<void>;
  onSaveSettings?: (nextSettings: ExchangeSettings, silent?: boolean) => Promise<void>;
  onCreateProduct: (prod: {
    name: string;
    category: ProductCategory;
    description: string;
    basePriceUsd: number;
    priceBs: number;
    rateMode: RateMode;
    isCustomBs: boolean;
    stock: number;
    available?: boolean;
  }) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onDeleteAllProductsDatabase?: () => Promise<void>;
}

interface ProductDraft {
  usd: string;
  bs: string;
  rateMode: RateMode;
  dirty: boolean;
}

export const ShopSection: React.FC<ShopSectionProps> = ({
  products,
  settings,
  shopOrders = [],
  onApproveShopOrder,
  onRejectShopOrder,
  onCreateClothesPayment,
  onPreviewReceipt,
  onSaveProductPrices,
  onSaveAllDraftPrices,
  onSaveSettings,
  onCreateProduct,
  onDeleteProduct,
  onDeleteAllProductsDatabase,
}) => {
  const [shopCategoryFilter, setShopCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [confirmClearAllProducts, setConfirmClearAllProducts] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Open Catalog Clothes Payment Manager state (no price, no stock, no product name)
  const [clothesPhone, setClothesPhone] = useState<string>('+58 412-');
  const [clothesPaidWhat, setClothesPaidWhat] = useState<string>('');
  const [clothesRef, setClothesRef] = useState<string>('');
  const [clothesAmountBs, setClothesAmountBs] = useState<string>('');
  const [clothesReceiptUrl, setClothesReceiptUrl] = useState<string>('');
  const [clothesScanning, setClothesScanning] = useState<boolean>(false);

  const clothesPayments = shopOrders.filter((o) => o.categoryGroup === 'ropa');
  const pendingClothesPayments = clothesPayments.filter((o) => o.status === 'pending_approval');
  const confirmedClothesPayments = clothesPayments.filter((o) => o.status === 'confirmed');

  // Shared Membership & Registration (Inscripción Vitalicia) state tied to the same rate
  const [sharedMemRateMode, setSharedMemRateMode] = useState<RateMode>(settings.mode || 'auto_bcv');
  const [memUsdInput, setMemUsdInput] = useState<string>(
    (settings.membershipMonthlyUsd || 30).toFixed(2)
  );
  const [memBsInput, setMemBsInput] = useState<string>(
    (settings.membershipMonthlyBs || 30 * settings.activeRate).toFixed(2)
  );
  const [regUsdInput, setRegUsdInput] = useState<string>(
    (settings.registrationUsd ?? 15).toFixed(2)
  );
  const [regBsInput, setRegBsInput] = useState<string>(
    (
      settings.registrationBs ??
      Number(((settings.registrationUsd ?? 15) * settings.activeRate).toFixed(2))
    ).toFixed(2)
  );

  useEffect(() => {
    const mode = settings.mode || 'auto_bcv';
    const rate = getRateForMode(mode, settings);
    setSharedMemRateMode(mode);
    setMemUsdInput((settings.membershipMonthlyUsd || 30).toFixed(2));
    setMemBsInput(
      (
        settings.membershipMonthlyBs ||
        Number(((settings.membershipMonthlyUsd || 30) * rate).toFixed(2))
      ).toFixed(2)
    );
    const rUsd = settings.registrationUsd ?? 15;
    setRegUsdInput(rUsd.toFixed(2));
    setRegBsInput(
      (settings.registrationBs ?? Number((rUsd * rate).toFixed(2))).toFixed(2)
    );
  }, [
    settings.mode,
    settings.activeRate,
    settings.bcvRate,
    settings.euroRate,
    settings.manualRate,
    settings.membershipMonthlyUsd,
    settings.membershipMonthlyBs,
    settings.registrationUsd,
    settings.registrationBs,
  ]);

  const handleApplySharedGymPlansRate = async (
    overrideMode?: RateMode,
    overrideMemUsd?: string,
    overrideRegUsd?: string,
    silent = false
  ) => {
    const modeToUse = overrideMode || sharedMemRateMode;
    const rate = getRateForMode(modeToUse, settings);
    const cleanMemUsd = Math.max(0.01, Number(overrideMemUsd ?? memUsdInput) || 30);
    const cleanRegUsd = Math.max(0.01, Number(overrideRegUsd ?? regUsdInput) || 15);
    const nextMemBs = Number((cleanMemUsd * rate).toFixed(2));
    const nextRegBs = Number((cleanRegUsd * rate).toFixed(2));

    setSharedMemRateMode(modeToUse);
    setMemBsInput(nextMemBs.toFixed(2));
    setRegBsInput(nextRegBs.toFixed(2));

    if (onSaveSettings) {
      await onSaveSettings(
        {
          ...settings,
          mode: modeToUse,
          activeRate: Number(rate.toFixed(2)),
          membershipMonthlyUsd: Number(cleanMemUsd.toFixed(2)),
          membershipMonthlyBs: nextMemBs,
          registrationUsd: Number(cleanRegUsd.toFixed(2)),
          registrationBs: nextRegBs,
        },
        silent
      );
    }
  };

  useEffect(() => {
    setDrafts((prev) => {
      const nextDrafts: Record<string, ProductDraft> = {};
      products.forEach((p) => {
        const existingDraft = prev[p.id];
        const nextMode = p.rateMode || settings.mode || 'auto_bcv';
        const sameUsd =
          existingDraft &&
          Math.abs((Number(existingDraft.usd) || 0) - p.basePriceUsd) < 0.001;
        const sameBs =
          existingDraft &&
          Math.abs((Number(existingDraft.bs) || 0) - p.priceBs) < 0.001;

        nextDrafts[p.id] = {
          usd: sameUsd ? existingDraft.usd : p.basePriceUsd.toFixed(2),
          bs: sameBs ? existingDraft.bs : p.priceBs.toFixed(2),
          rateMode: nextMode,
          dirty: existingDraft ? existingDraft.dirty : false,
        };
      });
      return nextDrafts;
    });
  }, [products, settings.mode, settings.bcvRate, settings.euroRate, settings.manualRate]);

  // New product form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ProductCategory>('jugos_saludables');
  const [newDesc, setNewDesc] = useState('');
  const [newRateMode, setNewRateMode] = useState<RateMode>(settings.mode || 'auto_bcv');
  const [newUsd, setNewUsd] = useState('3.50');
  const [newBs, setNewBs] = useState(
    (3.5 * getRateForMode(settings.mode || 'auto_bcv', settings)).toFixed(2)
  );
  const [newAvailable, setNewAvailable] = useState<boolean>(true);

  // Keep new product Bs in sync if global rates change
  useEffect(() => {
    const r = getRateForMode(newRateMode, settings);
    const usdNum = Math.max(0, Number(newUsd) || 0);
    setNewBs((usdNum * r).toFixed(2));
  }, [settings.bcvRate, settings.euroRate, settings.manualRate, newRateMode]);

  const isNotEquivalent = (usdVal: number, bsVal: number, mode: RateMode) => {
    const rate = getRateForMode(mode, settings);
    const expectedBs = Number((usdVal * rate).toFixed(2));
    return Math.abs(bsVal - expectedBs) > 0.05;
  };

  // Change USD or Bs: when USD changes, automatically recalculate Bs using the product's selected tasa and auto-persist
  const handleDraftFieldChange = (
    id: string,
    field: 'usd' | 'bs',
    value: string
  ) => {
    const prod = products.find((p) => p.id === id);
    const current: ProductDraft = drafts[id] || {
      usd: prod ? prod.basePriceUsd.toFixed(2) : '0.00',
      bs: prod ? prod.priceBs.toFixed(2) : '0.00',
      rateMode: prod?.rateMode || settings.mode || 'auto_bcv',
      dirty: false,
    };

    if (field === 'usd') {
      const rate = getRateForMode(current.rateMode, settings);
      const usdNum = Math.max(0, Number(value) || 0);
      const autoBsNum = Number((usdNum * rate).toFixed(2));
      const autoBs = autoBsNum.toFixed(2);
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...current,
          usd: value,
          bs: autoBs,
          dirty: true,
        },
      }));
      if (prod && usdNum > 0) {
        onSaveProductPrices(
          {
            ...prod,
            basePriceUsd: Number(usdNum.toFixed(2)),
            priceBs: autoBsNum,
            rateMode: current.rateMode,
            isCustomBs: false,
          },
          true
        );
      }
      return;
    }

    const usdNum = Math.max(0, Number(current.usd) || 0);
    const bsNum = Math.max(0, Number(value) || 0);
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...current,
        bs: value,
        dirty: true,
      },
    }));
    if (prod && bsNum > 0) {
      onSaveProductPrices(
        {
          ...prod,
          basePriceUsd: Number(usdNum.toFixed(2)),
          priceBs: Number(bsNum.toFixed(2)),
          rateMode: current.rateMode,
          isCustomBs: isNotEquivalent(usdNum, bsNum, current.rateMode),
        },
        true
      );
    }
  };

  // When changing the "tasa" of a specific product, calculate Bs. equivalent of its CURRENT USD price and auto-save!
  const handleProductRateModeChange = async (id: string, nextMode: RateMode) => {
    const rate = getRateForMode(nextMode, settings);
    const prod = products.find((p) => p.id === id);
    const existingDraft = drafts[id];
    const usdVal = Math.max(
      0,
      Number(existingDraft ? existingDraft.usd : prod?.basePriceUsd ?? 0) || 0
    );
    const newBsVal = Number((usdVal * rate).toFixed(2));

    setDrafts((prev) => {
      const current: ProductDraft = prev[id] || {
        usd: prod ? prod.basePriceUsd.toFixed(2) : '0.00',
        bs: prod ? prod.priceBs.toFixed(2) : '0.00',
        rateMode: prod?.rateMode || 'auto_bcv',
        dirty: false,
      };
      return {
        ...prev,
        [id]: {
          ...current,
          usd: usdVal.toFixed(2),
          rateMode: nextMode,
          bs: newBsVal.toFixed(2),
          dirty: false,
        },
      };
    });

    if (prod) {
      await onSaveProductPrices({
        ...prod,
        basePriceUsd: Number(usdVal.toFixed(2)),
        priceBs: newBsVal,
        rateMode: nextMode,
        isCustomBs: false,
      });
    }
  };

  // Button to convert a single product's current USD price to Bs. using that product's chosen tasa
  const handleConvertRowToProductTasa = async (id: string) => {
    const prod = products.find((p) => p.id === id);
    const current = drafts[id];
    if (!current || !prod) return;
    const rate = getRateForMode(current.rateMode, settings);
    const usdVal = Math.max(0, Number(current.usd) || 0);
    const newBsVal = Number((usdVal * rate).toFixed(2));

    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...current,
        bs: newBsVal.toFixed(2),
        dirty: false,
      },
    }));

    await onSaveProductPrices({
      ...prod,
      basePriceUsd: Number(usdVal.toFixed(2)),
      priceBs: newBsVal,
      rateMode: current.rateMode,
      isCustomBs: false,
    });
  };

  const handleSaveSingleRow = async (prod: ProductItem) => {
    const d = drafts[prod.id];
    if (!d) return;
    const usdNum = Math.max(0, Number(d.usd) || 0);
    const bsNum = Math.max(0, Number(d.bs) || 0);
    const customBs = isNotEquivalent(usdNum, bsNum, d.rateMode);

    setDrafts((prev) => ({
      ...prev,
      [prod.id]: {
        ...d,
        usd: usdNum.toFixed(2),
        bs: bsNum.toFixed(2),
        dirty: false,
      },
    }));

    await onSaveProductPrices({
      ...prod,
      basePriceUsd: Number(usdNum.toFixed(2)),
      priceBs: Number(bsNum.toFixed(2)),
      rateMode: d.rateMode,
      isCustomBs: customBs,
    });
  };

  const handleToggleProductAvailability = async (prod: ProductItem) => {
    const d = drafts[prod.id];
    const usdNum = d ? Math.max(0, Number(d.usd) || 0) : prod.basePriceUsd;
    const bsNum = d ? Math.max(0, Number(d.bs) || 0) : prod.priceBs;
    const modeToUse = d ? d.rateMode : prod.rateMode;
    const nextAvailable = !prod.available;

    await onSaveProductPrices({
      ...prod,
      basePriceUsd: Number(usdNum.toFixed(2)),
      priceBs: Number(bsNum.toFixed(2)),
      rateMode: modeToUse,
      isCustomBs: isNotEquivalent(usdNum, bsNum, modeToUse),
      available: nextAvailable,
      stock: nextAvailable ? 10 : 0,
    });
  };

  const handleSaveAllEdited = async () => {
    const updatedList: ProductItem[] = products.map((prod) => {
      const d = drafts[prod.id];
      if (!d) return prod;
      const usdNum = Math.max(0, Number(d.usd) || 0);
      const bsNum = Math.max(0, Number(d.bs) || 0);
      return {
        ...prod,
        basePriceUsd: Number(usdNum.toFixed(2)),
        priceBs: Number(bsNum.toFixed(2)),
        rateMode: d.rateMode,
        isCustomBs: isNotEquivalent(usdNum, bsNum, d.rateMode),
      };
    });

    const clearedDrafts: Record<string, ProductDraft> = {};
    updatedList.forEach((p) => {
      clearedDrafts[p.id] = {
        usd: p.basePriceUsd.toFixed(2),
        bs: p.priceBs.toFixed(2),
        rateMode: p.rateMode,
        dirty: false,
      };
    });
    setDrafts(clearedDrafts);

    await onSaveAllDraftPrices(updatedList);
  };

  // Apply each product's selected tasa ONLY to its Bs. price (NEVER overwrites edited USD prices!)
  const handleApplyEachProductTasaToBs = async () => {
    const updatedList: ProductItem[] = products.map((prod) => {
      const d = drafts[prod.id];
      const currentUsd = d ? Math.max(0, Number(d.usd) || 0) : prod.basePriceUsd;
      const modeToUse: RateMode = d ? d.rateMode : prod.rateMode || settings.mode;
      const rateVal = getRateForMode(modeToUse, settings);
      const nextBs = Number((currentUsd * rateVal).toFixed(2));

      return {
        ...prod,
        basePriceUsd: Number(currentUsd.toFixed(2)),
        priceBs: nextBs,
        rateMode: modeToUse,
        isCustomBs: false,
      };
    });

    const nextDrafts: Record<string, ProductDraft> = {};
    updatedList.forEach((p) => {
      nextDrafts[p.id] = {
        usd: p.basePriceUsd.toFixed(2),
        bs: p.priceBs.toFixed(2),
        rateMode: p.rateMode,
        dirty: false,
      };
    });
    setDrafts(nextDrafts);

    await onSaveAllDraftPrices(updatedList);
  };

  const filteredProducts = products.filter(
    (p) => shopCategoryFilter === 'all' || p.category === shopCategoryFilter
  );

  const anyDirty = Object.values(drafts).some((d) => d.dirty);

  return (
    <div className="space-y-6">
      {/* Top Action Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <h2 className="text-base font-semibold text-slate-900">
            Control de Precios y Disponibilidad por Producto ($ USD, Bolívares y Tasa Individual)
          </h2>
          <p className="text-xs text-slate-600">
            Cada producto (incluyendo la Membresía) puede seguir su propia tasa:{' '}
            <strong>Dólar BCV (Bs. {settings.bcvRate.toFixed(2)})</strong>,{' '}
            <strong>Euro BCV (Bs. {settings.euroRate.toFixed(2)})</strong> o{' '}
            <strong>Manual (Bs. {settings.manualRate.toFixed(2)})</strong>. Usa el botón de disponibilidad al lado de cada producto: si está en{' '}
            <strong>gris (Sin Stock)</strong>, no podrá comprarse y si alguien pregunta en el bot responderá que no hay por los momentos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleApplyEachProductTasaToBs}
            className="px-4 py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Aplicar Tasa de Cada Producto a sus Bs. (Respeta tus $)</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAllEdited}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              anyDirty
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Todos los Precios{anyDirty ? ' (Cambios pendientes)' : ''}</span>
          </button>

          {products.length > 0 && onDeleteAllProductsDatabase && (
            <button
              type="button"
              onClick={() => setConfirmClearAllProducts(true)}
              className="px-4 py-2.5 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              title="Eliminar toda la base de datos de productos (se guardará el reporte de qué se eliminó)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar Base de Datos de Productos ({products.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Official Gym Plans Card: Membership ($30) & Lifetime Registration ($15) tied to the SAME Rate */}
      <div className="bg-white border-2 border-emerald-200 rounded-xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
              Misma Tasa Sincronizada (Mensualidad + Inscripción Vitalicia)
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Tarifas Oficiales de Membresía Mensual e Inscripción (Vitalicia / De por vida)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              La <strong>Inscripción</strong> se paga una sola vez de por vida (vitalicia) y es requisito para pedir membresía. Ambos precios están vinculados a la misma tasa y puedes cambiar su valor aquí o en Configuración.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-700">Tasa Compartida:</span>
              <select
                value={sharedMemRateMode}
                onChange={(e) => {
                  const nextM = e.target.value as RateMode;
                  handleApplySharedGymPlansRate(nextM, memUsdInput, regUsdInput, false);
                }}
                className="px-2.5 py-1 text-xs font-bold border border-emerald-300 rounded bg-white text-emerald-950 cursor-pointer"
              >
                <option value="auto_bcv">Dólar BCV (Bs. {settings.bcvRate.toFixed(2)})</option>
                <option value="auto_euro">Euro BCV (Bs. {settings.euroRate.toFixed(2)})</option>
                <option value="manual">Tasa Manual (Bs. {settings.manualRate.toFixed(2)})</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                handleApplySharedGymPlansRate(sharedMemRateMode, memUsdInput, regUsdInput, false)
              }
              className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                Aplicar Tasa ({RATE_MODE_LABELS[sharedMemRateMode]}: Bs.{' '}
                {getRateForMode(sharedMemRateMode, settings).toFixed(2)})
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Membresía Mensual */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                1. Membresía Mensual (1 Mes)
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Renovable cada mes
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Precio en USD ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={memUsdInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMemUsdInput(val);
                    const r = getRateForMode(sharedMemRateMode, settings);
                    const nextBs = Number(((Number(val) || 0) * r).toFixed(2));
                    setMemBsInput(nextBs.toFixed(2));
                  }}
                  onBlur={() =>
                    handleApplySharedGymPlansRate(sharedMemRateMode, memUsdInput, regUsdInput, true)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Equivalente en Bs.
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={memBsInput}
                  onChange={(e) => setMemBsInput(e.target.value)}
                  onBlur={() => {
                    if (onSaveSettings) {
                      onSaveSettings(
                        {
                          ...settings,
                          membershipMonthlyUsd: Math.max(0.01, Number(memUsdInput) || 30),
                          membershipMonthlyBs: Math.max(0.01, Number(memBsInput) || 2053.5),
                        },
                        true
                      );
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-emerald-300 rounded-lg bg-emerald-50/50 text-emerald-950"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                handleApplySharedGymPlansRate(sharedMemRateMode, memUsdInput, regUsdInput, false)
              }
              className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Aplicar Tasa y Guardar Mensualidad</span>
            </button>
          </div>

          {/* 2. Inscripción Vitalicia */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                2. Inscripción (Vitalicia / De por vida)
              </span>
              <span className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                Pago único vitalicio
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Precio en USD ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={regUsdInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRegUsdInput(val);
                    const r = getRateForMode(sharedMemRateMode, settings);
                    const nextBs = Number(((Number(val) || 0) * r).toFixed(2));
                    setRegBsInput(nextBs.toFixed(2));
                  }}
                  onBlur={() =>
                    handleApplySharedGymPlansRate(sharedMemRateMode, memUsdInput, regUsdInput, true)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-amber-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Equivalente en Bs.
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={regBsInput}
                  onChange={(e) => setRegBsInput(e.target.value)}
                  onBlur={() => {
                    if (onSaveSettings) {
                      onSaveSettings(
                        {
                          ...settings,
                          registrationUsd: Math.max(0.01, Number(regUsdInput) || 15),
                          registrationBs: Math.max(0.01, Number(regBsInput) || 1026.75),
                        },
                        true
                      );
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-amber-300 rounded-lg bg-white text-amber-950"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                handleApplySharedGymPlansRate(sharedMemRateMode, memUsdInput, regUsdInput, false)
              }
              className="w-full py-1.5 px-3 bg-amber-900 hover:bg-amber-950 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Aplicar Tasa y Guardar Inscripción</span>
            </button>
          </div>

          {/* 3. Total Nuevo Ingreso (Inscripción + Mensualidad) */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between space-y-2">
            <div>
              <span className="text-xs font-bold text-emerald-950">
                Total Nuevo Ingreso (Inscripción + 1er Mes)
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                Si el cliente es nuevo, paga Inscripción + Mensualidad. Si dice que ya está inscrito, el bot le pide <strong>Nombre, Apellido y Cédula</strong> y le pregunta a un Admin para confirmar.
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-500 block">
                  Total en Dólares
                </span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  ${((Number(memUsdInput) || 0) + (Number(regUsdInput) || 0)).toFixed(2)} USD
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold uppercase text-slate-500 block">
                  Total en Bolívares
                </span>
                <span className="text-sm font-bold font-mono text-emerald-700">
                  Bs. {((Number(memBsInput) || 0) + (Number(regBsInput) || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CLOTHES PAYMENT MANAGER (NO PRICE, NO STOCK, NO FIXED PRODUCT NAME) */}
      <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-indigo-100 pb-3">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                <Shirt className="w-3.5 h-3.5 text-indigo-600" />
                <span>Gestor de Pagos de Ropa (Sin Precio, Sin Stock ni Nombre de Producto)</span>
              </span>
              {pendingClothesPayments.length > 0 && (
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-xs font-bold">
                  ⏳ {pendingClothesPayments.length} pago(s) de ropa por confirmar
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900">
              👕 Pagos de Ropa / Catálogo Abierto (Solo Gestión y Confirmación de Pagos)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Como la ropa es un catálogo completo que no tiene un precio único ni stock fijo aquí,{' '}
              <strong>no necesitas crear productos para la ropa</strong>. Cuando alguien quiere pagar ropa en el Bot de WhatsApp, el bot le indica que envíe su pago como de costumbre (a la cuenta de Mensualidad y Ropa:{' '}
              <span className="font-mono font-semibold text-slate-800">04146734866 / BDV 18318153</span>) y{' '}
              <strong>escriba qué prendas pagó</strong> para que tú lo confirmes aquí o en Aprobar Pagos.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Submit / Register a Clothes Payment without price or stock */}
          <div className="lg:col-span-5 bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                Registrar Pago de Ropa Recibido (Sin Precio ni Stock Fijo)
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Si un cliente envía su pago de ropa, solo se registra <strong>qué prendas pagó</strong> y su comprobante para confirmarlo:
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!clothesPaidWhat.trim() || !onCreateClothesPayment) return;
                await onCreateClothesPayment({
                  phone: clothesPhone.trim() || '+58 412-0000000',
                  clothesDescription: `👕 Ropa: ${clothesPaidWhat.trim()}`,
                  operationRef:
                    clothesRef.trim() ||
                    `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
                  amountBs: Number(clothesAmountBs) || 0,
                  receiptImageUrl: clothesReceiptUrl || undefined,
                });
                setClothesPaidWhat('');
                setClothesRef('');
                setClothesAmountBs('');
                setClothesReceiptUrl('');
              }}
              className="space-y-2.5"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ¿Qué ropa o prendas dice el cliente que pagó? *
                </label>
                <input
                  type="text"
                  required
                  value={clothesPaidWhat}
                  onChange={(e) => setClothesPaidWhat(e.target.value)}
                  placeholder="Ej: Conjunto deportivo negro talla M y franela blanca"
                  className="w-full px-3 py-2 text-xs border border-indigo-200 rounded-lg bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Teléfono Cliente
                  </label>
                  <input
                    type="text"
                    value={clothesPhone}
                    onChange={(e) => setClothesPhone(e.target.value)}
                    placeholder="+58 412-1234567"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Referencia / Operación
                  </label>
                  <input
                    type="text"
                    value={clothesRef}
                    onChange={(e) => setClothesRef(e.target.value)}
                    placeholder="Ej: 007583657705"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Monto en Comprobante (Bs)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={clothesAmountBs}
                    onChange={(e) => setClothesAmountBs(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>
                    {clothesScanning
                      ? 'Escaneando captura...'
                      : clothesReceiptUrl
                      ? 'Captura cargada ✓'
                      : 'Subir Captura (Opcional)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                        if (!dataUrl) return;
                        setClothesReceiptUrl(dataUrl);
                        setClothesScanning(true);
                        try {
                          const res = await fetch('/api/bot/scan-receipt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              imageBase64DataUrl: dataUrl,
                              captionText: clothesPaidWhat,
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            if (data?.scanned?.operationNumber && !clothesRef) {
                              setClothesRef(data.scanned.operationNumber);
                            }
                            if (
                              typeof data?.scanned?.amountBs === 'number' &&
                              data.scanned.amountBs > 0 &&
                              !clothesAmountBs
                            ) {
                              setClothesAmountBs(data.scanned.amountBs.toFixed(2));
                            }
                          }
                        } catch {
                          // ignore scan error
                        } finally {
                          setClothesScanning(false);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>

                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Pago de Ropa para Confirmar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Clothes Payments Queue (Pending Confirmation & Confirmed) */}
          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Pagos de Ropa Recibidos ({pendingClothesPayments.length} pendientes ·{' '}
                  {confirmedClothesPayments.length} confirmados)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Revisa qué ropa declaró haber pagado el cliente y confirma su pago.
                </p>
              </div>
            </div>

            {clothesPayments.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                Aún no hay pagos de ropa registrados. Cuando un cliente envíe su pago por WhatsApp diciendo qué ropa pagó, aparecerá aquí y en Aprobar Pagos.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {clothesPayments.map((ord) => {
                  const isPending = ord.status === 'pending_approval';
                  const amountBs = ord.scannedAmountBs ?? ord.totalBs ?? 0;
                  return (
                    <div
                      key={ord.id}
                      className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                        isPending
                          ? 'bg-white border-indigo-200 shadow-2xs'
                          : 'bg-emerald-50/40 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {ord.receiptImageUrl && onPreviewReceipt && (
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewReceipt({
                                imageUrl: ord.receiptImageUrl!,
                                title: ord.itemsSummary,
                                phone: ord.phone,
                                operationRef: ord.paymentRef,
                                scannedBs: amountBs,
                                expectedBs: amountBs,
                              })
                            }
                            className="relative group shrink-0 w-12 h-14 rounded overflow-hidden border border-indigo-300 bg-slate-900 cursor-pointer"
                            title="Ver comprobante de pago de ropa"
                          >
                            <img
                              src={ord.receiptImageUrl}
                              alt="Comprobante Ropa"
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                              <Eye className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        )}
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold font-mono text-slate-900">
                              {ord.phone}
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded text-[11px] font-mono font-bold">
                              Ref: {ord.paymentRef}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isPending
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                            >
                              {isPending ? '⏳ Por Confirmar' : '✅ Confirmado'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-indigo-950">
                            ¿Qué ropa pagó?: <span className="font-semibold">{ord.itemsSummary}</span>
                          </p>
                          {amountBs > 0 && (
                            <p className="text-[11px] font-mono text-slate-600">
                              Monto en comprobante: <strong>Bs. {amountBs.toFixed(2)}</strong>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPending && onApproveShopOrder && (
                          <button
                            type="button"
                            onClick={() => onApproveShopOrder(ord)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmar Pago de Ropa</span>
                          </button>
                        )}
                        {onRejectShopOrder && (
                          <button
                            type="button"
                            onClick={() => onRejectShopOrder(ord.id)}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isPending ? 'Rechazar' : 'Eliminar'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Add New Product */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Agregar Producto a FormaGym
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Elige qué tasa sigue este producto, su disponibilidad y su precio en USD y Bolívares.
            </p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              const usdNum = Math.max(0.1, Number(newUsd) || 1);
              const bsNum = Math.max(
                0.1,
                Number(newBs) || usdNum * getRateForMode(newRateMode, settings)
              );
              await onCreateProduct({
                name: newName.trim(),
                category: newCategory,
                description: newDesc.trim() || 'Disponible en tienda FormaGym.',
                basePriceUsd: Number(usdNum.toFixed(2)),
                priceBs: Number(bsNum.toFixed(2)),
                rateMode: newRateMode,
                isCustomBs: isNotEquivalent(usdNum, bsNum, newRateMode),
                stock: newAvailable ? 10 : 0,
                available: newAvailable,
              });
              setNewName('');
              setNewDesc('');
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nombre del Producto
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Huevos / Jugo Verde / Agua Mineral"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Categoría
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="jugos_saludables">Jugos Saludables</option>
                  <option value="agua_hidratacion">Agua e Hidratación</option>
                  <option value="alimentos">Comida / Alimentos</option>
                  <option value="membresias">Membresía</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tasa de este Producto
                </label>
                <select
                  value={newRateMode}
                  onChange={(e) => {
                    const m = e.target.value as RateMode;
                    setNewRateMode(m);
                    const r = getRateForMode(m, settings);
                    setNewBs(((Number(newUsd) || 0) * r).toFixed(2));
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white font-medium"
                >
                  <option value="auto_bcv">Dólar BCV (Bs. {settings.bcvRate.toFixed(2)})</option>
                  <option value="auto_euro">Euro BCV (Bs. {settings.euroRate.toFixed(2)})</option>
                  <option value="manual">Manual (Bs. {settings.manualRate.toFixed(2)})</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio en USD ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newUsd}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewUsd(val);
                    const r = getRateForMode(newRateMode, settings);
                    setNewBs(((Number(val) || 0) * r).toFixed(2));
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio en Bolívares (Bs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newBs}
                  onChange={(e) => setNewBs(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  const r = getRateForMode(newRateMode, settings);
                  setNewBs(((Number(newUsd) || 0) * r).toFixed(2));
                }}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Aplicar Cambio de Tasa ({RATE_MODE_LABELS[newRateMode]}: Bs.{' '}
                  {getRateForMode(newRateMode, settings).toFixed(2)})
                </span>
              </button>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {isNotEquivalent(Number(newUsd) || 0, Number(newBs) || 0, newRateMode)
                  ? 'Precio Bs. personalizado'
                  : `Sincronizado: $${(Number(newUsd) || 0).toFixed(2)} × Bs. ${getRateForMode(
                      newRateMode,
                      settings
                    ).toFixed(2)} = Bs. ${newBs}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Disponibilidad inicial
                </label>
                <button
                  type="button"
                  onClick={() => setNewAvailable((v) => !v)}
                  className={`w-full px-3 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    newAvailable
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {newAvailable ? (
                    <>
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Con Stock</span>
                    </>
                  ) : (
                    <>
                      <PackageX className="w-3.5 h-3.5" />
                      <span>Sin Stock (Gris)</span>
                    </>
                  )}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descripción (Opcional)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detalles..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Producto</span>
            </button>
          </form>
        </div>

        {/* Right: Editable Products Table with Per-Product Rate Mode & Gray Out-Of-Stock Toggle */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            <button
              onClick={() => setShopCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                shopCategoryFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({products.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setShopCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  shopCategoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-2">Disponibilidad</th>
                  <th className="py-3 px-2">Producto / Destino</th>
                  <th className="py-3 px-2">Tasa de este Producto</th>
                  <th className="py-3 px-2">Precio USD ($)</th>
                  <th className="py-3 px-2">Precio Bolívares (Bs.)</th>
                  <th className="py-3 px-2">Estado / Calcular Bs.</th>
                  <th className="py-3 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((prod) => {
                  const d: ProductDraft = drafts[prod.id] || {
                    usd: prod.basePriceUsd.toFixed(2),
                    bs: prod.priceBs.toFixed(2),
                    rateMode: prod.rateMode || 'auto_bcv',
                    dirty: false,
                  };
                  const usdVal = Number(d.usd) || 0;
                  const bsVal = Number(d.bs) || 0;
                  const prodRate = getRateForMode(d.rateMode, settings);
                  const expectedBs = Number((usdVal * prodRate).toFixed(2));
                  const editedStatus = isNotEquivalent(usdVal, bsVal, d.rateMode);
                  const redirectPhone =
                    prod.category === 'ropa_deportiva' || prod.category === 'membresias'
                      ? settings.ownerPhoneMemberships
                      : settings.ownerPhoneConsumables;
                  const isAvailable = prod.available !== false;

                  return (
                    <tr
                      key={prod.id}
                      className={`transition-colors ${
                        isAvailable ? 'hover:bg-slate-50/80' : 'bg-slate-100/70 text-slate-500'
                      }`}
                    >
                      <td className="py-3 px-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleProductAvailability(prod)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                            isAvailable
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-300 hover:bg-slate-400 text-slate-700'
                          }`}
                          title={
                            isAvailable
                              ? 'Haz clic para poner en GRIS (Sin Stock)'
                              : 'Sin Stock — haz clic para volver a activar'
                          }
                        >
                          {isAvailable ? (
                            <>
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Disponible</span>
                            </>
                          ) : (
                            <>
                              <PackageX className="w-3.5 h-3.5" />
                              <span>Sin Stock</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-2">
                        <p
                          className={`font-semibold ${
                            isAvailable ? 'text-slate-900' : 'text-slate-500 line-through'
                          }`}
                        >
                          {prod.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {CATEGORY_LABELS[prod.category]} · Va a: {redirectPhone}
                        </p>
                      </td>
                      <td className="py-3 px-2">
                        <select
                          value={d.rateMode}
                          onChange={(e) =>
                            handleProductRateModeChange(prod.id, e.target.value as RateMode)
                          }
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-medium text-slate-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                        >
                          <option value="auto_bcv">
                            Dólar BCV ({settings.bcvRate.toFixed(2)})
                          </option>
                          <option value="auto_euro">
                            Euro BCV ({settings.euroRate.toFixed(2)})
                          </option>
                          <option value="manual">
                            Manual ({settings.manualRate.toFixed(2)})
                          </option>
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-mono">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={d.usd}
                            onChange={(e) =>
                              handleDraftFieldChange(prod.id, 'usd', e.target.value)
                            }
                            className="w-20 px-2 py-1.5 border border-slate-200 rounded font-mono tabular-nums text-slate-900 bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-mono">Bs.</span>
                          <input
                            type="number"
                            step="0.01"
                            value={d.bs}
                            onChange={(e) =>
                              handleDraftFieldChange(prod.id, 'bs', e.target.value)
                            }
                            className="w-24 px-2 py-1.5 border border-slate-200 rounded font-mono tabular-nums text-slate-900 bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => handleConvertRowToProductTasa(prod.id)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Aplicar la tasa seleccionada al precio en dólares de este producto"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>
                              Aplicar Tasa ({RATE_MODE_LABELS[d.rateMode]} = Bs.{' '}
                              {expectedBs.toFixed(2)})
                            </span>
                          </button>
                          {editedStatus ? (
                            <span className="block text-[10px] font-semibold text-amber-700">
                              Editado ($ y Bs. independientes)
                            </span>
                          ) : (
                            <span className="block text-[10px] text-slate-400 font-mono tabular-nums">
                              ${usdVal.toFixed(2)} × {prodRate.toFixed(2)} = Bs.{' '}
                              {expectedBs.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveSingleRow(prod)}
                            className={`px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                              d.dirty
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{d.dirty ? 'Guardar' : 'Guardado'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductToDelete(prod)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Eliminar producto (con confirmación de seguridad)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Secure Delete Confirmation Modal for Products */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  Confirmar Eliminación de Producto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Estás seguro de que deseas eliminar el producto{' '}
              <strong className="text-slate-900">"{productToDelete.name}"</strong> (${productToDelete.basePriceUsd.toFixed(2)} USD / Bs.{' '}
              {productToDelete.priceBs.toFixed(2)}) del catálogo? Quedará registrado en el{' '}
              <strong>Reporte de Eliminados</strong> por seguridad y podrás restaurarlo cuando quieras. Si solo no tienes inventario en este momento, puedes usar el botón{' '}
              <strong>Sin Stock (Gris)</strong> para desactivarlo temporalmente.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDeleteProduct(productToDelete.id);
                    setProductToDelete(null);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Eliminando...' : 'Sí, Eliminar (Guardar en Reporte)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Entire Product Database Modal */}
      {confirmClearAllProducts && onDeleteAllProductsDatabase && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar Base de Datos de Productos?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearAllProducts(false)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Estás seguro de que deseas eliminar los{' '}
              <strong className="text-slate-900">{products.length} productos</strong> de la base de datos? Todos los productos eliminados (con su categoría, tasa asignada y precio en $ USD y Bs.) se guardarán automáticamente en la pestaña{' '}
              <strong className="text-slate-900">Reporte Eliminados</strong> para que tengas el registro exacto de qué se eliminó y puedas restaurarlos o descargarlos en Excel/JSON.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmClearAllProducts(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDeleteAllProductsDatabase();
                    setConfirmClearAllProducts(false);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {deleting ? 'Eliminando...' : 'Sí, Eliminar Todo y Enviar al Reporte'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
