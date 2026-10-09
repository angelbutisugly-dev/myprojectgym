import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Image as ImageIcon,
  Loader2,
  Search,
  ScanLine,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { ExchangeSettings, MembershipRecord, ProductItem, ShopOrderRecord } from '../types';

interface PaymentApprovalsTabProps {
  memberships: MembershipRecord[];
  shopOrders: ShopOrderRecord[];
  products: ProductItem[];
  settings: ExchangeSettings;
  onApproveMembership: (member: MembershipRecord) => Promise<void>;
  onRejectMembership: (memberId: string) => Promise<void>;
  onVerifyRegistration?: (member: MembershipRecord, approved: boolean) => Promise<void>;
  onApproveShopOrder: (order: ShopOrderRecord) => Promise<void>;
  onRejectShopOrder: (orderId: string) => Promise<void>;
  onPreviewReceipt: (data: {
    imageUrl: string;
    title: string;
    phone: string;
    operationRef: string;
    scannedBs?: number;
    expectedBs?: number;
  }) => void;
  onCreateEvaluatedPendingPayment: (payload: {
    phone: string;
    conceptText: string;
    category: 'membresia' | 'consumibles' | 'ropa';
    membershipCount: number;
    scannedAmountBs: number;
    expectedAmountBs: number;
    expectedAmountUsd: number;
    operationRef: string;
    receiptImageUrl?: string;
    paymentNote?: string;
  }) => Promise<void>;
}

