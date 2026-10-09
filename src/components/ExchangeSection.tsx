import React, { useEffect, useState } from 'react';
import { CheckCircle2, PhoneCall, RefreshCw, Save } from 'lucide-react';
import { ExchangeSettings, RateMode } from '../types';

interface ExchangeSectionProps {
  settings: ExchangeSettings;
  rateSource: string;
  rateUpdatedAt: string;
  parallelRate: number;
  onSelectRateMode: (mode: RateMode, customRateValue?: number) => Promise<void>;
  onSaveSettings: (nextSettings: ExchangeSettings) => Promise<void>;
  onApplyRateToAllProducts: () => Promise<void>;
}

export const ExchangeSection: React.FC<ExchangeSectionProps> = ({
  settings,
  rateSource,
  rateUpdatedAt,
  parallelRate,
  onSelectRateMode,
  onSaveSettings,
  onApplyRateToAllProducts,
}) => {
  const [draftUsd, setDraftUsd] = useState(settings.membershipMonthlyUsd.toFixed(2));
  const [draftBs, setDraftBs] = useState(settings.membershipMonthlyBs.toFixed(2));
  const [draftManualRate, setDraftManualRate] = useState(settings.manualRate.toFixed(2));
  const [draftEuroRate, setDraftEuroRate] = useState(settings.euroRate.toFixed(2));
  const [draftBcvRate, setDraftBcvRate] = useState(settings.bcvRate.toFixed(2));
  const [draftBusinessName, setDraftBusinessName] = useState(settings.businessName);
  const [draftSchedule, setDraftSchedule] = useState(settings.scheduleText);
  const [draftPaymentText, setDraftPaymentText] = useState(settings.paymentMethodsText);
  const [draftPhoneMem, setDraftPhoneMem] = useState(settings.ownerPhoneMemberships);
  const [draftPhoneCons, setDraftPhoneCons] = useState(settings.ownerPhoneConsumables);
  const [draftPhoneSup, setDraftPhoneSup] = useState(settings.ownerPhoneSupport);

  useEffect(() => {
    setDraftUsd(settings.membershipMonthlyUsd.toFixed(2));
    setDraftBs(settings.membershipMonthlyBs.toFixed(2));
    setDraftManualRate(settings.manualRate.toFixed(2));
    setDraftEuroRate(settings.euroRate.toFixed(2));
    setDraftBcvRate(settings.bcvRate.toFixed(2));
    setDraftBusinessName(settings.businessName);
    setDraftSchedule(settings.scheduleText);
    setDraftPaymentText(settings.paymentMethodsText);
    setDraftPhoneMem(settings.ownerPhoneMemberships);
    setDraftPhoneCons(settings.ownerPhoneConsumables);
    setDraftPhoneSup(settings.ownerPhoneSupport);
  }, [settings]);

  const usdVal = Number(draftUsd) || 0;
  const bsVal = Number(draftBs) || 0;
  const expectedMemBs = Number((usdVal * settings.activeRate).toFixed(2));
  const isMemEdited = Math.abs(bsVal - expectedMemBs) > 0.05;

  const handleCommitSettings = async () => {
    const bcvNum = Math.max(0.01, Number(draftBcvRate) || settings.bcvRate);
    const euroNum = Math.max(0.01, Number(draftEuroRate) || settings.euroRate);
    const manualNum = Math.max(0.01, Number(draftManualRate) || settings.manualRate);

    const active =
      settings.mode === 'auto_bcv'
        ? bcvNum
        : settings.mode === 'auto_euro'
        ? euroNum
        : manualNum;

    await onSaveSettings({
      ...settings,
      bcvRate: Number(bcvNum.toFixed(2)),
      euroRate: Number(euroNum.toFixed(2)),
      manualRate: Number(manualNum.toFixed(2)),
      activeRate: Number(active.toFixed(2)),
      businessName: draftBusinessName.trim() || 'FormaGym',
      scheduleText: draftSchedule,
      membershipMonthlyUsd: Number(usdVal.toFixed(2)),
      membershipMonthlyBs: Number(bsVal.toFixed(2)),
      paymentMethodsText: draftPaymentText,
      ownerPhoneMemberships: draftPhoneMem.trim() || '+58 414-6734866',
      ownerPhoneConsumables: draftPhoneCons.trim() || '+58 424-6559787',
      ownerPhoneSupport: draftPhoneSup.trim() || '+58 414-6734866',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: 3 Rate Modes + Designated Phone Numbers */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Tasas Disponibles (Dólar BCV, Euro BCV y Manual)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              El bot nunca le menciona la tasa al cliente; solo le muestra el precio final. Al cambiar la tasa o presionar &ldquo;Aplicar Tasa&rdquo;, se calcula el equivalente en Bolívares respetando los precios en USD que hayas editado (ej. si cambiaste la mensualidad a $25, calculará el equivalente en Bs. de $25 sin regresarlo a $30).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Mode 1: Dólar BCV */}
            <div
              onClick={() =>
                onSelectRateMode('auto_bcv', Number(draftBcvRate) || settings.bcvRate)
              }
              className={`cursor-pointer p-4 rounded-xl border text-left transition-all ${
                settings.mode === 'auto_bcv'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Tasa Dólar BCV</span>
                {settings.mode === 'auto_bcv' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-mono text-slate-500">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  value={draftBcvRate}
                  onChange={(e) => setDraftBcvRate(e.target.value)}
                  className="w-full px-2 py-1 text-base font-bold font-mono tabular-nums bg-white border border-slate-200 rounded"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {rateSource} ({rateUpdatedAt})
              </p>
            </div>

            {/* Mode 2: Tasa Euro */}
            <div
              onClick={() =>
                onSelectRateMode('auto_euro', Number(draftEuroRate) || settings.euroRate)
              }
              className={`cursor-pointer p-4 rounded-xl border text-left transition-all ${
                settings.mode === 'auto_euro'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Tasa Euro BCV</span>
                {settings.mode === 'auto_euro' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-mono text-slate-500">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  value={draftEuroRate}
                  onChange={(e) => setDraftEuroRate(e.target.value)}
                  className="w-full px-2 py-1 text-base font-bold font-mono tabular-nums bg-white border border-slate-200 rounded"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">Euro Oficial BCV (EUR/VES)</p>
            </div>

            {/* Mode 3: Tasa Manual */}
            <div
              onClick={() =>
                onSelectRateMode('manual', Number(draftManualRate) || settings.manualRate)
              }
              className={`cursor-pointer p-4 rounded-xl border text-left transition-all ${
                settings.mode === 'manual'
                  ? 'border-emerald-600 bg-emerald-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Tasa Manual</span>
                {settings.mode === 'manual' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-mono text-slate-500">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  value={draftManualRate}
                  onChange={(e) => setDraftManualRate(e.target.value)}
                  className="w-full px-2 py-1 text-base font-bold font-mono tabular-nums bg-white border border-slate-200 rounded"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Ref. Paralelo: Bs. {parallelRate.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Calcular Equivalente en Bolívares Según la Tasa de Cada Producto
              </span>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-700">
                Respeta tus precios en USD ($)
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Actualiza únicamente el precio en Bolívares de todos los productos multiplicando el monto en dólares que tú hayas guardado por la tasa asignada a cada producto.
            </p>
            <button
              type="button"
              onClick={onApplyRateToAllProducts}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Aplicar Tasa a los Bolívares de Todos los Productos (Sin cambiar USD)</span>
            </button>
          </div>
        </div>

        {/* Designated Phone Numbers for Payment Photo Redirect & Support Forwarding */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Números Designados para Redirección de Pagos (con Foto) y Soporte
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Configura a qué número de teléfono se redirige cada tipo de pago (con la foto del comprobante y el producto pagado) y a qué número llegan las consultas de soporte.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                1. Número para Pagos de Membresía y Ropa (Recibe Foto + Producto)
              </label>
              <input
                type="text"
                value={draftPhoneMem}
                onChange={(e) => setDraftPhoneMem(e.target.value)}
                placeholder="+58 414-6734866"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                2. Número para Pagos de Jugos, Bebidas y Comida (Recibe Foto + Producto)
              </label>
              <input
                type="text"
                value={draftPhoneCons}
                onChange={(e) => setDraftPhoneCons(e.target.value)}
                placeholder="+58 424-6559787"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                3. Número(s) Designado(s) para Soporte Reenviado (Formato &ldquo;+58...: mensaje&rdquo;)
              </label>
              <input
                type="text"
                value={draftPhoneSup}
                onChange={(e) => setDraftPhoneSup(e.target.value)}
                placeholder="+58 414-6734866"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Cuando este número responda al mensaje reenviado, el bot le enviará la respuesta automáticamente al cliente que pidió ayuda.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: FormaGym Name, Membership Price, Schedule & Pago Móvil */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Configuración de FormaGym, Mensualidad, Horario y Pago Móvil
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Personaliza el nombre del chat (FormaGym), el precio de la mensualidad y los textos oficiales.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Nombre del Chat / Gimnasio
          </label>
          <input
            type="text"
            value={draftBusinessName}
            onChange={(e) => setDraftBusinessName(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-semibold"
          />
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900">
              Precio de la Membresía Mensual
            </span>
            <span
              className={`text-xs font-semibold ${
                isMemEdited ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {isMemEdited
                ? `Editado (Equiv: Bs. ${expectedMemBs.toFixed(2)})`
                : 'Equivalente a la Tasa'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mensualidad en USD ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={draftUsd}
                onChange={(e) => setDraftUsd(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mensualidad en Bolívares (Bs.)
              </label>
              <input
                type="number"
                step="0.01"
                value={draftBs}
                onChange={(e) => setDraftBs(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono tabular-nums"
              />
            </div>
          </div>

          {isMemEdited && (
            <button
              type="button"
              onClick={() => setDraftBs(expectedMemBs.toFixed(2))}
              className="text-xs text-emerald-700 hover:underline font-medium"
            >
              Calcular Bolívares al equivalente de tus ${usdVal.toFixed(2)} USD (Bs.{' '}
              {expectedMemBs.toFixed(2)})
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Horario Oficial (Lunes a Viernes 7am-9pm | Sábados aparte 10am-3pm)
          </label>
          <textarea
            rows={2}
            value={draftSchedule}
            onChange={(e) => setDraftSchedule(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Cuentas de Pago Móvil (Jugos/Bebidas/Comida vs. Mensualidad/Ropa)
          </label>
          <textarea
            rows={5}
            value={draftPaymentText}
            onChange={(e) => setDraftPaymentText(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
          />
        </div>

        <button
          type="button"
          onClick={handleCommitSettings}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>Guardar Configuración, Precios y Números Designados</span>
        </button>
      </div>
    </div>
  );
};
