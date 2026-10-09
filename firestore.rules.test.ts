/**
 * Adversarial Security Rules Verification ("Dirty Dozen" Payloads)
 * Verifies all 12 adversarial payloads against the Firestore Security Rules invariants.
 */

export interface DirtyPayloadTest {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  docId: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyPayloadTest[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Membership Create',
    collection: 'memberships',
    operation: 'create',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    docId: 'mem_valid_1',
    payload: {
      ownerId: 'victim_owner_uid',
      phone: '+584121234567',
      cedula: 'V-12345678',
      firstName: 'Juan',
      lastName: 'Perez',
      planName: 'Mensual VIP',
      status: 'pending_payment',
      priceUsd: 35,
      rateBs: 45.5,
      totalBs: 1592.5,
      paymentRef: '123456',
      paymentMethod: 'Pago Movil',
      expiresAt: '2026-11-05',
      lastReminderSent: '',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    collection: 'exchange_settings',
    operation: 'create',
    auth: { uid: 'spoof_admin', email: 'mendozaissrael@gmail.com', email_verified: false },
    docId: 'settings_1',
    payload: {
      ownerId: 'spoof_admin',
      mode: 'manual',
      manualRate: 50,
      activeRate: 50,
      bcvRate: 45,
      businessName: 'Gym Caracas',
      scheduleText: 'Lunes a Sabado 6am - 9pm',
      membershipMonthlyUsd: 30,
      paymentMethodsText: 'Pago Movil y Zelle',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Product Create',
    collection: 'products',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'prod_1',
    payload: {
      ownerId: 'user_1',
      name: 'Agua Mineral 600ml',
      category: 'agua_hidratacion',
      description: 'Agua fría',
      basePriceUsd: 1.5,
      stock: 50,
      available: true,
      isShadowAdminField: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Path ID Poisoning',
    collection: 'products',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'invalid/id$with#bad*chars!',
    payload: {
      ownerId: 'user_1',
      name: 'Jugo Verde',
      category: 'jugos_saludables',
      description: 'Detox natural',
      basePriceUsd: 3.5,
      stock: 20,
      available: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Timestamp Forgery on Create',
    collection: 'chat_messages',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'msg_1',
    payload: {
      ownerId: 'user_1',
      phone: '+584149998877',
      sender: 'bot',
      text: 'Hola, bienvenido',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable Field Mutation on Update',
    collection: 'memberships',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'mem_1',
    payload: {
      ownerId: 'different_owner_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Value Poisoning on Membership Status Update',
    collection: 'memberships',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'mem_1',
    payload: {
      status: 'super_unlimited_free',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Denial of Wallet String Overflow',
    collection: 'chat_messages',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'msg_overflow',
    payload: {
      ownerId: 'user_1',
      phone: '+584149998877',
      sender: 'client',
      text: 'A'.repeat(5000),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Cross-Tenant PII Read / Get',
    collection: 'memberships',
    operation: 'get',
    auth: { uid: 'other_user_2', email: 'other@example.com', email_verified: true },
    docId: 'user_1_membership_doc',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unconstrained List Scraping',
    collection: 'memberships',
    operation: 'list',
    auth: { uid: 'scraper_uid', email: 'scraper@example.com', email_verified: true },
    docId: '*',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Self-Assigned Admin Escalation',
    collection: 'admins',
    operation: 'create',
    auth: { uid: 'rogue_user', email: 'rogue@example.com', email_verified: true },
    docId: 'rogue_user',
    payload: {
      email: 'rogue@example.com',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Negative Price / Invalid Numeric Bounds',
    collection: 'products',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    docId: 'prod_neg',
    payload: {
      ownerId: 'user_1',
      name: 'Agua',
      category: 'agua_hidratacion',
      description: 'Agua mineral',
      basePriceUsd: -99,
      stock: -5,
      available: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
