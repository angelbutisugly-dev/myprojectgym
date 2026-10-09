import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_DB_PATH = path.join(__dirname, 'formagym_local_db.json');
const BAILEYS_AUTH_DIR = path.join(__dirname, 'baileys_auth_info');

function phoneToWhatsAppJid(rawPhone: string): string | null {
  let digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('04') && digits.length === 11) {
    digits = '58' + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('4')) {
    digits = '58' + digits;
  }
  if (digits.length < 10) return null;
  return `${digits}@s.whatsapp.net`;
}

function jidToFormattedPhone(jid: string): string {
  const digits = (jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (digits.startsWith('58') && digits.length === 12) {
    return `+58 ${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return digits ? `+${digits}` : '+58 412-0000000';
}

function readLocalDiskDb(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore read error
  }
  return null;
}

function writeLocalDiskDb(data: Record<string, unknown>): void {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // ignore write error
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'local-optional-key',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function getLocalNetworkIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // ignore
  }
  return '127.0.0.1';
}

export interface ScannedReceiptData {
  operationNumber: string | null;
  cedula: string | null;
  amountBs: number | null;
  amountBsText: string | null;
  date: string | null;
  destinationPhone: string | null;
}

export function parseVenezuelanAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw > 0) return raw;
  if (!raw) return null;
  const str = String(raw)
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!str) return null;

  // Format like "19.540,00" (dot thousands, comma decimals)
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      const normalized = str.replace(/\./g, '').replace(',', '.');
      const val = parseFloat(normalized);
      return Number.isNaN(val) ? null : val;
    } else {
      const normalized = str.replace(/,/g, '');
      const val = parseFloat(normalized);
      return Number.isNaN(val) ? null : val;
    }
  }
  // Format like "19540,00"
  if (str.includes(',')) {
    const parts = str.split(',');
    if (parts[parts.length - 1].length <= 2) {
      const val = parseFloat(str.replace(',', '.'));
      return Number.isNaN(val) ? null : val;
    }
    const val = parseFloat(str.replace(/,/g, ''));
    return Number.isNaN(val) ? null : val;
  }
  const val = parseFloat(str);
  return Number.isNaN(val) ? null : val;
}

export function formatBsVe(val: number): string {
  return val.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function scanPagoMovilReceiptImage(
  imageBase64DataUrl?: string | null,
  captionText: string = ''
): Promise<ScannedReceiptData> {
  const opLabelMatch = captionText.match(
    /(?:operaci[oó]n|referencia|nro\.?\s*de\s*referencia|comprobante)\s*[:#\-]?\s*(\d{5,20})/i
  );
  const genericDigitsMatch = captionText.match(/\b(00\d{6,16}|\d{7,20})\b/);
  const fallbackOp = opLabelMatch
    ? opLabelMatch[1]
    : genericDigitsMatch
    ? genericDigitsMatch[1]
    : null;

  const amountInCaptionMatch = captionText.match(
    /(?:bs\.?|monto|por)\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i
  );
  const fallbackAmount = amountInCaptionMatch
    ? parseVenezuelanAmount(amountInCaptionMatch[1])
    : null;

  const fallbackResult: ScannedReceiptData = {
    operationNumber: fallbackOp,
    cedula: null,
    amountBs: fallbackAmount,
    amountBsText: fallbackAmount ? formatBsVe(fallbackAmount) : null,
    date: null,
    destinationPhone: null,
  };

  if (!imageBase64DataUrl || !imageBase64DataUrl.startsWith('data:image')) {
    return fallbackResult;
  }

  try {
    const match = imageBase64DataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return fallbackResult;
    const mimeType = match[1];
    const base64Data = match[2];

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `Analiza esta imagen de comprobante de Pago Móvil (por ejemplo Banco de Venezuela PagomóvilBDV Personas u otro banco venezolano).
Extrae con máxima precisión:
1. El monto principal en Bolívares (por ejemplo: "19.540,00" donde dice "19.540,00 Bs").
2. El identificador principal al lado de "Operación:" (o "Operacion:", "Referencia:"), por ejemplo: "007583657705".
3. El número de "Identificación:" (Cédula) si aparece, por ejemplo: "19549164".
4. El teléfono "Destino:" si aparece, por ejemplo: "04246492229".
Responde ÚNICAMENTE con un JSON válido:
{
  "operationNumber": "solo los dígitos de Operación, ej. 007583657705, o null",
  "amountBsText": "texto exacto del monto en Bs, ej. 19.540,00, o null",
  "cedula": "solo los dígitos de Identificación si aparece o null",
  "date": "fecha si aparece o null",
  "destinationPhone": "Número destino si aparece o null"
}`,
        },
      ],
    });

    const rawText = (response.text || '').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const cleanOp = parsed.operationNumber
        ? String(parsed.operationNumber).replace(/\D/g, '')
        : fallbackOp;
      const cleanCedula = parsed.cedula
        ? String(parsed.cedula).replace(/\D/g, '')
        : null;
      const parsedAmount = parseVenezuelanAmount(parsed.amountBsText || parsed.amountBs);
      const finalAmount = parsedAmount ?? fallbackAmount;
      return {
        operationNumber: cleanOp && cleanOp.length >= 4 ? cleanOp : fallbackOp,
        cedula: cleanCedula && cleanCedula.length >= 6 ? cleanCedula : null,
        amountBs: finalAmount,
        amountBsText: finalAmount ? formatBsVe(finalAmount) : null,
        date: parsed.date ? String(parsed.date) : null,
        destinationPhone: parsed.destinationPhone ? String(parsed.destinationPhone) : null,
      };
    }
  } catch (err) {
    console.error('Error escaneando comprobante Pago Móvil con Gemini Vision:', err);
  }

  return fallbackResult;
}

export const PAGO_MOVIL_CONSUMIBLES = `Banco de Venezuela
17636777
04246559787`;

export const PAGO_MOVIL_MENSUALIDAD = `Banco de Venezuela
18318153
04146734866`;

export const PAGO_MOVIL_MESSAGE = `Para pagos de Jugos, Bebidas, Comida
${PAGO_MOVIL_CONSUMIBLES}

Para pagos de Mensualidad y Ropa
${PAGO_MOVIL_MENSUALIDAD}.`;

export const HORARIO_MESSAGE = `🕒 *Horario de FormaGym:*
• *Lunes a Viernes:* 7:00 AM a 9:00 PM
• *Sábados:* 10:00 AM a 3:00 PM
• *Domingos:* Cerrado`;

interface CachedRate {
  bcvRate: number;
  euroRate: number;
  parallelRate: number;
  source: string;
  updatedAt: string;
  fetchedAtMs: number;
}

interface ExternalBotEvent {
  id: string;
  timestamp: string;
  phone: string;
  clientMessage: string;
  hasPhoto: boolean;
  botResult: Record<string, unknown>;
}

export interface PendingAdminPayment {
  id: string;
  clientPhone: string;
  operationNumber: string;
  category: 'membership' | 'consumibles' | 'ropa';
  membershipCount: number;
  planOrItems: string;
  amountUsd: number;
  amountBs: number;
  scannedAmountBs?: number | null;
  expectedAmountBs?: number | null;
  paymentNote?: string;
  isForOtherPerson?: boolean;
  receiptImageUrl?: string;
  designatedAdminPhone: string;
  status: 'pending' | 'approved';
  createdAt: number;
}

interface ClientSessionState {
  phone: string;
  welcomedAt: number;
  intentStage:
    | 'idle'
    | 'awaiting_support_issue'
    | 'support_chat_open'
    | 'awaiting_payment_receipt'
    | 'awaiting_payment_item_clarification'
    | 'awaiting_existing_member_choice'
    | 'awaiting_registration_choice'
    | 'awaiting_registration_check_profile'
    | 'awaiting_admin_registration_confirmation'
    | 'awaiting_profile_data'
    | 'awaiting_system_lookup'
    | 'admin_adding_membership';
  verifiedRegistered?: boolean;
  pendingCategory: 'membership' | 'consumibles' | 'ropa' | null;
  pendingItemsSummary: string | null;
  pendingTotalUsd: number | null;
  pendingTotalBs: number | null;
  pendingReceiptRef: string | null;
  pendingReceiptHasPhoto: boolean;
  pendingReceiptImageUrl: string | null;
  pendingReceiptScannedBs: number | null;
  pendingMembershipCount: number;
  isPayingForOtherPerson: boolean;
  isPayingInAdvance: boolean;
  approvedOperationRef: string | null;
  remainingProfilesToCollect: number;
  totalProfilesApproved: number;
  partialCedula: string | null;
  partialName: string | null;
  adminDraftName?: string | null;
  adminDraftCedula?: string | null;
  adminDraftStartDate?: string | null;
  adminDraftMonths?: number | null;
  lastShownCategory: 'membership' | 'consumibles' | 'ropa' | null;
  history: Array<{ role: 'user' | 'model'; text: string; timestamp: number }>;
  updatedAt: number;
}

const clientSessions = new Map<string, ClientSessionState>();
const pendingAdminPayments: PendingAdminPayment[] = [];
const processedBaileysMsgIds = new Set<string>();
const sentBotMessageIds = new Set<string>();
const phoneKeyToReplyJidMap = new Map<string, string>();
const fiveDayReminderSentToday = new Set<string>();
let lastSupportClientPhone: string | null = null;

function getPhoneSessionKey(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '').slice(-10);
  return digits || rawPhone.trim() || 'anon';
}

function getOrCreateClientSession(rawPhone: string): ClientSessionState {
  const key = getPhoneSessionKey(rawPhone);
  let session = clientSessions.get(key);
  const now = Date.now();
  // Expire non-profile stale intent stages after 45 minutes of inactivity
  if (
    session &&
    session.intentStage !== 'awaiting_profile_data' &&
    session.intentStage !== 'support_chat_open' &&
    now - session.updatedAt > 45 * 60 * 1000
  ) {
    session.intentStage = 'idle';
    session.pendingCategory = null;
    session.pendingItemsSummary = null;
    session.pendingTotalUsd = null;
    session.pendingTotalBs = null;
    session.pendingReceiptRef = null;
    session.pendingReceiptHasPhoto = false;
    session.pendingReceiptImageUrl = null;
    session.pendingReceiptScannedBs = null;
  }
  if (!session) {
    session = {
      phone: rawPhone,
      welcomedAt: 0,
      intentStage: 'idle',
      pendingCategory: null,
      pendingItemsSummary: null,
      pendingTotalUsd: null,
      pendingTotalBs: null,
      pendingReceiptRef: null,
      pendingReceiptHasPhoto: false,
      pendingReceiptImageUrl: null,
      pendingReceiptScannedBs: null,
      pendingMembershipCount: 1,
      isPayingForOtherPerson: false,
      isPayingInAdvance: false,
      approvedOperationRef: null,
      remainingProfilesToCollect: 0,
      totalProfilesApproved: 0,
      partialCedula: null,
      partialName: null,
      lastShownCategory: null,
      history: [],
      updatedAt: now,
    };
    clientSessions.set(key, session);
  }
  session.phone = rawPhone || session.phone;
  session.updatedAt = now;
  return session;
}

function appendSessionHistory(session: ClientSessionState, role: 'user' | 'model', text: string) {
  session.history.push({ role, text, timestamp: Date.now() });
  if (session.history.length > 10) {
    session.history = session.history.slice(-10);
  }
}

let serverSyncedContext: Partial<BotContext> & {
  memberships?: Array<{
    id: string;
    phone: string;
    cedula: string;
    firstName: string;
    lastName: string;
    planName: string;
    status: string;
    priceUsd: number;
    totalBs: number;
    scannedAmountBs?: number;
    expectedAmountBs?: number;
    paymentNote?: string;
    expiresAt: string;
    paymentRef: string;
    receiptImageUrl?: string;
    membershipCount?: number;
  }>;
  shopOrders?: Array<{
    id: string;
    phone: string;
    itemsSummary: string;
    categoryGroup: 'consumibles' | 'ropa';
    status: string;
    totalUsd: number;
    totalBs: number;
    scannedAmountBs?: number;
    expectedAmountBs?: number;
    paymentNote?: string;
    paymentRef: string;
    pagoMovilTarget: string;
    receiptImageUrl?: string;
  }>;
} = {
  businessName: 'FormaGym',
  activeRate: 68.45,
  rateMode: 'auto_bcv',
  membershipMonthlyUsd: 30,
  membershipMonthlyBs: 2053.5,
  registrationUsd: 15,
  registrationBs: 1026.75,
  ownerPhoneMemberships: '+58 414-6734866',
  ownerPhoneConsumables: '+58 424-6559787',
  ownerPhoneSupport: '+58 414-6734866',
  adminNumbers: '',
  products: [],
  memberships: [],
  shopOrders: [],
};

// Hydrate serverSyncedContext from local disk DB on startup so Baileys works immediately even before a browser opens
let botRunning247 = true;
const botStartedAtIso = new Date().toISOString();

const initialDiskData = readLocalDiskDb();
if (initialDiskData && typeof initialDiskData === 'object') {
  if (typeof initialDiskData.botRunning247 === 'boolean') {
    botRunning247 = initialDiskData.botRunning247;
  }
  const diskSettings = (initialDiskData.settings || {}) as Record<string, unknown>;
  serverSyncedContext = {
    ...serverSyncedContext,
    businessName: String(diskSettings.businessName || 'FormaGym'),
    activeRate: Number(diskSettings.activeRate || 68.45),
    rateMode: String(diskSettings.mode || 'auto_bcv'),
    bcvRate: Number(diskSettings.bcvRate || 68.45),
    euroRate: Number(diskSettings.euroRate || 74.95),
    manualRate: Number(diskSettings.manualRate || 70),
    scheduleText: String(diskSettings.scheduleText || HORARIO_MESSAGE),
    membershipMonthlyUsd: Number(diskSettings.membershipMonthlyUsd || 30),
    membershipMonthlyBs: Number(diskSettings.membershipMonthlyBs || 2053.5),
    registrationUsd: Number(diskSettings.registrationUsd || 15),
    registrationBs: Number(
      diskSettings.registrationBs ||
        Number(((Number(diskSettings.registrationUsd || 15)) * Number(diskSettings.activeRate || 68.45)).toFixed(2))
    ),
    paymentMethodsText: String(diskSettings.paymentMethodsText || PAGO_MOVIL_MESSAGE),
    ownerPhoneMemberships: String(diskSettings.ownerPhoneMemberships || '+58 414-6734866'),
    ownerPhoneConsumables: String(diskSettings.ownerPhoneConsumables || '+58 424-6559787'),
    ownerPhoneSupport: String(diskSettings.ownerPhoneSupport || '+58 414-6734866'),
    adminNumbers: String(diskSettings.adminNumbers || ''),
    products: Array.isArray(initialDiskData.products) ? (initialDiskData.products as BotProduct[]) : [],
    memberships: Array.isArray(initialDiskData.memberships) ? (initialDiskData.memberships as any[]) : [],
    shopOrders: Array.isArray(initialDiskData.shopOrders) ? (initialDiskData.shopOrders as any[]) : [],
  };
}

function persistServerSyncedContextToDisk() {
  try {
    const existing = readLocalDiskDb() || {};
    const existingSettings = (existing.settings || {}) as Record<string, unknown>;
    const updatedSnapshot = {
      ...existing,
      botRunning247,
      settings: {
        ...existingSettings,
        businessName: serverSyncedContext.businessName || 'FormaGym',
        activeRate: serverSyncedContext.activeRate || 68.45,
        mode: serverSyncedContext.rateMode || 'auto_bcv',
        bcvRate: serverSyncedContext.bcvRate || 68.45,
        euroRate: serverSyncedContext.euroRate || 74.95,
        manualRate: serverSyncedContext.manualRate || 70,
        scheduleText: serverSyncedContext.scheduleText || HORARIO_MESSAGE,
        membershipMonthlyUsd: serverSyncedContext.membershipMonthlyUsd || 30,
        membershipMonthlyBs: serverSyncedContext.membershipMonthlyBs || 2053.5,
        registrationUsd: serverSyncedContext.registrationUsd || 15,
        registrationBs:
          serverSyncedContext.registrationBs ||
          Number(((serverSyncedContext.registrationUsd || 15) * (serverSyncedContext.activeRate || 68.45)).toFixed(2)),
        paymentMethodsText: serverSyncedContext.paymentMethodsText || PAGO_MOVIL_MESSAGE,
        ownerPhoneMemberships: serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866',
        ownerPhoneConsumables: serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787',
        ownerPhoneSupport: serverSyncedContext.ownerPhoneSupport || '+58 414-6734866',
        adminNumbers: serverSyncedContext.adminNumbers || '',
      },
      products: Array.isArray(serverSyncedContext.products) ? serverSyncedContext.products : existing.products || [],
      memberships: Array.isArray(serverSyncedContext.memberships) ? serverSyncedContext.memberships : existing.memberships || [],
      shopOrders: Array.isArray(serverSyncedContext.shopOrders) ? serverSyncedContext.shopOrders : existing.shopOrders || [],
      updatedAtMs: Date.now(),
      savedAt: new Date().toISOString(),
    };
    writeLocalDiskDb(updatedSnapshot);
  } catch {
    // ignore disk write error
  }
}

function applyBotResultToServerState(senderPhone: string, botResult: Record<string, any>) {
  if (!botResult || !botResult.action || botResult.action === 'NONE') return;
  const action = String(botResult.action);
  const todayIso = new Date().toISOString().slice(0, 10);
  let modified = false;

  if (!Array.isArray(serverSyncedContext.memberships)) {
    serverSyncedContext.memberships = [];
  }
  if (!Array.isArray(serverSyncedContext.shopOrders)) {
    serverSyncedContext.shopOrders = [];
  }

  if (action === 'CREATE_PENDING_MEMBERSHIP' && botResult.extractedPayment) {
    const ext = botResult.extractedPayment;
    const count = Math.max(1, Number(ext.membershipCount || 1));
    const opRef = String(ext.reference || 'PENDIENTE').trim();
    const alreadyExists = serverSyncedContext.memberships.some(
      (m) =>
        m.paymentRef === opRef &&
        getPhoneSessionKey(m.phone) === getPhoneSessionKey(senderPhone)
    );
    if (!alreadyExists) {
      const unitUsd = Number((Number(ext.amountUsd || 30) / count).toFixed(2));
      const unitBs = Number((Number(ext.amountBs || 2053.5) / count).toFixed(2));
      const expDate = addCalendarMonthsServer(todayIso, 1);
      for (let i = 0; i < count; i++) {
        const isOtherSlot = Boolean(ext.isForOtherPerson) || i > 0;
        serverSyncedContext.memberships.unshift({
          id: `mem_srv_${Date.now()}_${i + 1}`,
          ownerId: 'local_owner',
          phone: isOtherSlot ? '' : senderPhone,
          needsManualPhone: isOtherSlot,
          paidByPhone: isOtherSlot ? senderPhone : undefined,
          cedula: '',
          firstName: `Operación: ${opRef}`,
          lastName: count > 1 ? `(Persona ${i + 1} de ${count})` : '',
          planName: count > 1 ? `${ext.planName || 'Membresía Mensual'} (${i + 1}/${count})` : (ext.planName || 'Membresía Mensual'),
          status: 'pending_payment',
          priceUsd: unitUsd,
          rateBs: Number(serverSyncedContext.activeRate || 68.45),
          totalBs: unitBs,
          paymentRef: opRef,
          paymentMethod: `WhatsApp -> ${botResult.redirectedToPhone || serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866'}`,
          startDate: todayIso,
          prepaidMonths: 1,
          expiresAt: expDate,
          lastReminderSent: '',
          receiptImageUrl: ext.receiptImageUrl,
          membershipCount: count,
          scannedAmountBs: ext.scannedAmountBs ?? undefined,
          expectedAmountBs: ext.expectedAmountBs ?? Number(ext.amountBs || 0),
          paymentNote: ext.paymentNote || undefined,
          isRegisteredForLife: true,
          includesRegistration: Boolean(ext.includesRegistration),
          createdAtIso: new Date().toISOString(),
        } as any);
      }
      modified = true;
    }
  } else if (action === 'CREATE_SHOP_ORDER' && botResult.extractedShopOrder) {
    const ord = botResult.extractedShopOrder;
    const opRef = String(ord.reference || 'PENDIENTE').trim();
    const alreadyExists = serverSyncedContext.shopOrders.some(
      (o) =>
        o.paymentRef === opRef &&
        getPhoneSessionKey(o.phone) === getPhoneSessionKey(senderPhone)
    );
    if (!alreadyExists) {
      serverSyncedContext.shopOrders.unshift({
        id: `order_srv_${Date.now()}`,
        ownerId: 'local_owner',
        phone: senderPhone,
        itemsSummary: ord.itemsSummary || 'Pedido de Tienda',
        categoryGroup: ord.categoryGroup === 'ropa' ? 'ropa' : 'consumibles',
        status: 'pending_approval',
        totalUsd: Number(ord.totalUsd || 0),
        totalBs: Number(ord.totalBs || 0),
        paymentRef: opRef,
        pagoMovilTarget: String(botResult.redirectedToPhone || serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787'),
        receiptImageUrl: ord.receiptImageUrl,
        scannedAmountBs: ord.scannedAmountBs ?? undefined,
        expectedAmountBs: ord.expectedAmountBs ?? Number(ord.totalBs || 0),
        paymentNote: ord.paymentNote || undefined,
        createdAtIso: new Date().toISOString(),
      } as any);
      modified = true;
    }
  } else if (action === 'ADMIN_APPROVE_PAYMENT' && botResult.approvedPayment) {
    const appPay = botResult.approvedPayment;
    const targetPhone = String(botResult.targetClientPhone || appPay.clientPhone || '');
    const opNum = String(appPay.operationNumber || '');
    if (appPay.category === 'membership') {
      serverSyncedContext.memberships = serverSyncedContext.memberships.map((m: any) => {
        if (
          m.status === 'pending_payment' &&
          (m.paymentRef === opNum ||
            getPhoneSessionKey(m.phone) === getPhoneSessionKey(targetPhone) ||
            getPhoneSessionKey(m.paidByPhone || '') === getPhoneSessionKey(targetPhone))
        ) {
          modified = true;
          const alreadyHasData = Boolean(
            m.cedula && m.cedula.trim() && m.firstName && !String(m.firstName).startsWith('Operación:')
          );
          if (botResult.isAdvanceRenewal || alreadyHasData) {
            const addedMonths = Math.max(1, Number(appPay.membershipCount || 1));
            const totalMonths = Number(m.prepaidMonths || 1) + (botResult.isAdvanceRenewal ? addedMonths : 0);
            const baseStart = m.startDate || todayIso;
            const nextExpiry = String(botResult.advanceNewExpiresAt || addCalendarMonthsServer(baseStart, totalMonths));
            return {
              ...m,
              status: 'active',
              prepaidMonths: totalMonths,
              membershipCount: totalMonths,
              expiresAt: nextExpiry,
            };
          }
          return {
            ...m,
            status: 'awaiting_profile',
          };
        }
        return m;
      });
    } else {
      serverSyncedContext.shopOrders = serverSyncedContext.shopOrders.map((o: any) => {
        if (
          o.status === 'pending_approval' &&
          (o.paymentRef === opNum || getPhoneSessionKey(o.phone) === getPhoneSessionKey(targetPhone))
        ) {
          modified = true;
          return { ...o, status: 'approved' };
        }
        return o;
      });
    }
  } else if (action === 'ADMIN_CREATE_MANUAL_MEMBERSHIP' && botResult.adminCreatedMembership) {
    const adm = botResult.adminCreatedMembership;
    const months = Math.max(1, Number(adm.prepaidMonths || 1));
    const unitUsd = Number(serverSyncedContext.membershipMonthlyUsd || 30);
    const unitBs = Number(serverSyncedContext.membershipMonthlyBs || 2053.5);
    serverSyncedContext.memberships.unshift({
      id: `mem_adm_srv_${Date.now()}`,
      ownerId: 'local_owner',
      phone: '',
      needsManualPhone: true,
      cedula: adm.cedula,
      firstName: adm.firstName,
      lastName: adm.lastName || '',
      planName: months > 1 ? `Membresía Mensual (+${months} meses)` : 'Membresía Mensual',
      status: 'active',
      priceUsd: Number((unitUsd * months).toFixed(2)),
      rateBs: Number(serverSyncedContext.activeRate || 68.45),
      totalBs: Number((unitBs * months).toFixed(2)),
      paymentRef: 'ADMIN-MANUAL',
      paymentMethod: 'Agregado Manual por Admin',
      startDate: adm.startDate || todayIso,
      prepaidMonths: months,
      membershipCount: months,
      expiresAt: adm.expiresAt || addCalendarMonthsServer(adm.startDate || todayIso, months),
      lastReminderSent: '',
      createdAtIso: new Date().toISOString(),
    } as any);
    modified = true;
  } else if (action === 'LINK_PHONE_TO_EXISTING_MEMBERSHIP' && botResult.linkedMemberId) {
    const targetId = String(botResult.linkedMemberId);
    const linkedPhone = String(botResult.linkedPhone || senderPhone);
    serverSyncedContext.memberships = serverSyncedContext.memberships.map((m: any) => {
      if (m.id === targetId && (!m.phone || !String(m.phone).trim())) {
        modified = true;
        return {
          ...m,
          phone: linkedPhone,
          needsManualPhone: false,
        };
      }
      return m;
    });
  } else if (action === 'COMPLETE_MEMBERSHIP_PROFILE' && botResult.extractedProfile) {
    const prof = botResult.extractedProfile;
    const profilesList = Array.isArray(botResult.extractedProfilesList)
      ? botResult.extractedProfilesList
      : [prof];
    for (const pItem of profilesList) {
      const targetSlot = serverSyncedContext.memberships.find(
        (m: any) =>
          (m.status === 'awaiting_profile' || m.status === 'pending_payment') &&
          (getPhoneSessionKey(m.phone) === getPhoneSessionKey(senderPhone) ||
            getPhoneSessionKey(m.paidByPhone || '') === getPhoneSessionKey(senderPhone))
      );
      if (targetSlot) {
        const startIso = (targetSlot as any).startDate || todayIso;
        const months = Math.max(1, Number((targetSlot as any).prepaidMonths || 1));
        targetSlot.cedula = pItem.cedula;
        targetSlot.firstName = pItem.firstName;
        targetSlot.lastName = pItem.lastName || '';
        targetSlot.status = 'active';
        targetSlot.expiresAt = addCalendarMonthsServer(startIso, months);
        if (pItem.isForOtherPerson) {
          targetSlot.phone = '';
          (targetSlot as any).needsManualPhone = true;
          (targetSlot as any).paidByPhone = senderPhone;
        } else if (!targetSlot.phone) {
          targetSlot.phone = senderPhone;
          (targetSlot as any).needsManualPhone = false;
        }
        modified = true;
      }
    }
  }

  if (modified) {
    persistServerSyncedContextToDisk();
  }
}

