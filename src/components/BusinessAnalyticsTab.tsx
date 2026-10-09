import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,
  PackageCheck,
  PackageX,
  Search,
  ShoppingBag,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  DeletedMembershipRecord,
  DeletedProductRecord,
  DeletedShopOrderRecord,
  ExchangeSettings,
  formatSpanishDate,
  inferStartDateFromExpiry,
  MembershipRecord,
  ProductCategory,
  ProductItem,
  ShopOrderRecord,
} from '../types';

interface BusinessAnalyticsTabProps {
  memberships: MembershipRecord[];
  deletedMemberships: DeletedMembershipRecord[];
  deletedProducts?: DeletedProductRecord[];
  deletedShopOrders?: DeletedShopOrderRecord[];
  shopOrders: ShopOrderRecord[];
  products: ProductItem[];
  settings: ExchangeSettings;
  onDeleteMembershipSale?: (membershipId: string) => Promise<void>;
  onDeleteShopOrderSale?: (orderId: string) => Promise<void>;
  onDeleteAllShopOrdersDatabase?: () => Promise<void>;
  onDeleteAllProductsCatalogDatabase?: () => Promise<void>;
}

function formatBs(val: number): string {
  return val.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const BusinessAnalyticsTab: React.FC<BusinessAnalyticsTabProps> = ({
  memberships,
  deletedMemberships,
  deletedProducts = [],
  deletedShopOrders = [],
  shopOrders,
  products,
  settings,
  onDeleteMembershipSale,
  onDeleteShopOrderSale,
  onDeleteAllShopOrdersDatabase,
  onDeleteAllProductsCatalogDatabase,
}) => {
  const [salesSearch, setSalesSearch] = useState('');
  const [salesFilter, setSalesFilter] = useState<'all' | 'membership' | 'shop' | 'ropa'>('all');
  const [confirmClearModal, setConfirmClearModal] = useState<
    'shop_orders' | 'products_catalog' | null
  >(null);
  const [deletingAction, setDeletingAction] = useState(false);

  const analytics = useMemo(() => {
    const confirmedMemberships = memberships.filter((m) => m.status !== 'pending_payment');
    const pendingMemberships = memberships.filter((m) => m.status === 'pending_payment');
    const confirmedOrders = shopOrders.filter((o) => o.status === 'confirmed');
    const pendingOrders = shopOrders.filter((o) => o.status === 'pending_approval');

    // Map phone last-10 digits to registered member info so shop purchases also show the member's real name & cedula!
    const phoneToMemberMap = new Map<
      string,
      { fullName: string; cedula: string; phone: string }
    >();
    memberships.forEach((m) => {
      const digits = (m.phone || '').replace(/\D/g, '').slice(-10);
      const cleanFirst = (m.firstName || '').trim();
      const isPlaceholder =
        !cleanFirst ||
        cleanFirst.toLowerCase().startsWith('operación:') ||
        cleanFirst.toLowerCase().startsWith('operacion:') ||
        cleanFirst.toLowerCase() === 'por registrar';
      if (digits.length >= 7 && !isPlaceholder) {
        phoneToMemberMap.set(digits, {
          fullName: `${cleanFirst} ${(m.lastName || '').trim()}`.trim(),
          cedula: m.cedula || '',
          phone: m.phone,
        });
      }
    });

    // Build unified Sales Database ("What was sold and to whom")
    const salesDatabase: Array<{
      id: string;
      sourceId: string;
      type: 'membership' | 'shop' | 'ropa';
      typeLabel: string;
      whatWasSold: string;
      prepaidMonths: number;
      buyerName: string;
      buyerCedula: string;
      buyerPhone: string;
      isRegisteredMember: boolean;
      paymentRef: string;
      accountTarget: string;
      amountUsd: number;
      amountBs: number;
      dateInfo: string;
      statusLabel: string;
      isConfirmed: boolean;
    }> = [];

    memberships.forEach((m) => {
      const cleanFirst = (m.firstName || '').trim();
      const isPlaceholder =
        !cleanFirst ||
        cleanFirst.toLowerCase().startsWith('operación:') ||
        cleanFirst.toLowerCase().startsWith('operacion:') ||
        cleanFirst.toLowerCase() === 'por registrar';
      const fullName = !isPlaceholder
        ? `${cleanFirst} ${(m.lastName || '').trim()}`.trim()
        : 'Pendiente por enviar Nombre/Cédula';
      const months = Math.max(1, m.prepaidMonths || m.membershipCount || 1);
      const startStr =
        m.startDate || (m.expiresAt ? inferStartDateFromExpiry(m.expiresAt, months) : '');

      salesDatabase.push({
        id: `sale_mem_${m.id}`,
        sourceId: m.id,
        type: 'membership',
        typeLabel: 'Membresía Gimnasio',
        whatWasSold: m.planName || 'Membresía Mensual FormaGym',
        prepaidMonths: months,
        buyerName: fullName,
        buyerCedula: m.cedula || 'Sin Cédula',
        buyerPhone: m.phone || (m.paidByPhone ? `Pagado por ${m.paidByPhone}` : 'Sin teléfono'),
        isRegisteredMember: !isPlaceholder,
        paymentRef: m.paymentRef || 'MANUAL',
        accountTarget: m.paymentMethod || `Pago Móvil (${settings.ownerPhoneMemberships})`,
        amountUsd: Number(m.priceUsd || 0),
        amountBs: Number(m.totalBs || 0),
        dateInfo: startStr
          ? `Inicio: ${startStr} → Vence: ${m.expiresAt} (${formatSpanishDate(m.expiresAt)})`
          : `Vence: ${m.expiresAt} (${formatSpanishDate(m.expiresAt)})`,
        statusLabel:
          m.status === 'active'
            ? 'Activa'
            : m.status === 'awaiting_profile'
            ? 'Aprobada (Falta Perfil)'
            : m.status === 'pending_payment'
            ? 'Por Aprobar'
            : m.status === 'expiring_soon'
            ? 'Por Vencer'
            : 'Vencida',
        isConfirmed: m.status !== 'pending_payment',
      });
    });

    shopOrders.forEach((o) => {
      const digits = (o.phone || '').replace(/\D/g, '').slice(-10);
      const matchedMember = digits ? phoneToMemberMap.get(digits) : undefined;
      const cleanSummary = (o.itemsSummary || '').replace(/^\[📸[^\]]*\]\s*/, '');
      const isRopa = o.categoryGroup === 'ropa';

      salesDatabase.push({
        id: `sale_ord_${o.id}`,
        sourceId: o.id,
        type: isRopa ? 'ropa' : 'shop',
        typeLabel: isRopa ? 'Ropa Deportiva' : 'Tienda (Bebidas / Jugos / Comida)',
        whatWasSold: cleanSummary || 'Producto de Tienda',
        prepaidMonths: 1,
        buyerName:
          o.buyerName ||
          (matchedMember ? matchedMember.fullName : 'Cliente de Tienda'),
        buyerCedula: o.buyerCedula || (matchedMember ? matchedMember.cedula : '—'),
        buyerPhone: o.phone || 'Sin teléfono',
        isRegisteredMember: Boolean(matchedMember || o.buyerName),
        paymentRef: o.paymentRef || 'PENDIENTE',
        accountTarget:
          o.pagoMovilTarget ||
          (isRopa
            ? `Mensualidad y Ropa (${settings.ownerPhoneMemberships})`
            : `Consumibles (${settings.ownerPhoneConsumables})`),
        amountUsd: Number(o.totalUsd || 0),
        amountBs: Number(o.totalBs || 0),
        dateInfo: o.paymentNote || 'Pedido de Tienda',
        statusLabel:
          o.status === 'confirmed'
            ? 'Confirmado'
            : o.status === 'pending_approval'
            ? 'Por Aprobar'
            : 'Rechazado',
        isConfirmed: o.status === 'confirmed',
      });
    });

    const memConfirmedUsd = confirmedMemberships.reduce((acc, m) => acc + (m.priceUsd || 0), 0);
    const memConfirmedBs = confirmedMemberships.reduce((acc, m) => acc + (m.totalBs || 0), 0);

    const memPendingUsd = pendingMemberships.reduce((acc, m) => acc + (m.priceUsd || 0), 0);
    const memPendingBs = pendingMemberships.reduce((acc, m) => acc + (m.totalBs || 0), 0);

    const shopConfirmedUsd = confirmedOrders.reduce((acc, o) => acc + (o.totalUsd || 0), 0);
    const shopConfirmedBs = confirmedOrders.reduce((acc, o) => acc + (o.totalBs || 0), 0);

    const shopPendingUsd = pendingOrders.reduce((acc, o) => acc + (o.totalUsd || 0), 0);
    const shopPendingBs = pendingOrders.reduce((acc, o) => acc + (o.totalBs || 0), 0);

    const totalConfirmedUsd = memConfirmedUsd + shopConfirmedUsd;
    const totalConfirmedBs = memConfirmedBs + shopConfirmedBs;

    // Breakdown by Category
    const categoryStats: Array<{
      key: ProductCategory;
      label: string;
      usd: number;
      bs: number;
      count: number;
      colorClass: string;
    }> = [
      {
        key: 'membresias',
        label: 'Membresías del Gimnasio',
        usd: memConfirmedUsd,
        bs: memConfirmedBs,
        count: confirmedMemberships.length,
        colorClass: 'bg-emerald-600',
      },
      {
        key: 'jugos_saludables',
        label: 'Jugos Saludables',
        usd: 0,
        bs: 0,
        count: 0,
        colorClass: 'bg-teal-600',
      },
      {
        key: 'agua_hidratacion',
        label: 'Agua e Hidratación',
        usd: 0,
        bs: 0,
        count: 0,
        colorClass: 'bg-blue-600',
      },
      {
        key: 'alimentos',
        label: 'Comida y Alimentos',
        usd: 0,
        bs: 0,
        count: 0,
        colorClass: 'bg-amber-600',
      },
      {
        key: 'ropa_deportiva',
        label: 'Ropa Deportiva',
        usd: 0,
        bs: 0,
        count: 0,
        colorClass: 'bg-indigo-600',
      },
    ];

    confirmedOrders.forEach((ord) => {
      const lower = (ord.itemsSummary || '').toLowerCase();
      let targetCat: ProductCategory =
        ord.categoryGroup === 'ropa' ? 'ropa_deportiva' : 'jugos_saludables';

      if (lower.includes('agua') || lower.includes('hidrat') || lower.includes('gatorade')) {
        targetCat = 'agua_hidratacion';
      } else if (
        lower.includes('huevo') ||
        lower.includes('comida') ||
        lower.includes('avena') ||
        lower.includes('barra') ||
        lower.includes('pollo') ||
        lower.includes('sandwich')
      ) {
        targetCat = 'alimentos';
      } else if (ord.categoryGroup === 'ropa' || lower.includes('franela') || lower.includes('ropa')) {
        targetCat = 'ropa_deportiva';
      } else {
        targetCat = 'jugos_saludables';
      }

      const entry = categoryStats.find((c) => c.key === targetCat);
      if (entry) {
        entry.usd += ord.totalUsd || 0;
        entry.bs += ord.totalBs || 0;
        entry.count += 1;
      }
    });

    const maxCategoryUsd = Math.max(1, ...categoryStats.map((c) => c.usd));

    // Membership status distribution
    const statusDist = [
      {
        label: 'Membresías Activas',
        count: memberships.filter((m) => m.status === 'active').length,
        color: 'bg-emerald-600',
      },
      {
        label: 'Por Vencer (≤ 5 días)',
        count: memberships.filter((m) => m.status === 'expiring_soon').length,
        color: 'bg-amber-500',
      },
      {
        label: 'Falta Cédula / Nombre / Teléfono',
        count: memberships.filter((m) => m.status === 'awaiting_profile' || m.needsManualPhone)
          .length,
        color: 'bg-blue-600',
      },
      {
        label: 'Pago Pendiente por Aprobar',
        count: pendingMemberships.length,
        color: 'bg-orange-500',
      },
      {
        label: 'Membresías Vencidas',
        count: memberships.filter((m) => m.status === 'expired').length,
        color: 'bg-red-500',
      },
    ];

    const availableProductsCount = products.filter((p) => p.available !== false).length;
    const outOfStockProductsCount = products.filter((p) => p.available === false).length;

    return {
      totalConfirmedUsd,
      totalConfirmedBs,
      memConfirmedUsd,
      memConfirmedBs,
      shopConfirmedUsd,
      shopConfirmedBs,
      memPendingUsd,
      memPendingBs,
      shopPendingUsd,
      shopPendingBs,
      categoryStats,
      maxCategoryUsd,
      statusDist,
      availableProductsCount,
      outOfStockProductsCount,
      salesDatabase,
    };
  }, [memberships, shopOrders, products, settings.ownerPhoneMemberships, settings.ownerPhoneConsumables]);

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    return analytics.salesDatabase.filter((item) => {
      if (salesFilter !== 'all' && item.type !== salesFilter) return false;
      if (!q) return true;
      const blob =
        `${item.buyerName} ${item.buyerCedula} ${item.buyerPhone} ${item.whatWasSold} ${item.paymentRef} ${item.typeLabel}`.toLowerCase();
      return blob.includes(q);
    });
  }, [analytics.salesDatabase, salesSearch, salesFilter]);

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ingresos Totales Confirmados</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            ${analytics.totalConfirmedUsd.toFixed(2)} USD
          </p>
          <p className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
            Bs. {formatBs(analytics.totalConfirmedBs)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ingresos por Membresías</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            ${analytics.memConfirmedUsd.toFixed(2)} USD
          </p>
          <p className="text-xs font-mono text-slate-600 tabular-nums">
            Bs. {formatBs(analytics.memConfirmedBs)} · Cuenta {settings.ownerPhoneMemberships}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ingresos Tienda (Jugos, Agua, Comida, Ropa)</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            ${analytics.shopConfirmedUsd.toFixed(2)} USD
          </p>
          <p className="text-xs font-mono text-slate-600 tabular-nums">
            Bs. {formatBs(analytics.shopConfirmedBs)} · Cuenta {settings.ownerPhoneConsumables}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Monto en Cola por Aprobar</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 font-mono tabular-nums">
            ${(analytics.memPendingUsd + analytics.shopPendingUsd).toFixed(2)} USD
          </p>
          <p className="text-xs font-mono text-slate-600 tabular-nums">
            Bs. {formatBs(analytics.memPendingBs + analytics.shopPendingBs)}
          </p>
        </div>
      </div>

      {/* Main Graphics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Revenue by Business Category */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Gráfica de Ingresos por Categoría ($ USD y Bolívares)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución real del dinero confirmado en {settings.businessName} por área de negocio.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {analytics.categoryStats.map((cat) => {
              const widthPct = Math.max(
                4,
                Math.round((cat.usd / analytics.maxCategoryUsd) * 100)
              );
              const sharePct =
                analytics.totalConfirmedUsd > 0
                  ? ((cat.usd / analytics.totalConfirmedUsd) * 100).toFixed(1)
                  : '0.0';

              return (
                <div key={cat.key} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-900">
                      {cat.label}{' '}
                      <span className="text-slate-400 font-normal">
                        ({cat.count} {cat.count === 1 ? 'operación' : 'operaciones'} · {sharePct}%)
                      </span>
                    </div>
                    <div className="font-mono tabular-nums">
                      <span className="font-bold text-slate-900">${cat.usd.toFixed(2)} USD</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="font-semibold text-emerald-700">Bs. {formatBs(cat.bs)}</span>
                    </div>
                  </div>
                  <div className="w-full h-3.5 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${cat.colorClass} rounded-lg transition-all duration-500`}
                      style={{ width: `${cat.usd === 0 ? 2 : widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pago Móvil Account Split Visual */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-bold text-emerald-800">
                Pago Móvil Mensualidad y Ropa (BDV 18318153)
              </span>
              <p className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                $
                {(
                  analytics.memConfirmedUsd +
                  (analytics.categoryStats.find((c) => c.key === 'ropa_deportiva')?.usd || 0)
                ).toFixed(2)}{' '}
                USD
              </p>
              <p className="text-xs font-mono text-slate-600 tabular-nums">
                Bs.{' '}
                {formatBs(
                  analytics.memConfirmedBs +
                    (analytics.categoryStats.find((c) => c.key === 'ropa_deportiva')?.bs || 0)
                )}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-bold text-blue-800">
                Pago Móvil Jugos, Agua y Comida (BDV 17636777)
              </span>
              <p className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                $
                {(
                  analytics.shopConfirmedUsd -
                  (analytics.categoryStats.find((c) => c.key === 'ropa_deportiva')?.usd || 0)
                ).toFixed(2)}{' '}
                USD
              </p>
              <p className="text-xs font-mono text-slate-600 tabular-nums">
                Bs.{' '}
                {formatBs(
                  analytics.shopConfirmedBs -
                    (analytics.categoryStats.find((c) => c.key === 'ropa_deportiva')?.bs || 0)
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Chart 2: Membership Status Distribution & Product Stock Overview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Estado de Membresías ({memberships.length} Totales)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Desglose actual de clientes activos, por vencer y pendientes.
              </p>
            </div>

            <div className="space-y-3">
              {analytics.statusDist.map((st) => {
                const pct =
                  memberships.length > 0
                    ? Math.round((st.count / memberships.length) * 100)
                    : 0;
                return (
                  <div key={st.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{st.label}</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {st.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${st.color} rounded-full transition-all duration-500`}
                        style={{ width: `${st.count === 0 ? 2 : Math.max(6, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Disponibilidad de Catálogo y Tasas Activas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Resumen de productos con stock vs en gris (Sin Stock) y tasas configuradas.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
                  <PackageCheck className="w-4 h-4" />
                  <span>Con Stock</span>
                </div>
                <p className="text-xl font-bold font-mono text-emerald-950">
                  {analytics.availableProductsCount} productos
                </p>
              </div>

              <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
                  <PackageX className="w-4 h-4" />
                  <span>Sin Stock (Gris)</span>
                </div>
                <p className="text-xl font-bold font-mono text-slate-800">
                  {analytics.outOfStockProductsCount} productos
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tasa Dólar BCV:</span>
                <span className="font-mono font-bold text-slate-900">
                  Bs. {settings.bcvRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tasa Euro BCV:</span>
                <span className="font-mono font-bold text-slate-900">
                  Bs. {settings.euroRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tasa Manual:</span>
                <span className="font-mono font-bold text-slate-900">
                  Bs. {settings.manualRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Historial en Reporte de Eliminados:</span>
                <span className="font-mono font-semibold text-slate-700">
                  {deletedMemberships.length + deletedProducts.length + deletedShopOrders.length} registros
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Base de Datos de Ventas: Qué se vendió y a quién */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Base de Datos de Ventas: Qué se Vendió y a Quién ({filteredSales.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro detallado de cada venta de membresía, agua, jugos, comida y ropa, vinculado automáticamente al nombre y cédula del miembro. Cualquier venta o producto eliminado se conserva en el Reporte de Eliminados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shopOrders.length > 0 && onDeleteAllShopOrdersDatabase && (
              <button
                type="button"
                onClick={() => setConfirmClearModal('shop_orders')}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Eliminar la base de datos de ventas de productos y guardar qué se eliminó en el Reporte de Eliminados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar BD Ventas de Productos ({shopOrders.length})</span>
              </button>
            )}

            {products.length > 0 && onDeleteAllProductsCatalogDatabase && (
              <button
                type="button"
                onClick={() => setConfirmClearModal('products_catalog')}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Eliminar el catálogo de productos y guardar qué se eliminó en el Reporte de Eliminados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar BD Catálogo Productos ({products.length})</span>
              </button>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Buscar por cliente, cédula, producto u operación..."
                className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 outline-none w-64"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {(
                [
                  { id: 'all', label: 'Todo' },
                  { id: 'membership', label: 'Membresías' },
                  { id: 'shop', label: 'Bebidas y Comida' },
                  { id: 'ropa', label: 'Ropa' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSalesFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    salesFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredSales.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No hay ventas registradas que coincidan con el filtro actual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-3">A Quién se Vendió (Cliente / Miembro)</th>
                  <th className="py-2.5 px-3">Qué se Vendió (Concepto / Producto)</th>
                  <th className="py-2.5 px-3">Categoría y Cuenta</th>
                  <th className="py-2.5 px-3">Operación / Fechas</th>
                  <th className="py-2.5 px-3 text-right">Monto ($ / Bs.)</th>
                  <th className="py-2.5 px-3 text-right">Estado / Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span>{sale.buyerName}</span>
                        {sale.isRegisteredMember && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
                            <UserCheck className="w-3 h-3" />
                            Miembro
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Cédula: {sale.buyerCedula} · Tel: {sale.buyerPhone}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <ShoppingBag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{sale.whatWasSold}</span>
                        {sale.prepaidMonths > 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold">
                            +{sale.prepaidMonths}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{sale.dateInfo}</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">{sale.typeLabel}</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-[210px]">
                        {sale.accountTarget}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-700">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-bold">
                        Op: {sale.paymentRef}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-900">${sale.amountUsd.toFixed(2)} USD</div>
                      <div className="text-[11px] font-semibold text-emerald-700">
                        Bs. {formatBs(sale.amountBs)}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            sale.isConfirmed
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {sale.isConfirmed && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {sale.statusLabel}
                        </span>
                        {sale.type === 'membership' && onDeleteMembershipSale && (
                          <button
                            type="button"
                            onClick={() => onDeleteMembershipSale(sale.sourceId)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Eliminar membresía y enviarla al Reporte de Eliminados"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {sale.type !== 'membership' && onDeleteShopOrderSale && (
                          <button
                            type="button"
                            onClick={() => onDeleteShopOrderSale(sale.sourceId)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Eliminar venta de producto y enviarla al Reporte de Eliminados"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Deleting Product Sales Database or Products Catalog */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  {confirmClearModal === 'shop_orders'
                    ? '¿Eliminar Base de Datos de Ventas de Productos?'
                    : '¿Eliminar Base de Datos del Catálogo de Productos?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModal(null)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmClearModal === 'shop_orders' ? (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar las{' '}
                <strong className="text-slate-900">{shopOrders.length} ventas de productos</strong>{' '}
                registradas en la base de datos? Todas las ventas eliminadas (qué se vendió, a quién, monto en $ / Bs. y operación) pasarán al{' '}
                <strong className="text-slate-900">Reporte Eliminados</strong> por seguridad para que puedas revisarlas, restaurarlas o exportarlas.
              </p>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar los{' '}
                <strong className="text-slate-900">{products.length} productos</strong> del catálogo? Todos pasarán al{' '}
                <strong className="text-slate-900">Reporte Eliminados</strong> con sus precios y tasas para que tengas el reporte exacto de qué fue eliminado.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmClearModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingAction}
                onClick={async () => {
                  setDeletingAction(true);
                  try {
                    if (confirmClearModal === 'shop_orders' && onDeleteAllShopOrdersDatabase) {
                      await onDeleteAllShopOrdersDatabase();
                    } else if (
                      confirmClearModal === 'products_catalog' &&
                      onDeleteAllProductsCatalogDatabase
                    ) {
                      await onDeleteAllProductsCatalogDatabase();
                    }
                    setConfirmClearModal(null);
                  } finally {
                    setDeletingAction(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {deletingAction
                    ? 'Eliminando...'
                    : 'Sí, Eliminar y Guardar en Reporte'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
