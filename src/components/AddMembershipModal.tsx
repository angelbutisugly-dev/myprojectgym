import React, { useState } from 'react';
import { Calendar, Camera, Check, Loader2, Plus, ScanLine, X } from 'lucide-react';
import {
  addCalendarMonths,
  formatSpanishDate,
  getTodayIsoDate,
  inferStartDateFromExpiry,
  MembershipRecord,
  MembershipStatus,
} from '../types';

interface AddMembershipModalProps {
  defaultUsd: number;
  defaultBs: number;
  defaultRegistrationUsd?: number;
  defaultRegistrationBs?: number;
  defaultRateBs: number;
  bcvRate?: number;
  euroRate?: number;
  manualRate?: number;
  defaultRateMode?: 'auto_bcv' | 'auto_euro' | 'manual';
  initialRecord?: MembershipRecord | null;
  onClose: () => void;
  onSave: (
    record: Omit<MembershipRecord, 'id' | 'ownerId'>,
    existingId?: string
  ) => Promise<void>;
}

export const AddMembershipModal: React.FC<AddMembershipModalProps> = ({
  defaultUsd,
  defaultBs,
  defaultRegistrationUsd = 15,
  defaultRegistrationBs,
  defaultRateBs,
  bcvRate,
  euroRate,
  manualRate,
  defaultRateMode = 'auto_bcv',
  initialRecord,
  onClose,
  onSave,
}) => {
  const initialMonths = Math.max(
    1,
    initialRecord?.prepaidMonths || initialRecord?.membershipCount || 1
  );
  const initialStart =
    initialRecord?.startDate ||
    (initialRecord?.expiresAt
      ? inferStartDateFromExpiry(initialRecord.expiresAt, initialMonths)
      : getTodayIsoDate());

  const [firstName, setFirstName] = useState(initialRecord?.firstName || '');
  const [lastName, setLastName] = useState(initialRecord?.lastName || '');
  const [cedula, setCedula] = useState(initialRecord?.cedula || '');
  const [startDate, setStartDate] = useState(initialStart);
  const [prepaidMonths, setPrepaidMonths] = useState<number>(initialMonths);
  const [expiresAt, setExpiresAt] = useState(
    initialRecord?.expiresAt || addCalendarMonths(initialStart, initialMonths)
  );
  const [phone, setPhone] = useState(initialRecord?.phone || '');
  const [status, setStatus] = useState<MembershipStatus>(initialRecord?.status || 'active');
  const [includesRegistration, setIncludesRegistration] = useState<boolean>(
    Boolean(initialRecord?.includesRegistration)
  );
  const [isRegisteredForLife, setIsRegisteredForLife] = useState<boolean>(
    initialRecord?.isRegisteredForLife !== undefined
      ? Boolean(initialRecord.isRegisteredForLife)
      : true
  );
  const [planName, setPlanName] = useState(
    initialRecord?.planName || 'Membresía Mensual FormaGym'
  );
  const [selectedRateMode, setSelectedRateMode] = useState<'auto_bcv' | 'auto_euro' | 'manual'>(
    defaultRateMode
  );
  const getRateByMode = (mode: 'auto_bcv' | 'auto_euro' | 'manual') => {
    if (mode === 'auto_euro') return euroRate || defaultRateBs;
    if (mode === 'manual') return manualRate || defaultRateBs;
    return bcvRate || defaultRateBs;
  };
  const [priceUsd, setPriceUsd] = useState(
    String(initialRecord?.priceUsd ?? Number((defaultUsd * initialMonths).toFixed(2)))
  );
  const [totalBs, setTotalBs] = useState(
    String(initialRecord?.totalBs ?? Number((defaultBs * initialMonths).toFixed(2)))
  );
  const [paymentRef, setPaymentRef] = useState(initialRecord?.paymentRef || '');
  const [paymentMethod, setPaymentMethod] = useState(
    initialRecord?.paymentMethod || 'Registro Manual Admin'
  );
  const [receiptImageUrl, setReceiptImageUrl] = useState<string>(
    initialRecord?.receiptImageUrl || ''
  );
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleStartDateChange = (nextStart: string) => {
    const cleanStart = nextStart || getTodayIsoDate();
    setStartDate(cleanStart);
    setExpiresAt(addCalendarMonths(cleanStart, prepaidMonths));
  };

  const handlePrepaidMonthsChange = (nextMonths: number, includeReg = includesRegistration) => {
    const m = Math.max(1, nextMonths);
    setPrepaidMonths(m);
    setExpiresAt(addCalendarMonths(startDate, m));
    const regAdd = includeReg ? defaultRegistrationUsd : 0;
    const nextUsd = Number((defaultUsd * m + regAdd).toFixed(2));
    const activeRateVal = getRateByMode(selectedRateMode);
    setPriceUsd(String(nextUsd));
    setTotalBs(String(Number((nextUsd * activeRateVal).toFixed(2))));
  };

  const handleToggleIncludesRegistration = (checked: boolean) => {
    setIncludesRegistration(checked);
    if (checked) {
      setIsRegisteredForLife(true);
      setPlanName(`Inscripción Vitalicia + Membresía Mensual FormaGym`);
    } else {
      setPlanName(`Membresía Mensual FormaGym`);
    }
    const regAdd = checked ? defaultRegistrationUsd : 0;
    const nextUsd = Number((defaultUsd * prepaidMonths + regAdd).toFixed(2));
    const activeRateVal = getRateByMode(selectedRateMode);
    setPriceUsd(String(nextUsd));
    setTotalBs(String(Number((nextUsd * activeRateVal).toFixed(2))));
  };

  const handleSetRegistrationOnly = () => {
    setIncludesRegistration(true);
    setIsRegisteredForLife(true);
    setPlanName(`Inscripción Vitalicia FormaGym (De por vida)`);
    const nextUsd = Number(defaultRegistrationUsd.toFixed(2));
    const activeRateVal = getRateByMode(selectedRateMode);
    const nextBs = defaultRegistrationBs
      ? Number(defaultRegistrationBs.toFixed(2))
      : Number((nextUsd * activeRateVal).toFixed(2));
    setPriceUsd(String(nextUsd));
    setTotalBs(String(nextBs));
  };

  const handleRateModeSelect = (nextMode: 'auto_bcv' | 'auto_euro' | 'manual') => {
    setSelectedRateMode(nextMode);
    const r = getRateByMode(nextMode);
    const u = Math.max(0, Number(priceUsd) || defaultUsd);
    setTotalBs(String(Number((u * r).toFixed(2))));
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setReceiptImageUrl(dataUrl);
      setScanningReceipt(true);
      setScanResultMsg('Escaneando "Operación:" y monto en el comprobante...');
      try {
        const res = await fetch('/api/bot/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiptImageUrl: dataUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          const opNum = data?.operationNumber || data?.scanned?.operationNumber;
          if (opNum) {
            setPaymentRef(opNum);
            if (!firstName.trim() || firstName.startsWith('Operación:')) {
              setFirstName(`Operación: ${opNum}`);
            }
            setScanResultMsg(`Detectado automáticamente — Operación: ${opNum}`);
          } else {
            setScanResultMsg('Imagen cargada. Puedes escribir o ajustar el número de Operación.');
          }
        } else {
          setScanResultMsg('Imagen cargada correctamente.');
        }
      } catch {
        setScanResultMsg('Imagen cargada correctamente.');
      } finally {
        setScanningReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const resolvedRef = paymentRef.trim() || `MANUAL-${Date.now().toString().slice(-6)}`;
      const rawCed = cedula.trim().toUpperCase().replace(/[\s.]+/g, '');
      const normalizedCedula = rawCed
        ? /^[VEJ]-?\d+$/.test(rawCed)
          ? rawCed.includes('-')
            ? rawCed
            : `${rawCed[0]}-${rawCed.slice(1)}`
          : /^\d+$/.test(rawCed)
          ? `V-${rawCed}`
          : cedula.trim()
        : '';

      const cleanPhone = phone.trim();
      const hasValidPhone = cleanPhone.replace(/\D/g, '').length >= 7;

      const resolvedFirstName =
        firstName.trim() ||
        (status === 'pending_payment' || status === 'awaiting_profile'
          ? `Operación: ${resolvedRef}`
          : 'Miembro');

      await onSave(
        {
          phone: hasValidPhone ? cleanPhone : '',
          firstName: resolvedFirstName,
          lastName: lastName.trim(),
          cedula: normalizedCedula,
          status,
          planName: planName.trim() || 'Membresía Mensual FormaGym',
          priceUsd: Math.max(0, Number(priceUsd) || defaultUsd),
          rateBs: initialRecord?.rateBs ?? defaultRateBs,
          totalBs: Math.max(0, Number(totalBs) || defaultBs),
          paymentRef: resolvedRef,
          paymentMethod: paymentMethod.trim() || 'Registro Manual Admin',
          startDate: startDate || getTodayIsoDate(),
          expiresAt: expiresAt || addCalendarMonths(startDate || getTodayIsoDate(), prepaidMonths),
          prepaidMonths,
          membershipCount: prepaidMonths,
          needsManualPhone: !hasValidPhone,
          lastReminderSent: initialRecord?.lastReminderSent || '',
          isRegisteredForLife,
          includesRegistration,
          ...(receiptImageUrl ? { receiptImageUrl } : {}),
        },
        initialRecord?.id
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto text-slate-900">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {initialRecord ? 'Editar Membresía y Fechas' : 'Agregar Membresía en FormaGym'}
            </h3>
            <p className="text-xs text-slate-500">
              Ingresa Nombre, Cédula y Fecha de Inicio. El vencimiento se calcula por mes calendario exacto.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Nombre, Apellido y Cédula */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                required={status === 'active'}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ej. Carlos"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Apellido
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ej. Rodríguez"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Cédula (ID) *
              </label>
              <input
                type="text"
                required={status === 'active'}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="V-18318153"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>
          </div>

          {/* 2. Fecha de Inicio, Meses Pagados (+2, +3) y Fecha de Vencimiento por Mes Calendario */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-1 text-[11px] font-bold uppercase text-emerald-900 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  Fecha de Inicio *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center justify-between text-[11px] font-bold uppercase text-emerald-900 mb-1">
                  <span>Meses Pagados</span>
                  {prepaidMonths > 1 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold">
                      +{prepaidMonths}
                    </span>
                  )}
                </label>
                <select
                  value={prepaidMonths}
                  onChange={(e) =>
                    handlePrepaidMonthsChange(parseInt(e.target.value, 10) || 1)
                  }
                  className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 outline-none"
                >
                  <option value={1}>1 Mes (Normal)</option>
                  <option value={2}>2 Membresías / Meses (+2)</option>
                  <option value={3}>3 Membresías / Meses (+3)</option>
                  <option value={4}>4 Meses (+4)</option>
                  <option value={6}>6 Meses (+6)</option>
                  <option value={12}>12 Meses (+12)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-emerald-900 mb-1">
                  Fecha Vencimiento
                </label>
                <input
                  type="date"
                  required
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-xs font-mono font-bold text-emerald-800 focus:border-emerald-600 outline-none"
                />
              </div>
            </div>

            <div className="text-[11px] text-emerald-900 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-200/80">
              <span>
                📅 Vence el día: <strong>{formatSpanishDate(expiresAt)}</strong>
              </span>
              <span className="text-emerald-700">
                (Ej: 20 Ene → 20 Feb | 31 Ene → 28 Feb)
              </span>
            </div>
          </div>

          {/* 2B. Inscripción Vitalicia (De por vida) y Tipo de Cobro */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase text-amber-950">
                Estado de Inscripción Vitalicia (De por vida: ${defaultRegistrationUsd.toFixed(2)} USD)
              </span>
              <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRegisteredForLife}
                  onChange={(e) => setIsRegisteredForLife(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>Inscrito de por vida ✅</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleToggleIncludesRegistration(false)}
                className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-center cursor-pointer ${
                  !includesRegistration
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Ya Inscrito: Solo Mensualidad (${(defaultUsd * prepaidMonths).toFixed(2)})
              </button>
              <button
                type="button"
                onClick={() => handleToggleIncludesRegistration(true)}
                className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-center cursor-pointer ${
                  includesRegistration && planName.includes('Membresía')
                    ? 'bg-amber-900 text-white border-amber-950'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Nuevo: Inscripción + Mensualidad ($
                {(defaultUsd * prepaidMonths + defaultRegistrationUsd).toFixed(2)})
              </button>
              <button
                type="button"
                onClick={handleSetRegistrationOnly}
                className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-center cursor-pointer ${
                  includesRegistration && !planName.includes('Membresía')
                    ? 'bg-amber-700 text-white border-amber-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Solo Inscripción Vitalicia (${defaultRegistrationUsd.toFixed(2)})
              </button>
            </div>
          </div>

          {/* 3. Teléfono WhatsApp (Opcional si se vinculará por el bot o luego) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Teléfono WhatsApp (Opcional)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+58 412-1234567 (o vacío)"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Si lo dejas vacío, el bot lo agregará cuando la persona escriba su Nombre y Cédula.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Estado de la Membresía
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MembershipStatus)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 outline-none"
              >
                <option value="active">Activa (Pagada / Registrada)</option>
                <option value="pending_payment">Pago Pendiente por Aprobar</option>
                <option value="awaiting_profile">Pago Aprobado (Falta Cédula/Nombre)</option>
                <option value="pending_registration_check">
                  Verificando si está Inscrito (Consulta Admin)
                </option>
                <option value="expiring_soon">Por Vencer Pronto</option>
                <option value="expired">Vencida (Pero Inscrito de por vida)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Tasa a Aplicar
              </label>
              <select
                value={selectedRateMode}
                onChange={(e) =>
                  handleRateModeSelect(e.target.value as 'auto_bcv' | 'auto_euro' | 'manual')
                }
                className="w-full bg-emerald-50/70 border border-emerald-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 outline-none"
              >
                <option value="auto_bcv">
                  Dólar BCV (Bs. {(bcvRate || defaultRateBs).toFixed(2)})
                </option>
                <option value="auto_euro">
                  Euro BCV (Bs. {(euroRate || defaultRateBs).toFixed(2)})
                </option>
                <option value="manual">
                  Tasa Manual (Bs. {(manualRate || defaultRateBs).toFixed(2)})
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Monto USD ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={priceUsd}
                onChange={(e) => {
                  const v = e.target.value;
                  setPriceUsd(v);
                  const numU = Math.max(0, Number(v) || 0);
                  const r = getRateByMode(selectedRateMode);
                  if (numU > 0 && r > 0) {
                    setTotalBs(String(Number((numU * r).toFixed(2))));
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Monto Bolívares (Bs.)
              </label>
              <input
                type="number"
                step="0.01"
                value={totalBs}
                onChange={(e) => setTotalBs(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-emerald-700 font-semibold focus:border-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Referencia (Opcional)
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Manual / Efectivo / Op"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Plan / Concepto
              </label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Método / Cuenta Destino
              </label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-900">
                  Foto del Comprobante (Opcional)
                </span>
              </div>
              <label className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                <Camera className="w-3.5 h-3.5" />
                <span>{receiptImageUrl ? 'Cambiar Foto' : 'Subir Captura'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptFileChange}
                  className="hidden"
                />
              </label>
            </div>
            {scanningReceipt && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Escaneando número de Operación en el comprobante...</span>
              </div>
            )}
            {scanResultMsg && !scanningReceipt && (
              <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                {scanResultMsg}
              </div>
            )}
            {receiptImageUrl && (
              <div className="flex items-start gap-3 pt-1">
                <img
                  src={receiptImageUrl}
                  alt="Comprobante Pago Móvil"
                  className="w-24 h-24 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
                />
                <div className="text-[11px] text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-900">
                    Identificador detectado:{' '}
                    <span className="font-mono text-emerald-700">Operación: {paymentRef}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptImageUrl('');
                      setScanResultMsg(null);
                    }}
                    className="text-red-600 hover:underline font-semibold cursor-pointer"
                  >
                    Quitar foto
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {initialRecord ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? 'Guardando...' : initialRecord ? 'Guardar Cambios' : 'Guardar Membresía'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