function getUnifiedPendingPayments(
  defaultMemAdminPhone = '+58 414-6734866',
  defaultConsAdminPhone = '+58 424-6559787'
): PendingAdminPayment[] {
  const unified: PendingAdminPayment[] = [];
  const seenKeys = new Set<string>();

  // 1. Pending memberships from synced database (group multi-person slots sharing same paymentRef + phone)
  const memList = Array.isArray(serverSyncedContext.memberships)
    ? serverSyncedContext.memberships.filter((m) => m.status === 'pending_payment')
    : [];

  const groupedMems = new Map<string, typeof memList>();
  for (const m of memList) {
    const groupKey = `${getPhoneSessionKey(m.phone)}_${(m.paymentRef || m.id).trim()}`;
    const arr = groupedMems.get(groupKey) || [];
    arr.push(m);
    groupedMems.set(groupKey, arr);
  }

  for (const [groupKey, group] of groupedMems.entries()) {
    const first = group[0];
    const count = Math.max(group.length, Number(first.membershipCount || 1));
    const totalUsd =
      group.length > 1
        ? Number(group.reduce((acc, item) => acc + Number(item.priceUsd || 0), 0).toFixed(2))
        : Number(first.priceUsd || 0);
    const totalBs =
      group.length > 1
        ? Number(group.reduce((acc, item) => acc + Number(item.totalBs || 0), 0).toFixed(2))
        : Number(first.totalBs || 0);
    const expectedBs = Number(first.expectedAmountBs ?? totalBs);
    const scannedBs =
      typeof first.scannedAmountBs === 'number' && first.scannedAmountBs > 0
        ? first.scannedAmountBs
        : totalBs;

    // Also check if we have an in-memory pendingAdminPayment with extra details/photo
    const memMatch = pendingAdminPayments.find(
      (p) =>
        p.status === 'pending' &&
        (p.operationNumber === first.paymentRef ||
          getPhoneSessionKey(p.clientPhone) === getPhoneSessionKey(first.phone))
    );

    const cleanPlanName = (first.planName || 'Membresía Mensual').replace(/\s*\(\d+\/\d+\)\s*$/, '');
    seenKeys.add(groupKey);
    if (first.paymentRef) seenKeys.add(`op_${first.paymentRef.trim()}`);

    unified.push({
      id: first.id,
      clientPhone: first.phone,
      operationNumber: first.paymentRef || memMatch?.operationNumber || 'PENDIENTE',
      category: 'membership',
      membershipCount: count,
      planOrItems: cleanPlanName,
      amountUsd: totalUsd,
      amountBs: expectedBs,
      scannedAmountBs: scannedBs || memMatch?.scannedAmountBs || null,
      expectedAmountBs: expectedBs,
      paymentNote: first.paymentNote || memMatch?.paymentNote,
      receiptImageUrl: first.receiptImageUrl || memMatch?.receiptImageUrl,
      designatedAdminPhone: defaultMemAdminPhone,
      status: 'pending',
      createdAt: memMatch?.createdAt || Date.now(),
    });
  }

  // 2. Pending shop orders from synced database
  const ordList = Array.isArray(serverSyncedContext.shopOrders)
    ? serverSyncedContext.shopOrders.filter((o) => o.status === 'pending_approval')
    : [];

  for (const o of ordList) {
    const key = `${getPhoneSessionKey(o.phone)}_${(o.paymentRef || o.id).trim()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (o.paymentRef) seenKeys.add(`op_${o.paymentRef.trim()}`);

    const memMatch = pendingAdminPayments.find(
      (p) =>
        p.status === 'pending' &&
        (p.operationNumber === o.paymentRef ||
          getPhoneSessionKey(p.clientPhone) === getPhoneSessionKey(o.phone))
    );

    const expectedBs = Number(o.expectedAmountBs ?? o.totalBs ?? 0);
    const scannedBs =
      typeof o.scannedAmountBs === 'number' && o.scannedAmountBs > 0
        ? o.scannedAmountBs
        : Number(o.totalBs || 0);

    unified.push({
      id: o.id,
      clientPhone: o.phone,
      operationNumber: o.paymentRef || memMatch?.operationNumber || 'PENDIENTE',
      category: o.categoryGroup === 'ropa' ? 'ropa' : 'consumibles',
      membershipCount: 1,
      planOrItems: o.itemsSummary || 'Pedido de Tienda',
      amountUsd: Number(o.totalUsd || 0),
      amountBs: expectedBs,
      scannedAmountBs: scannedBs || memMatch?.scannedAmountBs || null,
      expectedAmountBs: expectedBs,
      paymentNote: o.paymentNote || memMatch?.paymentNote,
      receiptImageUrl: o.receiptImageUrl || memMatch?.receiptImageUrl,
      designatedAdminPhone:
        o.categoryGroup === 'ropa' ? defaultMemAdminPhone : defaultConsAdminPhone,
      status: 'pending',
      createdAt: memMatch?.createdAt || Date.now(),
    });
  }

  // 3. Include any very recent in-memory pendingAdminPayments that haven't round-tripped from the browser yet
  const hasSyncedArrays =
    Array.isArray(serverSyncedContext.memberships) || Array.isArray(serverSyncedContext.shopOrders);
  const now = Date.now();
  for (const p of pendingAdminPayments) {
    if (p.status !== 'pending') continue;
    const key = `${getPhoneSessionKey(p.clientPhone)}_${(p.operationNumber || p.id).trim()}`;
    const opKey = `op_${(p.operationNumber || '').trim()}`;
    if (seenKeys.has(key) || seenKeys.has(opKey)) continue;
    // If synced arrays exist, only keep unsynced in-memory items created within the last 30 seconds
    if (!hasSyncedArrays || now - p.createdAt < 30000) {
      seenKeys.add(key);
      unified.push(p);
    }
  }

  return unified;
}

function findSyncedMembershipByPhone(rawPhone: string) {
  const targetKey = getPhoneSessionKey(rawPhone);
  if (!targetKey || !Array.isArray(serverSyncedContext.memberships)) return null;
  const matches = serverSyncedContext.memberships.filter(
    (m) => getPhoneSessionKey(m.phone) === targetKey
  );
  // Prefer awaiting_profile or pending_payment if one is in progress, otherwise active
  return (
    matches.find((m) => m.status === 'awaiting_profile') ||
    matches.find((m) => m.status === 'pending_payment') ||
    matches.find((m) => m.status === 'active') ||
    matches[0] ||
    null
  );
}

function findActivePersonalMembershipsByPhone(rawPhone: string) {
  const targetKey = getPhoneSessionKey(rawPhone);
  if (!targetKey || !Array.isArray(serverSyncedContext.memberships)) return [];
  return serverSyncedContext.memberships.filter(
    (m) =>
      getPhoneSessionKey(m.phone) === targetKey &&
      m.status === 'active' &&
      Boolean(m.cedula && m.cedula.trim())
  );
}

const externalEventsQueue: ExternalBotEvent[] = [];

// Baileys Live WhatsApp State
let baileysSock: WASocket | null = null;
let baileysConnectionState: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' = 'disconnected';
let baileysQrDataUrl: string | null = null;
let baileysPairingCode: string | null = null;
let baileysConnectedPhone: string | null = null;
let baileysStatusMessage: string = 'Desconectado. Haz clic en "Vincular con Baileys" para conectar el número del bot.';
const baileysActivityLogs: Array<{ id: string; time: string; text: string }> = [];

function addBaileysLog(text: string) {
  const time = new Date().toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  baileysActivityLogs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time,
    text,
  });
  if (baileysActivityLogs.length > 35) {
    baileysActivityLogs.pop();
  }
}

function rememberSentMsgId(sentResult: any) {
  const id = sentResult?.key?.id;
  if (id) {
    sentBotMessageIds.add(id);
    if (sentBotMessageIds.size > 500) {
      const first = sentBotMessageIds.values().next().value;
      if (first) sentBotMessageIds.delete(first);
    }
  }
}

async function sendWhatsAppViaBaileys(targetPhone: string, text: string): Promise<boolean> {
  if (!baileysSock || baileysConnectionState !== 'connected') return false;
  const phoneKey = getPhoneSessionKey(targetPhone);
  const mappedJid = phoneKey ? phoneKeyToReplyJidMap.get(phoneKey) : null;
  const jid = mappedJid || phoneToWhatsAppJid(targetPhone);
  if (!jid) return false;
  try {
    const sent = await baileysSock.sendMessage(jid, { text });
    rememberSentMsgId(sent);
    addBaileysLog(`Mensaje enviado a ${targetPhone}`);
    return true;
  } catch (err) {
    // Fallback to standard phoneToWhatsAppJid if mappedJid failed
    const fallbackJid = phoneToWhatsAppJid(targetPhone);
    if (fallbackJid && fallbackJid !== jid) {
      try {
        const sent2 = await baileysSock.sendMessage(fallbackJid, { text });
        rememberSentMsgId(sent2);
        addBaileysLog(`Mensaje enviado a ${targetPhone}`);
        return true;
      } catch {
        // ignore
      }
    }
    addBaileysLog(`Error enviando mensaje a ${targetPhone}: ${err instanceof Error ? err.message : 'Error'}`);
    return false;
  }
}

function resolveRealClientPhoneFromBaileys(msg: any, sock: WASocket): {
  senderPhone: string;
  replyJid: string;
  isFromBotSelf: boolean;
} {
  const key = msg.key || {};
  const remoteJid: string = key.remoteJid || '';
  const senderPn: string = key.senderPn || key.remoteJidAlt || key.participantAlt || '';
  const participant: string = key.participant || '';

  // Prefer JIDs that end with @s.whatsapp.net so we get the real phone number, not an @lid identifier!
  const candidatePhoneJid =
    [senderPn, remoteJid, participant].find((j) => j && j.endsWith('@s.whatsapp.net')) ||
    senderPn ||
    remoteJid;

  const senderPhone = jidToFormattedPhone(candidatePhoneJid);
  const botOwnPhone = sock.user?.id ? jidToFormattedPhone(sock.user.id) : baileysConnectedPhone || '';
  const isFromBotSelf =
    Boolean(key.fromMe) ||
    (Boolean(botOwnPhone) &&
      getPhoneSessionKey(senderPhone) === getPhoneSessionKey(botOwnPhone) &&
      !key.senderPn);

  if (senderPhone && remoteJid) {
    phoneKeyToReplyJidMap.set(getPhoneSessionKey(senderPhone), remoteJid);
  }

  return {
    senderPhone,
    replyJid: remoteJid,
    isFromBotSelf,
  };
}

async function startBaileysConnection(phoneForPairing?: string) {
  try {
    if (baileysSock) {
      try {
        baileysSock.ev.removeAllListeners('connection.update');
        baileysSock.ev.removeAllListeners('messages.upsert');
        baileysSock.end(undefined);
      } catch {
        // ignore cleanup error
      }
      baileysSock = null;
    }

    baileysConnectionState = 'connecting';
    baileysQrDataUrl = null;
    baileysPairingCode = null;
    baileysStatusMessage = 'Iniciando conexión segura con WhatsApp mediante Baileys...';
    addBaileysLog('Iniciando cliente @whiskeysockets/baileys...');

    const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_DIR);
    let version: [number, number, number] = [2, 3000, 1015901307];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest?.version) version = latest.version;
    } catch {
      // use fallback version
    }

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) as any,
      browser: ['FormaGym Panel', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    baileysSock = sock;
    sock.ev.on('creds.update', saveCreds);

    if (phoneForPairing && !sock.authState.creds.registered) {
      let cleanDigits = phoneForPairing.replace(/\D/g, '');
      if (cleanDigits.startsWith('04') && cleanDigits.length === 11) {
        cleanDigits = '58' + cleanDigits.slice(1);
      }
      if (cleanDigits.length >= 10) {
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(cleanDigits);
            baileysPairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
            baileysConnectionState = 'qr_ready';
            baileysStatusMessage = `Código de vinculación generado (${baileysPairingCode}) para +${cleanDigits}. Ingrésalo en tu WhatsApp.`;
            addBaileysLog(`Código de vinculación generado: ${baileysPairingCode}`);
          } catch (err) {
            addBaileysLog(`No se pudo generar código por número, usa el Código QR en pantalla.`);
          }
        }, 2200);
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          baileysQrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          baileysConnectionState = 'qr_ready';
          baileysStatusMessage =
            'Escanea el código QR desde el WhatsApp del teléfono donde correrá el bot (Dispositivos vinculados -> Vincular un dispositivo).';
          addBaileysLog('Nuevo Código QR de Baileys listo para escanear.');
        } catch {
          // ignore qr render error
        }
      }

      if (connection === 'open') {
        baileysConnectionState = 'connected';
        baileysQrDataUrl = null;
        baileysPairingCode = null;
        const rawUserJid = sock.user?.id || '';
        baileysConnectedPhone = jidToFormattedPhone(rawUserJid);
        baileysStatusMessage = `Bot FormaGym ACTIVO y conectado en el número ${baileysConnectedPhone}`;
        addBaileysLog(`¡Conectado exitosamente a WhatsApp en ${baileysConnectedPhone}!`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        baileysQrDataUrl = null;

        if (statusCode === DisconnectReason.loggedOut) {
          baileysConnectionState = 'disconnected';
          baileysConnectedPhone = null;
          baileysStatusMessage = 'Sesión cerrada en WhatsApp. Puedes vincular un nuevo número.';
          addBaileysLog('Sesión cerrada desde el teléfono.');
          try {
            fs.rmSync(BAILEYS_AUTH_DIR, { recursive: true, force: true });
          } catch {
            // ignore
          }
        } else if (shouldReconnect) {
          baileysConnectionState = 'connecting';
          baileysStatusMessage = 'Reconectando automáticamente con WhatsApp (Baileys)...';
          addBaileysLog('Reconectando sesión de Baileys...');
          setTimeout(() => {
            startBaileysConnection();
          }, 3500);
        } else {
          baileysConnectionState = 'disconnected';
          baileysStatusMessage = 'Conexión detenida.';
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      if (!botRunning247) return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const msgId = msg.key.id || '';
        if (msgId) {
          if (processedBaileysMsgIds.has(msgId) || sentBotMessageIds.has(msgId)) continue;
          processedBaileysMsgIds.add(msgId);
          if (processedBaileysMsgIds.size > 500) {
            const firstId = processedBaileysMsgIds.values().next().value;
            if (firstId) processedBaileysMsgIds.delete(firstId);
          }
        }

        const remoteJid = msg.key.remoteJid || '';
        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) {
          continue;
        }

        const { senderPhone, replyJid } = resolveRealClientPhoneFromBaileys(msg, sock);

        // Unwrap nested Baileys containers (ephemeralMessage, viewOnceMessage, documentWithCaptionMessage)
        const rawInner =
          (msg.message as any)?.ephemeralMessage?.message ||
          (msg.message as any)?.viewOnceMessage?.message ||
          (msg.message as any)?.viewOnceMessageV2?.message ||
          (msg.message as any)?.viewOnceMessageV2Extension?.message ||
          (msg.message as any)?.documentWithCaptionMessage?.message ||
          msg.message;

        const imageMsgObj = rawInner?.imageMessage || msg.message?.imageMessage;
        const extTextObj = rawInner?.extendedTextMessage || msg.message?.extendedTextMessage;

        const textBody =
          rawInner?.conversation ||
          msg.message?.conversation ||
          extTextObj?.text ||
          imageMsgObj?.caption ||
          rawInner?.videoMessage?.caption ||
          '';

        // Ignore internal bot notification echoes if the bot number forwarded a message to itself
        if (
          textBody.startsWith('🏋️‍♂️ *Nuevo Pago de Membresía') ||
          textBody.startsWith('🏋️‍♂️ *PAGO DE MEMBRESÍA') ||
          textBody.startsWith('🛒 *Nuevo Pago de Tienda') ||
          textBody.startsWith('🛒 *PAGO DE TIENDA') ||
          textBody.startsWith('📩 *Consulta de Soporte') ||
          textBody.startsWith('📩 *Chat de Soporte') ||
          textBody.startsWith('💬 *Mensaje de ') ||
          textBody.startsWith('📲 *PAGO MÓVIL PENDIENTE')
        ) {
          continue;
        }

        const quotedMsg =
          extTextObj?.contextInfo?.quotedMessage ||
          imageMsgObj?.contextInfo?.quotedMessage;
        const quotedText =
          quotedMsg?.conversation ||
          quotedMsg?.extendedTextMessage?.text ||
          quotedMsg?.imageMessage?.caption ||
          '';
        const hasImage = Boolean(imageMsgObj);

        if (!textBody.trim() && !hasImage) continue;

        let imageBuffer: Buffer | null = null;
        let receiptImageUrl: string | undefined = undefined;

        if (hasImage) {
          try {
            const msgForDownload =
              rawInner !== msg.message ? { ...msg, message: rawInner } : msg;
            const dl = await downloadMediaMessage(
              msgForDownload as any,
              'buffer',
              {},
              {
                logger: pino({ level: 'silent' }) as any,
                reuploadRequest: sock.updateMediaMessage,
              }
            );
            imageBuffer = dl as Buffer;
            const mime = imageMsgObj?.mimetype || 'image/jpeg';
            receiptImageUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
          } catch (err) {
            addBaileysLog(`No se pudo descargar imagen adjunta de ${senderPhone}`);
          }
        }

        const cleanMsg = textBody.trim() || (hasImage ? '[📸 Foto de pago enviada]' : 'Hola');
        addBaileysLog(`Mensaje recibido de ${senderPhone}: "${cleanMsg.slice(0, 60)}"`);

        const session = getOrCreateClientSession(senderPhone);
        const matchedMember = findSyncedMembershipByPhone(senderPhone);

        const mergedContext: BotContext = {
          activeRate: Number(serverSyncedContext.activeRate || cachedRate.bcvRate || 68.45),
          rateMode: serverSyncedContext.rateMode || 'auto_bcv',
          bcvRate: serverSyncedContext.bcvRate || cachedRate.bcvRate,
          euroRate: serverSyncedContext.euroRate || cachedRate.euroRate,
          manualRate: serverSyncedContext.manualRate || 70,
          businessName: serverSyncedContext.businessName || 'FormaGym',
          scheduleText: serverSyncedContext.scheduleText || HORARIO_MESSAGE,
          membershipMonthlyUsd: Number(serverSyncedContext.membershipMonthlyUsd || 30),
          membershipMonthlyBs: Number(serverSyncedContext.membershipMonthlyBs || 2053.5),
          paymentMethodsText: serverSyncedContext.paymentMethodsText || PAGO_MOVIL_MESSAGE,
          ownerPhoneMemberships: serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866',
          ownerPhoneConsumables: serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787',
          ownerPhoneSupport: serverSyncedContext.ownerPhoneSupport || '+58 414-6734866',
          adminNumbers: serverSyncedContext.adminNumbers || '',
          hasPhotoAttached: hasImage,
          receiptImageUrl,
          supportState: session.intentStage === 'awaiting_support_issue' ? 'awaiting_issue' : null,
          activeSupportClientPhone: lastSupportClientPhone,
          products: serverSyncedContext.products || [],
          membership: matchedMember,
          conversationHistory: session.history.map((h) => ({ sender: h.role, text: h.text })),
          quotedText,
        };

        const botResult = await processIncomingWhatsAppMessage(senderPhone, cleanMsg, mergedContext);
        applyBotResultToServerState(senderPhone, botResult);

        // 1. Reply directly to the sender on WhatsApp via Baileys
        if (botResult.reply) {
          try {
            const sent = await sock.sendMessage(replyJid, { text: String(botResult.reply) });
            rememberSentMsgId(sent);
            addBaileysLog(`Bot respondió a ${senderPhone}`);
          } catch {
            addBaileysLog(`Error respondiendo a ${senderPhone}`);
          }
        }

        // 1B. If Admin checked pending payments and there are receipt photos, send each photo card to the admin!
        if (
          Array.isArray(botResult.adminPendingReceiptCards) &&
          botResult.adminPendingReceiptCards.length > 0
        ) {
          for (const card of botResult.adminPendingReceiptCards) {
            if (card?.receiptImageUrl && String(card.receiptImageUrl).startsWith('data:image')) {
              const b64Match = String(card.receiptImageUrl).match(
                /^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/
              );
              if (b64Match && b64Match[1]) {
                try {
                  const buf = Buffer.from(b64Match[1], 'base64');
                  const sentImg = await sock.sendMessage(replyJid, {
                    image: buf,
                    caption: String(card.caption || ''),
                  });
                  rememberSentMsgId(sentImg);
                } catch {
                  // ignore image send error
                }
              }
            }
          }
        }

        // 2. If Admin approved a payment OR verified a lifetime registration via WhatsApp, notify the client!
        if (
          (botResult.action === 'ADMIN_APPROVE_PAYMENT' ||
            botResult.action === 'ADMIN_VERIFY_REGISTRATION') &&
          botResult.targetClientPhone &&
          botResult.clientNotificationMessage
        ) {
          await sendWhatsAppViaBaileys(
            String(botResult.targetClientPhone),
            String(botResult.clientNotificationMessage)
          );
          addBaileysLog(
            `Notificación de admin enviada al cliente ${botResult.targetClientPhone}`
          );
        }

        // 3. If support agent replied to a client, forward the answer directly to the client's WhatsApp!
        if (
          botResult.action === 'SUPPORT_AGENT_REPLY' &&
          botResult.targetClientPhone &&
          botResult.supportReplyText
        ) {
          await sendWhatsAppViaBaileys(
            String(botResult.targetClientPhone),
            `💬 *Mensaje de ${mergedContext.businessName}:*\n\n${botResult.supportReplyText}`
          );
          addBaileysLog(
            `Respuesta de soporte enviada al cliente (${botResult.targetClientPhone})`
          );
        }

        // 4. If payment or support request from client, forward to the designated owner number(s) on WhatsApp (including image even if sent in previous message!)
        const forwardTargetPhone =
          (botResult.redirectedToPhone as string | undefined) ||
          (botResult.designatedSupportPhone as string | undefined) ||
          null;
        const forwardText =
          (botResult.forwardedPaymentNotification as string | undefined) ||
          (botResult.forwardedMessageFormatted as string | undefined) ||
          null;

        if (forwardTargetPhone && forwardText) {
          // Recover image buffer from saved base64 dataUrl if the client sent the photo first and clarified the item in a second message!
          let finalImageBuffer: Buffer | null = imageBuffer;
          if (!finalImageBuffer) {
            const savedDataUrl: string | undefined =
              (botResult as any)?.extractedPayment?.receiptImageUrl ||
              (botResult as any)?.extractedShopOrder?.receiptImageUrl ||
              mergedContext.receiptImageUrl;
            if (savedDataUrl && savedDataUrl.startsWith('data:image')) {
              const b64Match = savedDataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
              if (b64Match && b64Match[1]) {
                try {
                  finalImageBuffer = Buffer.from(b64Match[1], 'base64');
                } catch {
                  // ignore buffer decode error
                }
              }
            }
          }

          const targetPhonesList = forwardTargetPhone
            .split(/[,;/]+/)
            .map((s) => s.trim())
            .filter(Boolean);

          for (const singleTargetPhone of targetPhonesList) {
            const targetKey = getPhoneSessionKey(singleTargetPhone);
            const mappedOwnerJid = targetKey ? phoneKeyToReplyJidMap.get(targetKey) : null;
            const ownerJid = mappedOwnerJid || phoneToWhatsAppJid(singleTargetPhone);
            if (!ownerJid) continue;

            try {
              if (finalImageBuffer) {
                const sent = await sock.sendMessage(ownerJid, {
                  image: finalImageBuffer,
                  caption: forwardText,
                });
                rememberSentMsgId(sent);
                addBaileysLog(`Comprobante con FOTO enviado al admin (${singleTargetPhone})`);
              } else {
                const sent = await sock.sendMessage(ownerJid, { text: forwardText });
                rememberSentMsgId(sent);
                addBaileysLog(`Notificación enviada al admin (${singleTargetPhone})`);
              }
            } catch {
              const fallbackJid = phoneToWhatsAppJid(singleTargetPhone);
              if (fallbackJid) {
                try {
                  if (finalImageBuffer) {
                    const sent = await sock.sendMessage(fallbackJid, {
                      image: finalImageBuffer,
                      caption: forwardText,
                    });
                    rememberSentMsgId(sent);
                  } else {
                    const sent = await sock.sendMessage(fallbackJid, { text: forwardText });
                    rememberSentMsgId(sent);
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        }

        // 5. Push to panel event queue so the Admin Panel records the membership/order/profile/approval immediately
        const targetEventPhone =
          botResult.action === 'ADMIN_APPROVE_PAYMENT' && botResult.targetClientPhone
            ? String(botResult.targetClientPhone)
            : senderPhone;

        externalEventsQueue.push({
          id: `baileys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          phone: targetEventPhone,
          clientMessage: cleanMsg,
          hasPhoto: hasImage,
          botResult: botResult as Record<string, unknown>,
        });
      }
    });
  } catch (err) {
    baileysConnectionState = 'disconnected';
    baileysStatusMessage = `Error iniciando Baileys: ${err instanceof Error ? err.message : 'Error desconocido'}`;
  }
}

let cachedRate: CachedRate = {
  bcvRate: 68.45,
  euroRate: 74.95,
  parallelRate: 79.20,
  source: 'API Oficial BCV (DolarApi VE)',
  updatedAt: new Date().toISOString(),
  fetchedAtMs: 0,
};

async function fetchLiveVenezuelanRate(force = false): Promise<CachedRate> {
  const now = Date.now();
  if (!force && cachedRate.fetchedAtMs > 0 && now - cachedRate.fetchedAtMs < 5 * 60 * 1000) {
    return cachedRate;
  }

  let foundBcv = 0;
  let foundParallel = 0;
  let foundEuro = 0;
  let sourceLabel = 'API Oficial BCV';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const oficial = data.find((d: { fuente?: string; promedio?: number }) => d.fuente === 'oficial');
        const paralelo = data.find((d: { fuente?: string; promedio?: number }) => d.fuente === 'paralelo');
        if (oficial && typeof oficial.promedio === 'number' && oficial.promedio > 1) {
          foundBcv = Number(oficial.promedio.toFixed(2));
          foundParallel =
            paralelo && typeof paralelo.promedio === 'number'
              ? Number(paralelo.promedio.toFixed(2))
              : Number((oficial.promedio * 1.15).toFixed(2));
          sourceLabel = 've.dolarapi.com (BCV Oficial)';
        }
      }
    }
  } catch {
    // Fallback below
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const ves = data?.rates?.VES;
      const eurPerUsd = data?.rates?.EUR;
      if (!foundBcv && typeof ves === 'number' && ves > 1) {
        foundBcv = Number(ves.toFixed(2));
        foundParallel = Number((ves * 1.14).toFixed(2));
        sourceLabel = 'ExchangeRate-API (BCV USD/EUR)';
      }
      if (foundBcv > 0 && typeof eurPerUsd === 'number' && eurPerUsd > 0.1) {
        foundEuro = Number((foundBcv / eurPerUsd).toFixed(2));
      }
    }
  } catch {
    // Keep calculated fallback
  }

  if (foundBcv > 0) {
    cachedRate = {
      bcvRate: foundBcv,
      euroRate: foundEuro > 0 ? foundEuro : Number((foundBcv * 1.095).toFixed(2)),
      parallelRate: foundParallel > 0 ? foundParallel : Number((foundBcv * 1.15).toFixed(2)),
      source: sourceLabel,
      updatedAt: new Date().toISOString(),
      fetchedAtMs: now,
    };
  } else {
    cachedRate.fetchedAtMs = now;
    cachedRate.updatedAt = new Date().toISOString();
  }

  return cachedRate;
}

function normalizeSpanish(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/mobil/g, 'movil')
    .replace(/pagomovil/g, 'pago movil')
    .replace(/pagomobil/g, 'pago movil')
    .replace(/pgo movil/g, 'pago movil')
    .replace(/\borario\b/g, 'horario')
    .replace(/\baber\b/g, 'abrir')
    .replace(/\bmensualida\b/g, 'mensualidad')
    .replace(/\bmembresia\b/g, 'membresia')
    .replace(/\bmembrecia\b/g, 'membresia')
    .replace(/\bbolibares\b/g, 'bolivares')
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Safe fuzzy word matcher: never fuzzy-matches short words (<=4 chars) to avoid false positives!
function hasFuzzyWord(normalizedMsg: string, targets: string[], maxDist = 2): boolean {
  const words = normalizedMsg.split(' ').filter(Boolean);
  for (const target of targets) {
    if (target.includes(' ')) {
      if (normalizedMsg.includes(target)) return true;
      continue;
    }
    if (words.includes(target)) return true;
    // Only allow typo distance on longer words so short words like "un", "voy", "es" never collide
    const allowedDist = target.length <= 4 ? 0 : target.length <= 6 ? Math.min(1, maxDist) : maxDist;
    if (allowedDist === 0) continue;

    for (const w of words) {
      if (w.length <= 3) continue;
      if (Math.abs(w.length - target.length) <= allowedDist && levenshtein(w, target) <= allowedDist) {
        return true;
      }
    }
  }
  return false;
}

interface BotProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  basePriceUsd: number;
  priceBs: number;
  rateMode?: string;
  isCustomBs?: boolean;
  stock: number;
  available: boolean;
}

