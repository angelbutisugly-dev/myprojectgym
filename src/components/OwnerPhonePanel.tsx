import React, { useState } from 'react';
import {
  Camera,
  Check,
  Image as ImageIcon,
  MessageSquareReply,
  Phone,
  Send,
  ShoppingBag,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import {
  ChatMessageItem,
  ExchangeSettings,
  MembershipRecord,
  ShopOrderRecord,
  SupportForwardSession,
} from '../types';

interface OwnerPhonePanelProps {
  settings: ExchangeSettings;
  messages: ChatMessageItem[];
  pendingMemberships: MembershipRecord[];
  pendingShopOrders: ShopOrderRecord[];
  supportSessions: SupportForwardSession[];
  onApproveMembership: (m: MembershipRecord) => Promise<void>;
  onApproveShopOrder: (o: ShopOrderRecord) => Promise<void>;
  onSendSupportReply: (session: SupportForwardSession, replyText: string) => Promise<void>;
  onUpdateOwnerPhones: (
    memPhone: string,
    consPhone: string,
    supPhone: string
  ) => Promise<void>;
}

export const OwnerPhonePanel: React.FC<OwnerPhonePanelProps> = ({
  settings,
  messages,
  pendingMemberships,
  pendingShopOrders,
  supportSessions,
  onApproveMembership,
  onApproveShopOrder,
  onSendSupportReply,
  onUpdateOwnerPhones,
}) => {
  const [activeOwnerRole, setActiveOwnerRole] = useState<
    'memberships' | 'consumables' | 'support'
  >('memberships');
  const [ownerReplyInput, setOwnerReplyInput] = useState('');
  const [editingPhones, setEditingPhones] = useState(false);
  const [memPhoneDraft, setMemPhoneDraft] = useState(settings.ownerPhoneMemberships);
  const [consPhoneDraft, setConsPhoneDraft] = useState(settings.ownerPhoneConsumables);
  const [supPhoneDraft, setSupPhoneDraft] = useState(settings.ownerPhoneSupport);

  const currentOwnerPhone =
    activeOwnerRole === 'memberships'
      ? settings.ownerPhoneMemberships
      : activeOwnerRole === 'consumables'
      ? settings.ownerPhoneConsumables
      : settings.ownerPhoneSupport;

  const ownerThreadMessages = messages.filter((m) => m.phone === currentOwnerPhone);
  const openSupportSessions = supportSessions.filter((s) => s.status === 'forwarded_open');

  const handleOwnerChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = ownerReplyInput.trim();
    if (!text) return;
    setOwnerReplyInput('');

    // If there is an open support session, forward the owner's reply directly to that client!
    if (openSupportSessions.length > 0) {
      await onSendSupportReply(openSupportSessions[0], text);
    }
  };

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[660px]">
      {/* Top Role Selector on Owner's Phone */}
      <div className="bg-slate-900 text-white px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Teléfono Designado del Dueño / Encargado (En Vivo)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMemPhoneDraft(settings.ownerPhoneMemberships);
              setConsPhoneDraft(settings.ownerPhoneConsumables);
              setSupPhoneDraft(settings.ownerPhoneSupport);
              setEditingPhones((v) => !v);
            }}
            className="text-[11px] font-semibold text-slate-300 hover:text-white underline whitespace-nowrap"
          >
            {editingPhones ? 'Cerrar edición' : 'Cambiar números'}
          </button>
        </div>

        {editingPhones && (
          <div className="p-3 bg-slate-800 rounded-lg space-y-2 text-xs">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-[11px] text-slate-300 mb-0.5">
                  Teléfono para Membresías y Ropa:
                </label>
                <input
                  type="text"
                  value={memPhoneDraft}
                  onChange={(e) => setMemPhoneDraft(e.target.value)}
                  className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-0.5">
                  Teléfono para Jugos, Bebidas y Comida:
                </label>
                <input
                  type="text"
                  value={consPhoneDraft}
                  onChange={(e) => setConsPhoneDraft(e.target.value)}
                  className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-0.5">
                  Teléfono Designado para Soporte:
                </label>
                <input
                  type="text"
                  value={supPhoneDraft}
                  onChange={(e) => setSupPhoneDraft(e.target.value)}
                  className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await onUpdateOwnerPhones(
                  memPhoneDraft.trim() || '+58 414-6734866',
                  consPhoneDraft.trim() || '+58 424-6559787',
                  supPhoneDraft.trim() || '+58 414-6734866'
                );
                setEditingPhones(false);
              }}
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded"
            >
              Guardar Números Designados
            </button>
          </div>
        )}

        {/* 3 Designated Phone Tabs */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-800 p-1 rounded-lg text-[11px]">
          <button
            type="button"
            onClick={() => setActiveOwnerRole('memberships')}
            className={`py-1.5 px-2 rounded font-semibold transition-colors text-left truncate ${
              activeOwnerRole === 'memberships'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            1. Membresía ({pendingMemberships.length})
            <span className="block font-mono text-[10px] opacity-80 truncate">
              {settings.ownerPhoneMemberships}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOwnerRole('consumables')}
            className={`py-1.5 px-2 rounded font-semibold transition-colors text-left truncate ${
              activeOwnerRole === 'consumables'
                ? 'bg-sky-400 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            2. Jugos/Comida ({pendingShopOrders.length})
            <span className="block font-mono text-[10px] opacity-80 truncate">
              {settings.ownerPhoneConsumables}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOwnerRole('support')}
            className={`py-1.5 px-2 rounded font-semibold transition-colors text-left truncate ${
              activeOwnerRole === 'support'
                ? 'bg-purple-400 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            3. Soporte ({openSupportSessions.length})
            <span className="block font-mono text-[10px] opacity-80 truncate">
              {settings.ownerPhoneSupport}
            </span>
          </button>
        </div>
      </div>

      {/* Subheader showing active designated phone number */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-semibold text-slate-800"> Viendo WhatsApp de:</span>
          <span className="font-mono font-bold text-emerald-800">{currentOwnerPhone}</span>
        </div>
        <span className="text-[11px] text-slate-500">
          {activeOwnerRole === 'memberships'
            ? 'Recibe Fotos + Pagos de Mensualidad/Ropa'
            : activeOwnerRole === 'consumables'
            ? 'Recibe Fotos + Pagos de Jugos/Bebidas/Comida'
            : 'Recibe Problemas Reenviados (+58...: mensaje)'}
        </span>
      </div>

      {/* Owner Phone Body: Live Redirected Payment Photos & Support Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#e5ddd5]">
        {/* Role 1: Memberships & Clothes Redirected Payments */}
        {activeOwnerRole === 'memberships' && (
          <>
            {pendingMemberships.map((mem) => (
              <div
                key={mem.id}
                className="bg-white rounded-xl p-3.5 shadow-xs border-l-4 border-amber-500 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-bold text-amber-800">
                    📲 REDIRECCIÓN AUTOMÁTICA FORMAGYM
                  </span>
                  <span className="font-mono">Para: {settings.ownerPhoneMemberships}</span>
                </div>

                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-950 font-medium">
                  <ImageIcon className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    📸 Foto de Comprobante + Producto en el mismo mensaje (Ref: {mem.paymentRef})
                  </span>
                </div>

                <div className="font-mono text-slate-900 font-semibold">
                  {mem.phone}: Pagó {mem.planName}
                </div>
                <div className="text-slate-600 font-mono">
                  Monto: ${mem.priceUsd.toFixed(2)} USD = Bs. {mem.totalBs.toFixed(2)} · Ref:{' '}
                  {mem.paymentRef}
                </div>

                <button
                  type="button"
                  onClick={() => onApproveMembership(mem)}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    Aprobar Pago desde mi Teléfono (El Bot le pedirá Cédula y Nombre)
                  </span>
                </button>
              </div>
            ))}
          </>
        )}

        {/* Role 2: Juices, Drinks & Food Redirected Payments */}
        {activeOwnerRole === 'consumables' && (
          <>
            {pendingShopOrders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-xl p-3.5 shadow-xs border-l-4 border-sky-500 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-bold text-sky-800">
                    🥤 REDIRECCIÓN DE JUGOS / BEBIDAS / COMIDA
                  </span>
                  <span className="font-mono">Para: {settings.ownerPhoneConsumables}</span>
                </div>

                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg flex items-center gap-2 text-sky-950 font-medium">
                  <Camera className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>
                    📸 Foto de Comprobante + Producto en el mismo mensaje (Ref: {ord.paymentRef})
                  </span>
                </div>

                <div className="font-mono text-slate-900 font-semibold">
                  {ord.phone}: {ord.itemsSummary}
                </div>
                <div className="text-slate-600 font-mono">
                  Total: ${ord.totalUsd.toFixed(2)} USD = Bs. {ord.totalBs.toFixed(2)} · Ref:{' '}
                  {ord.paymentRef}
                </div>

                <button
                  type="button"
                  onClick={() => onApproveShopOrder(ord)}
                  className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Aprobar Pedido de Tienda desde mi Teléfono</span>
                </button>
              </div>
            ))}
          </>
        )}

        {/* Role 3: Forwarded Support Messages ("+58 4146734866: message forwarded") */}
        {activeOwnerRole === 'support' && (
          <>
            {supportSessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-white rounded-xl p-3.5 shadow-xs border-l-4 border-purple-600 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-bold text-purple-800">
                    🆘 NOTIFICACIÓN DE SOPORTE REENVIADO
                  </span>
                  <span className="font-mono">{sess.createdAtLabel}</span>
                </div>

                {/* Exact format requested by user: "+58 4146734866: in this case the message forwarded." */}
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg font-mono text-slate-900 font-semibold text-[13px]">
                  {sess.clientPhone}: {sess.issueText}
                </div>

                {sess.status === 'forwarded_open' ? (
                  <p className="text-[11px] text-slate-600">
                    👇 Escribe tu respuesta abajo. El bot de <strong>FormaGym</strong> se la reenviará automáticamente a{' '}
                    <span className="font-mono font-semibold">{sess.clientPhone}</span> sin que tengas que hablarle desde tu número personal.
                  </p>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">
                    <span className="font-semibold">Tu respuesta reenviada por el bot:</span> &ldquo;
                    {sess.lastReplyText}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Also show raw message logs sent to this designated owner phone */}
        {ownerThreadMessages.map((m) => (
          <div key={m.id} className="bg-white/90 rounded-xl p-3 text-xs shadow-xs">
            <div className="text-[10px] font-mono text-slate-400 mb-1">
              Mensaje en {currentOwnerPhone} · {m.timestampLabel || 'Hoy'}
            </div>
            <div className="whitespace-pre-wrap text-slate-800">{m.text}</div>
          </div>
        ))}

        {activeOwnerRole === 'memberships' &&
          pendingMemberships.length === 0 &&
          ownerThreadMessages.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-600 bg-white/80 rounded-xl p-4">
              Cuando un cliente envíe la foto de su Pago Móvil de <strong>Membresía o Ropa</strong>, aparecerá aquí en el teléfono{' '}
              <strong className="font-mono">{settings.ownerPhoneMemberships}</strong>.
            </div>
          )}

        {activeOwnerRole === 'consumables' &&
          pendingShopOrders.length === 0 &&
          ownerThreadMessages.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-600 bg-white/80 rounded-xl p-4">
              Cuando un cliente envíe la foto de su Pago Móvil de <strong>Jugos, Bebidas o Comida</strong>, aparecerá aquí en el teléfono{' '}
              <strong className="font-mono">{settings.ownerPhoneConsumables}</strong>.
            </div>
          )}
      </div>

      {/* Bottom Reply Bar for Designated Support Number */}
      <form
        onSubmit={handleOwnerChatSubmit}
        className="bg-slate-100 p-3 border-t border-slate-200 flex items-center gap-2"
      >
        <MessageSquareReply className="w-4 h-4 text-purple-700 shrink-0" />
        <input
          type="text"
          value={ownerReplyInput}
          onChange={(e) => setOwnerReplyInput(e.target.value)}
          placeholder={
            openSupportSessions.length > 0
              ? `Responder desde ${settings.ownerPhoneSupport} a ${openSupportSessions[0].clientPhone}...`
              : `Responder como encargado (${currentOwnerPhone})...`
          }
          className="flex-1 bg-white px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
        />
        <button
          type="submit"
          disabled={!ownerReplyInput.trim()}
          className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Reenviar al Cliente</span>
        </button>
      </form>
    </div>
  );
};