function formatBsVenezuelan(val: number): string {
  return val.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const PaymentApprovalsTab: React.FC<PaymentApprovalsTabProps> = ({
  memberships,
  shopOrders,
  products,
  settings,
  onApproveMembership,
  onRejectMembership,
  onVerifyRegistration,
  onApproveShopOrder,
  onRejectShopOrder,
  onPreviewReceipt,
  onCreateEvaluatedPendingPayment,
}) => {
  const pendingMemberships = memberships.filter((m) => m.status === 'pending_payment');
  const pendingRegVerifications = memberships.filter(
    (m) => m.status === 'pending_registration_check'
  );
  const pendingOrders = shopOrders.filter((o) => o.status === 'pending_approval');
  const totalPendingCount =
    pendingMemberships.length + pendingOrders.length + pendingRegVerifications.length;

  // Search and filter state for checking pending payments
  const [pendingSearch, setPendingSearch] = useState<string>('');
  const [pendingFilter, setPendingFilter] = useState<
    'all' | 'membership' | 'shop' | 'exact_match' | 'difference'
  >('all');

  // Admin Bot Console state (allows the admin to check pending payments or run admin bot commands directly)
  const [adminBotInput, setAdminBotInput] = useState<string>('');
  const [adminBotLoading, setAdminBotLoading] = useState<boolean>(false);
  const [adminBotReply, setAdminBotReply] = useState<string | null>(null);
  const [adminBotCards, setAdminBotCards] = useState<
    Array<{ receiptImageUrl: string; caption: string }>
  >([]);

  const filteredPendingMemberships = useMemo(() => {
    if (pendingFilter === 'shop') return [];
    return pendingMemberships.filter((m) => {
      const scannedBs = m.scannedAmountBs ?? m.totalBs;
      const expectedBs = m.expectedAmountBs ?? m.totalBs;
      const isExact = Math.abs(scannedBs - expectedBs) <= 1.5;
      if (pendingFilter === 'exact_match' && !isExact) return false;
      if (pendingFilter === 'difference' && isExact) return false;

      const q = pendingSearch.toLowerCase().trim();
      if (!q) return true;
      const blob = `${m.phone} ${m.paymentRef} ${m.planName} ${m.firstName} ${m.lastName} ${
        m.paymentNote || ''
      }`.toLowerCase();
      return blob.includes(q);
    });
  }, [pendingMemberships, pendingFilter, pendingSearch]);

  const filteredPendingOrders = useMemo(() => {
    if (pendingFilter === 'membership') return [];
    return pendingOrders.filter((o) => {
      const scannedBs = o.scannedAmountBs ?? o.totalBs;
      const expectedBs = o.expectedAmountBs ?? o.totalBs;
      const isExact = Math.abs(scannedBs - expectedBs) <= 1.5;
      if (pendingFilter === 'exact_match' && !isExact) return false;
      if (pendingFilter === 'difference' && isExact) return false;

      const q = pendingSearch.toLowerCase().trim();
      if (!q) return true;
      const blob = `${o.phone} ${o.paymentRef} ${o.itemsSummary} ${
        o.paymentNote || ''
      }`.toLowerCase();
      return blob.includes(q);
    });
  }, [pendingOrders, pendingFilter, pendingSearch]);

  const pendingStats = useMemo(() => {
    const totalUsd =
      pendingMemberships.reduce((acc, m) => acc + (m.priceUsd || 0), 0) +
      pendingOrders.reduce((acc, o) => acc + (o.totalUsd || 0), 0);
    const totalExpectedBs =
      pendingMemberships.reduce((acc, m) => acc + (m.expectedAmountBs ?? m.totalBs ?? 0), 0) +
      pendingOrders.reduce((acc, o) => acc + (o.expectedAmountBs ?? o.totalBs ?? 0), 0);
    const exactMatchCount =
      pendingMemberships.filter(
        (m) => Math.abs((m.scannedAmountBs ?? m.totalBs) - (m.expectedAmountBs ?? m.totalBs)) <= 1.5
      ).length +
      pendingOrders.filter(
        (o) => Math.abs((o.scannedAmountBs ?? o.totalBs) - (o.expectedAmountBs ?? o.totalBs)) <= 1.5
      ).length;
    const diffCount = totalPendingCount - exactMatchCount;
    return { totalUsd, totalExpectedBs, exactMatchCount, diffCount };
  }, [pendingMemberships, pendingOrders, totalPendingCount]);

  const sendAdminBotCommand = async (commandText: string) => {
    const cleanCmd = commandText.trim();
    if (!cleanCmd) return;
    setAdminBotLoading(true);
    try {
      const adminPhone =
        settings.ownerPhoneMemberships.split(/[,;/]+/)[0]?.trim() || '+58 414-6734866';
      const res = await fetch('/api/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: adminPhone,
          message: cleanCmd,
          fromExternal: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdminBotReply(data.reply || 'Comando procesado.');
        setAdminBotCards(
          Array.isArray(data.adminPendingReceiptCards) ? data.adminPendingReceiptCards : []
        );
      }
    } catch {
      setAdminBotReply('Error al consultar el bot de administrador.');
    } finally {
      setAdminBotLoading(false);
    }
  };

  // Quick AI Receipt Evaluator state
  const [evalPhone, setEvalPhone] = useState('+58 412-');
  const [evalClaimText, setEvalClaimText] = useState('1 Membresía Mensual');
  const [evalCategory, setEvalCategory] = useState<'membresia' | 'consumibles' | 'ropa'>('membresia');
  const [evalMemCount, setEvalMemCount] = useState<number>(1);
  const [evalImageUrl, setEvalImageUrl] = useState<string>('');
  const [evalScanning, setEvalScanning] = useState<boolean>(false);
  const [evalScannedBs, setEvalScannedBs] = useState<string>('');
  const [evalExpectedBs, setEvalExpectedBs] = useState<string>(
    settings.membershipMonthlyBs.toFixed(2)
  );
  const [evalExpectedUsd, setEvalExpectedUsd] = useState<string>(
    settings.membershipMonthlyUsd.toFixed(2)
  );
  const [evalOperationRef, setEvalOperationRef] = useState<string>('');
  const [evalNote, setEvalNote] = useState<string>('');
  const [evalFeedback, setEvalFeedback] = useState<string | null>(null);

  const recalculateExpectedFromClaim = (
    cat: 'membresia' | 'consumibles' | 'ropa',
    count: number,
    claim: string
  ) => {
    const lower = claim.toLowerCase();
    const isHalf =
      lower.includes('mitad') ||
      lower.includes('half') ||
      lower.includes('50%') ||
      lower.includes('abono');
    const factor = isHalf ? 0.5 : 1;

    if (cat === 'membresia') {
      const memProd = products.find((p) => p.category === 'membresias');
      const unitUsd = memProd ? memProd.basePriceUsd : settings.membershipMonthlyUsd;
      const unitBs = memProd ? memProd.priceBs : settings.membershipMonthlyBs;
      setEvalExpectedUsd((unitUsd * count * factor).toFixed(2));
      setEvalExpectedBs((unitBs * count * factor).toFixed(2));
      return;
    }

    // Try matching product in claim
    const matchedProd = products.find((p) =>
      lower.includes(p.name.toLowerCase())
    );
    if (matchedProd) {
      setEvalExpectedUsd((matchedProd.basePriceUsd * count * factor).toFixed(2));
      setEvalExpectedBs((matchedProd.priceBs * count * factor).toFixed(2));
    }
  };

  const handleUploadReceiptToScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setEvalImageUrl(dataUrl);
      setEvalScanning(true);
      setEvalFeedback('Escaneando monto en Bs. y número de "Operación:" con IA...');
      try {
        const res = await fetch('/api/bot/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64DataUrl: dataUrl,
            captionText: evalClaimText,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const scanned = data?.scanned || {};
          if (scanned.operationNumber) {
            setEvalOperationRef(scanned.operationNumber);
          }
          if (typeof scanned.amountBs === 'number' && scanned.amountBs > 0) {
            setEvalScannedBs(scanned.amountBs.toFixed(2));
          }
          setEvalFeedback(
            `Escaneo completado — Operación: ${
              scanned.operationNumber || 'No detectada'
            } · Monto leído en captura: Bs. ${
              typeof scanned.amountBs === 'number' && scanned.amountBs > 0
                ? formatBsVenezuelan(scanned.amountBs)
                : 'Verifica manualmente'
            }`
          );
        } else {
          setEvalFeedback('Captura cargada. Verifica el monto y número de operación.');
        }
      } catch {
        setEvalFeedback('Captura cargada. Verifica el monto y número de operación.');
      } finally {
        setEvalScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Header Explanation & Live Pending Payments Status Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Centro de Evaluación y Aprobación de Pagos
              </h2>
              {totalPendingCount > 0 ? (
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-xs font-bold">
                  ⏳ Hay {totalPendingCount} Pago(s) Pendiente(s) por Aprobar
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>0 Pagos Pendientes — Todo al día</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cada pago muestra arriba el <strong>Monto Escaneado en el Comprobante</strong> y justo debajo el{' '}
              <strong>Monto que DEBERÍA Decir</strong> según lo que el cliente indica que pagó (incluyendo pagos de múltiples membresías o pagos parciales/abonos), junto con su identificador{' '}
              <span className="font-mono font-semibold text-slate-800">Operación: 007583657705</span>. También puedes escribir{' '}
              <span className="font-mono font-semibold text-emerald-800">pagos pendientes</span> desde tu WhatsApp de administrador para revisar la cola o responder{' '}
              <span className="font-mono font-semibold text-emerald-800">yes</span> /{' '}
              <span className="font-mono font-semibold text-emerald-800">aprobado</span> para aprobar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => sendAdminBotCommand('pagos pendientes')}
              disabled={adminBotLoading}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ClipboardCheck className="w-4 h-4 text-emerald-400" />
              <span>Consultar Pagos Pendientes en el Bot</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip for Pending Payments */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">Total Pagos Pendientes</span>
            <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
              {totalPendingCount} ({pendingMemberships.length} Memb. · {pendingOrders.length} Tienda)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">Monto Total por Aprobar</span>
            <p className="text-base font-bold font-mono text-emerald-700 mt-0.5">
              ${pendingStats.totalUsd.toFixed(2)} · Bs. {formatBsVenezuelan(pendingStats.totalExpectedBs)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
            <span className="text-[11px] text-emerald-800 font-medium">Coinciden Exactamente</span>
            <p className="text-base font-bold font-mono text-emerald-900 mt-0.5">
              {pendingStats.exactMatchCount} pago(s)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200">
            <span className="text-[11px] text-amber-800 font-medium">Con Diferencia / Parciales</span>
            <p className="text-base font-bold font-mono text-amber-900 mt-0.5">
              {pendingStats.diffCount} pago(s)
            </p>
          </div>
        </div>

        {/* Filter & Search Bar for Checking Pending Payments */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(
              [
                ['all', `Todos (${totalPendingCount})`],
                ['membership', `Membresías (${pendingMemberships.length})`],
                ['shop', `Tienda / Productos (${pendingOrders.length})`],
                ['exact_match', `Monto Exacto (${pendingStats.exactMatchCount})`],
                ['difference', `Con Diferencia (${pendingStats.diffCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPendingFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  pendingFilter === key
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Buscar operación, teléfono, producto..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Interactive Admin Bot Console to Check Pending Payments / Approve / Inspect via Bot */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Bot Versión Administrador ({settings.ownerPhoneMemberships})
              </h3>
              <p className="text-[11px] text-slate-300">
                Revisa si hay pagos pendientes, aprueba pagos o agrega membresías como administrador desde el bot:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={adminBotLoading}
              onClick={() => sendAdminBotCommand('pagos pendientes')}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              📋 Ver Pagos Pendientes
            </button>
            {totalPendingCount > 0 && (
              <button
                type="button"
                disabled={adminBotLoading}
                onClick={() => sendAdminBotCommand('yes')}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
              >
                ✅ Aprobar Último ("yes")
              </button>
            )}
            <button
              type="button"
              disabled={adminBotLoading}
              onClick={() => sendAdminBotCommand('estadisticas')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            >
              📊 Estadísticas Admin
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!adminBotInput.trim()) return;
            const cmd = adminBotInput;
            setAdminBotInput('');
            sendAdminBotCommand(cmd);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={adminBotInput}
            onChange={(e) => setAdminBotInput(e.target.value)}
            placeholder='Escribe como Admin: "pagos pendientes", "yes", "aprobar 007583657705", "buscar [Nombre]"...'
            className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={adminBotLoading || !adminBotInput.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {adminBotLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Enviar</span>
          </button>
        </form>

        {adminBotReply && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Respuesta del Bot Administrador:
              </span>
              <button
                type="button"
                onClick={() => {
                  setAdminBotReply(null);
                  setAdminBotCards([]);
                }}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <pre className="text-xs font-sans whitespace-pre-wrap text-slate-100 leading-relaxed">
              {adminBotReply}
            </pre>
            {adminBotCards.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                {adminBotCards.map((c, i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex items-start gap-3"
                  >
                    <img
                      src={c.receiptImageUrl}
                      alt="Comprobante Pendiente"
                      className="w-16 h-20 object-cover rounded border border-slate-700 shrink-0"
                    />
                    <div className="text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-5">
                      {c.caption}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending Lifetime Registration Verification Requests (When client claims they are already registered) */}
      {pendingRegVerifications.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="inline-block px-2 py-0.5 bg-amber-200 text-amber-950 rounded text-[11px] font-bold uppercase tracking-wider mb-1">
                Verificación de Inscripción Vitalicia ({pendingRegVerifications.length})
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                Clientes que indican que YA están inscritos y desean pagar solo la Mensualidad
              </h3>
              <p className="text-xs text-slate-700">
                Revisa su <strong>Nombre, Apellido y Cédula (ID)</strong>. Si confirmas que ya está inscrito, quedará registrado de por vida y el bot le cobrará solo la mensualidad (${settings.membershipMonthlyUsd.toFixed(2)} USD). Si no está inscrito, el bot le cobrará Inscripción (${(settings.registrationUsd ?? 15).toFixed(2)} USD) + Mensualidad (${settings.membershipMonthlyUsd.toFixed(2)} USD).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingRegVerifications.map((reg) => (
              <div
                key={reg.id}
                className="bg-white border border-amber-300 rounded-xl p-4 flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {reg.firstName} {reg.lastName}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900">
                      ID / Cédula: {reg.cedula || 'Sin cédula'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-600">
                    Teléfono WhatsApp: <strong>{reg.phone}</strong>
                  </p>
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                    Pregunta al Admin: ¿Esta persona ya pagó su inscripción vitalicia anteriormente?
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onVerifyRegistration && onVerifyRegistration(reg, false)}
                    className="px-3 py-1.5 text-xs font-semibold border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>No está inscrito (Cobrar Inscripción + Mes)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerifyRegistration && onVerifyRegistration(reg, true)}
                    className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Sí está inscrito (De por vida)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Two-Column Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Pending Membership Payments */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Pagos de Membresías por Aprobar ({pendingMemberships.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cuenta destino: {settings.ownerPhoneMemberships} (BDV 18318153)
              </p>
            </div>
          </div>

          {filteredPendingMemberships.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
              {pendingMemberships.length === 0
                ? 'No hay pagos de membresía pendientes. Todo está al día.'
                : 'Ningún pago de membresía pendiente coincide con el filtro actual.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPendingMemberships.map((pending) => {
                const scannedBs = pending.scannedAmountBs ?? pending.totalBs;
                const expectedBs = pending.expectedAmountBs ?? pending.totalBs;
                const diffBs = Math.abs(scannedBs - expectedBs);
                const matchesPrice = diffBs <= 1.5;

                return (
                  <div
                    key={pending.id}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {pending.receiptImageUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewReceipt({
                                imageUrl: pending.receiptImageUrl!,
                                title: pending.planName,
                                phone: pending.phone,
                                operationRef: pending.paymentRef,
                                scannedBs,
                                expectedBs,
                              })
                            }
                            className="relative group shrink-0 w-20 h-24 rounded-lg overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer"
                            title="Ampliar comprobante de Pago Móvil"
                          >
                            <img
                              src={pending.receiptImageUrl}
                              alt="Comprobante Pago Móvil"
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Eye className="w-4 h-4" />
                            </span>
                          </button>
                        ) : (
                          <div className="w-16 h-20 rounded-lg bg-slate-200/70 border border-slate-300 flex flex-col items-center justify-center shrink-0 text-slate-500 p-1 text-center">
                            <ScanLine className="w-4 h-4 mb-1" />
                            <span className="text-[10px] leading-tight">Sin foto</span>
                          </div>
                        )}

                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                              {pending.phone}
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded">
                              Operación: {pending.paymentRef}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-slate-800">
                            Concepto: {pending.planName}{' '}
                            {pending.lastName ? `· ${pending.lastName}` : ''}
                          </p>
                          {pending.paymentNote && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              Nota / Excepción: {pending.paymentNote}
                            </p>
                          )}

                          {/* SCANNED PRICE ON TOP vs EXPECTED PRICE BELOW */}
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1">
                            <div className="flex items-center justify-between gap-4 text-xs">
                              <span className="text-slate-500 font-medium">
                                Monto escaneado en pago:
                              </span>
                              <span className="font-mono font-bold text-slate-900 tabular-nums">
                                {formatBsVenezuelan(scannedBs)} Bs
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-xs border-t border-slate-100 pt-1">
                              <span className="text-slate-500 font-medium">
                                Monto que DEBERÍA decir:
                              </span>
                              <span className="font-mono font-bold text-emerald-700 tabular-nums">
                                {formatBsVenezuelan(expectedBs)} Bs (${pending.priceUsd.toFixed(2)})
                              </span>
                            </div>
                            <div className="pt-0.5 text-[11px] font-semibold">
                              {matchesPrice ? (
                                <span className="text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  El monto escaneado coincide con el precio esperado
                                </span>
                              ) : (
                                <span className="text-amber-700 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Diferencia o pago parcial detectado (Dif: Bs. {formatBsVenezuelan(diffBs)})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                      {pending.receiptImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewReceipt({
                              imageUrl: pending.receiptImageUrl!,
                              title: pending.planName,
                              phone: pending.phone,
                              operationRef: pending.paymentRef,
                              scannedBs,
                              expectedBs,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Ver Captura</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRejectMembership(pending.id)}
                        className="px-3 py-1.5 text-xs font-semibold border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onApproveMembership(pending)}
                        className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Aprobar Membresía (Sí)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Pending Shop Orders (Jugos, Agua, Comida, Ropa) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                2. Pagos de Productos / Tienda y Ropa por Aprobar ({pendingOrders.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Jugos/Agua/Comida: {settings.ownerPhoneConsumables} · Ropa (Catálogo Abierto): {settings.ownerPhoneMemberships}
              </p>
            </div>
          </div>

          {filteredPendingOrders.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
              {pendingOrders.length === 0
                ? 'No hay pagos de productos ni de ropa pendientes por aprobar.'
                : 'Ningún pago de tienda o ropa pendiente coincide con el filtro actual.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPendingOrders.map((ord) => {
                const isClothes = ord.categoryGroup === 'ropa';
                const scannedBs = ord.scannedAmountBs ?? ord.totalBs;
                const expectedBs = ord.expectedAmountBs ?? ord.totalBs;
                const diffBs = Math.abs(scannedBs - expectedBs);
                const matchesPrice = diffBs <= 1.5;

                return (
                  <div
                    key={ord.id}
                    className={`border rounded-xl p-4 space-y-3 ${
                      isClothes
                        ? 'border-indigo-300 bg-indigo-50/40'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {ord.receiptImageUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewReceipt({
                              imageUrl: ord.receiptImageUrl!,
                              title: ord.itemsSummary,
                              phone: ord.phone,
                              operationRef: ord.paymentRef,
                              scannedBs,
                              expectedBs,
                            })
                          }
                          className="relative group shrink-0 w-20 h-24 rounded-lg overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer"
                          title="Ampliar comprobante de Pago Móvil"
                        >
                          <img
                            src={ord.receiptImageUrl}
                            alt="Comprobante Tienda"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-4 h-4" />
                          </span>
                        </button>
                      ) : (
                        <div className="w-16 h-20 rounded-lg bg-slate-200/70 border border-slate-300 flex flex-col items-center justify-center shrink-0 text-slate-500 p-1 text-center">
                          <ScanLine className="w-4 h-4 mb-1" />
                          <span className="text-[10px] leading-tight">Sin foto</span>
                        </div>
                      )}

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isClothes && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white">
                              👕 Ropa (Catálogo Abierto • Sin Precio/Stock Fijo)
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                            {ord.phone}
                          </span>
                          <span className="text-xs font-mono font-bold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded">
                            Operación: {ord.paymentRef}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-800">
                          {isClothes ? '¿Qué ropa dice que pagó?: ' : 'Productos: '}
                          <span className={isClothes ? 'text-indigo-950 font-bold' : ''}>
                            {ord.itemsSummary}
                          </span>
                        </p>
                        {ord.paymentNote && (
                          <p className="text-[11px] text-amber-800 font-medium">
                            Nota / Detalle: {ord.paymentNote}
                          </p>
                        )}

                        {/* SCANNED PRICE ON TOP vs EXPECTED PRICE BELOW */}
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-4 text-xs">
                            <span className="text-slate-500 font-medium">
                              {isClothes ? 'Monto reportado / escaneado en pago:' : 'Monto escaneado en pago:'}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {scannedBs > 0 ? `${formatBsVenezuelan(scannedBs)} Bs` : 'Por verificar en captura'}
                            </span>
                          </div>
                          {!isClothes ? (
                            <>
                              <div className="flex items-center justify-between gap-4 text-xs border-t border-slate-100 pt-1">
                                <span className="text-slate-500 font-medium">
                                  Monto que DEBERÍA decir:
                                </span>
                                <span className="font-mono font-bold text-blue-700 tabular-nums">
                                  {formatBsVenezuelan(expectedBs)} Bs (${ord.totalUsd.toFixed(2)})
                                </span>
                              </div>
                              <div className="pt-0.5 text-[11px] font-semibold">
                                {matchesPrice ? (
                                  <span className="text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    El monto escaneado coincide con el pedido
                                  </span>
                                ) : (
                                  <span className="text-amber-700 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Pago parcial o diferencia detectada (Dif: Bs. {formatBsVenezuelan(diffBs)})
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="pt-1 border-t border-slate-100 text-[11px] text-indigo-800 font-medium">
                              Catálogo de ropa abierto: verifica que el monto del comprobante corresponda a la prenda indicada por el cliente antes de confirmar.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                      {ord.receiptImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewReceipt({
                              imageUrl: ord.receiptImageUrl!,
                              title: ord.itemsSummary,
                              phone: ord.phone,
                              operationRef: ord.paymentRef,
                              scannedBs,
                              expectedBs,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-blue-700" />
                          <span>Ver Captura</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRejectShopOrder(ord.id)}
                        className="px-3 py-1.5 text-xs font-semibold border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onApproveShopOrder(ord)}
                        className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aprobar Pedido (Sí)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: AI Pago Móvil Evaluator & Manual/Exception Payment Entry */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Escáner IA de Comprobantes (Detecta "19.540,00 Bs" y "Operación: 007583657705")
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Evaluar y Registrar Comprobante de Pago Móvil o Pago Parcial / Mixto
            </h3>
            <p className="text-xs text-slate-600 max-w-3xl">
              Sube cualquier captura de Pago Móvil para que la IA escanee el monto (ej.{' '}
              <span className="font-mono font-semibold">19.540,00 Bs</span>) y la{' '}
              <span className="font-mono font-semibold">Operación: 007583657705</span>, y compáralo con el precio que debería tener según lo que el cliente está pagando (1 o 3 membresías, mitad en efectivo y mitad por Pago Móvil, etc.).
            </p>
          </div>

          <label className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer shrink-0">
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>{evalImageUrl ? 'Cambiar Captura de Pago Móvil' : 'Subir Captura para Escanear'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadReceiptToScan}
              className="hidden"
            />
          </label>
        </div>

        {evalScanning && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Escaneando imagen del Pago Móvil (buscando monto en Bs. y "Operación:")...</span>
          </div>
        )}

        {evalFeedback && !evalScanning && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-900">
            {evalFeedback}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Teléfono del Cliente
              </label>
              <input
                type="text"
                value={evalPhone}
                onChange={(e) => setEvalPhone(e.target.value)}
                placeholder="+58 412-1234567"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tipo de Pago / Destino
              </label>
              <select
                value={evalCategory}
                onChange={(e) => {
                  const nextCat = e.target.value as 'membresia' | 'consumibles' | 'ropa';
                  setEvalCategory(nextCat);
                  recalculateExpectedFromClaim(nextCat, evalMemCount, evalClaimText);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="membresia">Membresía(s) (BDV 18318153)</option>
                <option value="consumibles">Jugos, Agua o Comida (BDV 17636777)</option>
                <option value="ropa">Ropa Deportiva (BDV 18318153)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ¿Qué dice el cliente que pagó?
              </label>
              <input
                type="text"
                value={evalClaimText}
                onChange={(e) => {
                  setEvalClaimText(e.target.value);
                  recalculateExpectedFromClaim(evalCategory, evalMemCount, e.target.value);
                }}
                placeholder="Ej: 3 membresías / Mitad de un agua mineral"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cantidad de Membresías / Unidades
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={evalMemCount}
                onChange={(e) => {
                  const c = Math.max(1, Number(e.target.value) || 1);
                  setEvalMemCount(c);
                  recalculateExpectedFromClaim(evalCategory, c, evalClaimText);
                }}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Monto Escaneado en Captura (Bs.) — ARRIBA
              </label>
              <input
                type="number"
                step="0.01"
                value={evalScannedBs}
                onChange={(e) => setEvalScannedBs(e.target.value)}
                placeholder="19540.00"
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-800 mb-1">
                Monto que DEBERÍA Decir (Bs.) — ABAJO
              </label>
              <input
                type="number"
                step="0.01"
                value={evalExpectedBs}
                onChange={(e) => setEvalExpectedBs(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-emerald-800 border border-emerald-300 rounded-lg bg-emerald-50/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Operación Escaneada (Identificador)
              </label>
              <input
                type="text"
                value={evalOperationRef}
                onChange={(e) => setEvalOperationRef(e.target.value)}
                placeholder="007583657705"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nota de Excepción (Efectivo + Pago Móvil / Pago Parcial)
              </label>
              <input
                type="text"
                value={evalNote}
                onChange={(e) => setEvalNote(e.target.value)}
                placeholder="Ej: Pagó $10 en efectivo y el resto por Pago Móvil"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900">
              Vista Rápida para el Administrador
            </h4>
            {evalImageUrl && (
              <img
                src={evalImageUrl}
                alt="Previsualización Pago Móvil"
                className="w-full h-40 object-contain bg-slate-950 rounded-lg border border-slate-300"
              />
            )}
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Monto escaneado (Arriba):</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatBsVenezuelan(Number(evalScannedBs) || Number(evalExpectedBs) || 0)} Bs
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span className="text-slate-500">Debería decir (Abajo):</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatBsVenezuelan(Number(evalExpectedBs) || 0)} Bs (${Number(evalExpectedUsd || 0).toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span className="text-slate-500">Operación:</span>
                <span className="font-mono font-bold text-slate-800">
                  {evalOperationRef || '007583657705'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                const expBs = Math.max(0, Number(evalExpectedBs) || 0);
                const scanBs = Math.max(0, Number(evalScannedBs) || expBs);
                const expUsd = Math.max(0, Number(evalExpectedUsd) || 0);
                await onCreateEvaluatedPendingPayment({
                  phone: evalPhone.trim() || '+58 412-0000000',
                  conceptText: evalClaimText.trim() || 'Membresía Mensual',
                  category: evalCategory,
                  membershipCount: evalMemCount,
                  scannedAmountBs: scanBs,
                  expectedAmountBs: expBs,
                  expectedAmountUsd: expUsd,
                  operationRef: evalOperationRef.trim() || '007583657705',
                  receiptImageUrl: evalImageUrl || undefined,
                  paymentNote: evalNote.trim() || undefined,
                });
                setEvalImageUrl('');
                setEvalScannedBs('');
                setEvalOperationRef('');
                setEvalNote('');
                setEvalFeedback(null);
              }}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Enviar a Cola de Aprobación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