interface BotContext {
  activeRate: number;
  rateMode: string;
  bcvRate?: number;
  euroRate?: number;
  manualRate?: number;
  businessName: string;
  scheduleText: string;
  membershipMonthlyUsd: number;
  membershipMonthlyBs?: number;
  registrationUsd?: number;
  registrationBs?: number;
  paymentMethodsText: string;
  ownerPhoneMemberships?: string;
  ownerPhoneConsumables?: string;
  ownerPhoneSupport?: string;
  adminNumbers?: string;
  hasPhotoAttached?: boolean;
  receiptImageUrl?: string;
  scannedOperationNumber?: string | null;
  scannedAmountBs?: number | null;
  scannedAmountBsText?: string | null;
  supportState?: 'awaiting_issue' | 'forwarded_open' | null;
  activeSupportClientPhone?: string | null;
  products: BotProduct[];
  membership?: {
    id: string;
    phone: string;
    cedula: string;
    firstName: string;
    lastName: string;
    planName: string;
    status: string;
    priceUsd: number;
    totalBs: number;
    expiresAt: string;
    paymentRef: string;
    receiptImageUrl?: string;
    membershipCount?: number;
  } | null;
  conversationHistory?: Array<{ sender: string; text: string }>;
  quotedText?: string;
}

const SPANISH_MONTH_NAMES = [
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

function getTodayIsoDateServer(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function addCalendarMonthsServer(startDateStr: string, monthsToAdd: number = 1): string {
  const clean = (startDateStr || '').trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = match
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
  const targetMonthIndex = base.month - 1 + safeMonths;
  const targetYear = base.year + Math.floor(targetMonthIndex / 12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth0 + 1, 0).getDate();
  const targetDay = Math.min(base.day, daysInTargetMonth);

  return `${targetYear}-${String(targetMonth0 + 1).padStart(2, '0')}-${String(targetDay).padStart(
    2,
    '0'
  )}`;
}

function formatSpanishDateServer(isoDateStr?: string | null): string {
  if (!isoDateStr) return 'sin fecha';
  const clean = isoDateStr.trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDateStr;
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  return `${day} de ${SPANISH_MONTH_NAMES[monthIdx] || m[2]} de ${year}`;
}

function parseDateFromAdminText(rawText: string): string | null {
  const lower = (rawText || '').toLowerCase();
  if (/\b(hoy|today|ahorita)\b/.test(lower)) {
    return getTodayIsoDateServer();
  }
  const isoMatch = rawText.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(parseInt(isoMatch[2], 10)).padStart(2, '0')}-${String(
      parseInt(isoMatch[3], 10)
    ).padStart(2, '0')}`;
  }
  const dmyMatch = rawText.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${String(parseInt(dmyMatch[2], 10)).padStart(2, '0')}-${String(
      parseInt(dmyMatch[1], 10)
    ).padStart(2, '0')}`;
  }
  for (let i = 0; i < SPANISH_MONTH_NAMES.length; i++) {
    const mName = SPANISH_MONTH_NAMES[i];
    const reg = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s*)?${mName}(?:\\s*(?:de|del)?\\s*(20\\d{2}))?\\b`, 'i');
    const hit = lower.match(reg);
    if (hit) {
      const yr = hit[2] ? parseInt(hit[2], 10) : new Date().getFullYear();
      const dy = parseInt(hit[1], 10);
      return `${yr}-${String(i + 1).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
    }
  }
  return null;
}

function getCleanFirstName(firstName?: string | null): string | null {
  if (!firstName) return null;
  const trimmed = firstName.trim();
  if (
    !trimmed ||
    trimmed.startsWith('Operación:') ||
    trimmed.toLowerCase().startsWith('operacion:') ||
    trimmed.toLowerCase() === 'por registrar' ||
    trimmed.toLowerCase() === 'miembro' ||
    trimmed.toLowerCase() === 'cliente'
  ) {
    return null;
  }
  return trimmed.split(' ')[0];
}

