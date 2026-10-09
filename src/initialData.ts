import {
  ChatMessageItem,
  ExchangeSettings,
  MembershipRecord,
  ProductItem,
  ShopOrderRecord,
} from './types';

export const DEFAULT_PAGO_MOVIL_TEXT = `Para pagos de Jugos, Bebidas, Comida
Banco de Venezuela
17636777
04246559787 
Para pagos de Mensualidad y Ropa
Banco de Venezuela 
18318153 
04146734866.`;

export const DEFAULT_SCHEDULE_TEXT =
  'Lunes a Viernes de 7:00 AM a 9:00 PM | Sábados (horario especial aparte) de 10:00 AM a 3:00 PM | Domingos cerrado.';

export const DEFAULT_EXCHANGE_SETTINGS: ExchangeSettings = {
  id: 'default_settings',
  ownerId: 'local_owner',
  mode: 'auto_bcv',
  manualRate: 70.0,
  activeRate: 68.45,
  bcvRate: 68.45,
  euroRate: 74.95,
  businessName: 'FormaGym',
  scheduleText: DEFAULT_SCHEDULE_TEXT,
  membershipMonthlyUsd: 30.0,
  membershipMonthlyBs: 2053.5,
  registrationUsd: 15.0,
  registrationBs: 1026.75,
  paymentMethodsText: DEFAULT_PAGO_MOVIL_TEXT,
  ownerPhoneMemberships: '+58 414-6734866',
  ownerPhoneConsumables: '+58 424-6559787',
  ownerPhoneSupport: '+58 414-6734866',
  adminNumbers: '',
};

// Legacy testing chat/demo IDs that should be ignored
export const LEGACY_DEMO_IDS = new Set([
  'msg_init_1',
  'msg_init_2',
  'msg_init_3',
  'msg_init_4',
  'prod_membresia_mensual',
  'prod_agua_600',
  'prod_isotonica',
  'prod_jugo_verde',
  'prod_batido_whey',
  'prod_wrap_pollo',
  'prod_barra_proteina',
  'prod_franela_dryfit',
]);

export function isLegacyDemoId(id: string): boolean {
  if (!id) return false;
  if (LEGACY_DEMO_IDS.has(id)) return true;
  for (const demoPrefix of LEGACY_DEMO_IDS) {
    if (id.startsWith(`${demoPrefix}_`)) return true;
  }
  return false;
}

export const INITIAL_PRODUCTS: Omit<ProductItem, 'ownerId'>[] = [];

export const INITIAL_SHOP_ORDERS: Omit<ShopOrderRecord, 'ownerId'>[] = [];

export const INITIAL_MEMBERSHIPS: Omit<MembershipRecord, 'ownerId'>[] = [];

export const INITIAL_MESSAGES: Omit<ChatMessageItem, 'ownerId'>[] = [];
