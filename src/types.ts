export type RateMode = 'auto_bcv' | 'auto_euro' | 'manual';

export type MembershipStatus =
  | 'pending_payment'
  | 'awaiting_profile'
  | 'pending_registration_check'
  | 'active'
  | 'expiring_soon'
  | 'expired';

export type ShopOrderStatus = 'pending_approval' | 'confirmed' | 'rejected';

export type ProductCategory =
  | 'agua_hidratacion'
  | 'jugos_saludables'
  | 'alimentos'
  | 'ropa_deportiva'
  | 'membresias';

export interface ExchangeSettings {
  id: string;
  ownerId: string;
  mode: RateMode;
  manualRate: number;
  activeRate: number;
  bcvRate: number;
  euroRate: number;
  businessName: string;
  scheduleText: string;
  membershipMonthlyUsd: number;
  membershipMonthlyBs: number;
  registrationUsd?: number;
  registrationBs?: number;
  paymentMethodsText: string;
  ownerPhoneMemberships: string;
  ownerPhoneConsumables: string;
  ownerPhoneSupport: string;
  adminNumbers?: string;
  botWhatsAppPhone?: string;
}

export interface DeletedMembershipRecord extends MembershipRecord {
  deletedAt: string;
  deletedReason?: string;
}

export interface DeletedProductRecord extends ProductItem {
  deletedAt: string;
  deletedReason?: string;
}

export interface DeletedShopOrderRecord extends ShopOrderRecord {
  deletedAt: string;
  deletedReason?: string;
  buyerFullName?: string;
  buyerCedulaResolved?: string;
}

export interface MembershipRecord {
  id: string;
  ownerId: string;
  phone: string;
  cedula: string;
  firstName: string;
  lastName: string;
  planName: string;
  status: MembershipStatus;
  priceUsd: number;
  rateBs: number;
  totalBs: number;
  paymentRef: string;
  paymentMethod: string;
  startDate?: string;
  expiresAt: string;
  prepaidMonths?: number;
  lastReminderSent: string;
  receiptImageUrl?: string;
  membershipCount?: number;
  scannedAmountBs?: number;
  expectedAmountBs?: number;
  needsManualPhone?: boolean;
  paidByPhone?: string;
  paymentNote?: string;
  isRegisteredForLife?: boolean;
  includesRegistration?: boolean;
  createdAtIso?: string;
}

export interface ShopOrderRecord {
  id: string;
  ownerId: string;
  phone: string;
  itemsSummary: string;
  categoryGroup: 'consumibles' | 'ropa';
  status: ShopOrderStatus;
  totalUsd: number;
  totalBs: number;
  paymentRef: string;
  pagoMovilTarget: string;
  receiptImageUrl?: string;
  scannedAmountBs?: number;
  expectedAmountBs?: number;
  paymentMethodType?: string;
  paymentNote?: string;
  buyerName?: string;
  buyerCedula?: string;
  createdAtIso?: string;
}

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds exact calendar months to a YYYY-MM-DD date string.
 * Example:
 * - 2026-01-20 + 1 month -> 2026-02-20
 * - 2026-01-31 + 1 month -> 2026-02-28 (or 29 in leap year)
 * - 2026-01-20 + 2 months -> 2026-03-20
 */
export function addCalendarMonths(startDateStr: string, monthsToAdd: number = 1): string {
  const clean = (startDateStr || '').trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const baseDate = match
    ? {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[3], 10),
      }
    : (() => {
        const now = new Date();
        return {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
        };
      })();

  const safeMonths = Number.isFinite(monthsToAdd) ? Math.trunc(monthsToAdd) : 1;
  const targetMonthIndex = baseDate.month - 1 + safeMonths;
  const targetYear = baseDate.year + Math.floor(targetMonthIndex / 12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth0 + 1, 0).getDate();
  const targetDay = Math.min(baseDate.day, daysInTargetMonth);

  return `${targetYear}-${String(targetMonth0 + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function inferStartDateFromExpiry(expiresAtStr: string, monthsPaid: number = 1): string {
  return addCalendarMonths(expiresAtStr, -Math.max(1, monthsPaid));
}

export function formatSpanishDate(isoDateStr?: string | null): string {
  if (!isoDateStr) return 'Sin fecha';
  const clean = isoDateStr.trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDateStr;
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const monthName = SPANISH_MONTHS[monthIdx] || match[2];
  return `${day} de ${monthName} de ${year}`;
}

export interface ProductItem {
  id: string;
  ownerId: string;
  name: string;
  category: ProductCategory;
  description: string;
  basePriceUsd: number;
  priceBs: number;
  rateMode: RateMode;
  isCustomBs: boolean;
  stock: number;
  available: boolean;
}

export interface ChatMessageItem {
  id: string;
  ownerId: string;
  phone: string;
  sender: 'client' | 'bot' | 'system';
  text: string;
  timestampLabel?: string;
}

export interface SupportForwardSession {
  id: string;
  clientPhone: string;
  designatedSupportPhone: string;
  issueText: string;
  status: 'awaiting_issue' | 'forwarded_open' | 'resolved';
  createdAtLabel: string;
  lastReplyText?: string;
}