function calculateDaysRemaining(expiresAtStr?: string | null): number | null {
  if (!expiresAtStr) return null;
  const exp = new Date(expiresAtStr);
  if (Number.isNaN(exp.getTime())) return null;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const expMidnight = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime();
  return Math.ceil((expMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

function buildNaturalWelcome(
  businessName: string,
  memberFirstName?: string,
  memberStatus?: string,
  expiresAt?: string
): string {
  const gym = businessName || 'FormaGym';
  const cleanName = getCleanFirstName(memberFirstName);
  if (cleanName && memberStatus === 'active') {
    const daysLeft = calculateDaysRemaining(expiresAt);
    const expFormatted = formatSpanishDateServer(expiresAt);
    const reminderNote =
      daysLeft !== null && daysLeft <= 5 && daysLeft >= 0
        ? `\n\n⏰ *Recordatorio:* Tu membresía vence el día *${expFormatted}* (*${expiresAt}*).`
        : '';
    return `¡Hola, *${cleanName}*! Qué gusto saludarte en *${gym}* 👋 ¿En qué te puedo ayudar hoy?${reminderNote}`;
  }
  if (cleanName) {
    return `¡Hola, *${cleanName}*! Bienvenido a *${gym}* 👋 ¿En qué te puedo ayudar hoy?`;
  }
  return `¡Hola! Bienvenido a *${gym}* 👋 ¿En qué te puedo ayudar hoy?\n\nPuedes preguntarme por la *mensualidad*, los *productos de la tienda* o el *horario*.\n\n*(Si ya estás inscrito en el sistema del gimnasio y aún no hemos registrado tu número de teléfono, dime *"ya estoy en el sistema"* con tu Nombre y Cédula para vincularte).*`;
}

function formatAdminPaymentCard(params: {
  gymName: string;
  isMembership: boolean;
  clientPhone: string;
  clientName?: string | null;
  planOrItems: string;
  membershipCount: number;
  operationNumber: string;
  scannedBs?: number | null;
  expectedBs: number;
  expectedUsd: number;
  paymentNote?: string;
}): string {
  const scannedText =
    typeof params.scannedBs === 'number' && params.scannedBs > 0
      ? `${formatBsVe(params.scannedBs)} Bs`
      : 'No detectado en imagen (Revisar foto)';
  const expectedText = `${formatBsVe(params.expectedBs)} Bs ($${params.expectedUsd.toFixed(2)} USD)`;
  const diffOk =
    typeof params.scannedBs === 'number' &&
    params.scannedBs > 0 &&
    Math.abs(params.scannedBs - params.expectedBs) <= 5;
  const matchBadge =
    typeof params.scannedBs === 'number' && params.scannedBs > 0
      ? diffOk
        ? '✅ MONTO EXACTO'
        : '⚠️ MONTO DIFERENTE — VERIFICAR'
      : '📸 VERIFICAR FOTO ADJUNTA';

  const headerIcon = params.isMembership ? '🏋️‍♂️ *PAGO DE MEMBRESÍA*' : '🛒 *PAGO DE TIENDA*';
  const clientLabel = params.clientName
    ? `${params.clientName} (${params.clientPhone})`
    : params.clientPhone;

  return `${headerIcon} — *${params.gymName}*
━━━━━━━━━━━━━━━━━━━━
📥 *PRECIO ESCANEADO:* *${scannedText}*
🎯 *PRECIO QUE DEBERÍA DECIR:* *${expectedText}*
📊 *Estado:* ${matchBadge}
🔢 *Operación:* *${params.operationNumber}*
━━━━━━━━━━━━━━━━━━━━
• *Cliente:* ${clientLabel}
• *Concepto:* ${params.planOrItems}${
    params.membershipCount > 1 ? ` (${params.membershipCount} personas)` : ''
  }${params.paymentNote ? `\n• *Nota / Excepción:* ${params.paymentNote}` : ''}

👉 *Admin:* Responde *yes* (o *si* / *aprobado*) a este mensaje para aprobar el pago.`;
}

function detectPartialOrExceptionPayment(rawText: string, norm: string): {
  isException: boolean;
  fraction: number | null;
  partialUsd: number | null;
  partialBs: number | null;
  note: string | null;
} {
  const isHalf =
    /\b(mitad|medio|media|50%|la mitad)\b/i.test(norm) ||
    norm.includes('paying for half') ||
    norm.includes('pagando la mitad');
  const isPartialKeyword =
    isHalf ||
    hasFuzzyWord(norm, ['parte', 'parcial', 'abono', 'adelanto', 'efectivo', 'fisico', 'divisas', 'resto', 'completar', 'diferente'], 1) ||
    /\b(una parte|en fisico|en efectivo|dos pagos|varios pagos|otro pago movil)\b/i.test(norm);

  if (!isPartialKeyword) {
    return { isException: false, fraction: null, partialUsd: null, partialBs: null, note: null };
  }

  let partialUsd: number | null = null;
  const usdMatch = rawText.match(/\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:usd|dolares|d[oó]lares|\$)/i);
  if (usdMatch) {
    partialUsd = parseFloat((usdMatch[1] || usdMatch[2]).replace(',', '.'));
  }

  let partialBs: number | null = null;
  const bsMatch = rawText.match(/(?:bs\.?|bolivares|bol[ií]vares)\s*([\d.]+(?:,\d{1,2})?)/i);
  if (bsMatch) {
    partialBs = parseVenezuelanAmount(bsMatch[1]);
  }

  return {
    isException: true,
    fraction: isHalf ? 0.5 : null,
    partialUsd,
    partialBs,
    note: `Pago parcial / excepción declarada: "${rawText.slice(0, 120)}"`,
  };
}

function extractMembershipCountFromText(norm: string): number {
  const wordToNum: Record<string, number> = {
    una: 1,
    un: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
  };
  const digitMatch = norm.match(
    /\b(\d{1,2})\s*(?:x\s*)?(?:membresias|membresia|mensualidades|mensualidad|personas|cupos|inscripciones|meses)\b/i
  );
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  const wordMatch = norm.match(
    /\b(una|un|dos|tres|cuatro|cinco|seis)\s+(?:membresias|membresia|mensualidades|mensualidad|personas|cupos)\b/i
  );
  if (wordMatch && wordToNum[wordMatch[1]]) {
    return wordToNum[wordMatch[1]];
  }
  return 1;
}

function extractMultipleProfilesFromText(
  rawText: string
): Array<{ cedula: string; firstName: string; lastName: string }> {
  const textNoDots = rawText.replace(/(\d)\.(\d{3})\.(\d{3})/g, '$1$2$3');
  const results: Array<{ cedula: string; firstName: string; lastName: string }> = [];
  const segments = textNoDots
    .split(/[\n;]+|(?=\b[VEJvej][-\s]?\d{6,9}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const m = seg.match(/\b([VEJvej][-\s]?\d{6,9}|\d{6,9})\b/);
    if (!m) continue;
    const rawCed = m[1].toUpperCase().replace(/[\s\-]+/g, '');
    const formattedCedula = /^[VEJ]/.test(rawCed)
      ? `${rawCed[0]}-${rawCed.slice(1)}`
      : `V-${rawCed}`;
    const cleanedName = seg
      .replace(m[0], ' ')
      .replace(
        /\b(mi|la|el|cedula|cédula|es|nombre|apellido|apellidos|nombres|soy|me|llamo|aqui|aquí|estan|están|mis|datos|id|v|e|de|identidad|cliente|hola|buenas|persona|numero|nro)\b/gi,
        ' '
      )
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = cleanedName.split(' ').filter((w) => w.length >= 2);
    if (parts.length >= 1) {
      results.push({
        cedula: formattedCedula,
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
      });
    }
  }
  return results;
}

function evaluateSmartSpanishBot(
  phone: string,
  rawMessage: string,
  context: BotContext,
  session: ClientSessionState
): Record<string, any> | null {
  const cleanedMsgWithoutPhotoTag = rawMessage.replace(/\[📸[^\]]*\]/g, '').trim();
  const norm = normalizeSpanish(cleanedMsgWithoutPhotoTag || rawMessage);
  const hasPhoto =
    Boolean(context?.hasPhotoAttached) ||
    Boolean(context?.receiptImageUrl) ||
    rawMessage.includes('📸') ||
    hasFuzzyWord(norm, ['foto', 'capture', 'captura', 'imagen', 'comprobante', 'recibo'], 1);

  const gymName = context?.businessName || 'FormaGym';
  const ownerPhoneMem = context?.ownerPhoneMemberships || '+58 414-6734866';
  const ownerPhoneCons = context?.ownerPhoneConsumables || '+58 424-6559787';
  const ownerPhoneSup = context?.ownerPhoneSupport || '+58 414-6734866';

  const allCatalogProducts = context?.products || [];
  const products = allCatalogProducts.filter((p) => p.available);
  const outOfStockProducts = allCatalogProducts.filter((p) => !p.available);
  const memProducts = products.filter((p) => p.category === 'membresias');
  const mainMemProduct = memProducts[0];

  const memUsd = mainMemProduct
    ? Number(mainMemProduct.basePriceUsd)
    : Number(context?.membershipMonthlyUsd || 30);
  const memBs = mainMemProduct
    ? Number(mainMemProduct.priceBs)
    : typeof context?.membershipMonthlyBs === 'number' && context.membershipMonthlyBs > 0
    ? Number(context.membershipMonthlyBs)
    : Number((memUsd * (context?.activeRate || 68.45)).toFixed(2));

  const regUsd = Number(context?.registrationUsd || serverSyncedContext.registrationUsd || 15);
  const regBs =
    typeof context?.registrationBs === 'number' && context.registrationBs > 0
      ? Number(context.registrationBs)
      : Number((regUsd * (context?.activeRate || 68.45)).toFixed(2));

  const clientRegisteredFirstName = getCleanFirstName(context?.membership?.firstName);
  const clientIsRegisteredForLife = Boolean(
    context?.membership &&
      (context.membership.isRegisteredForLife !== false ||
        context.membership.status === 'active' ||
        context.membership.status === 'expired' ||
        context.membership.status === 'expiring_soon')
  );

  // 0. Check if this message is sent BY an ADMIN / Designated Owner Phone!
  const normalizePhoneDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
  const senderDigits = normalizePhoneDigits(phone);
  const adminMemDigits = ownerPhoneMem
    .split(/[,;/]+/)
    .map((s) => normalizePhoneDigits(s))
    .filter((d) => d.length >= 7);
  const adminConsDigits = ownerPhoneCons
    .split(/[,;/]+/)
    .map((s) => normalizePhoneDigits(s))
    .filter((d) => d.length >= 7);
  const supportDigitsList = ownerPhoneSup
    .split(/[,;/]+/)
    .map((s) => normalizePhoneDigits(s))
    .filter((d) => d.length >= 7);
  const rawAdminNumbers = context?.adminNumbers ?? serverSyncedContext.adminNumbers ?? '';
  const extraAdminDigits = rawAdminNumbers
    .split(/[,;/\n]+/)
    .map((s) => normalizePhoneDigits(s))
    .filter((d) => d.length >= 7);

  const isExtraAdminNumber =
    senderDigits.length >= 7 && extraAdminDigits.includes(senderDigits);

  // Only the dedicated Support number (and NOT numbers added in "Admin Numbers") gets the support message answerer
  const isSupportAnswererPhone =
    senderDigits.length >= 7 &&
    supportDigitsList.includes(senderDigits) &&
    !isExtraAdminNumber;

  const isAdminPhone =
    senderDigits.length >= 7 &&
    (isExtraAdminNumber ||
      adminMemDigits.includes(senderDigits) ||
      adminConsDigits.includes(senderDigits) ||
      supportDigitsList.includes(senderDigits));

  // 0A-0. Admin verifying or rejecting a Lifetime Registration check ("si inscrito", "confirmar inscripcion", "no inscrito")
  const pendingRegChecksNow = pendingRegistrationChecks.filter((r) => r.status === 'pending');
  const isRegVerifyApprove =
    isAdminPhone &&
    (/\b(si inscrito|si esta inscrito|esta inscrito|confirmar inscripcion|aprobar inscripcion|inscrito)\b/i.test(
      norm
    ) ||
      (pendingRegChecksNow.length > 0 &&
        unifiedPendingNow.length === 0 &&
        /^(yes|si|ok|dale|confirmado|confirmar|aprobado|aprobar)\b/i.test(norm)));
  const isRegVerifyReject =
    isAdminPhone &&
    (/\b(no inscrito|no esta inscrito|sin inscripcion|rechazar inscripcion|nuevo ingreso)\b/i.test(
      norm
    ) ||
      (pendingRegChecksNow.length > 0 &&
        unifiedPendingNow.length === 0 &&
        /^(no|rechazar|rechazado|falso|negativo)\b/i.test(norm)));

  if (isRegVerifyApprove || isRegVerifyReject) {
    const targetReg = pendingRegChecksNow[pendingRegChecksNow.length - 1];
    if (!targetReg) {
      return {
        action: 'NONE',
        reply: `👮‍♂️ *Modo Administrador (${gymName}):* No hay ninguna verificación de inscripción pendiente en este momento.`,
      };
    }

    targetReg.status = isRegVerifyApprove ? 'confirmed' : 'rejected';
    const clientSess = getOrCreateClientSession(targetReg.clientPhone);

    if (isRegVerifyApprove) {
      // Mark member as registered for life in serverSyncedContext & disk DB
      if (Array.isArray(serverSyncedContext.memberships)) {
        const existsIdx = serverSyncedContext.memberships.findIndex(
          (m: any) =>
            m.id === targetReg.id ||
            (m.cedula &&
              m.cedula.replace(/\D/g, '') === targetReg.cedula.replace(/\D/g, '')) ||
            normalizePhoneDigits(m.phone) === normalizePhoneDigits(targetReg.clientPhone)
        );
        if (existsIdx >= 0) {
          serverSyncedContext.memberships[existsIdx] = {
            ...serverSyncedContext.memberships[existsIdx],
            phone: targetReg.clientPhone,
            cedula: targetReg.cedula,
            firstName: targetReg.firstName,
            lastName: targetReg.lastName,
            isRegisteredForLife: true,
            needsManualPhone: false,
            status:
              serverSyncedContext.memberships[existsIdx].status === 'pending_registration_check'
                ? 'expired'
                : serverSyncedContext.memberships[existsIdx].status,
          };
        }
        const currentDisk = readLocalDiskDb() || {};
        writeLocalDiskDb({
          ...currentDisk,
          memberships: serverSyncedContext.memberships,
          savedAt: new Date().toISOString(),
        });
      }

      clientSess.intentStage = 'awaiting_payment_receipt';
      clientSess.pendingCategory = 'membership';
      clientSess.lastShownCategory = 'membership';
      clientSess.pendingMembershipCount = 1;
      clientSess.includesRegistration = false;
      clientSess.pendingItemsSummary = `Membresía Mensual ${gymName} (Inscrito de por vida)`;
      clientSess.pendingTotalUsd = memUsd;
      clientSess.pendingTotalBs = memBs;

      const clientMsg = `✅ ¡Hola *${targetReg.firstName}*! El administrador de *${gymName}* confirmó que *ya estás inscrito de por vida* (Cédula: *${targetReg.cedula}*) 🎉\n\nComo la inscripción es vitalicia, para activar tu *Membresía Mensual* solo debes pagar la mensualidad:\n• *Monto:* *$${memUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(memBs)}*)\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nEnvíame la *foto del comprobante* por aquí cuando realices el pago.`;

      return {
        action: 'ADMIN_VERIFY_REGISTRATION',
        targetClientPhone: targetReg.clientPhone,
        verifiedRegistration: {
          ...targetReg,
          approved: true,
        },
        clientNotificationMessage: clientMsg,
        reply: `✅ *Inscripción Vitalicia Confirmada*\n• *Cliente:* ${targetReg.firstName} ${targetReg.lastName} (${targetReg.cedula})\n• *Teléfono:* ${targetReg.clientPhone}\n\nYa quedó registrado de por vida en el sistema y se le indicó que solo debe pagar la mensualidad ($${memUsd.toFixed(
          2
        )} USD / Bs. ${formatBsVe(memBs)}).`,
      };
    } else {
      // Rejected: Remove temporary pending_registration_check record or mark isRegisteredForLife = false
      if (Array.isArray(serverSyncedContext.memberships)) {
        serverSyncedContext.memberships = serverSyncedContext.memberships.filter(
          (m: any) =>
            !(
              m.status === 'pending_registration_check' &&
              (m.id === targetReg.id ||
                normalizePhoneDigits(m.phone) === normalizePhoneDigits(targetReg.clientPhone))
            )
        );
        const currentDisk = readLocalDiskDb() || {};
        writeLocalDiskDb({
          ...currentDisk,
          memberships: serverSyncedContext.memberships,
          savedAt: new Date().toISOString(),
        });
      }

      const combinedUsd = Number((regUsd + memUsd).toFixed(2));
      const combinedBs = Number((regBs + memBs).toFixed(2));
      clientSess.intentStage = 'awaiting_payment_receipt';
      clientSess.pendingCategory = 'membership';
      clientSess.lastShownCategory = 'membership';
      clientSess.pendingMembershipCount = 1;
      clientSess.includesRegistration = true;
      clientSess.pendingItemsSummary = `Inscripción Vitalicia + Membresía Mensual ${gymName}`;
      clientSess.pendingTotalUsd = combinedUsd;
      clientSess.pendingTotalBs = combinedBs;

      const clientMsg = `ℹ️ Hola *${targetReg.firstName}*, el administrador revisó el sistema de *${gymName}* y aún no figuras con inscripción registrada.\n\nPara aplicar a la membresía primero debes estar inscrito (la *Inscripción* es de por vida y se paga una sola vez):\n• *Inscripción Vitalicia:* *$${regUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(regBs)}*)\n• *Membresía Mensual:* *$${memUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(memBs)}*)\n💰 *Total a pagar (Inscripción + 1er Mes):* *$${combinedUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(combinedBs)}*)\n\n📲 *Pago Móvil (Mensualidad e Inscripción):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nEnvíame la *foto del comprobante* por aquí cuando realices el pago.`;

      return {
        action: 'ADMIN_VERIFY_REGISTRATION',
        targetClientPhone: targetReg.clientPhone,
        verifiedRegistration: {
          ...targetReg,
          approved: false,
        },
        clientNotificationMessage: clientMsg,
        reply: `⚠️ *Inscripción No Encontrada — Notificado al Cliente*\n• *Cliente:* ${targetReg.firstName} ${targetReg.lastName} (${targetReg.cedula})\n• *Teléfono:* ${targetReg.clientPhone}\n\nSe le informó al cliente que debe pagar la *Inscripción Vitalicia ($${regUsd.toFixed(
          2
        )}) + Membresía Mensual ($${memUsd.toFixed(2)}) = $${combinedUsd.toFixed(
          2
        )} USD (Bs. ${formatBsVe(combinedBs)})*.`,
      };
    }
  }

  // 0A. Admin approving a Pago Móvil via WhatsApp chat ("yes", "si", "sí", "approved", "aprobado", "ok", "dale")
  const unifiedPendingNow = getUnifiedPendingPayments(ownerPhoneMem, ownerPhoneCons);
  const isApprovalCommand = isAdminPhone
    ? /^(yes|si|ok|dale|listo|approved|approve|aprobado|aprobada|aprobar|aceptado|aceptada|confirmado|confirmar)\b/i.test(
        norm
      ) ||
      /\b(approved|approve|aprobado|aprobada|aprobar|aceptado|aceptada|confirmado|confirmar)\b/i.test(
        norm
      )
    : /\b(approved|approve|aprobado|aprobada|aprobar)\b/i.test(norm) &&
      unifiedPendingNow.length > 0;

  if (isApprovalCommand) {
    const combinedAdminRefText = `${cleanedMsgWithoutPhotoTag} ${context?.quotedText || ''}`;
    const opMatchInAdminMsg = combinedAdminRefText.match(/\b(00\d{5,16}|\d{6,20})\b/);
    const phoneMatchInAdminMsg = combinedAdminRefText.match(
      /(\+?58[\s\-]?\d{3}[\s\-]?\d{7}|04\d{2}[\s\-]?\d{7})/
    );

    let targetPayment = unifiedPendingNow
      .slice()
      .reverse()
      .find((p) => {
        if (opMatchInAdminMsg && p.operationNumber.includes(opMatchInAdminMsg[1])) return true;
        if (
          phoneMatchInAdminMsg &&
          normalizePhoneDigits(p.clientPhone) === normalizePhoneDigits(phoneMatchInAdminMsg[1])
        ) {
          return true;
        }
        return false;
      });

    if (!targetPayment) {
      targetPayment = unifiedPendingNow[unifiedPendingNow.length - 1];
    }

    if (!targetPayment) {
      return {
        action: 'NONE',
        reply: `👮‍♂️ *Modo Administrador (${gymName}):* No hay ningún pago pendiente por aprobar en este momento (0 pagos en cola).`,
      };
    }

    targetPayment.status = 'approved';
    // Also mark in-memory pendingAdminPayments and serverSyncedContext so subsequent queries immediately reflect approval
    pendingAdminPayments.forEach((p) => {
      if (
        p.status === 'pending' &&
        (p.operationNumber === targetPayment!.operationNumber ||
          normalizePhoneDigits(p.clientPhone) === normalizePhoneDigits(targetPayment!.clientPhone))
      ) {
        p.status = 'approved';
      }
    });

    if (targetPayment.category === 'membership' && Array.isArray(serverSyncedContext.memberships)) {
      serverSyncedContext.memberships = serverSyncedContext.memberships.map((m) =>
        m.status === 'pending_payment' &&
        (m.paymentRef === targetPayment!.operationNumber ||
          normalizePhoneDigits(m.phone) === normalizePhoneDigits(targetPayment!.clientPhone))
          ? { ...m, status: 'awaiting_profile', isRegisteredForLife: true }
          : m
      );
    } else if (Array.isArray(serverSyncedContext.shopOrders)) {
      serverSyncedContext.shopOrders = serverSyncedContext.shopOrders.map((o) =>
        o.status === 'pending_approval' &&
        (o.paymentRef === targetPayment!.operationNumber ||
          normalizePhoneDigits(o.phone) === normalizePhoneDigits(targetPayment!.clientPhone))
          ? { ...o, status: 'confirmed' }
          : o
      );
    }

    const clientSession = getOrCreateClientSession(targetPayment.clientPhone);

    if (targetPayment.category === 'membership') {
      const count = Math.max(1, targetPayment.membershipCount || 1);
      clientSession.intentStage = 'awaiting_profile_data';
      clientSession.approvedOperationRef = targetPayment.operationNumber;
      clientSession.remainingProfilesToCollect = count;
      clientSession.totalProfilesApproved = count;
      clientSession.isPayingForOtherPerson = Boolean(targetPayment.isForOtherPerson || count > 1);
      clientSession.partialCedula = null;
      clientSession.partialName = null;

      // Client message is kept simple and natural — no Operación number needed for the client
      const clientMsg =
        count > 1
          ? `✅ ¡Tu pago por *${count} membresías* fue aprobado! 🎉\n\nPor favor dime el *Nombre y Apellido* y el *Número de Cédula* de las *${count} personas* (puedes enviármelos en un solo mensaje o uno por uno) para registrarlas.`
          : targetPayment.isForOtherPerson
          ? `✅ ¡El pago de la membresía fue aprobado! 🎉\n\nPor favor dime el *Nombre y Apellido* y la *Cédula* de la persona a quien le pagaste la membresía para registrarla.`
          : `✅ ¡Tu pago de membresía fue aprobado! 🎉\n\nPor favor respóndeme con tu *Nombre y Apellido* y tu *Número de Cédula* (por ejemplo: *Juan Pérez 19549164*) para activar tu membresía.`;

      return {
        action: 'ADMIN_APPROVE_PAYMENT',
        targetClientPhone: targetPayment.clientPhone,
        approvedPayment: {
          operationNumber: targetPayment.operationNumber,
          category: 'membership',
          membershipCount: count,
          clientPhone: targetPayment.clientPhone,
        },
        clientNotificationMessage: clientMsg,
        reply: `✅ *Pago Aprobado y Sincronizado con la Web*\n• *Operación:* ${targetPayment.operationNumber}\n• *Cliente:* ${targetPayment.clientPhone}\n• *Membresías:* ${count}\n\nYa se eliminó de pendientes en la web y se le pidieron los datos al cliente.`,
      };
    } else {
      const clientMsg = `✅ ¡Tu pago por *${targetPayment.planOrItems}* fue aprobado! 🎉 Ya puedes retirar tu pedido en *${gymName}*.`;
      return {
        action: 'ADMIN_APPROVE_PAYMENT',
        targetClientPhone: targetPayment.clientPhone,
        approvedPayment: {
          operationNumber: targetPayment.operationNumber,
          category: targetPayment.category,
          membershipCount: 1,
          clientPhone: targetPayment.clientPhone,
        },
        clientNotificationMessage: clientMsg,
        reply: `✅ *Pago de Tienda Aprobado y Sincronizado con la Web*\n• *Operación:* ${targetPayment.operationNumber}\n• *Cliente:* ${targetPayment.clientPhone}\n• *Pedido:* ${targetPayment.planOrItems}`,
      };
    }
  }

  // 0B. Dedicated Owner / Admin Version of the Bot!
  if (isAdminPhone && !isApprovalCommand) {
    const quotedPhoneMatch = (context?.quotedText || '').match(
      /(\+?58[\s\-]?\d{3}[\s\-]?\d{7}|04\d{2}[\s\-]?\d{7})/
    );
    const explicitTargetMatch = cleanedMsgWithoutPhotoTag.match(
      /^(\+?58[\s\-]?\d{3}[\s\-]?\d{7}|04\d{2}[\s\-]?\d{7}|\d{10,12})\s*[:\-]\s*(.+)$/i
    );

    const isCancelAdminFlow = /^(cancelar|salir|menu|volver)$/i.test(norm);
    if (isCancelAdminFlow && session.intentStage === 'admin_adding_membership') {
      session.intentStage = 'idle';
      session.adminDraftName = null;
      session.adminDraftCedula = null;
      session.adminDraftStartDate = null;
      session.adminDraftMonths = null;
      return {
        action: 'NONE',
        reply: `👑 *Modo Administrador (${gymName}):* Registro manual cancelado. Escribe *menu* o *estadisticas* para ver todas las opciones de administrador.`,
      };
    }

    // Check if Admin wants to ADD A MEMBERSHIP MANUALLY from the bot chat (no payment receipt required!)
    const triggersAdminAddMembership =
      /\b(agregar membresia|anadir membresia|añadir membresia|nueva membresia|nuevo miembro|agregar miembro|registrar miembro|add membership|crear membresia)\b/i.test(
        norm
      );

    if (triggersAdminAddMembership || session.intentStage === 'admin_adding_membership') {
      session.intentStage = 'admin_adding_membership';

      const textForParsing = cleanedMsgWithoutPhotoTag
        .replace(
          /\b(agregar membresia|anadir membresia|añadir membresia|nueva membresia|nuevo miembro|agregar miembro|registrar miembro|add membership|crear membresia)\b/gi,
          ' '
        )
        .trim();

      // Parse date if present in message
      const parsedDate = parseDateFromAdminText(textForParsing);
      if (parsedDate) {
        session.adminDraftStartDate = parsedDate;
      }

      // Parse months if present (e.g. "2 meses", "3 membresias", "+2")
      const monthsMatch = textForParsing.match(
        /(?:\+(\d{1,2})|\b(\d{1,2})\s*(?:meses|mes|membresias)\b)/i
      );
      if (monthsMatch) {
        const mVal = parseInt(monthsMatch[1] || monthsMatch[2], 10);
        if (mVal >= 1 && mVal <= 24) {
          session.adminDraftMonths = mVal;
        }
      }

      // Remove date expressions before extracting Cedula and Name
      const textWithoutDate = textForParsing
        .replace(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g, ' ')
        .replace(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/g, ' ')
        .replace(
          /\b(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:de|del)?\s*20\d{2})?\b/gi,
          ' '
        )
        .replace(/\b(hoy|inicio|inicia|empieza|fecha|el|dia|meses|mes)\b/gi, ' ')
        .replace(/(\d)\.(\d{3})\.(\d{3})/g, '$1$2$3');

      const cedMatch = textWithoutDate.match(/\b([VEJvej][-\s]?\d{6,9}|\d{6,9})\b/);
      if (cedMatch) {
        const rawCed = cedMatch[1].toUpperCase().replace(/[\s\-]+/g, '');
        session.adminDraftCedula = /^[VEJ]/.test(rawCed)
          ? `${rawCed[0]}-${rawCed.slice(1)}`
          : `V-${rawCed}`;
      }

      const cleanedNameCandidate = (cedMatch
        ? textWithoutDate.replace(cedMatch[0], ' ')
        : textWithoutDate
      )
        .replace(/\b(nombre|apellido|cedula|cédula|id|persona|cliente|de|la|el|es)\b/gi, ' ')
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const nameWords = cleanedNameCandidate.split(' ').filter((w) => w.length >= 2);
      if (nameWords.length >= 1) {
        session.adminDraftName = nameWords.join(' ');
      }

      // Guide the admin through any missing fields (Name, ID/Cédula, Start Date)
      if (!session.adminDraftName || !session.adminDraftCedula) {
        if (session.adminDraftName && !session.adminDraftCedula) {
          return {
            action: 'NONE',
            reply: `👑 *Agregar Membresía Manual (Admin):*\nAnoté el nombre *${session.adminDraftName}*. Por favor indícame ahora su *Número de Cédula* y la *Fecha en que inicia la membresía* (ej: *19549164 20/01/2026* o *hoy*).`,
          };
        }
        if (!session.adminDraftName && session.adminDraftCedula) {
          return {
            action: 'NONE',
            reply: `👑 *Agregar Membresía Manual (Admin):*\nAnoté la cédula *${session.adminDraftCedula}*. Por favor dime el *Nombre y Apellido* de la persona y la *Fecha de inicio* (ej: *Carlos Rodríguez 20/01/2026* o *hoy*).`,
          };
        }
        return {
          action: 'NONE',
          reply: `👑 *Agregar Membresía Manual — Modo Admin (${gymName}):*\nNo necesitas presentar comprobante de pago.\n\nPor favor envíame:\n1️⃣ *Nombre y Apellido* de la persona\n2️⃣ *Número de Cédula (ID)*\n3️⃣ *Fecha en que inicia la membresía* (ej: *20/01/2026*, *2026-01-20* o *hoy*)\n\n*(Ejemplo en un solo mensaje: "Carlos Rodríguez 19549164 20/01/2026" o agrega "2 meses" si pagó más de 1 mes).*`,
        };
      }

      if (!session.adminDraftStartDate) {
        return {
          action: 'NONE',
          reply: `👑 *Agregar Membresía Manual (Admin):*\n• *Persona:* ${session.adminDraftName}\n• *Cédula:* ${session.adminDraftCedula}\n\n📅 ¿En qué *fecha inicia la membresía*? (Responde por ejemplo *20/01/2026*, *31/01/2026* o *hoy*. Si pagó más de 1 membresía/mes, puedes decir ej: *20/01/2026 2 meses*).`,
        };
      }

      // All 3 required pieces collected! Create the active membership with exact calendar-month expiration!
      const fullNameParts = session.adminDraftName.split(' ');
      const firstName = fullNameParts[0] || 'Miembro';
      const lastName = fullNameParts.slice(1).join(' ');
      const cedula = session.adminDraftCedula;
      const startDate = session.adminDraftStartDate;
      const prepaidMonths = Math.max(1, session.adminDraftMonths || 1);
      const expiresAt = addCalendarMonthsServer(startDate, prepaidMonths);
      const totalUsd = Number((memUsd * prepaidMonths).toFixed(2));
      const totalBs = Number((memBs * prepaidMonths).toFixed(2));
      const manualRef = `MANUAL-${Date.now().toString().slice(-6)}`;

      const newManualMember = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        phone: '',
        cedula,
        firstName,
        lastName,
        planName:
          prepaidMonths > 1
            ? `Membresía Mensual ${gymName} (${prepaidMonths} Meses)`
            : `Membresía Mensual ${gymName}`,
        status: 'active',
        priceUsd: totalUsd,
        rateBs: Number(context?.activeRate || 68.45),
        totalBs,
        paymentRef: manualRef,
        paymentMethod: `Registro Manual Admin (${phone})`,
        startDate,
        expiresAt,
        prepaidMonths,
        membershipCount: prepaidMonths,
        needsManualPhone: true,
        paidByPhone: phone,
        lastReminderSent: '',
      };

      if (!Array.isArray(serverSyncedContext.memberships)) {
        serverSyncedContext.memberships = [];
      }
      serverSyncedContext.memberships.unshift(newManualMember);

      // Persist to local disk DB immediately
      const currentDisk = readLocalDiskDb() || {};
      const diskMems = Array.isArray(currentDisk.memberships)
        ? (currentDisk.memberships as any[])
        : [];
      writeLocalDiskDb({
        ...currentDisk,
        memberships: [newManualMember, ...diskMems],
        savedAt: new Date().toISOString(),
      });

      session.intentStage = 'idle';
      session.adminDraftName = null;
      session.adminDraftCedula = null;
      session.adminDraftStartDate = null;
      session.adminDraftMonths = null;

      return {
        action: 'ADMIN_CREATE_MANUAL_MEMBERSHIP',
        createdManualMembership: newManualMember,
        reply: `✅ *Membresía Manual Agregada al Sistema (${gymName})*\n━━━━━━━━━━━━━━━━━━━━\n• *Miembro:* ${firstName} ${lastName}${
          prepaidMonths > 1 ? ` *[+${prepaidMonths}]*` : ''
        }\n• *Cédula (ID):* ${cedula}\n• *Fecha de Inicio:* ${startDate} (${formatSpanishDateServer(
          startDate
        )})\n• *Fecha de Vencimiento:* *${expiresAt}* (*${formatSpanishDateServer(
          expiresAt
        )}*)\n• *Teléfono:* Pendiente (Cuando escriba al bot y diga que ya está en el sistema con su Nombre y Cédula, se vinculará automáticamente, o puedes agregarlo en la web).\n• *Estado:* ✅ ACTIVA`,
      };
    }

    // Check if the Admin is specifically asking to CHECK PENDING PAYMENTS ("pagos pendientes", "hay pendientes?", "ver pendientes", "por aprobar", "pending payments", etc.)
    const asksPendingPaymentsSpecifically =
      /^(pendiente|pendientes|pagos pendientes|ver pendientes|revisar pendientes|revisar pagos|ver pagos|cola de pagos|por aprobar|pagos por aprobar|pending|pending payments|check pending)$/i.test(
        norm
      ) ||
      /\b(pagos pendientes|pago pendiente|pendientes por aprobar|hay pagos|hay pendientes|que pagos hay|cuantos pagos pendientes|ver pendientes|revisar pendientes|check pending|pending payments|faltan por aprobar)\b/i.test(
        norm
      );

    if (asksPendingPaymentsSpecifically && !quotedPhoneMatch && !explicitTargetMatch) {
      const pendingList = getUnifiedPendingPayments(ownerPhoneMem, ownerPhoneCons);
      if (pendingList.length === 0) {
        return {
          action: 'NONE',
          pendingPaymentsCount: 0,
          pendingPayments: [],
          reply: `👑 *Revisión de Pagos Pendientes — ${gymName}*\n━━━━━━━━━━━━━━━━━━━━\n✅ *No hay pagos pendientes por aprobar en este momento.*\n\n• *Membresías por aprobar:* 0\n• *Pedidos de tienda por aprobar:* 0\n\nTodo está al día. Si deseas ver el resumen general escribe *estadisticas*, o escribe *agregar membresia* para registrar un miembro manualmente.`,
        };
      }

      const memPendingCount = pendingList.filter((p) => p.category === 'membership').length;
      const shopPendingCount = pendingList.filter((p) => p.category !== 'membership').length;
      const receiptCards: Array<{ receiptImageUrl: string; caption: string }> = [];

      const formattedPendingItems = pendingList
        .map((p, idx) => {
          const isMem = p.category === 'membership';
          const scannedBs =
            typeof p.scannedAmountBs === 'number' && p.scannedAmountBs > 0
              ? p.scannedAmountBs
              : p.amountBs;
          const expectedBs =
            typeof p.expectedAmountBs === 'number' && p.expectedAmountBs > 0
              ? p.expectedAmountBs
              : p.amountBs;
          const diffOk = Math.abs(scannedBs - expectedBs) <= 5;
          const statusBadge = diffOk
            ? '✅ MONTO COINCIDE'
            : `⚠️ DIFERENCIA (Dif: Bs. ${formatBsVe(Math.abs(scannedBs - expectedBs))})`;

          const itemCardText = `${idx + 1}️⃣ ${
            isMem ? '🏋️‍♂️ *MEMBRESÍA*' : '🛒 *TIENDA / PRODUCTO*'
          }\n📥 *PRECIO ESCANEADO:* *${formatBsVe(
            scannedBs
          )} Bs*\n🎯 *DEBERÍA DECIR:* *${formatBsVe(expectedBs)} Bs ($${Number(
            p.amountUsd || 0
          ).toFixed(2)} USD)*\n📊 *Estado:* ${statusBadge}\n🔢 *Operación:* *${
            p.operationNumber
          }*\n👤 *Cliente:* ${p.clientPhone}\n📦 *Concepto:* ${p.planOrItems}${
            p.membershipCount > 1 ? ` (${p.membershipCount} membresías)` : ''
          }${p.paymentNote ? `\n📝 *Nota:* ${p.paymentNote}` : ''}${
            p.receiptImageUrl ? '\n📸 *Foto del comprobante:* Disponible' : ''
          }`;

          if (p.receiptImageUrl) {
            receiptCards.push({
              receiptImageUrl: p.receiptImageUrl,
              caption: itemCardText,
            });
          }

          return itemCardText;
        })
        .join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');

      return {
        action: 'ADMIN_CHECK_PENDING_PAYMENTS',
        pendingPaymentsCount: pendingList.length,
        pendingPayments: pendingList,
        adminPendingReceiptCards: receiptCards,
        reply: `👑 *Pagos Pendientes por Aprobar (${pendingList.length}) — ${gymName}*\n• *Membresías:* ${memPendingCount} | *Tienda/Productos:* ${shopPendingCount}\n━━━━━━━━━━━━━━━━━━━━\n\n${formattedPendingItems}\n\n━━━━━━━━━━━━━━━━━━━━\n👉 *Para aprobar:* Responde *"yes"* (o *"aprobado"*) para aprobar el último pago, o escribe *"aprobar [Operación]"* (ej: *aprobar ${
          pendingList[pendingList.length - 1].operationNumber
        }*) para aprobar uno específico.`,
      };
    }

    // Check if the admin is asking for the Admin Guide / Statistics / Database Query / Member Inspection
    const isAdminGreetingOrGuide =
      /^(hola|buenas|buenos dias|buenas tardes|buenas noches|menu|admin|panel|ayuda|comandos|estadisticas|resumen)$/i.test(
        norm
      );
    const asksAdminDatabaseQuery =
      isAdminGreetingOrGuide ||
      hasFuzzyWord(
        norm,
        [
          'pago',
          'pagos',
          'membresia',
          'membresias',
          'pendiente',
          'pendientes',
          'vencida',
          'vencidas',
          'activa',
          'activas',
          'estado',
          'quien',
          'cuantos',
          'resumen',
          'base',
          'datos',
          'buscar',
          'revisar',
          'inspeccionar',
          'info',
          'informacion',
          'estadisticas',
          'falta',
        ],
        1
      ) ||
      /\b(ya pago|ha pagado|esta al dia|membresia de|pago de|buscar a|datos de)\b/i.test(norm);

    if (
      (asksAdminDatabaseQuery || !isSupportAnswererPhone) &&
      !quotedPhoneMatch &&
      !explicitTargetMatch
    ) {
      const allMems = Array.isArray(serverSyncedContext.memberships)
        ? serverSyncedContext.memberships
        : [];
      const pendingList = getUnifiedPendingPayments(ownerPhoneMem, ownerPhoneCons);

      // Extract potential search words (name or cedula or phone)
      const stopWords = new Set([
        'hola',
        'buenas',
        'menu',
        'admin',
        'panel',
        'ayuda',
        'comandos',
        'estadisticas',
        'inspeccionar',
        'info',
        'informacion',
        'como',
        'esta',
        'la',
        'el',
        'los',
        'las',
        'de',
        'del',
        'por',
        'para',
        'con',
        'sin',
        'membresia',
        'membresias',
        'mensualidad',
        'pago',
        'pagos',
        'pagado',
        'pendiente',
        'pendientes',
        'activa',
        'activas',
        'quien',
        'quienes',
        'cuantos',
        'resumen',
        'estado',
        'revisar',
        'buscar',
        'si',
        'ya',
        'ha',
        'al',
        'dia',
        'tiene',
        'base',
        'datos',
        'hay',
        'ver',
        'mostrar',
        'aprobar',
        'cola',
        'lista',
        'cuales',
        'son',
        'tengo',
        'tenemos',
        'tienda',
        'productos',
        'check',
        'pending',
        'payments',
      ]);
      const queryTokens = norm
        .split(' ')
        .filter((w) => w.length >= 3 && !stopWords.has(w));

      if (queryTokens.length > 0 && !isAdminGreetingOrGuide) {
        const matchedMembers = allMems.filter((m) => {
          const fullBlob = normalizeSpanish(
            `${m.firstName} ${m.lastName} ${m.cedula} ${m.phone} ${m.paymentRef}`
          );
          return queryTokens.some((tok) => fullBlob.includes(tok));
        });

        if (matchedMembers.length > 0) {
          const lines = matchedMembers.slice(0, 6).map((m: any) => {
            const months = Math.max(1, m.prepaidMonths || m.membershipCount || 1);
            const plusBadge = months > 1 ? ` *[+${months}]*` : '';
            const startStr =
              m.startDate || addCalendarMonthsServer(m.expiresAt, -months);
            const statusEs =
              m.status === 'active'
                ? `✅ ACTIVA (Inició: ${startStr} → Vence el *${formatSpanishDateServer(
                    m.expiresAt
                  )}* [${m.expiresAt}])${plusBadge}`
                : m.status === 'pending_payment'
                ? `⏳ PAGO PENDIENTE POR APROBAR (Op: ${m.paymentRef})`
                : m.status === 'awaiting_profile'
                ? `📝 APROBADA — ESPERANDO CÉDULA/NOMBRE`
                : `❌ VENCIDA (Venció el ${formatSpanishDateServer(m.expiresAt)} [${m.expiresAt}])`;
            const displayName =
              getCleanFirstName(m.firstName)
                ? `${m.firstName} ${m.lastName}`.trim()
                : m.firstName || 'Sin nombre';
            const phoneAlert = m.phone
              ? m.phone
              : '⚠️ SIN TELÉFONO (Se vinculará cuando escriba al bot o agrégalo en la web)';
            return `👤 *${displayName}*${plusBadge}\n• *Cédula (ID):* ${
              m.cedula || 'Pendiente'
            }\n• *Teléfono:* ${phoneAlert}\n• *Estado:* ${statusEs}\n• *Plan:* ${
              m.planName
            }\n• *Monto:* $${Number(m.priceUsd).toFixed(2)} USD / Bs. ${formatBsVe(
              Number(m.totalBs || 0)
            )}\n• *Referencia:* ${m.paymentRef || 'Manual'}`;
          });

          return {
            action: 'NONE',
            reply: `👑 *Inspección de Miembro — Base de Datos ${gymName}:*\n\n${lines.join(
              '\n\n━━━━━━━━━━━━━━━━━━━━\n\n'
            )}`,
          };
        }
      }

      // Statistical Executive Summary & Interactive Admin Guide
      const activeMems = allMems.filter((m) => m.status === 'active');
      const expiredCount = allMems.filter(
        (m) => m.status === 'expired' || m.status === 'expiring_soon'
      ).length;
      const missingPhoneCount = allMems.filter(
        (m: any) => !m.phone || m.needsManualPhone
      ).length;
      const totalMemRevenueUsd = allMems
        .filter((m) => m.status !== 'pending_payment')
        .reduce((acc, m) => acc + Number(m.priceUsd || 0), 0);
      const totalMemRevenueBs = allMems
        .filter((m) => m.status !== 'pending_payment')
        .reduce((acc, m) => acc + Number(m.totalBs || 0), 0);

      const pendingSummary =
        pendingList.length > 0
          ? pendingList
              .slice(-5)
              .map(
                (p, i) =>
                  `${i + 1}. *Op: ${p.operationNumber}* — ${p.clientPhone} (${p.planOrItems})\n   📥 Escaneado: *${
                    p.scannedAmountBs ? `${formatBsVe(p.scannedAmountBs)} Bs` : 'Ver foto'
                  }* | 🎯 Debería decir: *${formatBsVe(p.amountBs)} Bs ($${Number(
                    p.amountUsd || 0
                  ).toFixed(2)})*`
              )
              .join('\n')
          : '✅ No hay pagos pendientes en cola.';

      const supportGuideLine = isSupportAnswererPhone
        ? '\n5️⃣ *Responder Soporte:* Escribe directamente o responde citando un mensaje para contestarle al cliente.'
        : '';

      return {
        action: 'NONE',
        reply: `👑 *Panel Estadístico de Administrador — ${gymName}*\n━━━━━━━━━━━━━━━━━━━━\n📊 *ESTADÍSTICAS EN TIEMPO REAL:*\n• *Membresías Activas:* ${
          activeMems.length
        }\n• *Pagos Pendientes por Aprobar:* ${
          pendingList.length
        }\n• *Por Vencer / Vencidas:* ${expiredCount}\n• *Miembros sin Teléfono Registrado:* ${missingPhoneCount}\n• *Ingresos Membresías:* $${totalMemRevenueUsd.toFixed(
          2
        )} USD (Bs. ${formatBsVe(totalMemRevenueBs)})\n\n📋 *PAGOS PENDIENTES POR APROBAR (${
          pendingList.length
        }):*\n${pendingSummary}\n\n🛠️ *GUÍA DE COMANDOS SOLO PARA ADMINS:*\n1️⃣ *Revisar Pagos Pendientes:* Escribe *"pagos pendientes"* o *"pendientes"* para ver todos los pagos en cola con su monto escaneado y esperado.\n2️⃣ *Aprobar un Pago:* Responde *"yes"*, *"aprobado"* o *"aprobar [Operación]"*.\n3️⃣ *Agregar Membresía Manual (Sin pago):* Escribe *"agregar membresia"* (te pediré Nombre, Cédula y Fecha de Inicio).\n4️⃣ *Buscar / Inspeccionar Persona:* Escribe *"buscar [Nombre o Cédula]"* o *"¿ya pagó [Nombre]?"*.${supportGuideLine}`,
      };
    }

    // ONLY the designated Support number (and NOT numbers added in "Admin Numbers") gets the support message answerer!
    if (isSupportAnswererPhone) {
      const targetClient = explicitTargetMatch
        ? explicitTargetMatch[1].trim()
        : quotedPhoneMatch
        ? quotedPhoneMatch[1].trim()
        : context?.activeSupportClientPhone || lastSupportClientPhone;

      const replyBody = explicitTargetMatch
        ? explicitTargetMatch[2].trim()
        : cleanedMsgWithoutPhotoTag;

      if (targetClient && replyBody) {
        lastSupportClientPhone = targetClient;
        return {
          action: 'SUPPORT_AGENT_REPLY',
          targetClientPhone: targetClient,
          supportReplyText: replyBody,
          reply: `↪️ *Enviado a ${targetClient}:* "${replyBody}"`,
        };
      }
    }

    return {
      action: 'NONE',
      reply: `👑 *Modo Administrador (${gymName}):* Escribe *estadisticas*, *pagos pendientes*, *agregar membresia* o *buscar [Nombre o Cédula]* para consultar la base de datos.`,
    };
  }

  // 1. Check if client is in `awaiting_support_issue` or `support_chat_open` state
  const isEndSupportChat = /^(cancelar|gracias|listo|no gracias|muchas gracias|todo bien)$/i.test(norm);
  if (
    (session.intentStage === 'awaiting_support_issue' ||
      session.intentStage === 'support_chat_open' ||
      context?.supportState === 'awaiting_issue') &&
    cleanedMsgWithoutPhotoTag.length >= 2
  ) {
    if (isEndSupportChat) {
      session.intentStage = 'idle';
      return {
        action: 'NONE',
        reply: `¡Con mucho gusto${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! Cualquier otra cosa que necesites en *${gymName}*, escríbeme por aquí.`,
      };
    }

    // If the client stays in support conversation without asking about prices/payments, forward directly to the admin like a live chat!
    const isSwitchingToBotTopic =
      hasPhoto ||
      hasFuzzyWord(norm, ['precio', 'precios', 'mensualidad', 'membresia', 'horario', 'agua', 'jugo'], 1);

    if (session.intentStage === 'awaiting_support_issue' || !isSwitchingToBotTopic) {
      session.intentStage = 'support_chat_open';
      lastSupportClientPhone = phone;
      const clientLabel = clientRegisteredFirstName
        ? `${clientRegisteredFirstName} (${phone})`
        : phone;
      const forwardedFormatted = `📩 *Chat de Soporte — ${gymName}*\n• *Cliente:* ${clientLabel}\n• *Mensaje:* "${cleanedMsgWithoutPhotoTag}"\n\n_(Responde directamente en este chat para contestarle al cliente)_`;

      return {
        action: 'FORWARD_TO_SUPPORT',
        designatedSupportPhone: ownerPhoneSup,
        supportIssue: cleanedMsgWithoutPhotoTag,
        forwardedMessageFormatted: forwardedFormatted,
        reply: `¡Listo${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! Ya le envié tu mensaje al encargado. Apenas responda te llega por aquí mismo.`,
      };
    }
  }

  // 1B. Check if existing member is answering whether they are paying in advance or for another person
  if (session.intentStage === 'awaiting_existing_member_choice' && !hasPhoto) {
    const saysAdvance =
      hasFuzzyWord(norm, ['adelantado', 'adelantar', 'mia', 'mio', 'propia', 'renovar', 'mes'], 1) ||
      /\b(para mi|por adelantado|mi membresia|mi mensualidad)\b/i.test(norm);
    const saysOther =
      hasFuzzyWord(norm, ['otra', 'otro', 'persona', 'familiar', 'amigo', 'amiga', 'hermano', 'hermana', 'hijo', 'hija', 'esposa', 'esposo'], 1) ||
      extractMembershipCountFromText(norm) > 1;

    if (saysAdvance || saysOther) {
      const memCount = Math.max(1, extractMembershipCountFromText(norm));
      const totalUsd = Number((memUsd * memCount).toFixed(2));
      const totalBs = Number((memBs * memCount).toFixed(2));
      session.intentStage = 'awaiting_payment_receipt';
      session.pendingCategory = 'membership';
      session.lastShownCategory = 'membership';
      session.pendingMembershipCount = memCount;
      session.isPayingForOtherPerson = saysOther && !saysAdvance;
      session.isPayingInAdvance = saysAdvance;
      session.pendingItemsSummary = session.isPayingForOtherPerson
        ? memCount > 1
          ? `${memCount} Membresías (Para otras personas)`
          : `Membresía Mensual (Para otra persona)`
        : `Renovación Adelantada Membresía`;
      session.pendingTotalUsd = totalUsd;
      session.pendingTotalBs = totalBs;

      return {
        action: 'CALCULATE_ORDER',
        orderTotalUsd: totalUsd,
        orderTotalBs: totalBs,
        reply: session.isPayingForOtherPerson
          ? `¡Perfecto${
              clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
            }! Por *${memCount} membresía(s)* son *$${totalUsd.toFixed(2)} USD* (*Bs. ${formatBsVe(
              totalBs
            )}*).\n\n¿Vas a pagar por *Pago Móvil* u *otro método de pago*?\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nEnvíame la *foto del comprobante* por aquí y luego te pediré el nombre y cédula de ${
              memCount > 1 ? `las ${memCount} personas` : 'esa persona'
            }.`
          : `¡Excelente${
              clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
            }! Para adelantar tu mensualidad son *$${totalUsd.toFixed(2)} USD* (*Bs. ${formatBsVe(
              totalBs
            )}*).\n\n¿Vas a pagar por *Pago Móvil* u *otro método de pago*?\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nCuando hagas el pago, envíame la *foto del comprobante* por aquí.`,
      };
    }
  }

  // 2. Check if client is clarifying what they paid for after sending a photo/receipt without product name
  if (session.intentStage === 'awaiting_payment_item_clarification' && session.pendingReceiptRef) {
    const savedRef = session.pendingReceiptRef;
    const savedPhoto = session.pendingReceiptHasPhoto;
    const savedImgUrl = session.pendingReceiptImageUrl || undefined;
    const savedScannedBs = session.pendingReceiptScannedBs;
    return evaluateWithClarifiedReceipt(
      phone,
      norm,
      cleanedMsgWithoutPhotoTag,
      savedRef,
      savedPhoto,
      savedImgUrl,
      savedScannedBs,
      context,
      session,
      gymName,
      ownerPhoneMem,
      ownerPhoneCons,
      memUsd,
      memBs,
      products
    );
  }

  // 2B. Check if client is saying they are ALREADY registered / in the system or answering `awaiting_system_lookup` / `awaiting_registration_choice`!
  const claimsAlreadyInSystem =
    /\b(ya estoy en el sistema|estoy en el sistema|ya estoy registrado|ya estoy registrada|ya estoy inscrito|ya estoy inscrita|ya pague inscripcion|ya pague la inscripcion|ya soy miembro|ya tengo membresia|ya tengo inscripcion|ya pague en el gym|vincular mi numero|registrar mi numero)\b/i.test(
      norm
    );
  const claimsNewRegistration =
    /\b(nuevo ingreso|soy nuevo|soy nueva|no estoy inscrito|no estoy inscrita|primera vez|inscribirme por primera vez|inscripcion y mensualidad|ambos|los dos)\b/i.test(
      norm
    );

  if (
    session.intentStage === 'awaiting_registration_choice' &&
    claimsNewRegistration &&
    !claimsAlreadyInSystem &&
    !hasPhoto
  ) {
    const memCount = Math.max(1, session.pendingMembershipCount || 1);
    const totalUsd = Number(((regUsd + memUsd) * memCount).toFixed(2));
    const totalBs = Number(((regBs + memBs) * memCount).toFixed(2));
    session.intentStage = 'awaiting_payment_receipt';
    session.pendingCategory = 'membership';
    session.lastShownCategory = 'membership';
    session.includesRegistration = true;
    session.pendingItemsSummary =
      memCount > 1
        ? `${memCount}x (Inscripción Vitalicia + Membresía Mensual ${gymName})`
        : `Inscripción Vitalicia + Membresía Mensual ${gymName}`;
    session.pendingTotalUsd = totalUsd;
    session.pendingTotalBs = totalBs;

    return {
      action: 'CALCULATE_ORDER',
      orderTotalUsd: totalUsd,
      orderTotalBs: totalBs,
      reply: `¡Excelente! Bienvenido a *${gymName}* 💪\n\nRecuerda que una vez inscrito, *tu inscripción queda activa de por vida* (nunca más tendrás que volver a pagarla, a diferencia de la mensualidad):\n• *Inscripción Vitalicia:* *$${(
        regUsd * memCount
      ).toFixed(2)} USD* (*Bs. ${formatBsVe(regBs * memCount)}*)\n• *Membresía Mensual:* *$${(
        memUsd * memCount
      ).toFixed(2)} USD* (*Bs. ${formatBsVe(memBs * memCount)}*)\n💰 *Total a pagar:* *$${totalUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(totalBs)}*)\n\n📲 *Pago Móvil (Inscripción, Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nCuando realices el pago, envíame la *foto del comprobante* por aquí.`,
    };
  }

  if (
    (claimsAlreadyInSystem ||
      session.intentStage === 'awaiting_system_lookup' ||
      (session.intentStage === 'awaiting_registration_choice' && !claimsNewRegistration)) &&
    !hasPhoto &&
    session.intentStage !== 'awaiting_profile_data'
  ) {
    session.intentStage = 'awaiting_system_lookup';
    const textNoDots = cleanedMsgWithoutPhotoTag.replace(/(\d)\.(\d{3})\.(\d{3})/g, '$1$2$3');
    const cedulaMatch = textNoDots.match(/\b([VEJvej][-\s]?\d{6,9}|\d{6,9})\b/);
    let lookupCedulaDigits = cedulaMatch ? cedulaMatch[1].replace(/\D/g, '') : '';
    if (!lookupCedulaDigits && session.partialCedula) {
      lookupCedulaDigits = session.partialCedula.replace(/\D/g, '');
    }

    const cleanedNameForLookup = (cedulaMatch
      ? textNoDots.replace(cedulaMatch[0], ' ')
      : textNoDots
    )
      .replace(
        /\b(hola|buenas|ya|estoy|en|el|sistema|registrado|registrada|inscrito|inscrita|soy|miembro|tengo|membresia|inscripcion|pague|la|mi|nombre|apellido|apellidos|nombres|es|cedula|cédula|id|v|e|me|llamo|vincular|numero|si)\b/gi,
        ' '
      )
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const nameWords = cleanedNameForLookup.split(' ').filter((w) => w.length >= 2);
    const lookupName = nameWords.length >= 1 ? nameWords.join(' ') : session.partialName || '';

    if (!lookupCedulaDigits && !lookupName) {
      return {
        action: 'NONE',
        reply: `¡Perfecto! Como para aplicar a la membresía primero debes estar inscrito, si *ya estás inscrito en ${gymName}*, por favor envíame tu *Nombre, Apellido y Número de Cédula (ID)* (por ejemplo: *Carlos Rodríguez 19549164*) para verificar tu inscripción con el administrador.`,
      };
    }

    if (lookupCedulaDigits && !lookupName) {
      session.partialCedula = `V-${lookupCedulaDigits}`;
      return {
        action: 'NONE',
        reply: `Anoté tu cédula *V-${lookupCedulaDigits}*. ¿Me indicas por favor tu *Nombre y Apellido* para consultarle al administrador si ya estás inscrito?`,
      };
    }

    if (!lookupCedulaDigits && lookupName) {
      session.partialName = lookupName;
      return {
        action: 'NONE',
        reply: `¡Gracias, *${lookupName}*! ¿Me indicas por favor tu *Número de Cédula (ID)* para verificar tu inscripción con el administrador de *${gymName}*?`,
      };
    }

    // Both Name/Last Name & ID (Cédula) provided!
    const allMems = Array.isArray(serverSyncedContext.memberships)
      ? serverSyncedContext.memberships
      : [];
    const normTargetName = normalizeSpanish(lookupName);
    const targetNameTokens = normTargetName.split(' ').filter((w) => w.length >= 2);
    const formattedCedula = `V-${lookupCedulaDigits}`;
    const splitLookupName = lookupName.split(' ');
    const firstName = splitLookupName[0] || 'Cliente';
    const lastName = splitLookupName.slice(1).join(' ');

    const matchedInDb = allMems.find((m: any) => {
      const mCedDigits = (m.cedula || '').replace(/\D/g, '');
      if (lookupCedulaDigits && mCedDigits && mCedDigits === lookupCedulaDigits) {
        return true;
      }
      const mFullNorm = normalizeSpanish(`${m.firstName || ''} ${m.lastName || ''}`);
      return (
        targetNameTokens.length >= 1 &&
        targetNameTokens.every((t) => mFullNorm.includes(t)) &&
        (!lookupCedulaDigits || !mCedDigits || mCedDigits === lookupCedulaDigits)
      );
    });

    session.partialCedula = null;
    session.partialName = null;
    session.intentStage = 'idle';

    // Always ask the admin if they are in fact registered when they claim to be registered so the admin can verify!
    const checkId = matchedInDb ? matchedInDb.id : `regcheck_${Date.now()}`;
    pendingRegistrationChecks.push({
      id: checkId,
      clientPhone: phone,
      cedula: formattedCedula,
      firstName,
      lastName,
      createdAt: Date.now(),
      status: 'pending',
    });

    if (!matchedInDb) {
      const pendingRegRecord = {
        id: checkId,
        phone,
        cedula: formattedCedula,
        firstName,
        lastName,
        planName: `Verificación de Inscripción Vitalicia — ${gymName}`,
        status: 'pending_registration_check',
        priceUsd: memUsd,
        rateBs: Number(context?.activeRate || 68.45),
        totalBs: memBs,
        paymentRef: `VERIF-INSC-${lookupCedulaDigits.slice(-4)}`,
        paymentMethod: 'Verificación de Inscripción con Admin',
        startDate: new Date().toISOString().slice(0, 10),
        expiresAt: new Date().toISOString().slice(0, 10),
        prepaidMonths: 1,
        membershipCount: 1,
        isRegisteredForLife: false,
        includesRegistration: false,
        lastReminderSent: '',
      };
      if (!Array.isArray(serverSyncedContext.memberships)) {
        serverSyncedContext.memberships = [];
      }
      serverSyncedContext.memberships.unshift(pendingRegRecord);
      const currentDisk = readLocalDiskDb() || {};
      writeLocalDiskDb({
        ...currentDisk,
        memberships: serverSyncedContext.memberships,
        savedAt: new Date().toISOString(),
      });
    } else {
      // Link phone if not linked yet
      const existingPhoneDigits = (matchedInDb.phone || '').replace(/\D/g, '').slice(-10);
      const senderPhoneDigits = getPhoneSessionKey(phone);
      const hasExistingValidPhone =
        existingPhoneDigits.length >= 7 &&
        !(matchedInDb as any).needsManualPhone &&
        matchedInDb.phone !== '+58 412-0000000';

      if (hasExistingValidPhone && existingPhoneDigits !== senderPhoneDigits) {
        return {
          action: 'NONE',
          reply: `Hola *${matchedInDb.firstName}*, encontré tu registro en el sistema de *${gymName}* (Cédula *${matchedInDb.cedula}*), pero ya tiene otro número de teléfono registrado.\n\n🔒 Por seguridad, solo el administrador puede cambiar números de teléfono en la base de datos desde la página web.`,
        };
      }

      matchedInDb.phone = phone;
      (matchedInDb as any).needsManualPhone = false;
      (matchedInDb as any).isRegisteredForLife = true;
      const currentDisk = readLocalDiskDb() || {};
      if (Array.isArray(currentDisk.memberships)) {
        currentDisk.memberships = (currentDisk.memberships as any[]).map((item) =>
          item.id === matchedInDb.id
            ? { ...item, phone, needsManualPhone: false, isRegisteredForLife: true }
            : item
        );
        writeLocalDiskDb({ ...currentDisk, savedAt: new Date().toISOString() });
      }
    }

    const dbFoundNote = matchedInDb
      ? `✅ *(El sistema encontró una coincidencia en la base de datos con estado: ${matchedInDb.status})*`
      : `⚠️ *(No aparece aún en la lista digital, requiere confirmación del administrador)*`;

    const adminVerificationCard = `📋 *VERIFICACIÓN DE INSCRIPCIÓN VITALICIA — ${gymName}*\n━━━━━━━━━━━━━━━━━━━━\n👤 *Nombre y Apellido:* *${firstName} ${lastName}*\n🪪 *Cédula (ID):* *${formattedCedula}*\n📱 *Teléfono:* ${phone}\n${dbFoundNote}\n━━━━━━━━━━━━━━━━━━━━\n❓ El cliente indica que *YA ESTÁ INSCRITO* en el gimnasio y solicita pagar únicamente la *Membresía Mensual* (*$${memUsd.toFixed(
      2
    )} USD* / *Bs. ${formatBsVe(memBs)}*) sin pagar la Inscripción Vitalicia (*$${regUsd.toFixed(
      2
    )} USD* / *Bs. ${formatBsVe(regBs)}*).\n\n👉 *Admin:* Responde *"si inscrito"* si confirmas que ya está inscrito de por vida, o responde *"no inscrito"* si debe pagar Inscripción + Mensualidad.`;

    return {
      action: 'ASK_ADMIN_REGISTRATION_CHECK',
      redirectedToPhone: ownerPhoneMem,
      forwardedPaymentNotification: adminVerificationCard,
      registrationVerificationRequest: {
        id: checkId,
        phone,
        cedula: formattedCedula,
        firstName,
        lastName,
        foundInDb: Boolean(matchedInDb),
      },
      reply: `¡Gracias, *${firstName}*! Anoté tus datos (*${firstName} ${lastName}*, Cédula *${formattedCedula}*).\n\n⏳ Ya le envié la consulta al administrador de *${gymName}* para confirmar que estás inscrito. Apenas el administrador confirme tu inscripción te aviso por aquí mismo para que procedas con el pago de tu mensualidad (*$${memUsd.toFixed(
        2
      )} USD* / *Bs. ${formatBsVe(memBs)}*).`,
    };
  }

  // 3. Explicit Support / Problem / Help Request
  const asksSupportTrigger =
    hasFuzzyWord(
      norm,
      [
        'soporte',
        'problema',
        'inconveniente',
        'reclamo',
        'queja',
        'encargado',
        'humano',
        'asesor',
        'ayudame',
      ],
      1
    ) ||
    norm.includes('necesito ayuda') ||
    norm.includes('hablar con alguien') ||
    norm.includes('atencion al cliente') ||
    norm.includes('tengo una duda');

  if (asksSupportTrigger) {
    const wordCount = norm.split(' ').filter(Boolean).length;
    if (wordCount >= 6) {
      session.intentStage = 'support_chat_open';
      lastSupportClientPhone = phone;
      const clientLabel = clientRegisteredFirstName
        ? `${clientRegisteredFirstName} (${phone})`
        : phone;
      const forwardedFormatted = `📩 *Chat de Soporte — ${gymName}*\n• *Cliente:* ${clientLabel}\n• *Mensaje:* "${cleanedMsgWithoutPhotoTag}"\n\n_(Responde directamente en este chat para contestarle al cliente)_`;
      return {
        action: 'FORWARD_TO_SUPPORT',
        designatedSupportPhone: ownerPhoneSup,
        supportIssue: cleanedMsgWithoutPhotoTag,
        forwardedMessageFormatted: forwardedFormatted,
        reply: `¡Entendido${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! Ya le pasé tu mensaje al encargado de *${gymName}*. Apenas me responda te escribo por aquí mismo.`,
      };
    }

    session.intentStage = 'awaiting_support_issue';
    return {
      action: 'AWAIT_SUPPORT_ISSUE',
      reply: `¡Claro${
        clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
      }! Cuéntame por aquí qué pasó o cuál es tu consulta y enseguida se la paso al encargado.`,
    };
  }

  // 3B. Check if the client is asking for an OUT-OF-STOCK product (gray button pressed on web panel) or something like "do you have eggs?"
  const productSynonyms: Record<string, string[]> = {
    prod_agua_600: ['agua mineral', 'agua fria', 'botella de agua', 'agua 600', 'agua'],
    prod_agua_alcalina: ['alcalina', 'agua alcalina', 'ph'],
    prod_isotonica: ['isotonica', 'bebida isotonica', 'electrolitos', 'gatorade'],
    prod_jugo_verde: ['jugo verde', 'detox', 'verde'],
    prod_batido_whey: ['batido', 'whey', 'cambur', 'proteico', 'merengada'],
    prod_jugo_naranja_curcuma: ['jugo inmune', 'naranja', 'zanahoria', 'curcuma'],
    prod_wrap_pollo: ['wrap', 'pollo'],
    prod_barra_proteina: ['barra', 'cacao'],
    prod_bowl_acai: ['bowl', 'acai', 'granola'],
    prod_franela_dryfit: ['franela', 'camisa', 'dry fit', 'dryfit'],
    prod_short_pro: ['short', 'pantalon'],
  };

  const matchedOutOfStock: BotProduct[] = [];
  for (const p of outOfStockProducts) {
    if (p.category === 'membresias') continue;
    const prodNorm = normalizeSpanish(p.name);
    const sigWords = prodNorm
      .split(' ')
      .filter((w) => w.length >= 4 && !['para', 'con', 'del', 'por', 'fria', 'cero'].includes(w));
    const syns = productSynonyms[p.id] || [];
    const hit =
      syns.some((s) => norm.includes(s)) ||
      sigWords.some((kw) => hasFuzzyWord(norm, [kw], 1));
    if (hit) {
      matchedOutOfStock.push(p);
    }
  }

  if (matchedOutOfStock.length > 0 && !hasPhoto) {
    const outNames = matchedOutOfStock.map((p) => `*${p.name}*`).join(', ');
    return {
      action: 'NONE',
      reply: `Por los momentos no tenemos ${outNames} disponible en stock${
        clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
      }. ¿Te gustaría consultar algún otro producto?`,
    };
  }

  // 4. Match available non-membership products & membership keywords
  const matchedShopItems: Array<{ prod: BotProduct; qty: number }> = [];
  const shopCatalog = products.filter((p) => p.category !== 'membresias');

  for (const p of shopCatalog) {
    const prodNorm = normalizeSpanish(p.name);
    const sigWords = prodNorm
      .split(' ')
      .filter((w) => w.length >= 4 && !['para', 'con', 'del', 'por', 'fria', 'cero'].includes(w));
    const syns = productSynonyms[p.id] || [];

    let isMatched = false;
    if (p.id === 'prod_agua_600') {
      if (
        norm.includes('agua mineral') ||
        norm.includes('agua fria') ||
        (hasFuzzyWord(norm, ['agua'], 0) && !norm.includes('alcalina'))
      ) {
        isMatched = true;
      }
    } else if (p.id === 'prod_agua_alcalina') {
      if (hasFuzzyWord(norm, ['alcalina'], 1)) {
        isMatched = true;
      }
    } else {
      isMatched =
        syns.some((s) => norm.includes(s)) ||
        sigWords.some((kw) => hasFuzzyWord(norm, [kw], 1));
    }

    if (isMatched) {
      let qty = 1;
      for (const kw of [...syns, ...sigWords]) {
        const firstWord = kw.split(' ')[0];
        if (!firstWord) continue;
        const qtyRegex = new RegExp(`(\\d+)\\s*(?:x\\s*)?${firstWord.slice(0, 4)}`);
        const m = norm.match(qtyRegex);
        if (m) {
          qty = Math.max(1, parseInt(m[1], 10));
          break;
        }
      }
      matchedShopItems.push({ prod: p, qty });
    }
  }

  // Strict membership detection
  const mentionsMembership =
    hasFuzzyWord(
      norm,
      ['membresia', 'membresias', 'mensualidad', 'mensualidades', 'inscripcion', 'gimnasio', 'suscripcion', 'entreno', 'entrenar'],
      1
    ) ||
    norm.includes('pagar el mes') ||
    norm.includes('precio del mes') ||
    norm.includes('cuanto es el mes') ||
    norm.includes('cuanto sale el mes');

  const detectedMembershipCount = extractMembershipCountFromText(norm);
  const mentionsOtherPerson =
    /\b(otra persona|otro|otra|hermano|hermana|hijo|hija|esposo|esposa|novio|novia|amigo|amiga|mama|papa|familiar|compañero|companero)\b/i.test(
      norm
    ) || detectedMembershipCount > 1;
  const mentionsAdvanceRenewal =
    /\b(adelantado|adelantar|por adelantado|proximo mes|renovar)\b/i.test(norm);

  // Extract operation number from scanned receipt image OR text
  const opLabelMatch = cleanedMsgWithoutPhotoTag.match(
    /(?:operaci[oó]n|referencia|comprobante|pm)[-\s#:]*(\d{5,20})\b/i
  );
  const genericRefMatch = cleanedMsgWithoutPhotoTag.match(/\b(00\d{6,16}|\d{10,20})\b/);
  const hasExplicitRef = Boolean(context?.scannedOperationNumber || opLabelMatch || genericRefMatch);
  const extractedRef =
    context?.scannedOperationNumber ||
    (opLabelMatch ? opLabelMatch[1] : genericRefMatch ? genericRefMatch[1] : null) ||
    (hasPhoto ? `${Math.floor(1000000000 + Math.random() * 9000000000)}` : 'PENDIENTE');

  const isReportingCompletedPayment =
    hasPhoto ||
    hasExplicitRef ||
    hasFuzzyWord(norm, ['pague', 'transferi', 'realice', 'comprobante', 'capture', 'captura'], 1) ||
    /\b(ya pague|aqui esta el pago|pago realizado|hice el pago|te pase el pago|envio el pago)\b/i.test(
      norm
    );

  const wantsToBuyOrPay =
    hasFuzzyWord(norm, ['pagar', 'comprar', 'llevar', 'quiero', 'dame', 'anotame', 'pedir'], 1) ||
    /\b(voy a pagar|quiero pagar|para pagar|como pago|donde pago)\b/i.test(norm);

  const asksPagoMovil =
    hasFuzzyWord(norm, ['movil', 'pagomovil', 'banco', 'cuenta', 'transferencia', 'datos'], 1) ||
    norm.includes('pago movil');

  // 5. Conversational Cédula (ID) + Nombre + Apellido collection AFTER membership is approved!
  const isAwaitingProfile =
    session.intentStage === 'awaiting_profile_data' ||
    context?.membership?.status === 'awaiting_profile';

  if (isAwaitingProfile && !isReportingCompletedPayment && matchedShopItems.length === 0) {
    if (session.remainingProfilesToCollect <= 0) {
      session.remainingProfilesToCollect = Math.max(1, context?.membership?.membershipCount || 1);
      session.totalProfilesApproved = session.remainingProfilesToCollect;
    }

    const activeExisting = findActivePersonalMembershipsByPhone(phone);
    const senderAlreadyHasActivePersonal = activeExisting.length > 0;
    const activeCedulas = new Set(
      activeExisting.map((m) => m.cedula.toUpperCase().replace(/[\s\-]+/g, ''))
    );

    // Check if the user sent multiple people in one message (e.g. for 3 memberships)
    const multiProfiles = extractMultipleProfilesFromText(cleanedMsgWithoutPhotoTag);
    if (multiProfiles.length > 1) {
      const validProfiles = multiProfiles.filter(
        (p) => !activeCedulas.has(p.cedula.toUpperCase().replace(/[\s\-]+/g, ''))
      );
      if (validProfiles.length > 0) {
        const toTake = validProfiles.slice(0, session.remainingProfilesToCollect);
        const enrichedProfiles = toTake.map((p, idx) => {
          // If sender already has an active personal membership, OR this is person 2..N in a multi-membership payment,
          // mark needsManualPhone = true and phone = '' so the web panel alerts the admin to add that person's phone!
          const isForOther =
            session.isPayingForOtherPerson || senderAlreadyHasActivePersonal || idx > 0;
          return {
            ...p,
            needsManualPhone: isForOther,
            paidByPhone: phone,
          };
        });

        session.remainingProfilesToCollect = Math.max(
          0,
          session.remainingProfilesToCollect - enrichedProfiles.length
        );
        if (session.remainingProfilesToCollect === 0) {
          session.intentStage = 'idle';
          session.isPayingForOtherPerson = false;
        }
        const registeredSummary = enrichedProfiles
          .map((p) => `• *${p.firstName} ${p.lastName}* (Cédula: *${p.cedula}*)`)
          .join('\n');

        return {
          action: 'COMPLETE_PROFILE',
          extractedProfile: enrichedProfiles[0],
          extractedProfiles: enrichedProfiles,
          operationRef: session.approvedOperationRef || context?.membership?.paymentRef || null,
          reply:
            session.remainingProfilesToCollect > 0
              ? `✅ Quedaron registrados:\n${registeredSummary}\n\nFalta(n) *${session.remainingProfilesToCollect} persona(s)*. Envíame el *Nombre y Cédula* de la siguiente persona.`
              : `🎉 ¡Listo, *${
                  enrichedProfiles[0].firstName
                }*! Quedaron registradas y *ACTIVAS* las membresías en *${gymName}*:\n${registeredSummary}\n\n¡Los esperamos para entrenar! 💪`,
        };
      }
    }

    // Single message or 2-step conversational profile parsing (Cédula + Name, or Cédula then Name)
    const textWithoutDotsInNums = cleanedMsgWithoutPhotoTag.replace(
      /(\d)\.(\d{3})\.(\d{3})/g,
      '$1$2$3'
    );
    const cedulaMatch = textWithoutDotsInNums.match(/\b([VEJvej][-\s]?\d{6,9}|\d{6,9})\b/);
    let candidateCedula = session.partialCedula;
    if (cedulaMatch) {
      const rawCedula = cedulaMatch[1].toUpperCase().replace(/[\s\-]+/g, '');
      candidateCedula = /^[VEJ]/.test(rawCedula)
        ? `${rawCedula[0]}-${rawCedula.slice(1)}`
        : `V-${rawCedula}`;
    }

    const cleanedForName = (cedulaMatch
      ? textWithoutDotsInNums.replace(cedulaMatch[0], '')
      : textWithoutDotsInNums
    )
      .replace(
        /\b(mi|la|el|cedula|cédula|es|nombre|apellido|apellidos|nombres|soy|me|llamo|aqui|aquí|estan|están|mis|datos|id|v|e|de|identidad|cliente|hola|buenas|numero|nro)\b/gi,
        ' '
      )
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const nameParts = cleanedForName.split(' ').filter((w) => w.length >= 2);
    const candidateName =
      nameParts.length >= 1 ? nameParts.join(' ') : session.partialName || null;

    if (candidateCedula && !candidateName) {
      session.partialCedula = candidateCedula;
      return {
        action: 'NONE',
        reply: `Perfecto, anoté la cédula *${candidateCedula}*. ¿Cuál es el *Nombre y Apellido* de esta persona?`,
      };
    }

    if (!candidateCedula && candidateName) {
      session.partialName = candidateName;
      return {
        action: 'NONE',
        reply: `¡Gracias, *${candidateName}*! ¿Me indicas por favor el *Número de Cédula* para completar el registro?`,
      };
    }

    if (candidateCedula && candidateName) {
      const normCedKey = candidateCedula.toUpperCase().replace(/[\s\-]+/g, '');
      if (activeCedulas.has(normCedKey) && !session.isPayingInAdvance) {
        session.partialCedula = null;
        session.partialName = null;
        return {
          action: 'NONE',
          reply: `⚠️ La cédula *${candidateCedula}* ya tiene una membresía activa. Si este pago es para otra persona, envíame el *Nombre y Cédula* de esa persona.`,
        };
      }

      const splitName = candidateName.split(' ');
      const firstName = splitName[0] || 'Miembro';
      const lastName = splitName.slice(1).join(' ');

      session.partialCedula = null;
      session.partialName = null;
      const currentPersonIdx =
        session.totalProfilesApproved - session.remainingProfilesToCollect + 1;
      session.remainingProfilesToCollect = Math.max(0, session.remainingProfilesToCollect - 1);

      const isForAnotherPerson =
        (session.isPayingForOtherPerson && !session.isPayingInAdvance) ||
        (senderAlreadyHasActivePersonal && !session.isPayingInAdvance) ||
        currentPersonIdx > 1;

      if (session.remainingProfilesToCollect === 0) {
        session.intentStage = 'idle';
        session.isPayingForOtherPerson = false;
        session.isPayingInAdvance = false;
      }

      const singleProfile = {
        cedula: candidateCedula,
        firstName,
        lastName,
        needsManualPhone: isForAnotherPerson,
        paidByPhone: phone,
      };
      return {
        action: 'COMPLETE_PROFILE',
        extractedProfile: singleProfile,
        extractedProfiles: [singleProfile],
        isPayingInAdvance: Boolean(session.isPayingInAdvance),
        operationRef: session.approvedOperationRef || context?.membership?.paymentRef || null,
        profileIndex: currentPersonIdx,
        totalProfiles: session.totalProfilesApproved,
        reply:
          session.remainingProfilesToCollect > 0
            ? `✅ Registrada la *Persona ${currentPersonIdx} de ${session.totalProfilesApproved}*: *${firstName} ${lastName}* (*${candidateCedula}*).\n\nEnvíame ahora el *Nombre y Cédula* de la *Persona ${
                currentPersonIdx + 1
              } de ${session.totalProfilesApproved}*.`
            : isForAnotherPerson
            ? `🎉 ¡Listo! La membresía de *${firstName} ${lastName}* (*${candidateCedula}*) quedó registrada y *ACTIVA* en *${gymName}* ✅ ¡Lo esperamos!`
            : `🎉 ¡Listo, *${firstName}*! Tu membresía quedó aprobada y *ACTIVA* en *${gymName}* ✅\n\nCuando quieras puedes preguntarme qué día vence tu membresía. ¡Te esperamos! 💪`,
      };
    }
  }

  // 6. Client is reporting a completed payment (sent photo, reference number, or "ya pagué")
  if (isReportingCompletedPayment) {
    const partialInfo = detectPartialOrExceptionPayment(cleanedMsgWithoutPhotoTag, norm);
    const activeRate = Number(context?.activeRate || 68.45);
    const scannedBs =
      typeof context?.scannedAmountBs === 'number' && context.scannedAmountBs > 0
        ? context.scannedAmountBs
        : partialInfo.partialBs;

    // Case 6a: They mentioned specific shop items in this message
    if (matchedShopItems.length > 0 && !mentionsMembership) {
      let catalogUsd = 0;
      let catalogBs = 0;
      let hasRopa = false;
      let hasConsumibles = false;

      matchedShopItems.forEach(({ prod, qty }) => {
        catalogUsd += Number(prod.basePriceUsd) * qty;
        catalogBs += Number(prod.priceBs) * qty;
        if (prod.category === 'ropa_deportiva') hasRopa = true;
        else hasConsumibles = true;
      });

      const expectedBs = Number(catalogBs.toFixed(2));
      const expectedUsd = Number(catalogUsd.toFixed(2));

      // If it's a partial/exception payment (e.g. "pagando la mitad de un agua"), record the actual paid amount so DB numbers stay accurate!
      let recordedBs = expectedBs;
      let recordedUsd = expectedUsd;
      if (partialInfo.isException) {
        if (scannedBs && scannedBs > 0) {
          recordedBs = Number(scannedBs.toFixed(2));
          recordedUsd = Number((recordedBs / activeRate).toFixed(2));
        } else if (partialInfo.partialUsd && partialInfo.partialUsd > 0) {
          recordedUsd = Number(partialInfo.partialUsd.toFixed(2));
          recordedBs = Number((recordedUsd * activeRate).toFixed(2));
        } else if (partialInfo.fraction) {
          recordedUsd = Number((expectedUsd * partialInfo.fraction).toFixed(2));
          recordedBs = Number((expectedBs * partialInfo.fraction).toFixed(2));
        }
      }

      const summaryStr = matchedShopItems.map(({ prod, qty }) => `${qty}x ${prod.name}`).join(', ');
      const categoryGroup: 'consumibles' | 'ropa' = hasRopa && !hasConsumibles ? 'ropa' : 'consumibles';
      const targetOwnerPhone = categoryGroup === 'ropa' ? ownerPhoneMem : ownerPhoneCons;
      const itemLabelWithPhoto = hasPhoto
        ? `[📸 Foto Comprobante] ${summaryStr}${partialInfo.isException ? ' (Pago Parcial/Excepción)' : ''}`
        : summaryStr;

      session.intentStage = 'idle';
      session.pendingCategory = null;

      pendingAdminPayments.push({
        id: `pay_${Date.now()}`,
        clientPhone: phone,
        operationNumber: extractedRef,
        category: categoryGroup,
        membershipCount: 1,
        planOrItems: summaryStr,
        amountUsd: recordedUsd,
        amountBs: recordedBs,
        scannedAmountBs: scannedBs,
        expectedAmountBs: expectedBs,
        paymentNote: partialInfo.note || undefined,
        receiptImageUrl: context?.receiptImageUrl,
        designatedAdminPhone: targetOwnerPhone,
        status: 'pending',
        createdAt: Date.now(),
      });

      const adminCard = formatAdminPaymentCard({
        gymName,
        isMembership: false,
        clientPhone: phone,
        clientName: clientRegisteredFirstName,
        planOrItems: summaryStr,
        membershipCount: 1,
        operationNumber: extractedRef,
        scannedBs,
        expectedBs,
        expectedUsd,
        paymentNote: partialInfo.note || undefined,
      });

      return {
        action: 'CREATE_SHOP_ORDER',
        redirectedToPhone: targetOwnerPhone,
        forwardedPaymentNotification: adminCard,
        extractedShopOrder: {
          itemsSummary: itemLabelWithPhoto,
          categoryGroup,
          totalUsd: recordedUsd,
          totalBs: recordedBs,
          scannedAmountBs: scannedBs,
          expectedAmountBs: expectedBs,
          paymentNote: partialInfo.note || undefined,
          paymentRef: extractedRef,
          receiptImageUrl: context?.receiptImageUrl,
          pagoMovilTarget:
            categoryGroup === 'ropa'
              ? 'Mensualidad y Ropa (BDV 18318153)'
              : 'Jugos, Bebidas y Comida (BDV 17636777)',
        },
        reply: `¡Listo${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! ✅ Recibí tu comprobante por *${summaryStr}* y ya lo pasé para aprobación.${
          !hasPhoto
            ? `\n\n📸 Recuerda enviarme también la *foto del comprobante* por aquí.`
            : `\n\nApenas lo aprueben te aviso por aquí mismo.`
        }`,
      };
    }

    // Case 6b: They mentioned membership (or "3 memberships" or "inscripcion") in this message
    if (mentionsMembership) {
      const memCount = Math.max(1, detectedMembershipCount);
      const explicitlyMentionsReg = /\b(inscripcion|nuevo ingreso|primera vez)\b/i.test(norm);
      const shouldIncludeReg = Boolean(
        explicitlyMentionsReg ||
          session.includesRegistration ||
          (!clientIsRegisteredForLife && session.includesRegistration !== false)
      );
      const unitPlanUsd = shouldIncludeReg ? memUsd + regUsd : memUsd;
      const unitPlanBs = shouldIncludeReg ? memBs + regBs : memBs;

      let extraUsd = 0;
      let extraBs = 0;
      matchedShopItems.forEach(({ prod, qty }) => {
        extraUsd += Number(prod.basePriceUsd) * qty;
        extraBs += Number(prod.priceBs) * qty;
      });
      const expectedUsd = Number((unitPlanUsd * memCount + extraUsd).toFixed(2));
      const expectedBs = Number((unitPlanBs * memCount + extraBs).toFixed(2));

      let recordedUsd = expectedUsd;
      let recordedBs = expectedBs;
      if (partialInfo.isException) {
        if (scannedBs && scannedBs > 0) {
          recordedBs = Number(scannedBs.toFixed(2));
          recordedUsd = Number((recordedBs / activeRate).toFixed(2));
        } else if (partialInfo.partialUsd && partialInfo.partialUsd > 0) {
          recordedUsd = Number(partialInfo.partialUsd.toFixed(2));
          recordedBs = Number((recordedUsd * activeRate).toFixed(2));
        } else if (partialInfo.fraction) {
          recordedUsd = Number((expectedUsd * partialInfo.fraction).toFixed(2));
          recordedBs = Number((expectedBs * partialInfo.fraction).toFixed(2));
        }
      }

      const baseLabel = shouldIncludeReg
        ? memCount > 1
          ? `${memCount}x (Inscripción Vitalicia + Membresía Mensual)`
          : `Inscripción Vitalicia + Membresía Mensual ${gymName}`
        : memCount > 1
        ? `${memCount} Membresías Mensuales`
        : `Membresía Mensual ${gymName}`;
      const planLabel =
        matchedShopItems.length > 0
          ? `${baseLabel} + ${matchedShopItems.map((i) => `${i.qty}x ${i.prod.name}`).join(', ')}`
          : baseLabel;

      const isForOther = Boolean(
        mentionsOtherPerson || session.isPayingForOtherPerson || memCount > 1
      );
      session.intentStage = 'idle';
      session.pendingCategory = null;
      session.pendingMembershipCount = memCount;
      session.isPayingForOtherPerson = isForOther;

      pendingAdminPayments.push({
        id: `pay_${Date.now()}`,
        clientPhone: phone,
        operationNumber: extractedRef,
        category: 'membership',
        membershipCount: memCount,
        planOrItems: planLabel,
        amountUsd: recordedUsd,
        amountBs: recordedBs,
        scannedAmountBs: scannedBs,
        expectedAmountBs: expectedBs,
        paymentNote: partialInfo.note || undefined,
        isForOtherPerson: isForOther,
        receiptImageUrl: context?.receiptImageUrl,
        designatedAdminPhone: ownerPhoneMem,
        status: 'pending',
        createdAt: Date.now(),
      });

      const adminCard = formatAdminPaymentCard({
        gymName,
        isMembership: true,
        clientPhone: phone,
        clientName: clientRegisteredFirstName,
        planOrItems: planLabel,
        membershipCount: memCount,
        operationNumber: extractedRef,
        scannedBs,
        expectedBs,
        expectedUsd,
        paymentNote: partialInfo.note || undefined,
      });

      return {
        action: 'CREATE_PENDING_PAYMENT',
        redirectedToPhone: ownerPhoneMem,
        forwardedPaymentNotification: adminCard,
        extractedPayment: {
          planOrItems: planLabel,
          amountUsd: recordedUsd,
          amountBs: recordedBs,
          scannedAmountBs: scannedBs,
          expectedAmountBs: expectedBs,
          paymentNote: partialInfo.note || undefined,
          isForOtherPerson: isForOther,
          paymentRef: extractedRef,
          operationDisplayName: `Operación: ${extractedRef}`,
          membershipCount: memCount,
          receiptImageUrl: context?.receiptImageUrl,
          paymentMethod: 'Pago Móvil Mensualidad (BDV 18318153)',
        },
        reply: `¡Recibido${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! ✅ Ya envié tu comprobante por *${planLabel}* para aprobación.${
          !hasPhoto
            ? `\n\n📸 Recuerda enviarme también la *foto del comprobante* por aquí.`
            : `\n\nApenas sea aprobado te aviso por aquí para pedirte ${
                memCount > 1
                  ? `el nombre y cédula de las *${memCount} personas*`
                  : isForOther
                  ? 'el *nombre y cédula* de la persona'
                  : 'tu *nombre y cédula*'
              }.`
        }`,
      };
    }

    // Case 6c: They sent a photo or reference WITHOUT repeating the product name, so check what they were just talking about in `session`!
    if (session.pendingCategory === 'membership' || session.lastShownCategory === 'membership') {
      const memCount = Math.max(1, session.pendingMembershipCount || detectedMembershipCount || 1);
      const expectedUsd = session.pendingTotalUsd || Number((memUsd * memCount).toFixed(2));
      const expectedBs = session.pendingTotalBs || Number((memBs * memCount).toFixed(2));
      const planLabel =
        session.pendingItemsSummary ||
        (memCount > 1 ? `${memCount} Membresías Mensuales ${gymName}` : `Membresía Mensual ${gymName}`);

      let recordedUsd = expectedUsd;
      let recordedBs = expectedBs;
      if (partialInfo.isException && scannedBs && scannedBs > 0) {
        recordedBs = Number(scannedBs.toFixed(2));
        recordedUsd = Number((recordedBs / activeRate).toFixed(2));
      }

      const isForOther = Boolean(session.isPayingForOtherPerson || memCount > 1);
      session.intentStage = 'idle';
      session.pendingCategory = null;

      pendingAdminPayments.push({
        id: `pay_${Date.now()}`,
        clientPhone: phone,
        operationNumber: extractedRef,
        category: 'membership',
        membershipCount: memCount,
        planOrItems: planLabel,
        amountUsd: recordedUsd,
        amountBs: recordedBs,
        scannedAmountBs: scannedBs,
        expectedAmountBs: expectedBs,
        paymentNote: partialInfo.note || undefined,
        isForOtherPerson: isForOther,
        receiptImageUrl: context?.receiptImageUrl,
        designatedAdminPhone: ownerPhoneMem,
        status: 'pending',
        createdAt: Date.now(),
      });

      const adminCard = formatAdminPaymentCard({
        gymName,
        isMembership: true,
        clientPhone: phone,
        clientName: clientRegisteredFirstName,
        planOrItems: planLabel,
        membershipCount: memCount,
        operationNumber: extractedRef,
        scannedBs,
        expectedBs,
        expectedUsd,
        paymentNote: partialInfo.note || undefined,
      });

      return {
        action: 'CREATE_PENDING_PAYMENT',
        redirectedToPhone: ownerPhoneMem,
        forwardedPaymentNotification: adminCard,
        extractedPayment: {
          planOrItems: planLabel,
          amountUsd: recordedUsd,
          amountBs: recordedBs,
          scannedAmountBs: scannedBs,
          expectedAmountBs: expectedBs,
          paymentNote: partialInfo.note || undefined,
          isForOtherPerson: isForOther,
          paymentRef: extractedRef,
          operationDisplayName: `Operación: ${extractedRef}`,
          membershipCount: memCount,
          receiptImageUrl: context?.receiptImageUrl,
          paymentMethod: 'Pago Móvil Mensualidad (BDV 18318153)',
        },
        reply: `¡Perfecto${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! ✅ Recibí tu comprobante para *${planLabel}* y ya lo envié a aprobación. Apenas lo confirmen te escribiré por aquí para pedirte ${
          memCount > 1
            ? `el nombre y cédula de las *${memCount} personas*`
            : isForOther
            ? 'el *nombre y cédula* de esa persona'
            : 'tu *nombre y cédula*'
        }.`,
      };
    }

    if (
      (session.pendingCategory === 'consumibles' || session.pendingCategory === 'ropa') &&
      session.pendingItemsSummary
    ) {
      const categoryGroup = session.pendingCategory;
      const targetOwnerPhone = categoryGroup === 'ropa' ? ownerPhoneMem : ownerPhoneCons;
      const expectedUsd = session.pendingTotalUsd || 1;
      const expectedBs =
        session.pendingTotalBs || Number((expectedUsd * activeRate).toFixed(2));
      const summaryStr = session.pendingItemsSummary;
      const itemLabelWithPhoto = hasPhoto ? `[📸 Foto Comprobante] ${summaryStr}` : summaryStr;

      let recordedUsd = expectedUsd;
      let recordedBs = expectedBs;
      if (partialInfo.isException && scannedBs && scannedBs > 0) {
        recordedBs = Number(scannedBs.toFixed(2));
        recordedUsd = Number((recordedBs / activeRate).toFixed(2));
      }

      session.intentStage = 'idle';
      session.pendingCategory = null;

      pendingAdminPayments.push({
        id: `pay_${Date.now()}`,
        clientPhone: phone,
        operationNumber: extractedRef,
        category: categoryGroup,
        membershipCount: 1,
        planOrItems: summaryStr,
        amountUsd: Number(recordedUsd.toFixed(2)),
        amountBs: Number(recordedBs.toFixed(2)),
        scannedAmountBs: scannedBs,
        expectedAmountBs: Number(expectedBs.toFixed(2)),
        paymentNote: partialInfo.note || undefined,
        receiptImageUrl: context?.receiptImageUrl,
        designatedAdminPhone: targetOwnerPhone,
        status: 'pending',
        createdAt: Date.now(),
      });

      const adminCard = formatAdminPaymentCard({
        gymName,
        isMembership: false,
        clientPhone: phone,
        clientName: clientRegisteredFirstName,
        planOrItems: summaryStr,
        membershipCount: 1,
        operationNumber: extractedRef,
        scannedBs,
        expectedBs: Number(expectedBs.toFixed(2)),
        expectedUsd: Number(expectedUsd.toFixed(2)),
        paymentNote: partialInfo.note || undefined,
      });

      return {
        action: 'CREATE_SHOP_ORDER',
        redirectedToPhone: targetOwnerPhone,
        forwardedPaymentNotification: adminCard,
        extractedShopOrder: {
          itemsSummary: itemLabelWithPhoto,
          categoryGroup,
          totalUsd: Number(recordedUsd.toFixed(2)),
          totalBs: Number(recordedBs.toFixed(2)),
          scannedAmountBs: scannedBs,
          expectedAmountBs: Number(expectedBs.toFixed(2)),
          paymentNote: partialInfo.note || undefined,
          paymentRef: extractedRef,
          receiptImageUrl: context?.receiptImageUrl,
          pagoMovilTarget:
            categoryGroup === 'ropa'
              ? 'Mensualidad y Ropa (BDV 18318153)'
              : 'Jugos, Bebidas y Comida (BDV 17636777)',
        },
        reply: `¡Perfecto${
          clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
        }! ✅ Recibí tu comprobante por *${summaryStr}* y ya lo pasé para aprobación. En breve te confirmamos tu pedido.`,
      };
    }

    // Case 6d: They sent a receipt/photo out of nowhere with no prior context — ask naturally what they paid for!
    session.intentStage = 'awaiting_payment_item_clarification';
    session.pendingReceiptRef = extractedRef;
    session.pendingReceiptHasPhoto = hasPhoto;
    session.pendingReceiptImageUrl = context?.receiptImageUrl || null;
    session.pendingReceiptScannedBs = scannedBs || null;
    return {
      action: 'NONE',
      reply: `¡Hola${
        clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
      }! Recibí tu foto de pago 👍 Como no habíamos conversado antes sobre tu pedido, ¿me indicas por favor *qué estás pagando* (si es *mensualidad*, cuántas personas, o qué *producto de la tienda*, o si es un abono/pago parcial)?\n\n*(Recuerda siempre escribir en el mismo mensaje de la foto qué estás pagando).*`,
    };
  }

  // 7. Pure Greeting ("hola", "buenas", "buenos dias", etc.) — Warm, brief, conversational welcome!
  const isPureGreeting =
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|hey|epa|alo|hola buenas|hola buenos dias|hola buenas tardes|hola buenas noches)$/i.test(
      norm
    );
  if (isPureGreeting) {
    session.welcomedAt = Date.now();
    return {
      action: 'NONE',
      reply: buildNaturalWelcome(
        gymName,
        context?.membership?.firstName,
        context?.membership?.status,
        context?.membership?.expiresAt
      ),
    };
  }

  const startsWithGreeting = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|epa)\b/i.test(norm);
  const shouldPrependBriefHello =
    startsWithGreeting && Date.now() - session.welcomedAt > 60 * 60 * 1000;
  if (shouldPrependBriefHello) {
    session.welcomedAt = Date.now();
  }
  const helloPrefix = shouldPrependBriefHello
    ? `¡Hola${clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''}! 👋\n\n`
    : '';

  // 8. Ask for Schedule ("cual es el horario?", "a que hora abren")
  const asksSchedule = hasFuzzyWord(
    norm,
    ['horario', 'horarios', 'abren', 'cierran', 'abierto', 'cerrado', 'sabado', 'sabados', 'lunes', 'hora'],
    1
  );
  if (asksSchedule && matchedShopItems.length === 0 && !mentionsMembership) {
    return {
      action: 'NONE',
      reply: `${helloPrefix}${HORARIO_MESSAGE}`,
    };
  }

  // 9. Ask about membership status / how many days left ("cuantos dias me quedan", "cuando vence mi membresia", "sigue activa")
  const asksDaysOrStatus =
    hasFuzzyWord(
      norm,
      ['vence', 'vencimiento', 'activa', 'estado', 'termina', 'termino', 'queda', 'quedan', 'dias', 'faltan'],
      1
    ) ||
    /\b(cuanto me queda|cuantos dias|dias me quedan|cuando se vence)\b/i.test(norm);

  if (asksDaysOrStatus && !wantsToBuyOrPay) {
    if (!context?.membership) {
      session.pendingCategory = 'membership';
      session.pendingItemsSummary = `Membresía Mensual ${gymName}`;
      session.pendingTotalUsd = memUsd;
      session.pendingTotalBs = memBs;
      return {
        action: 'CHECK_MEMBERSHIP_STATUS',
        reply: `${helloPrefix}Revisé tu número y aún no tienes una membresía activa registrada en *${gymName}*.\n\nLa *Mensualidad* cuesta *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(memBs)}*). ¿Vas a pagar por *Pago Móvil* u *otro método de pago*?\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}`,
      };
    }

    const m = context.membership;
    const daysLeft = calculateDaysRemaining(m.expiresAt);
    const expSpanish = formatSpanishDateServer(m.expiresAt);
    const nameGreeting = clientRegisteredFirstName ? `Hola *${clientRegisteredFirstName}*, ` : '';

    if (m.status === 'active') {
      const fiveDayAlert =
        daysLeft !== null && daysLeft <= 5 && daysLeft >= 0
          ? `\n\n⏰ *Recordatorio:* Como tu membresía vence el día *${expSpanish}*, puedes renovarla cuando gustes enviando tu pago.`
          : '';
      return {
        action: 'CHECK_MEMBERSHIP_STATUS',
        reply: `${helloPrefix}${nameGreeting}tu membresía en *${gymName}* está *ACTIVA* ✅ y vence el día *${expSpanish}* (*${m.expiresAt}*).${fiveDayAlert}`,
      };
    }
    if (m.status === 'pending_payment') {
      return {
        action: 'CHECK_MEMBERSHIP_STATUS',
        reply: `${helloPrefix}${nameGreeting}tu pago de membresía ya fue recibido y está *pendiente de aprobación* por el encargado. Apenas lo apruebe te aviso por aquí.`,
      };
    }
    if (m.status === 'awaiting_profile') {
      session.intentStage = 'awaiting_profile_data';
      return {
        action: 'CHECK_MEMBERSHIP_STATUS',
        reply: `${helloPrefix}¡Tu pago ya fue aprobado! 🎉 Solo falta que me envíes por aquí tu *Nombre, Apellido y Cédula* (por ejemplo: *Juan Pérez 19549164*) para activar tu membresía.`,
      };
    }

    session.pendingCategory = 'membership';
    session.pendingItemsSummary = `Membresía Mensual ${gymName}`;
    session.pendingTotalUsd = memUsd;
    session.pendingTotalBs = memBs;
    return {
      action: 'CHECK_MEMBERSHIP_STATUS',
      reply: `${helloPrefix}${nameGreeting}tu membresía figura como *${
        m.status === 'expired' ? 'Vencida' : 'Por vencer'
      }* (fecha de vencimiento: *${expSpanish}* [${m.expiresAt}]).\n\nPara renovarla son *$${memUsd.toFixed(
        2
      )} USD* (*Bs. ${formatBsVe(memBs)}*). ¿Vas a pagar en *Pago Móvil* u *otro método de pago*?\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nAl pagar, envíame la foto del comprobante indicando en el mismo mensaje qué pagaste.`,
    };
  }

  // 10. Membership Inquiry or Wanting to Pay Membership ("quiero pagar la mensualidad", "cuanto es la mensualidad", "3 membresias", "precio del agua y la mensualidad")
  if (mentionsMembership) {
    const activePersonalList = findActivePersonalMembershipsByPhone(phone);
    const hasActivePersonal =
      activePersonalList.length > 0 ||
      (context?.membership?.status === 'active' &&
        Boolean(context?.membership?.cedula && context.membership.cedula.trim()));

    // If the client already has an active membership and asks to pay a membership without specifying if it's for another person or in advance:
    if (
      hasActivePersonal &&
      wantsToBuyOrPay &&
      !mentionsOtherPerson &&
      !mentionsAdvanceRenewal &&
      matchedShopItems.length === 0
    ) {
      const activeMem = activePersonalList[0] || context?.membership;
      const expSpanish = formatSpanishDateServer(activeMem?.expiresAt);
      session.intentStage = 'awaiting_existing_member_choice';
      session.pendingCategory = 'membership';
      session.lastShownCategory = 'membership';

      return {
        action: 'CHECK_MEMBERSHIP_STATUS',
        reply: `${helloPrefix}Hola${
          clientRegisteredFirstName ? ` *${clientRegisteredFirstName}*` : ''
        }, veo que ya eres cliente activo de *${gymName}* ✅ (tu membresía vence el día *${expSpanish}* [${
          activeMem?.expiresAt || ''
        }]).\n\n¿Deseas pagar la membresía de *otra persona* (o varias personas) o quieres *adelantar tu propia mensualidad* para extender tu fecha de vencimiento al siguiente mes?`,
      };
    }

    const memCount = Math.max(1, detectedMembershipCount);
    const shouldIncludeReg = !clientIsRegisteredForLife && !hasActivePersonal;
    const unitPlanUsd = shouldIncludeReg ? memUsd + regUsd : memUsd;
    const unitPlanBs = shouldIncludeReg ? memBs + regBs : memBs;

    let extraUsd = 0;
    let extraBs = 0;
    let hasConsumiblesAlongWithMem = false;
    matchedShopItems.forEach(({ prod, qty }) => {
      extraUsd += Number(prod.basePriceUsd) * qty;
      extraBs += Number(prod.priceBs) * qty;
      if (prod.category !== 'ropa_deportiva') {
        hasConsumiblesAlongWithMem = true;
      }
    });

    const totalUsd = Number((unitPlanUsd * memCount + extraUsd).toFixed(2));
    const totalBs = Number((unitPlanBs * memCount + extraBs).toFixed(2));

    session.intentStage = shouldIncludeReg
      ? 'awaiting_registration_choice'
      : 'awaiting_payment_receipt';
    session.pendingCategory = 'membership';
    session.lastShownCategory = 'membership';
    session.pendingMembershipCount = memCount;
    session.includesRegistration = shouldIncludeReg;
    session.isPayingForOtherPerson = Boolean(mentionsOtherPerson || memCount > 1);
    session.isPayingInAdvance = Boolean(mentionsAdvanceRenewal);

    const countLabel = shouldIncludeReg
      ? memCount > 1
        ? `${memCount}x (Inscripción Vitalicia + Membresía Mensual ${gymName})`
        : `Inscripción Vitalicia + Membresía Mensual ${gymName}`
      : memCount > 1
      ? `${memCount} Membresías Mensuales ${gymName}`
      : `Membresía Mensual ${gymName}`;
    session.pendingItemsSummary =
      matchedShopItems.length > 0
        ? `${countLabel} + ${matchedShopItems.map((i) => `${i.qty}x ${i.prod.name}`).join(', ')}`
        : countLabel;
    session.pendingTotalUsd = totalUsd;
    session.pendingTotalBs = totalBs;

    const memOptionsText = shouldIncludeReg
      ? `Para aplicar a una membresía en *${gymName}* primero debes estar inscrito (la *Inscripción es de por vida*, una vez inscrito no vuelves a pagarla nunca más):\n\n• *Inscripción Vitalicia (De por vida):* *$${regUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(regBs)}*)\n• *Membresía Mensual:* *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(memBs)}*)\n💰 *Total Nuevo Ingreso (${
          memCount > 1 ? `${memCount} personas` : 'Inscripción + 1er Mes'
        }):* *$${(unitPlanUsd * memCount).toFixed(2)} USD* (*Bs. ${formatBsVe(
          unitPlanBs * memCount
        )}*)\n\n❓ *¿Ya estás inscrito en ${gymName}?*\n• Si *YA estás inscrito*, envíame tu *Nombre, Apellido y Cédula (ID)* para confirmarlo con el administrador y que pagues solo la mensualidad (*$${memUsd.toFixed(
          2
        )} USD* / *Bs. ${formatBsVe(memBs)}*).\n• Si eres *nuevo ingreso*, puedes realizar el pago de tu *Inscripción + Mensualidad* directamente:`
      : memCount > 1
      ? `Como ya estás inscrito de por vida en *${gymName}*, por *${memCount} Membresías Mensuales* el total es *$${(
          memUsd * memCount
        ).toFixed(2)} USD* (*Bs. ${formatBsVe(memBs * memCount)}*).`
      : `Como ya estás inscrito de por vida en *${gymName}*, solo debes pagar la *Membresía Mensual* de *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(memBs)}*).`;

    const extraItemsText =
      matchedShopItems.length > 0
        ? `\n\nAdemás, por ${matchedShopItems
            .map(
              (i) =>
                `${i.qty}x *${i.prod.name}* (*$${(Number(i.prod.basePriceUsd) * i.qty).toFixed(
                  2
                )} USD* / *Bs. ${formatBsVe(Number(i.prod.priceBs) * i.qty)}*)`
            )
            .join(', ')}, el total general es *$${totalUsd.toFixed(2)} USD* (*Bs. ${formatBsVe(
            totalBs
          )}*).`
        : '';

    // If they asked for BOTH membership and a consumable (like water/juice/food), display BOTH Pago Móvil accounts clearly!
    const pagoMovilBlock = hasConsumiblesAlongWithMem
      ? `⚠️ *Importante:* La mensualidad/ropa y las bebidas/comida se pagan en cuentas de Pago Móvil distintas:\n\n📲 *Pago Móvil 1 — Para Mensualidad y Ropa:*\n${PAGO_MOVIL_MENSUALIDAD}\n\n📲 *Pago Móvil 2 — Para Jugos, Bebidas (Agua) y Comida:*\n${PAGO_MOVIL_CONSUMIBLES}`
      : `📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n*(Recuerda que si compras jugos, agua o comida de la tienda se usa otro Pago Móvil distinto).*`;

    return {
      action: 'CALCULATE_ORDER',
      orderTotalUsd: totalUsd,
      orderTotalBs: totalBs,
      reply: `${helloPrefix}${memOptionsText}${extraItemsText}\n\n¿Vas a pagar en *Pago Móvil* u *otro tipo de pago*?\n\n${pagoMovilBlock}\n\nCuando realices el pago, envíame la *foto del comprobante* e indícame en el mismo mensaje qué estás pagando${
        memCount > 1 ? ` (por ejemplo: *"${memCount} membresías"*)` : ''
      }.`,
    };
  }

  // 11. Specific Shop Item(s) Matched (e.g., "jugo verde", "agua mineral", "franela")
  if (matchedShopItems.length > 0) {
    let totalUsd = 0;
    let totalBs = 0;
    let hasRopa = false;
    let hasConsumibles = false;

    const lines = matchedShopItems.map(({ prod, qty }) => {
      const unitUsd = Number(prod.basePriceUsd);
      const unitBs = Number(prod.priceBs);
      const subUsd = unitUsd * qty;
      const subBs = unitBs * qty;
      totalUsd += subUsd;
      totalBs += subBs;
      if (prod.category === 'ropa_deportiva') hasRopa = true;
      else hasConsumibles = true;
      return `• ${qty}x *${prod.name}*: *$${subUsd.toFixed(2)} USD* (*Bs. ${formatBsVe(subBs)}*)`;
    });

    const summaryStr = matchedShopItems.map(({ prod, qty }) => `${qty}x ${prod.name}`).join(', ');
    const categoryGroup: 'consumibles' | 'ropa' = hasRopa && !hasConsumibles ? 'ropa' : 'consumibles';

    session.intentStage = 'awaiting_payment_receipt';
    session.pendingCategory = categoryGroup;
    session.lastShownCategory = categoryGroup;
    session.pendingItemsSummary = summaryStr;
    session.pendingTotalUsd = Number(totalUsd.toFixed(2));
    session.pendingTotalBs = Number(totalBs.toFixed(2));

    const specificPagoMovil =
      hasRopa && hasConsumibles
        ? `⚠️ *Nota:* La ropa y las bebidas/alimentos usan cuentas distintas:\n\n📲 *Pago Móvil (Ropa y Mensualidad):*\n${PAGO_MOVIL_MENSUALIDAD}\n\n📲 *Pago Móvil (Jugos, Bebidas y Comida):*\n${PAGO_MOVIL_CONSUMIBLES}`
        : categoryGroup === 'ropa'
        ? `📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}`
        : `📲 *Pago Móvil (Jugos, Bebidas y Comida):*\n${PAGO_MOVIL_CONSUMIBLES}\n*(Recuerda usar este Pago Móvil para bebidas y comida, no el de mensualidad).*`;

    return {
      action: 'CALCULATE_ORDER',
      orderTotalUsd: Number(totalUsd.toFixed(2)),
      orderTotalBs: Number(totalBs.toFixed(2)),
      reply: `${helloPrefix}${lines.join('\n')}${
        matchedShopItems.length > 1
          ? `\n\n💰 *Total:* *$${totalUsd.toFixed(2)} USD* (*Bs. ${formatBsVe(totalBs)}*)`
          : ''
      }\n\n¿Vas a pagar por *Pago Móvil* u *otro método de pago*?\n\n${specificPagoMovil}\n\nCuando hagas el pago, envíame la *foto del comprobante* diciendo en el mismo mensaje qué pagaste.`,
    };
  }

  // 12. Asking for Pago Móvil ("cual es el pago movil", "pasame el pago movil")
  if (asksPagoMovil) {
    const activeCat = session.pendingCategory || session.lastShownCategory;
    if (activeCat === 'membership') {
      return {
        action: 'NONE',
        reply: `${helloPrefix}Para pagar la *Mensualidad* (*$${memUsd.toFixed(2)} USD* / *Bs. ${formatBsVe(
          memBs
        )}*), usa este Pago Móvil:\n\n${PAGO_MOVIL_MENSUALIDAD}\n\n*(Para productos que no sean ropa ni mensualidad se usa otro Pago Móvil).* Al pagar, envíame la foto indicando en el mismo mensaje qué pagaste.`,
      };
    }
    if (activeCat === 'ropa') {
      return {
        action: 'NONE',
        reply: `${helloPrefix}Para pagos de *Ropa y Mensualidad*, usa este Pago Móvil:\n\n${PAGO_MOVIL_MENSUALIDAD}\n\nAl realizarlo, envíame la foto del comprobante indicando en el mismo mensaje la prenda que compraste.`,
      };
    }
    if (activeCat === 'consumibles') {
      return {
        action: 'NONE',
        reply: `${helloPrefix}Para pagos de *Jugos, Bebidas y Comida*, usa este Pago Móvil:\n\n${PAGO_MOVIL_CONSUMIBLES}\n\nAl realizarlo, envíame la foto del comprobante indicando en el mismo mensaje el producto que pediste.`,
      };
    }

    return {
      action: 'NONE',
      reply: `${helloPrefix}Aquí tienes nuestras dos cuentas de *Pago Móvil* (recuerda que para bebidas/comida es una cuenta distinta a la de mensualidad/ropa):\n\n${PAGO_MOVIL_MESSAGE}\n\n¿Vas a pagar por *Pago Móvil* u *otro método*? Al pagar, envía la foto e indica en el mismo mensaje qué pagaste.`,
    };
  }

  // 13. Asking Prices of Things on Sale by Category or General Catalog ("precio de los jugos", "que venden", "precios")
  const asksJuices = hasFuzzyWord(norm, ['jugo', 'jugos', 'batido', 'batidos', 'detox', 'merengada'], 1);
  const asksDrinks = hasFuzzyWord(norm, ['agua', 'aguas', 'bebida', 'bebidas', 'hidratacion'], 1);
  const asksFood = hasFuzzyWord(norm, ['comida', 'comidas', 'alimento', 'alimentos', 'comer', 'snack'], 1);
  const asksClothes = hasFuzzyWord(norm, ['ropa', 'franelas', 'shorts', 'camisas', 'uniforme', 'prendas'], 1);
  const asksGeneralPrices = hasFuzzyWord(
    norm,
    ['precio', 'precios', 'cuanto', 'cuesta', 'vale', 'catalogo', 'tienda', 'venden', 'venta', 'lista', 'productos'],
    1
  );

  if (asksJuices || asksDrinks || asksFood || asksClothes) {
    const selectedCategories: string[] = [];
    if (asksJuices) selectedCategories.push('jugos_saludables');
    if (asksDrinks) selectedCategories.push('agua_hidratacion');
    if (asksFood) selectedCategories.push('alimentos');
    if (asksClothes) selectedCategories.push('ropa_deportiva');

    const isClothesOnly = asksClothes && !asksJuices && !asksDrinks && !asksFood;
    session.lastShownCategory = isClothesOnly ? 'ropa' : 'consumibles';

    const matchingProds = shopCatalog.filter((p) => selectedCategories.includes(p.category));
    if (matchingProds.length === 0) {
      if (shopCatalog.length === 0) {
        return {
          action: 'NONE',
          reply: `${helloPrefix}Por los momentos tenemos disponible la *Mensualidad de ${gymName}* en *$${memUsd.toFixed(2)} USD* (*Bs. ${memBs.toFixed(2)}*). ¿Te gustaría inscribirte o renovarla?`,
        };
      }
      const allLines = shopCatalog
        .map(
          (p) =>
            `• *${p.name}*: *$${Number(p.basePriceUsd).toFixed(2)} USD* (*Bs. ${Number(
              p.priceBs
            ).toFixed(2)}*)`
        )
        .join('\n');
      return {
        action: 'NONE',
        reply: `${helloPrefix}Estos son los productos que tenemos disponibles ahorita en *${gymName}*:\n${allLines}\n\n¿Cuál de estos te gustaría pedir?`,
      };
    }

    const listText = matchingProds
      .map(
        (p) =>
          `• *${p.name}*: *$${Number(p.basePriceUsd).toFixed(2)} USD* (*Bs. ${Number(
            p.priceBs
          ).toFixed(2)}*)`
      )
      .join('\n');

    return {
      action: 'NONE',
      reply: `${helloPrefix}Estos son los precios disponibles en *${gymName}*:\n${listText}\n\n¿Cuál te gustaría pedir?`,
    };
  }

  if (asksGeneralPrices) {
    if (shopCatalog.length === 0) {
      session.lastShownCategory = 'membership';
      return {
        action: 'NONE',
        reply: `${helloPrefix}La *Mensualidad en ${gymName}* tiene un costo de *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${memBs.toFixed(2)}*). ¿Deseas los datos de Pago Móvil para inscribirte?`,
      };
    }

    const catalogSummary = shopCatalog
      .map(
        (p) =>
          `• *${p.name}*: *$${Number(p.basePriceUsd).toFixed(2)} USD* (*Bs. ${Number(
            p.priceBs
          ).toFixed(2)}*)`
      )
      .join('\n');

    return {
      action: 'NONE',
      reply: `${helloPrefix}Aquí tienes nuestros precios en *${gymName}*:\n• *Membresía Mensual*: *$${memUsd.toFixed(
        2
      )} USD* (*Bs. ${memBs.toFixed(2)}*)\n${catalogSummary}\n\n¿Qué te gustaría pagar o pedir hoy?`,
    };
  }

  return null;
}

