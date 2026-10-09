import {
  ChatMessageItem,
  ExchangeSettings,
  MembershipRecord,
  ProductItem,
  RateMode,
  ShopOrderRecord,
} from './types';

export const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `doc_${Date.now()}`;
}

export function sanitizeString(val: string, minLen: number, maxLen: number, fallback = '-'): string {
  const trimmed = (val ?? '').trim();
  if (trimmed.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return trimmed.slice(0, maxLen);
}

export function clampNumber(val: number, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (Number.isNaN(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

export function getRateForMode(
  mode: RateMode,
  settings: Pick<ExchangeSettings, 'bcvRate' | 'euroRate' | 'manualRate'>
): number {
  if (mode === 'auto_euro') return Number(settings.euroRate || 74.95);
  if (mode === 'manual') return Number(settings.manualRate || 70.0);
  return Number(settings.bcvRate || 68.45);
}

export function validateExchangeSettingsPayload(s: ExchangeSettings, ownerId: string) {
  const validModes: RateMode[] = ['auto_bcv', 'auto_euro', 'manual'];
  const mode: RateMode = validModes.includes(s.mode) ? s.mode : 'auto_bcv';
  return {
    ownerId: sanitizeId(ownerId),
    mode,
    manualRate: clampNumber(s.manualRate, 0.01, 1000000, 70),
    activeRate: clampNumber(s.activeRate, 0.01, 1000000, 68.45),
    bcvRate: clampNumber(s.bcvRate, 0.01, 1000000, 68.45),
    euroRate: clampNumber(s.euroRate, 0.01, 1000000, 74.95),
    businessName: sanitizeString(s.businessName, 1, 100, 'FormaGym'),
    scheduleText: sanitizeString(
      s.scheduleText,
      1,
      500,
      'Lunes a Viernes de 7:00 AM a 9:00 PM | Sábados de 10:00 AM a 3:00 PM'
    ),
    membershipMonthlyUsd: clampNumber(s.membershipMonthlyUsd, 0.01, 100000, 30),
    membershipMonthlyBs: clampNumber(s.membershipMonthlyBs, 0.01, 1000000000, 2053.5),
    registrationUsd: clampNumber(s.registrationUsd ?? 15, 0.01, 100000, 15),
    registrationBs: clampNumber(
      s.registrationBs ?? Number(((s.registrationUsd ?? 15) * (s.activeRate || 68.45)).toFixed(2)),
      0.01,
      1000000000,
      1026.75
    ),
    paymentMethodsText: sanitizeString(s.paymentMethodsText, 1, 600, 'Banco de Venezuela Pago Móvil'),
    ownerPhoneMemberships: sanitizeString(s.ownerPhoneMemberships, 5, 40, '+58 414-6734866'),
    ownerPhoneConsumables: sanitizeString(s.ownerPhoneConsumables, 5, 40, '+58 424-6559787'),
    ownerPhoneSupport: sanitizeString(s.ownerPhoneSupport, 5, 80, '+58 414-6734866'),
  };
}

export function encodeReminderAndMeta(
  startDate?: string,
  prepaidMonths?: number,
  lastReminderSent?: string
): string {
  const s = (startDate || '').trim().slice(0, 10);
  const m = Math.max(1, Math.trunc(Number(prepaidMonths || 1)));
  const r = (lastReminderSent || '').replace(/^S:[^|]*\|M:\d+\|?R?:/, '').trim().slice(0, 10);
  if (!s && m === 1) return r.slice(0, 40);
  const encoded = r ? `S:${s}|M:${m}|R:${r}` : `S:${s}|M:${m}`;
  return encoded.slice(0, 40);
}

export function decodeReminderAndMeta(rawReminderField?: string): {
  startDate?: string;
  prepaidMonths?: number;
  lastReminderSent: string;
} {
  const raw = (rawReminderField || '').trim();
  if (!raw.startsWith('S:')) {
    return { lastReminderSent: raw };
  }
  const sMatch = raw.match(/S:(\d{4}-\d{2}-\d{2})/);
  const mMatch = raw.match(/M:(\d+)/);
  const rMatch = raw.match(/R:([^\s|]+)/);
  return {
    startDate: sMatch ? sMatch[1] : undefined,
    prepaidMonths: mMatch ? Math.max(1, parseInt(mMatch[1], 10)) : undefined,
    lastReminderSent: rMatch ? rMatch[1] : '',
  };
}

export function validateMembershipPayload(m: MembershipRecord, ownerId: string) {
  const validStatuses = [
    'pending_payment',
    'awaiting_profile',
    'pending_registration_check',
    'active',
    'expiring_soon',
    'expired',
  ];
  const status = validStatuses.includes(m.status) ? m.status : 'pending_payment';
  return {
    ownerId: sanitizeId(ownerId),
    phone: (m.phone ?? '').trim().slice(0, 30),
    cedula: (m.cedula ?? '').trim().slice(0, 30),
    firstName: (m.firstName ?? '').trim().slice(0, 80),
    lastName: (m.lastName ?? '').trim().slice(0, 80),
    planName: sanitizeString(m.planName, 1, 120, 'Membresía Mensual FormaGym'),
    status,
    priceUsd: clampNumber(m.priceUsd, 0, 100000, 30),
    rateBs: clampNumber(m.rateBs, 0.01, 1000000, 68.45),
    totalBs: clampNumber(m.totalBs, 0, 1000000000, 2053.5),
    paymentRef: sanitizeString(m.paymentRef, 1, 60, '007575948032'),
    paymentMethod: sanitizeString(m.paymentMethod, 1, 100, 'Pago Móvil BDV -> +58 414-6734866'),
    expiresAt: sanitizeString(m.expiresAt, 1, 40, '2026-11-05'),
    lastReminderSent: encodeReminderAndMeta(
      m.startDate,
      m.prepaidMonths ?? m.membershipCount,
      m.lastReminderSent
    ),
  };
}

export function validateShopOrderPayload(o: ShopOrderRecord, ownerId: string) {
  const validGroups = ['consumibles', 'ropa'];
  const categoryGroup = validGroups.includes(o.categoryGroup) ? o.categoryGroup : 'consumibles';
  const validStatuses = ['pending_approval', 'confirmed', 'rejected'];
  const status = validStatuses.includes(o.status) ? o.status : 'pending_approval';
  return {
    ownerId: sanitizeId(ownerId),
    phone: sanitizeString(o.phone, 5, 30, '+58 412-0000000'),
    itemsSummary: sanitizeString(o.itemsSummary, 1, 250, 'Pedido de tienda'),
    categoryGroup,
    status,
    totalUsd: clampNumber(o.totalUsd, 0, 100000, 1),
    totalBs: clampNumber(o.totalBs, 0, 1000000000, 68.45),
    paymentRef: sanitizeString(o.paymentRef, 1, 60, '007575948032'),
    pagoMovilTarget: sanitizeString(
      o.pagoMovilTarget,
      1,
      160,
      'BDV 17636777 -> Redirigido a +58 424-6559787'
    ),
  };
}

export function validateProductPayload(p: ProductItem, ownerId: string) {
  const validCategories = [
    'agua_hidratacion',
    'jugos_saludables',
    'alimentos',
    'ropa_deportiva',
    'membresias',
  ];
  const category = validCategories.includes(p.category) ? p.category : 'agua_hidratacion';
  const validModes: RateMode[] = ['auto_bcv', 'auto_euro', 'manual'];
  const rateMode: RateMode = validModes.includes(p.rateMode) ? p.rateMode : 'auto_bcv';

  return {
    ownerId: sanitizeId(ownerId),
    name: sanitizeString(p.name, 1, 100, 'Producto'),
    category,
    description: sanitizeString(p.description, 1, 300, 'Producto disponible en tienda.'),
    basePriceUsd: clampNumber(p.basePriceUsd, 0, 100000, 1),
    priceBs: clampNumber(p.priceBs, 0, 1000000000, 68.45),
    rateMode,
    isCustomBs: Boolean(p.isCustomBs),
    stock: Math.floor(clampNumber(p.stock, 0, 1000000, 10)),
    available: Boolean(p.available),
  };
}

export function validateChatMessagePayload(msg: ChatMessageItem, ownerId: string) {
  const validSenders = ['client', 'bot', 'system'];
  const sender = validSenders.includes(msg.sender) ? msg.sender : 'bot';
  return {
    ownerId: sanitizeId(ownerId),
    phone: sanitizeString(msg.phone, 5, 30, '+58 412-0000000'),
    sender,
    text: sanitizeString(msg.text, 1, 2000, '...'),
  };
}