function evaluateWithClarifiedReceipt(
  phone: string,
  norm: string,
  rawText: string,
  savedRef: string,
  savedPhoto: boolean,
  savedImgUrl: string | undefined,
  savedScannedBs: number | null | undefined,
  context: BotContext,
  session: ClientSessionState,
  gymName: string,
  ownerPhoneMem: string,
  ownerPhoneCons: string,
  memUsd: number,
  memBs: number,
  products: BotProduct[]
): Record<string, any> {
  session.intentStage = 'idle';
  session.pendingReceiptRef = null;
  session.pendingReceiptHasPhoto = false;
  session.pendingReceiptImageUrl = null;
  session.pendingReceiptScannedBs = null;

  const clientRegisteredFirstName = getCleanFirstName(context?.membership?.firstName);
  const partialInfo = detectPartialOrExceptionPayment(rawText, norm);
  const activeRate = Number(context?.activeRate || 68.45);
  const scannedBs =
    typeof savedScannedBs === 'number' && savedScannedBs > 0
      ? savedScannedBs
      : partialInfo.partialBs;

  const mentionsMembership =
    hasFuzzyWord(norm, ['membresia', 'membresias', 'mensualidad', 'mensualidades', 'inscripcion', 'gimnasio', 'mes'], 1);
  const memCount = extractMembershipCountFromText(norm);
  const mentionsOtherPerson =
    /\b(otra persona|otro|otra|hermano|hermana|hijo|hija|esposo|esposa|novio|novia|amigo|amiga|mama|papa|familiar)\b/i.test(
      norm
    ) || memCount > 1;

  if (mentionsMembership) {
    const expectedUsd = Number((memUsd * memCount).toFixed(2));
    const expectedBs = Number((memBs * memCount).toFixed(2));
    let recordedUsd = expectedUsd;
    let recordedBs = expectedBs;
    if (partialInfo.isException) {
      if (scannedBs && scannedBs > 0) {
        recordedBs = Number(scannedBs.toFixed(2));
        recordedUsd = Number((recordedBs / activeRate).toFixed(2));
      } else if (partialInfo.partialUsd && partialInfo.partialUsd > 0) {
        recordedUsd = Number(partialInfo.partialUsd.toFixed(2));
        recordedBs = Number((recordedUsd * activeRate).toFixed(2));
      } else if (partialInfo.fraction) {
        recordedUsd = Number((expectedUsd * partialInfo.fraction).toFixed(2));
        recordedBs = Number((expectedBs * partialInfo.fraction).toFixed(2));
      }
    }

    const planLabel =
      memCount > 1 ? `${memCount} Membresías Mensuales ${gymName}` : `Membresía Mensual ${gymName}`;
    const isForOther = Boolean(mentionsOtherPerson || session.isPayingForOtherPerson);
    session.isPayingForOtherPerson = isForOther;

    pendingAdminPayments.push({
      id: `pay_${Date.now()}`,
      clientPhone: phone,
      operationNumber: savedRef,
      category: 'membership',
      membershipCount: memCount,
      planOrItems: planLabel,
      amountUsd: recordedUsd,
      amountBs: recordedBs,
      scannedAmountBs: scannedBs,
      expectedAmountBs: expectedBs,
      paymentNote: partialInfo.note || undefined,
      isForOtherPerson: isForOther,
      receiptImageUrl: savedImgUrl,
      designatedAdminPhone: ownerPhoneMem,
      status: 'pending',
      createdAt: Date.now(),
    });

    const adminCard = formatAdminPaymentCard({
      gymName,
      isMembership: true,
      clientPhone: phone,
      clientName: clientRegisteredFirstName,
      planOrItems: planLabel,
      membershipCount: memCount,
      operationNumber: savedRef,
      scannedBs,
      expectedBs,
      expectedUsd,
      paymentNote: partialInfo.note || undefined,
    });

    return {
      action: 'CREATE_PENDING_PAYMENT',
      redirectedToPhone: ownerPhoneMem,
      forwardedPaymentNotification: adminCard,
      extractedPayment: {
        planOrItems: planLabel,
        amountUsd: recordedUsd,
        amountBs: recordedBs,
        scannedAmountBs: scannedBs,
        expectedAmountBs: expectedBs,
        paymentNote: partialInfo.note || undefined,
        isForOtherPerson: isForOther,
        paymentRef: savedRef,
        operationDisplayName: `Operación: ${savedRef}`,
        membershipCount: memCount,
        receiptImageUrl: savedImgUrl,
        paymentMethod: 'Pago Móvil Mensualidad (BDV 18318153)',
      },
      reply: `¡Excelente${
        clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
      }! ✅ Ya registré tu pago de *${planLabel}* para aprobación. Apenas lo confirmen te escribiré por aquí para pedirte ${
        memCount > 1
          ? `el nombre y cédula de las *${memCount} personas*`
          : isForOther
          ? 'el *nombre y cédula* de esa persona'
          : 'tu *nombre y cédula*'
      }.`,
    };
  }

  const shopCatalog = products.filter((p) => p.category !== 'membresias');
  const matched: BotProduct[] = [];
  for (const p of shopCatalog) {
    const pNorm = normalizeSpanish(p.name);
    if (norm.includes(pNorm) || pNorm.split(' ').some((w) => w.length >= 4 && norm.includes(w))) {
      matched.push(p);
    }
  }

  const isRopa =
    matched.length > 0
      ? matched.every((p) => p.category === 'ropa_deportiva')
      : hasFuzzyWord(norm, ['ropa', 'franela', 'short', 'camisa'], 1);
  const categoryGroup: 'consumibles' | 'ropa' = isRopa ? 'ropa' : 'consumibles';
  const targetOwnerPhone = categoryGroup === 'ropa' ? ownerPhoneMem : ownerPhoneCons;

  const expectedUsd =
    matched.length > 0
      ? matched.reduce((acc, p) => acc + Number(p.basePriceUsd), 0)
      : session.pendingTotalUsd || 1;
  const expectedBs =
    matched.length > 0
      ? matched.reduce((acc, p) => acc + Number(p.priceBs), 0)
      : session.pendingTotalBs || Number((expectedUsd * activeRate).toFixed(2));

  let recordedUsd = expectedUsd;
  let recordedBs = expectedBs;
  if (partialInfo.isException) {
    if (scannedBs && scannedBs > 0) {
      recordedBs = Number(scannedBs.toFixed(2));
      recordedUsd = Number((recordedBs / activeRate).toFixed(2));
    } else if (partialInfo.partialUsd && partialInfo.partialUsd > 0) {
      recordedUsd = Number(partialInfo.partialUsd.toFixed(2));
      recordedBs = Number((recordedUsd * activeRate).toFixed(2));
    } else if (partialInfo.fraction) {
      recordedUsd = Number((expectedUsd * partialInfo.fraction).toFixed(2));
      recordedBs = Number((expectedBs * partialInfo.fraction).toFixed(2));
    }
  }

  const summaryStr =
    matched.length > 0 ? matched.map((p) => `1x ${p.name}`).join(', ') : rawText.slice(0, 60);
  const itemLabelWithPhoto = savedPhoto
    ? `[📸 Foto Comprobante] ${summaryStr}${partialInfo.isException ? ' (Pago Parcial/Excepción)' : ''}`
    : summaryStr;

  pendingAdminPayments.push({
    id: `pay_${Date.now()}`,
    clientPhone: phone,
    operationNumber: savedRef,
    category: categoryGroup,
    membershipCount: 1,
    planOrItems: summaryStr,
    amountUsd: Number(recordedUsd.toFixed(2)),
    amountBs: Number(recordedBs.toFixed(2)),
    scannedAmountBs: scannedBs,
    expectedAmountBs: Number(expectedBs.toFixed(2)),
    paymentNote: partialInfo.note || undefined,
    receiptImageUrl: savedImgUrl,
    designatedAdminPhone: targetOwnerPhone,
    status: 'pending',
    createdAt: Date.now(),
  });

  const adminCard = formatAdminPaymentCard({
    gymName,
    isMembership: false,
    clientPhone: phone,
    clientName: clientRegisteredFirstName,
    planOrItems: summaryStr,
    membershipCount: 1,
    operationNumber: savedRef,
    scannedBs,
    expectedBs: Number(expectedBs.toFixed(2)),
    expectedUsd: Number(expectedUsd.toFixed(2)),
    paymentNote: partialInfo.note || undefined,
  });

  return {
    action: 'CREATE_SHOP_ORDER',
    redirectedToPhone: targetOwnerPhone,
    forwardedPaymentNotification: adminCard,
    extractedShopOrder: {
      itemsSummary: itemLabelWithPhoto,
      categoryGroup,
      totalUsd: Number(recordedUsd.toFixed(2)),
      totalBs: Number(recordedBs.toFixed(2)),
      scannedAmountBs: scannedBs,
      expectedAmountBs: Number(expectedBs.toFixed(2)),
      paymentNote: partialInfo.note || undefined,
      paymentRef: savedRef,
      receiptImageUrl: savedImgUrl,
      pagoMovilTarget:
        categoryGroup === 'ropa'
          ? 'Mensualidad y Ropa (BDV 18318153)'
          : 'Jugos, Bebidas y Comida (BDV 17636777)',
    },
    reply: `¡Listo${
      clientRegisteredFirstName ? `, *${clientRegisteredFirstName}*` : ''
    }! ✅ Ya registré tu pago por *${summaryStr}* para aprobación. En breve te confirmamos.`,
  };
}

async function processIncomingWhatsAppMessage(
  phone: string,
  rawMessage: string,
  context: BotContext
): Promise<Record<string, any>> {
  const safePhone = phone || '+58 412-0000000';
  const safeMsg = (rawMessage || 'Hola').trim();
  const session = getOrCreateClientSession(safePhone);

  // If an image is attached, scan for both the Bs price ("19.540,00") and "Operación:" + digits using Gemini Vision!
  if (context.receiptImageUrl || context.hasPhotoAttached) {
    const scanned = await scanPagoMovilReceiptImage(context.receiptImageUrl, safeMsg);
    if (scanned.operationNumber) {
      context.scannedOperationNumber = scanned.operationNumber;
    }
    if (typeof scanned.amountBs === 'number' && scanned.amountBs > 0) {
      context.scannedAmountBs = scanned.amountBs;
      context.scannedAmountBsText = scanned.amountBsText;
    }
  }

  appendSessionHistory(session, 'user', safeMsg);

  // Step 1: Session-aware deterministic Spanish intent engine
  const deterministicResult = evaluateSmartSpanishBot(safePhone, safeMsg, context, session);
  if (deterministicResult) {
    if (deterministicResult.reply) {
      appendSessionHistory(session, 'model', String(deterministicResult.reply));
    }
    return deterministicResult;
  }

  // Step 2: Conversational Gemini Assistant (evaluates the text + live context then answers)
  const gymName = context.businessName || 'FormaGym';
  const ownerPhoneSup = context.ownerPhoneSupport || '+58 414-6734866';
  const memUsd = Number(context.membershipMonthlyUsd || 30);
  const memBs = Number(context.membershipMonthlyBs || Number((memUsd * (context.activeRate || 68.45)).toFixed(2)));
  const regUsd = Number(context.registrationUsd || serverSyncedContext.registrationUsd || 15);
  const regBs = Number(context.registrationBs || Number((regUsd * (context.activeRate || 68.45)).toFixed(2)));
  const clientFirstName = getCleanFirstName(context.membership?.firstName);

  const allCatalog = context.products || [];
  const availableProducts = allCatalog.filter((p) => p.available);
  const outOfStockProducts = allCatalog.filter((p) => !p.available);

  const catalogText =
    availableProducts.length > 0
      ? availableProducts
          .map(
            (p) =>
              `- ${p.name} [categoría: ${p.category}]: $${Number(p.basePriceUsd).toFixed(2)} USD (Bs. ${formatBsVe(
                Number(p.priceBs)
              )}) — CON STOCK`
          )
          .join('\n')
      : '- Actualmente solo está disponible la Membresía Mensual.';

  const outOfStockText =
    outOfStockProducts.length > 0
      ? outOfStockProducts.map((p) => `- ${p.name} — SIN STOCK AHORITA`).join('\n')
      : 'Ninguno agotado.';

  const historyTranscript = session.history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Cliente' : 'Asistente'}: ${h.text}`)
    .join('\n');

  const daysLeft = calculateDaysRemaining(context.membership?.expiresAt);
  const memberInfo = context.membership
    ? `El cliente se llama "${clientFirstName || 'Cliente'}", tiene una membresía con estado "${
        context.membership.status
      }", vence el ${context.membership.expiresAt}${
        daysLeft !== null ? ` (le quedan ${daysLeft} días)` : ''
      }.`
    : 'El cliente aún no aparece con membresía activa.';

  try {
    const systemPrompt = `Eres la persona encargada de atender el WhatsApp de "${gymName}" en Venezuela. Evalúa con inteligencia el mensaje del cliente y responde de forma natural, cálida, breve y eficiente (1 a 3 oraciones).

REGLAS OBLIGATORIAS DE NEGOCIO:
1. NUNCA muestres números de "Operación:" al cliente (el cliente ya los conoce porque él hizo el pago).
2. Si el cliente ya está registrado (${
      clientFirstName ? `su nombre es ${clientFirstName}` : 'aún sin nombre registrado'
    }), trátalo por su primer nombre como cliente de la casa. Si pregunta cuándo vence su membresía o cuánto tiempo le queda, dile la fecha exacta en que vence su membresía (*${formatSpanishDateServer(
      context.membership?.expiresAt
    )}* — ${context.membership?.expiresAt || 'sin fecha'}) en vez de una cuenta regresiva de días.
3. NUNCA menciones cuál es la tasa del día (ni BCV, ni Euro). Solo da precios en dólares ($) y bolívares (Bs.).
4. REGLA DE PAGO MÓVIL Y MÉTODOS DE PAGO:
   - Pregúntale si va a pagar en "Pago Móvil" u otro método de pago (efectivo/divisas).
   - Recuérdale que para cosas que NO sean ropa ni membresías (como agua, jugos o comida) se usa otro Pago Móvil distinto:
     * Para MENSUALIDAD y ROPA:
       Banco de Venezuela | Cédula: 18318153 | Teléfono: 04146734866
     * Para JUGOS, BEBIDAS (AGUA) y COMIDA:
       Banco de Venezuela | Cédula: 17636777 | Teléfono: 04246559787
   - Si pide precio de agua/bebida Y membresía al mismo tiempo, pon los DOS Pago Móvil especificando cuál es para cada uno.
   - Recuérdale que al enviar la foto del pago indique en el mismo mensaje qué está pagando (o si es un pago parcial/abono).
5. PRODUCTOS SIN STOCK (BOTÓN GRIS):
   - Si pregunta por un producto que está en la lista de SIN STOCK o que no vendemos (ej. "¿tienen huevos?"), dile amablemente que por ahora no tenemos disponible en stock.
6. SOPORTE:
   - NUNCA muestres los números internos de los encargados. Si necesita hablar con el encargado o tiene un reclamo explicado, devuelve action = "FORWARD_TO_SUPPORT".
7. DATOS DEL GIMNASIO:
   - Inscripción Vitalicia (De por vida, obligatoria antes de aplicar a la membresía si es nuevo): $${regUsd.toFixed(2)} USD (Bs. ${formatBsVe(regBs)}). Si el cliente dice que ya está inscrito, pídele su Nombre, Apellido y Cédula para verificarlo con el administrador.
   - Mensualidad: $${memUsd.toFixed(2)} USD (Bs. ${formatBsVe(memBs)}).
   - Horario: Lunes a Viernes de 7:00 AM a 9:00 PM, Sábados de 10:00 AM a 3:00 PM, Domingos cerrado.
   - Productos CON STOCK:
${catalogText}
   - Productos SIN STOCK (no se pueden comprar ahorita):
${outOfStockText}
   - Estado del cliente: ${memberInfo}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Historial reciente de la conversación:\n${historyTranscript}\n\nEvalúa el último mensaje del cliente y responde de forma natural, simple y útil.`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            action: {
              type: Type.STRING,
              description: 'Valores permitidos: NONE, AWAIT_SUPPORT_ISSUE, FORWARD_TO_SUPPORT',
            },
            pendingCategory: {
              type: Type.STRING,
              description: 'Opcional: membership, consumibles, ropa, o vacio',
            },
          },
          required: ['reply', 'action'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.reply) {
      const action = parsed.action || 'NONE';
      if (
        parsed.pendingCategory === 'membership' ||
        parsed.pendingCategory === 'consumibles' ||
        parsed.pendingCategory === 'ropa'
      ) {
        session.pendingCategory = parsed.pendingCategory;
        session.lastShownCategory = parsed.pendingCategory;
      }

      if (action === 'AWAIT_SUPPORT_ISSUE') {
        session.intentStage = 'awaiting_support_issue';
      } else if (action === 'FORWARD_TO_SUPPORT') {
        session.intentStage = 'support_chat_open';
        lastSupportClientPhone = safePhone;
        appendSessionHistory(session, 'model', parsed.reply);
        return {
          action: 'FORWARD_TO_SUPPORT',
          designatedSupportPhone: ownerPhoneSup,
          supportIssue: safeMsg,
          forwardedMessageFormatted: `📩 *Chat de Soporte — ${gymName}*\n• *Cliente:* ${
            clientFirstName ? `${clientFirstName} (${safePhone})` : safePhone
          }\n• *Mensaje:* "${safeMsg}"\n\n_(Responde directamente en este chat para contestarle al cliente)_`,
          reply: parsed.reply,
        };
      }

      appendSessionHistory(session, 'model', parsed.reply);
      return {
        reply: parsed.reply,
        action,
      };
    }
  } catch {
    // Fallback below if AI call fails
  }

  // Step 3: Clean, human fallback
  const fallbackReply = `¡Hola${
    clientFirstName ? `, *${clientFirstName}*` : ''
  }! Soy el asistente de *${gymName}*. ¿Deseas consultar por la *mensualidad*, ver la disponibilidad de algún *producto* o enviarle un mensaje al encargado?`;
  appendSessionHistory(session, 'model', fallbackReply);
  return {
    action: 'NONE',
    reply: fallbackReply,
  };
}

async function checkAndSendFiveDayExpirationReminders() {
  if (!baileysSock || baileysConnectionState !== 'connected') return;
  const memberships = Array.isArray(serverSyncedContext.memberships)
    ? serverSyncedContext.memberships
    : [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const gymName = serverSyncedContext.businessName || 'FormaGym';

  for (const m of memberships) {
    if (m.status !== 'active' || !m.phone || !m.expiresAt) continue;
    const daysLeft = calculateDaysRemaining(m.expiresAt);
    if (daysLeft === 5) {
      const reminderKey = `${m.id}_${todayKey}`;
      if (fiveDayReminderSentToday.has(reminderKey)) continue;
      fiveDayReminderSentToday.add(reminderKey);
      const firstName = getCleanFirstName(m.firstName) || 'Hola';
      const expSpanish = formatSpanishDateServer(m.expiresAt);
      const reminderMsg = `⏰ ¡Hola *${firstName}*! Te escribimos de *${gymName}* para recordarte que tu membresía vence el día *${expSpanish}* (*${m.expiresAt}*). Cuando desees renovarla, puedes escribirnos por aquí. ¡Te esperamos! 💪`;
      await sendWhatsAppViaBaileys(m.phone, reminderMsg).catch(() => {});
    }
  }
}

setInterval(() => {
  if (!botRunning247) return;
  checkAndSendFiveDayExpirationReminders().catch(() => {});
}, 60 * 60 * 1000);

// 24/7 Watchdog & Autonomous Keep-Alive Loop: keeps WhatsApp connected and BCV rates fresh forever until turned off
setInterval(() => {
  if (!botRunning247) return;
  // 1. Auto-resume Baileys if disconnected and credentials exist on disk
  if (
    baileysConnectionState === 'disconnected' &&
    fs.existsSync(path.join(BAILEYS_AUTH_DIR, 'creds.json'))
  ) {
    addBaileysLog('Watchdog 24/7: Reconectando sesión de WhatsApp automáticamente...');
    startBaileysConnection().catch(() => {});
  }
  // 2. Keep BCV exchange rate updated in serverSyncedContext every 15 minutes
  fetchLiveVenezuelanRate(false)
    .then((rateData) => {
      if (rateData && rateData.bcvRate > 0) {
        serverSyncedContext.bcvRate = rateData.bcvRate;
        serverSyncedContext.euroRate = rateData.euroRate;
        if (serverSyncedContext.rateMode === 'auto_bcv') {
          serverSyncedContext.activeRate = rateData.bcvRate;
        } else if (serverSyncedContext.rateMode === 'auto_euro') {
          serverSyncedContext.activeRate = rateData.euroRate;
        }
      }
    })
    .catch(() => {});
}, 45 * 1000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.post('/api/bot/scan-receipt', async (req, res) => {
    const { receiptImageUrl, imageBase64DataUrl, captionText } = (req.body || {}) as {
      receiptImageUrl?: string;
      imageBase64DataUrl?: string;
      captionText?: string;
    };
    const imgToScan = receiptImageUrl || imageBase64DataUrl;
    const scanned = await scanPagoMovilReceiptImage(imgToScan, captionText || '');
    res.json({
      ok: true,
      ...scanned,
      scanned,
      displayName: scanned.operationNumber ? `Operación: ${scanned.operationNumber}` : null,
    });
  });

  app.post('/api/bot/verify-registration', async (req, res) => {
    const body = (req.body || {}) as {
      id?: string;
      phone?: string;
      cedula?: string;
      firstName?: string;
      lastName?: string;
      approved?: boolean;
    };

    const resolvedPhone = (body.phone || '').trim();
    const isApproved = Boolean(body.approved);
    const gymName = serverSyncedContext.businessName || 'FormaGym';
    const memUsd = Number(serverSyncedContext.membershipMonthlyUsd || 30);
    const memBs = Number(
      serverSyncedContext.membershipMonthlyBs ||
        Number((memUsd * (serverSyncedContext.activeRate || 68.45)).toFixed(2))
    );
    const regUsd = Number(serverSyncedContext.registrationUsd || 15);
    const regBs = Number(
      serverSyncedContext.registrationBs ||
        Number((regUsd * (serverSyncedContext.activeRate || 68.45)).toFixed(2))
    );

    // Mark matching pendingRegistrationChecks as resolved
    pendingRegistrationChecks.forEach((r) => {
      if (
        r.status === 'pending' &&
        (r.id === body.id ||
          (resolvedPhone && getPhoneSessionKey(r.clientPhone) === getPhoneSessionKey(resolvedPhone)))
      ) {
        r.status = isApproved ? 'confirmed' : 'rejected';
      }
    });

    if (resolvedPhone) {
      const clientSess = getOrCreateClientSession(resolvedPhone);
      if (isApproved) {
        clientSess.intentStage = 'awaiting_payment_receipt';
        clientSess.pendingCategory = 'membership';
        clientSess.lastShownCategory = 'membership';
        clientSess.pendingMembershipCount = 1;
        clientSess.includesRegistration = false;
        clientSess.pendingItemsSummary = `Membresía Mensual ${gymName} (Inscrito de por vida)`;
        clientSess.pendingTotalUsd = memUsd;
        clientSess.pendingTotalBs = memBs;

        const clientMsg = `✅ ¡Hola *${body.firstName || 'Cliente'}*! El administrador de *${gymName}* confirmó que *ya estás inscrito de por vida*${
          body.cedula ? ` (Cédula: *${body.cedula}*)` : ''
        } 🎉\n\nComo la inscripción es vitalicia, para activar tu *Membresía Mensual* solo debes pagar la mensualidad:\n• *Monto:* *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(memBs)}*)\n\n📲 *Pago Móvil (Mensualidad y Ropa):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nEnvíame la *foto del comprobante* por aquí cuando realices el pago.`;
        const sent = await sendWhatsAppViaBaileys(resolvedPhone, clientMsg);
        res.json({ ok: true, sent, approved: true, message: clientMsg });
        return;
      } else {
        const combinedUsd = Number((regUsd + memUsd).toFixed(2));
        const combinedBs = Number((regBs + memBs).toFixed(2));
        clientSess.intentStage = 'awaiting_payment_receipt';
        clientSess.pendingCategory = 'membership';
        clientSess.lastShownCategory = 'membership';
        clientSess.pendingMembershipCount = 1;
        clientSess.includesRegistration = true;
        clientSess.pendingItemsSummary = `Inscripción Vitalicia + Membresía Mensual ${gymName}`;
        clientSess.pendingTotalUsd = combinedUsd;
        clientSess.pendingTotalBs = combinedBs;

        const clientMsg = `ℹ️ Hola *${body.firstName || 'Cliente'}*, el administrador revisó el sistema de *${gymName}* y aún no figuras con inscripción registrada.\n\nPara aplicar a la membresía primero debes estar inscrito (la *Inscripción* es de por vida y se paga una sola vez):\n• *Inscripción Vitalicia:* *$${regUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(regBs)}*)\n• *Membresía Mensual:* *$${memUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(memBs)}*)\n💰 *Total a pagar (Inscripción + 1er Mes):* *$${combinedUsd.toFixed(
          2
        )} USD* (*Bs. ${formatBsVe(combinedBs)}*)\n\n📲 *Pago Móvil (Mensualidad e Inscripción):*\n${PAGO_MOVIL_MENSUALIDAD}\n\nEnvíame la *foto del comprobante* por aquí cuando realices el pago.`;
        const sent = await sendWhatsAppViaBaileys(resolvedPhone, clientMsg);
        res.json({ ok: true, sent, approved: false, message: clientMsg });
        return;
      }
    }

    res.json({ ok: true, sent: false, approved: isApproved });
  });

  app.post('/api/bot/notify-approval', async (req, res) => {
    const body = (req.body || {}) as {
      phone?: string;
      clientPhone?: string;
      paymentRef?: string;
      reference?: string;
      membershipCount?: number;
      category?: 'membership' | 'shop';
      itemsSummary?: string;
      isForOtherPerson?: boolean;
      alreadyHasProfile?: boolean;
      memberName?: string;
      memberCedula?: string;
      expiresAt?: string;
    };

    const resolvedPhone = (body.phone || body.clientPhone || '').trim();
    if (!resolvedPhone) {
      res.status(400).json({ ok: false, error: 'Falta teléfono del cliente' });
      return;
    }

    const opRef = (body.paymentRef || body.reference || 'CONFIRMADO').trim();
    const count = Math.max(1, Number(body.membershipCount || 1));
    const gymName = serverSyncedContext.businessName || 'FormaGym';

    // Mark matching pendingAdminPayments as approved so chat & web stay in sync
    pendingAdminPayments.forEach((p) => {
      if (
        p.status === 'pending' &&
        (p.operationNumber === opRef ||
          getPhoneSessionKey(p.clientPhone) === getPhoneSessionKey(resolvedPhone))
      ) {
        p.status = 'approved';
      }
    });

    if (body.category === 'shop') {
      const msg = `✅ ¡Tu pago por *${
        body.itemsSummary || 'tu pedido'
      }* fue aprobado! 🎉 Ya puedes retirarlo en *${gymName}*.`;
      const sent = await sendWhatsAppViaBaileys(resolvedPhone, msg);
      res.json({ ok: true, sent, message: msg });
      return;
    }

    // Update serverSyncedContext.memberships status so the bot immediately knows this phone is awaiting_profile or active
    if (Array.isArray(serverSyncedContext.memberships)) {
      serverSyncedContext.memberships = serverSyncedContext.memberships.map((m) => {
        if (
          m.status === 'pending_payment' &&
          (m.paymentRef === opRef || getPhoneSessionKey(m.phone) === getPhoneSessionKey(resolvedPhone))
        ) {
          return {
            ...m,
            status: body.alreadyHasProfile ? 'active' : 'awaiting_profile',
            ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
          };
        }
        return m;
      });
    }

    if (body.alreadyHasProfile && body.memberName) {
      const expText = body.expiresAt
        ? `${formatSpanishDateServer(body.expiresAt)} (${body.expiresAt})`
        : 'el próximo mes';
      const activeMsg = `🎉 *¡Tu pago de membresía en ${gymName} fue aprobado!*\n\nHola *${body.memberName}*${
        body.memberCedula ? ` (*${body.memberCedula}*)` : ''
      }, tu membresía ya está *ACTIVA* y vence el día *${expText}*. ¡Te esperamos para entrenar! 💪`;
      const sent = await sendWhatsAppViaBaileys(resolvedPhone, activeMsg);
      res.json({ ok: true, sent, message: activeMsg });
      return;
    }

    const session = getOrCreateClientSession(resolvedPhone);
    session.intentStage = 'awaiting_profile_data';
    session.approvedOperationRef = opRef;
    session.remainingProfilesToCollect = count;
    session.totalProfilesApproved = count;
    session.isPayingForOtherPerson = Boolean(body.isForOtherPerson || count > 1);
    session.partialCedula = null;
    session.partialName = null;

    // Simplified client notification (does not show Operación number to the client)
    const clientMsg =
      count > 1
        ? `✅ ¡Tu pago por *${count} membresías* en *${gymName}* fue aprobado! 🎉\n\nPor favor respóndeme con el *Nombre y Apellido* y el *Número de Cédula* de cada una de las *${count} personas* (puedes enviarlos en un solo mensaje o uno por uno) para registrarlas en el sistema.`
        : body.isForOtherPerson
        ? `✅ ¡El pago de la membresía en *${gymName}* fue aprobado! 🎉\n\nPor favor respóndeme con el *Nombre y Apellido* y el *Número de Cédula* de la persona a quien le pagaste la membresía para registrarla.`
        : `✅ ¡Tu pago de membresía en *${gymName}* fue aprobado! 🎉\n\nPor favor respóndeme a este mensaje con tu *Nombre y Apellido* y tu *Número de Cédula* (por ejemplo: *Juan Pérez 19549164*) para activar tu membresía en la base de datos.`;

    const sent = await sendWhatsAppViaBaileys(resolvedPhone, clientMsg);
    res.json({ ok: true, sent, message: clientMsg });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (cleanUser === 'formatilin' && cleanPass === 'formatilin67') {
      res.json({
        authenticated: true,
        username: 'formatilin',
        token: 'formagym_session_formatilin_verified',
      });
      return;
    }

    res.status(401).json({
      authenticated: false,
      error: 'Usuario o contraseña incorrectos.',
    });
  });

  app.get('/api/local-db', (_req, res) => {
    const data = readLocalDiskDb();
    res.json({
      exists: Boolean(data),
      filePath: LOCAL_DB_PATH,
      data: data || null,
    });
  });

  app.post('/api/local-db', (req, res) => {
    const payload = req.body as Record<string, unknown>;
    if (payload && typeof payload === 'object') {
      const existingDisk = readLocalDiskDb() || {};
      const safeProducts = Array.isArray(payload.products)
        ? payload.products
        : Array.isArray(existingDisk.products)
        ? existingDisk.products
        : [];

      const toSave = {
        ...existingDisk,
        ...payload,
        botRunning247,
        products: safeProducts,
        updatedAtMs: Number(payload.updatedAtMs) || Date.now(),
        savedAt: new Date().toISOString(),
      };
      writeLocalDiskDb(toSave);
      // Also keep serverSyncedContext updated whenever local-db is saved
      const savedSettings = (payload.settings || {}) as Record<string, unknown>;
      serverSyncedContext = {
        ...serverSyncedContext,
        businessName: String(savedSettings.businessName || serverSyncedContext.businessName || 'FormaGym'),
        activeRate: Number(savedSettings.activeRate || serverSyncedContext.activeRate || 68.45),
        rateMode: String(savedSettings.mode || serverSyncedContext.rateMode || 'auto_bcv'),
        bcvRate: Number(savedSettings.bcvRate || serverSyncedContext.bcvRate || 68.45),
        euroRate: Number(savedSettings.euroRate || serverSyncedContext.euroRate || 74.95),
        manualRate: Number(savedSettings.manualRate || serverSyncedContext.manualRate || 70),
        scheduleText: String(savedSettings.scheduleText || serverSyncedContext.scheduleText || HORARIO_MESSAGE),
        membershipMonthlyUsd: Number(savedSettings.membershipMonthlyUsd || serverSyncedContext.membershipMonthlyUsd || 30),
        membershipMonthlyBs: Number(savedSettings.membershipMonthlyBs || serverSyncedContext.membershipMonthlyBs || 2053.5),
        registrationUsd: Number(savedSettings.registrationUsd || serverSyncedContext.registrationUsd || 15),
        registrationBs: Number(savedSettings.registrationBs || serverSyncedContext.registrationBs || 1026.75),
        paymentMethodsText: String(savedSettings.paymentMethodsText || serverSyncedContext.paymentMethodsText || PAGO_MOVIL_MESSAGE),
        ownerPhoneMemberships: String(savedSettings.ownerPhoneMemberships || serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866'),
        ownerPhoneConsumables: String(savedSettings.ownerPhoneConsumables || serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787'),
        ownerPhoneSupport: String(savedSettings.ownerPhoneSupport || serverSyncedContext.ownerPhoneSupport || '+58 414-6734866'),
        adminNumbers:
          savedSettings.adminNumbers !== undefined
            ? String(savedSettings.adminNumbers)
            : serverSyncedContext.adminNumbers || '',
        products: Array.isArray(safeProducts) ? (safeProducts as BotProduct[]) : serverSyncedContext.products,
        memberships: Array.isArray(payload.memberships) ? (payload.memberships as any[]) : serverSyncedContext.memberships,
        shopOrders: Array.isArray(payload.shopOrders) ? (payload.shopOrders as any[]) : serverSyncedContext.shopOrders,
      };
      res.json({ ok: true, filePath: LOCAL_DB_PATH, savedAt: toSave.savedAt });
      return;
    }
    res.status(400).json({ ok: false });
  });

  app.get('/api/system/24-7-status', (_req, res) => {
    const ownerMem = serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866';
    const ownerCons = serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787';
    const pending = getUnifiedPendingPayments(ownerMem, ownerCons);
    const activePort = Number(process.env.PORT) || 3000;
    const lanIp = getLocalNetworkIp();
    res.json({
      ok: true,
      botRunning247,
      startedAt: botStartedAtIso,
      uptimeSeconds: Math.floor(process.uptime()),
      baileysConnectionState,
      connectedPhone: baileysConnectedPhone,
      activeRate: serverSyncedContext.activeRate || cachedRate.bcvRate || 68.45,
      membershipsCount: Array.isArray(serverSyncedContext.memberships)
        ? serverSyncedContext.memberships.length
        : 0,
      pendingCount: pending.length,
      localUrl: `http://localhost:${activePort}`,
      lanUrl: `http://${lanIp}:${activePort}`,
      standaloneProdUrl: 'https://ais-pre-ymynqlimtqabrw24fwdz5p-878245638537.us-east1.run.app',
      standaloneDevUrl: 'https://ais-dev-ymynqlimtqabrw24fwdz5p-878245638537.us-east1.run.app',
    });
  });

  app.post('/api/system/24-7-toggle', async (req, res) => {
    const { enabled } = (req.body || {}) as { enabled?: boolean };
    botRunning247 = Boolean(enabled);
    persistServerSyncedContextToDisk();
    if (botRunning247) {
      addBaileysLog('Modo 24/7 ENCENDIDO por el administrador. El bot responderá continuamente.');
      if (
        baileysConnectionState === 'disconnected' &&
        fs.existsSync(path.join(BAILEYS_AUTH_DIR, 'creds.json'))
      ) {
        startBaileysConnection().catch(() => {});
      }
    } else {
      addBaileysLog('Modo 24/7 APAGADO manualmente por el administrador. El bot está en pausa.');
    }
    res.json({
      ok: true,
      botRunning247,
      statusMessage: botRunning247
        ? 'Sistema y Bot 24/7 ENCENDIDOS — Ejecutándose continuamente hasta que lo apagues.'
        : 'Sistema y Bot APAGADOS manualmente — No responderá mensajes hasta que lo vuelvas a encender.',
    });
  });

  app.get('/api/bot/pending-payments', (_req, res) => {
    const ownerMem = serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866';
    const ownerCons = serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787';
    const pending = getUnifiedPendingPayments(ownerMem, ownerCons);
    res.json({
      ok: true,
      count: pending.length,
      pendingPayments: pending,
    });
  });

  app.get('/api/baileys/status', (_req, res) => {
    res.json({
      connectionState: baileysConnectionState,
      qrDataUrl: baileysQrDataUrl,
      pairingCode: baileysPairingCode,
      connectedPhone: baileysConnectedPhone,
      statusMessage: baileysStatusMessage,
      logs: baileysActivityLogs,
    });
  });

  app.post('/api/baileys/connect', async (req, res) => {
    const { phoneForPairing } = (req.body || {}) as { phoneForPairing?: string };
    await startBaileysConnection(phoneForPairing);
    res.json({
      ok: true,
      connectionState: baileysConnectionState,
      statusMessage: baileysStatusMessage,
    });
  });

  app.post('/api/baileys/disconnect', async (_req, res) => {
    try {
      if (baileysSock) {
        await baileysSock.logout().catch(() => {});
        baileysSock.end(undefined);
        baileysSock = null;
      }
      fs.rmSync(BAILEYS_AUTH_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
    baileysConnectionState = 'disconnected';
    baileysQrDataUrl = null;
    baileysPairingCode = null;
    baileysConnectedPhone = null;
    baileysStatusMessage = 'Desconectado. Puedes vincular un nuevo número cuando quieras.';
    addBaileysLog('Sesión de Baileys desconectada manualmente.');
    res.json({ ok: true });
  });

  app.post('/api/baileys/send', async (req, res) => {
    const { phone, message } = (req.body || {}) as { phone?: string; message?: string };
    if (!phone || !message) {
      res.status(400).json({ sent: false, error: 'Falta teléfono o mensaje' });
      return;
    }
    const sent = await sendWhatsAppViaBaileys(phone, message);
    res.json({ sent, connectedPhone: baileysConnectedPhone });
  });

  app.get('/api/exchange-rate', async (req, res) => {
    try {
      const force = req.query.refresh === 'true';
      const rateData = await fetchLiveVenezuelanRate(force);
      res.json(rateData);
    } catch (error) {
      res.status(200).json({
        ...cachedRate,
        warning: error instanceof Error ? error.message : 'Usando tasa en caché',
      });
    }
  });

  app.post('/api/panel/sync-config', (req, res) => {
    const incoming = req.body as Partial<BotContext> & {
      memberships?: any[];
      shopOrders?: any[];
    };
    if (incoming && typeof incoming === 'object') {
      serverSyncedContext = {
        ...serverSyncedContext,
        ...incoming,
        products: Array.isArray(incoming.products)
          ? incoming.products
          : serverSyncedContext.products || [],
      };
    }
    res.json({ ok: true });
  });

  app.get('/api/panel/events', (req, res) => {
    const sinceId = req.query.sinceId as string | undefined;
    if (!sinceId) {
      res.json({ events: externalEventsQueue.slice(-30) });
      return;
    }
    const idx = externalEventsQueue.findIndex((e) => e.id === sinceId);
    const newer = idx >= 0 ? externalEventsQueue.slice(idx + 1) : externalEventsQueue.slice(-30);
    res.json({ events: newer });
  });

  app.post('/api/whatsapp/chat', async (req, res) => {
    const { phone, message, context, fromExternal } = req.body as {
      phone: string;
      message: string;
      context?: BotContext;
      fromExternal?: boolean;
    };

    const safePhone = phone || '+58 412-0000000';
    const safeMsg = message || 'Hola';
    const session = getOrCreateClientSession(safePhone);
    const matchedMember = context?.membership || findSyncedMembershipByPhone(safePhone);

    const mergedContext: BotContext = {
      activeRate: Number(context?.activeRate || serverSyncedContext.activeRate || cachedRate.bcvRate || 68.45),
      rateMode: context?.rateMode || serverSyncedContext.rateMode || 'auto_bcv',
      bcvRate: context?.bcvRate || serverSyncedContext.bcvRate || cachedRate.bcvRate,
      euroRate: context?.euroRate || serverSyncedContext.euroRate || cachedRate.euroRate,
      manualRate: context?.manualRate || serverSyncedContext.manualRate || 70,
      businessName: context?.businessName || serverSyncedContext.businessName || 'FormaGym',
      scheduleText: context?.scheduleText || serverSyncedContext.scheduleText || HORARIO_MESSAGE,
      membershipMonthlyUsd: Number(context?.membershipMonthlyUsd || serverSyncedContext.membershipMonthlyUsd || 30),
      membershipMonthlyBs: Number(context?.membershipMonthlyBs || serverSyncedContext.membershipMonthlyBs || 2053.5),
      paymentMethodsText: context?.paymentMethodsText || serverSyncedContext.paymentMethodsText || PAGO_MOVIL_MESSAGE,
      ownerPhoneMemberships: context?.ownerPhoneMemberships || serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866',
      ownerPhoneConsumables: context?.ownerPhoneConsumables || serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787',
      ownerPhoneSupport: context?.ownerPhoneSupport || serverSyncedContext.ownerPhoneSupport || '+58 414-6734866',
      adminNumbers: context?.adminNumbers ?? serverSyncedContext.adminNumbers ?? '',
      hasPhotoAttached: Boolean(context?.hasPhotoAttached || context?.receiptImageUrl),
      receiptImageUrl: context?.receiptImageUrl,
      supportState: context?.supportState || (session.intentStage === 'awaiting_support_issue' ? 'awaiting_issue' : null),
      activeSupportClientPhone: context?.activeSupportClientPhone || lastSupportClientPhone,
      products: context?.products && context.products.length > 0 ? context.products : (serverSyncedContext.products || []),
      membership: matchedMember,
      conversationHistory: context?.conversationHistory || session.history.map((h) => ({ sender: h.role, text: h.text })),
      quotedText: context?.quotedText,
    };

    const result = await processIncomingWhatsAppMessage(safePhone, safeMsg, mergedContext);
    applyBotResultToServerState(safePhone, result);
    if (
      result.action === 'ADMIN_APPROVE_PAYMENT' &&
      result.targetClientPhone &&
      result.clientNotificationMessage
    ) {
      await sendWhatsAppViaBaileys(
        String(result.targetClientPhone),
        String(result.clientNotificationMessage)
      );
    }

    if (
      fromExternal ||
      result.action === 'ADMIN_APPROVE_PAYMENT' ||
      result.action === 'ADMIN_CREATE_MANUAL_MEMBERSHIP'
    ) {
      const targetPhone =
        result.action === 'ADMIN_APPROVE_PAYMENT' && result.targetClientPhone
          ? String(result.targetClientPhone)
          : safePhone;
      externalEventsQueue.push({
        id: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        phone: targetPhone,
        clientMessage: safeMsg,
        hasPhoto: Boolean(mergedContext.hasPhotoAttached),
        botResult: result,
      });
    }
    res.json(result);
  });

  app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token) {
      res.status(200).send(challenge);
      return;
    }
    res.status(200).json({
      status: 'active',
      webhook: 'FormaGym WhatsApp Cloud API Webhook Ready',
      language: 'es-VE',
    });
  });

  app.post('/api/whatsapp/webhook', async (req, res) => {
    const body = req.body || {};
    const rawSender =
      body?.query?.sender ||
      body?.sender ||
      body?.From ||
      body?.phone ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ||
      '+58 412-0000000';
    const rawMessage =
      body?.query?.message ||
      body?.message ||
      body?.Body ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body ||
      'Hola';
    const receiptImageUrl =
      body?.receiptImageUrl && typeof body.receiptImageUrl === 'string'
        ? body.receiptImageUrl
        : undefined;
    const hasMedia =
      Number(body?.NumMedia || 0) > 0 ||
      Boolean(body?.hasPhoto) ||
      Boolean(receiptImageUrl) ||
      Boolean(body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image);

    const safePhone = String(rawSender).replace('whatsapp:', '').trim() || '+58 412-0000000';
    const safeMsg = String(rawMessage).trim() || 'Hola';
    const session = getOrCreateClientSession(safePhone);
    const matchedMember = findSyncedMembershipByPhone(safePhone);

    const mergedContext: BotContext = {
      activeRate: Number(serverSyncedContext.activeRate || cachedRate.bcvRate || 68.45),
      rateMode: serverSyncedContext.rateMode || 'auto_bcv',
      bcvRate: serverSyncedContext.bcvRate || cachedRate.bcvRate,
      euroRate: serverSyncedContext.euroRate || cachedRate.euroRate,
      manualRate: serverSyncedContext.manualRate || 70,
      businessName: serverSyncedContext.businessName || 'FormaGym',
      scheduleText: serverSyncedContext.scheduleText || HORARIO_MESSAGE,
      membershipMonthlyUsd: Number(serverSyncedContext.membershipMonthlyUsd || 30),
      membershipMonthlyBs: Number(serverSyncedContext.membershipMonthlyBs || 2053.5),
      paymentMethodsText: serverSyncedContext.paymentMethodsText || PAGO_MOVIL_MESSAGE,
      ownerPhoneMemberships: serverSyncedContext.ownerPhoneMemberships || '+58 414-6734866',
      ownerPhoneConsumables: serverSyncedContext.ownerPhoneConsumables || '+58 424-6559787',
      ownerPhoneSupport: serverSyncedContext.ownerPhoneSupport || '+58 414-6734866',
      adminNumbers: serverSyncedContext.adminNumbers || '',
      hasPhotoAttached: hasMedia,
      receiptImageUrl,
      quotedText: body?.quotedText ? String(body.quotedText) : undefined,
      supportState: session.intentStage === 'awaiting_support_issue' ? 'awaiting_issue' : null,
      activeSupportClientPhone: lastSupportClientPhone,
      products: serverSyncedContext.products || [],
      membership: matchedMember,
      conversationHistory: session.history.map((h) => ({ sender: h.role, text: h.text })),
    };

    const result = await processIncomingWhatsAppMessage(safePhone, safeMsg, mergedContext);
    applyBotResultToServerState(safePhone, result);
    const targetEventPhone =
      result.action === 'ADMIN_APPROVE_PAYMENT' && result.targetClientPhone
        ? String(result.targetClientPhone)
        : safePhone;

    externalEventsQueue.push({
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      phone: targetEventPhone,
      clientMessage: safeMsg,
      hasPhoto: hasMedia,
      botResult: result as Record<string, unknown>,
    });

    res.status(200).json({
      reply: result.reply,
      replies: [{ message: result.reply }],
      action: result.action,
      redirectedToPhone: result.redirectedToPhone || null,
      forwardedPaymentNotification: result.forwardedPaymentNotification || null,
      targetClientPhone: result.targetClientPhone || null,
      clientNotificationMessage: result.clientNotificationMessage || null,
      supportReplyText: result.supportReplyText || null,
      timestamp: new Date().toISOString(),
    });
  });

  const distPath = path.join(__dirname, 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasBuiltDist) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  // Auto-resume Baileys session if credentials already exist on disk and 24/7 mode is enabled
  if (botRunning247 && fs.existsSync(path.join(BAILEYS_AUTH_DIR, 'creds.json'))) {
    startBaileysConnection().catch(() => {});
  }
  app.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLocalNetworkIp();
    console.log(`\n=============================================================`);
    console.log(`🏋️‍♂️ FormaGym — Sistema Web + Bot WhatsApp 24/7 Activo`);
    console.log(`💻 En esta computadora (Local): http://localhost:${PORT}`);
    console.log(`📱 En tu red Wi-Fi / Celular:   http://${lanIp}:${PORT}`);
    console.log(`💾 Base de datos en disco:      ${LOCAL_DB_PATH}`);
    console.log(`=============================================================\n`);
  });
}

startServer();
