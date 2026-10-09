import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  Cloud,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Image as ImageIcon,
  LayoutList,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AddMembershipModal } from './components/AddMembershipModal';
import { BotConfigAndCloudSection } from './components/BotConfigAndCloudSection';
import { BusinessAnalyticsTab } from './components/BusinessAnalyticsTab';
import { DeletedMembershipsReport } from './components/DeletedMembershipsReport';
import { LoginScreen } from './components/LoginScreen';
import { PaymentApprovalsTab } from './components/PaymentApprovalsTab';
import { RATE_MODE_LABELS, ShopSection } from './components/ShopSection';
import {
  auth,
  db,
  handleFirestoreError,
  loginWithGoogle,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  DEFAULT_EXCHANGE_SETTINGS,
  INITIAL_MEMBERSHIPS,
  INITIAL_PRODUCTS,
  INITIAL_SHOP_ORDERS,
  isLegacyDemoId,
} from './initialData';
import {
  addCalendarMonths,
  DeletedMembershipRecord,
  DeletedProductRecord,
  DeletedShopOrderRecord,
  ExchangeSettings,
  formatSpanishDate,
  getTodayIsoDate,
  inferStartDateFromExpiry,
  MembershipRecord,
  MembershipStatus,
  ProductItem,
  RateMode,
  ShopOrderRecord,
  SupportForwardSession,
} from './types';
import {
  decodeReminderAndMeta,
  getRateForMode,
  sanitizeId,
  validateExchangeSettingsPayload,
  validateMembershipPayload,
  validateProductPayload,
  validateShopOrderPayload,
} from './validation';

type ActiveSection =
  | 'memberships'
  | 'approvals'
  | 'analytics'
  | 'shop'
  | 'deleted_report'
  | 'config';
type UiViewMode = 'simplified' | 'statistics';

const STATUS_LABELS: Record<MembershipStatus, string> = {
  pending_payment: 'Pago Pendiente',
  pending_registration_check: 'Verificar si está Inscrito',
  awaiting_profile: 'Falta Cédula/Nombre',
  active: 'Activa',
  expiring_soon: 'Por Vencer (≤ 5 días)',
  expired: 'Vencida',
};

const LOCAL_STORAGE_KEY = 'formagym_local_db_v1';
const LOCAL_AUTH_KEY = 'formagym_logged_in_user';
const LOCAL_UI_MODE_KEY = 'formagym_ui_view_mode';
const LAST_EVENT_ID_KEY = 'formagym_last_seen_event_id_v2';
const PROCESSED_EVENTS_KEY = 'formagym_processed_event_ids_v2';

function deduplicateMemberships(list: MembershipRecord[]): MembershipRecord[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const result: MembershipRecord[] = [];
  for (const item of list) {
    if (!item || isLegacyDemoId(item.id)) continue;
    if (seenIds.has(item.id)) continue;
    // Deduplicate identical cloned records created by past page refreshes
    const sig = `${(item.phone || '').trim()}|${(item.cedula || '').trim()}|${(
      item.firstName || ''
    ).trim()}|${(item.lastName || '').trim()}|${(item.paymentRef || '').trim()}|${item.status}|${
      item.planName || ''
    }`;
    if (seenSignatures.has(sig)) continue;
    seenIds.add(item.id);
    seenSignatures.add(sig);
    result.push(item);
  }
  return result;
}

function deduplicateShopOrders(list: ShopOrderRecord[]): ShopOrderRecord[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const result: ShopOrderRecord[] = [];
  for (const ord of list) {
    if (!ord || isLegacyDemoId(ord.id)) continue;
    if (seenIds.has(ord.id)) continue;
    const sig = `${(ord.phone || '').trim()}|${(ord.itemsSummary || '').trim()}|${(
      ord.paymentRef || ''
    ).trim()}|${ord.status}|${ord.totalBs}`;
    if (seenSignatures.has(sig)) continue;
    seenIds.add(ord.id);
    seenSignatures.add(sig);
    result.push(ord);
  }
  return result;
}

function loadInitialLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore storage read error
  }
  return null;
}

export function App() {
  const [loggedInUsername, setLoggedInUsername] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_AUTH_KEY) || 'formatilin';
    } catch {
      return 'formatilin';
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeSection, setActiveSection] = useState<ActiveSection>('memberships');
  const [uiMode, setUiMode] = useState<UiViewMode>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_UI_MODE_KEY);
      return saved === 'statistics' ? 'statistics' : 'simplified';
    } catch {
      return 'simplified';
    }
  });

  const initialLocal = useMemo(() => loadInitialLocalState(), []);

  const [settings, setSettings] = useState<ExchangeSettings>(() => ({
    ...DEFAULT_EXCHANGE_SETTINGS,
    ...(initialLocal?.settings || {}),
    adminNumbers: initialLocal?.settings?.adminNumbers ?? '',
  }));
  const [memberships, setMemberships] = useState<MembershipRecord[]>(() =>
    deduplicateMemberships(
      initialLocal?.memberships ||
        INITIAL_MEMBERSHIPS.map((m) => ({ ...m, ownerId: 'local_owner' }))
    )
  );
  const [deletedMemberships, setDeletedMemberships] = useState<DeletedMembershipRecord[]>(
    () =>
      (initialLocal?.deletedMemberships || []).filter(
        (m: DeletedMembershipRecord) => !isLegacyDemoId(m.id)
      )
  );
  const [deletedProducts, setDeletedProducts] = useState<DeletedProductRecord[]>(
    () =>
      (initialLocal?.deletedProducts || []).filter(
        (p: DeletedProductRecord) => !isLegacyDemoId(p.id)
      )
  );
  const [deletedShopOrders, setDeletedShopOrders] = useState<DeletedShopOrderRecord[]>(
    () =>
      (initialLocal?.deletedShopOrders || []).filter(
        (o: DeletedShopOrderRecord) => !isLegacyDemoId(o.id)
      )
  );
  const [shopOrders, setShopOrders] = useState<ShopOrderRecord[]>(() =>
    deduplicateShopOrders(
      initialLocal?.shopOrders ||
        INITIAL_SHOP_ORDERS.map((o) => ({ ...o, ownerId: 'local_owner' }))
    )
  );
  const [products, setProducts] = useState<ProductItem[]>(() => {
    if (initialLocal && Array.isArray(initialLocal.products)) {
      return initialLocal.products.filter((p: ProductItem) => p && !isLegacyDemoId(p.id));
    }
    return INITIAL_PRODUCTS.map((p) => ({
      ...p,
      ownerId: 'local_owner',
    })).filter((p: ProductItem) => !isLegacyDemoId(p.id));
  });
  const [supportSessions, setSupportSessions] = useState<SupportForwardSession[]>(
    () => initialLocal?.supportSessions || []
  );
  const [isHydratedFromDisk, setIsHydratedFromDisk] = useState<boolean>(false);
  const hasUserMutatedRef = useRef<boolean>(false);

  const persistSnapshotNow = (overrides?: {
    settings?: ExchangeSettings;
    memberships?: MembershipRecord[];
    deletedMemberships?: DeletedMembershipRecord[];
    deletedProducts?: DeletedProductRecord[];
    deletedShopOrders?: DeletedShopOrderRecord[];
    shopOrders?: ShopOrderRecord[];
    products?: ProductItem[];
    supportSessions?: SupportForwardSession[];
  }) => {
    hasUserMutatedRef.current = true;
    const nowMs = Date.now();
    const snapshot = {
      settings: overrides?.settings ?? settings,
      memberships: overrides?.memberships ?? memberships,
      deletedMemberships: overrides?.deletedMemberships ?? deletedMemberships,
      deletedProducts: overrides?.deletedProducts ?? deletedProducts,
      deletedShopOrders: overrides?.deletedShopOrders ?? deletedShopOrders,
      shopOrders: overrides?.shopOrders ?? shopOrders,
      products: overrides?.products ?? products,
      supportSessions: overrides?.supportSessions ?? supportSessions,
      updatedAtMs: nowMs,
      updatedAt: new Date(nowMs).toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore quota error
    }
    fetch('/api/local-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(snapshot),
    }).catch(() => {});
  };

  const [lastLocalDownloadAt, setLastLocalDownloadAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('formagym_last_download_at');
    } catch {
      return null;
    }
  });
  const [needsBackupReminder, setNeedsBackupReminder] = useState<boolean>(false);

  // Add / Edit Membership Modal
  const [showAddMembershipModal, setShowAddMembershipModal] = useState<boolean>(false);
  const [modalEditRecord, setModalEditRecord] = useState<MembershipRecord | null>(null);
  const [previewReceiptModal, setPreviewReceiptModal] = useState<{
    imageUrl: string;
    title: string;
    phone: string;
    operationRef: string;
    scannedBs?: number;
    expectedBs?: number;
  } | null>(null);
  const [manualPhoneInputs, setManualPhoneInputs] = useState<Record<string, string>>({});

  // Exchange rate API metadata
  const [rateSource, setRateSource] = useState<string>('API Oficial BCV');
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string>('Hoy');
  const [isRefreshingRate, setIsRefreshingRate] = useState<boolean>(false);

  // Admin Memberships Filter & Search
  const [memberFilter, setMemberFilter] = useState<'all' | MembershipStatus>('all');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<{
    cedula: string;
    firstName: string;
    lastName: string;
    phone: string;
    startDate: string;
    prepaidMonths: number;
  }>({
    cedula: '',
    firstName: '',
    lastName: '',
    phone: '',
    startDate: getTodayIsoDate(),
    prepaidMonths: 1,
  });

  // Feedback banner
  const [bannerMessage, setBannerMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  const showNotice = (
    text: string,
    type: 'success' | 'info' | 'warning' = 'success'
  ) => {
    setBannerMessage({ text, type });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 6500);
  };

  const handleToggleUiMode = (mode: UiViewMode) => {
    setUiMode(mode);
    try {
      localStorage.setItem(LOCAL_UI_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const fetchLiveBcvRate = async (forceRefresh = false) => {
    setIsRefreshingRate(true);
    try {
      const res = await fetch(`/api/exchange-rate${forceRefresh ? '?refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        const bcv = Number(data.bcvRate) || 68.45;
        const euro = Number(data.euroRate) || Number((bcv * 1.095).toFixed(2));
        setRateSource(data.source || 'API Oficial BCV');
        setRateUpdatedAt(
          data.updatedAt
            ? new Date(data.updatedAt).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Ahora'
        );

        // Only overwrite user's saved rates and product prices when explicitly clicking "Actualizar BCV Ahora"
        if (forceRefresh) {
          setSettings((prev) => {
            const nextActive =
              prev.mode === 'auto_bcv'
                ? bcv
                : prev.mode === 'auto_euro'
                ? euro
                : prev.manualRate;
            const nextMemBs = Number((prev.membershipMonthlyUsd * nextActive).toFixed(2));
            const regUsdVal = prev.registrationUsd ?? 15;
            const nextRegBs = Number((regUsdVal * nextActive).toFixed(2));
            const updated: ExchangeSettings = {
              ...prev,
              bcvRate: bcv,
              euroRate: euro,
              activeRate: nextActive,
              membershipMonthlyBs: nextMemBs,
              registrationUsd: regUsdVal,
              registrationBs: nextRegBs,
            };
            if (user) {
              persistSettingsToFirestore(updated, user.uid);
            }
            const nextProds = products.map((p) => {
              if (p.isCustomBs) return p;
              const pMode = p.rateMode || updated.mode || 'auto_bcv';
              const r = pMode === 'auto_euro' ? euro : pMode === 'manual' ? updated.manualRate : bcv;
              return {
                ...p,
                priceBs: Number((p.basePriceUsd * r).toFixed(2)),
              };
            });
            setProducts(nextProds);
            persistSnapshotNow({ settings: updated, products: nextProds });
            return updated;
          });

          showNotice(
            `Tasas BCV actualizadas — Dólar BCV: Bs. ${bcv.toFixed(2)} | Euro BCV: Bs. ${euro.toFixed(2)}`,
            'success'
          );
        }
      }
    } catch {
      // Keep cached rates
    } finally {
      setIsRefreshingRate(false);
    }
  };

  useEffect(() => {
    fetchLiveBcvRate(false);
    fetch('/api/local-db')
      .then((r) => r.json())
      .then((res) => {
        if (hasUserMutatedRef.current) {
          return;
        }
        if (res?.exists && res.data) {
          const diskUpdatedAtMs = Number(
            res.data.updatedAtMs || (res.data.savedAt ? Date.parse(res.data.savedAt) : 0) || 0
          );
          const localUpdatedAtMs = Number(
            initialLocal?.updatedAtMs ||
              (initialLocal?.updatedAt ? Date.parse(initialLocal.updatedAt) : 0) ||
              0
          );
          const useDiskAsPrimary = !initialLocal || diskUpdatedAtMs >= localUpdatedAtMs;

          if (useDiskAsPrimary) {
            if (res.data.settings) {
              setSettings((prev) => ({
                ...prev,
                ...res.data.settings,
                adminNumbers:
                  res.data.settings.adminNumbers ?? prev.adminNumbers ?? '',
              }));
            }
            if (Array.isArray(res.data.memberships)) {
              setMemberships(deduplicateMemberships(res.data.memberships));
            }
            if (Array.isArray(res.data.deletedMemberships)) {
              setDeletedMemberships(
                res.data.deletedMemberships.filter(
                  (m: DeletedMembershipRecord) => m && !isLegacyDemoId(m.id)
                )
              );
            }
            if (Array.isArray(res.data.deletedProducts)) {
              setDeletedProducts(
                res.data.deletedProducts.filter(
                  (p: DeletedProductRecord) => p && !isLegacyDemoId(p.id)
                )
              );
            }
            if (Array.isArray(res.data.deletedShopOrders)) {
              setDeletedShopOrders(
                res.data.deletedShopOrders.filter(
                  (o: DeletedShopOrderRecord) => o && !isLegacyDemoId(o.id)
                )
              );
            }
            if (Array.isArray(res.data.shopOrders)) {
              setShopOrders(deduplicateShopOrders(res.data.shopOrders));
            }
            if (Array.isArray(res.data.products)) {
              setProducts(
                res.data.products.filter((p: ProductItem) => p && !isLegacyDemoId(p.id))
              );
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsHydratedFromDisk(true);
      });
  }, []);

  // Sync current state to local browser storage and server disk backup ONLY after initial disk hydration
  useEffect(() => {
    if (!isHydratedFromDisk) return;
    const nowMs = Date.now();
    const snapshot = {
      settings,
      memberships,
      deletedMemberships,
      deletedProducts,
      deletedShopOrders,
      shopOrders,
      products,
      supportSessions,
      updatedAtMs: nowMs,
      updatedAt: new Date(nowMs).toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore quota error
    }
    fetch('/api/local-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(snapshot),
    }).catch(() => {});
  }, [
    isHydratedFromDisk,
    settings,
    memberships,
    deletedMemberships,
    deletedProducts,
    deletedShopOrders,
    shopOrders,
    products,
    supportSessions,
  ]);

  // Sync current panel settings, products & memberships to the Express backend so incoming WhatsApp messages use live data
  useEffect(() => {
    if (!isHydratedFromDisk) return;
    fetch('/api/panel/sync-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        activeRate: settings.activeRate,
        rateMode: settings.mode,
        bcvRate: settings.bcvRate,
        euroRate: settings.euroRate,
        manualRate: settings.manualRate,
        businessName: settings.businessName,
        scheduleText: settings.scheduleText,
        membershipMonthlyUsd: settings.membershipMonthlyUsd,
        membershipMonthlyBs: settings.membershipMonthlyBs,
        registrationUsd: settings.registrationUsd ?? 15,
        registrationBs:
          settings.registrationBs ??
          Number(((settings.registrationUsd ?? 15) * settings.activeRate).toFixed(2)),
        paymentMethodsText: settings.paymentMethodsText,
        adminNumbers: settings.adminNumbers || '',
        ownerPhoneMemberships: settings.ownerPhoneMemberships,
        ownerPhoneConsumables: settings.ownerPhoneConsumables,
        ownerPhoneSupport: settings.ownerPhoneSupport,
        products,
        memberships,
        shopOrders,
      }),
    }).catch(() => {});
  }, [isHydratedFromDisk, settings, products, memberships, shopOrders]);

  // Listen for real incoming WhatsApp webhook events from the server (persisting seen IDs so refresh NEVER duplicates)
  const lastSeenEventIdRef = useRef<string>(
    (() => {
      try {
        return localStorage.getItem(LAST_EVENT_ID_KEY) || '';
      } catch {
        return '';
      }
    })()
  );
  const processedEventsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem(PROCESSED_EVENTS_KEY);
        return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })()
  );

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const q = lastSeenEventIdRef.current
          ? `?sinceId=${encodeURIComponent(lastSeenEventIdRef.current)}`
          : '';
        const res = await fetch(`/api/panel/events${q}`);
        if (!res.ok) return;
        const data = await res.json();
        const events = Array.isArray(data.events) ? data.events : [];
        if (events.length === 0) return;

        for (const ev of events) {
          lastSeenEventIdRef.current = ev.id;
          try {
            localStorage.setItem(LAST_EVENT_ID_KEY, ev.id);
          } catch {
            // ignore
          }
          if (processedEventsRef.current.has(ev.id)) {
            continue;
          }
          processedEventsRef.current.add(ev.id);
          try {
            const recentIds = Array.from(processedEventsRef.current).slice(-300);
            localStorage.setItem(PROCESSED_EVENTS_KEY, JSON.stringify(recentIds));
          } catch {
            // ignore
          }

          const phone = ev.phone || '+58 412-0000000';
          const botRes = ev.botResult || {};

          if (botRes.action === 'CREATE_PENDING_PAYMENT') {
            const ext = botRes.extractedPayment || {};
            const realClientPhone = ext.clientPhone || phone;
            const refNum = ext.reference || ext.paymentRef || '007583657705';
            const opDisplayName = ext.operationDisplayName || `Operación: ${refNum}`;
            const receiptUrl = ext.receiptImageUrl || undefined;
            const scannedBsVal =
              typeof ext.scannedAmountBs === 'number' && ext.scannedAmountBs > 0
                ? ext.scannedAmountBs
                : Number(ext.amountBs || settings.membershipMonthlyBs);
            const expectedBsVal = Number(
              ext.expectedAmountBs || ext.amountBs || settings.membershipMonthlyBs
            );
            const todayIso = getTodayIsoDate();
            const nextExpiry = addCalendarMonths(todayIso, 1);

            if (ext.orderCategory === 'consumibles' || ext.orderCategory === 'ropa') {
              const detOrderId = sanitizeId(`order_${ev.id}`);
              await upsertShopOrderRecord(
                {
                  id: detOrderId,
                  ownerId: user?.uid || 'local_owner',
                  phone: realClientPhone,
                  itemsSummary: ext.productPaid || ext.planOrItems || 'Pedido por WhatsApp',
                  categoryGroup: ext.orderCategory === 'ropa' ? 'ropa' : 'consumibles',
                  status: 'pending_approval',
                  totalUsd: Number(ext.amountUsd || 1),
                  totalBs: expectedBsVal,
                  paymentRef: refNum,
                  pagoMovilTarget: ext.redirectedToPhone || settings.ownerPhoneConsumables,
                  receiptImageUrl: receiptUrl,
                  scannedAmountBs: scannedBsVal,
                  expectedAmountBs: expectedBsVal,
                  paymentNote: ext.paymentNote || undefined,
                  createdAtIso: new Date().toISOString(),
                },
                true
              );
            } else {
              const count = Math.max(1, Math.min(20, Number(ext.membershipCount) || 1));
              const unitUsd = Number(
                ((Number(ext.amountUsd) || settings.membershipMonthlyUsd * count) / count).toFixed(2)
              );
              const unitBs = Number((expectedBsVal / count).toFixed(2));
              const basePlan =
                ext.productPaid || ext.planOrItems || `Membresía Mensual ${settings.businessName}`;

              for (let i = 0; i < count; i++) {
                const detMemId = sanitizeId(`mem_${ev.id}_${i + 1}`);
                await upsertMembershipRecord(
                  {
                    id: detMemId,
                    ownerId: user?.uid || 'local_owner',
                    phone: realClientPhone,
                    cedula: '',
                    firstName: opDisplayName,
                    lastName: count > 1 ? `(Persona ${i + 1} de ${count})` : '',
                    planName: count > 1 ? `${basePlan} (${i + 1}/${count})` : basePlan,
                    status: 'pending_payment',
                    priceUsd: unitUsd,
                    rateBs: settings.activeRate,
                    totalBs: unitBs,
                    paymentRef: refNum,
                    paymentMethod: `WhatsApp -> ${settings.ownerPhoneMemberships}`,
                    startDate: todayIso,
                    expiresAt: nextExpiry,
                    prepaidMonths: 1,
                    lastReminderSent: '',
                    receiptImageUrl: receiptUrl,
                    membershipCount: count,
                    scannedAmountBs: scannedBsVal,
                    expectedAmountBs: expectedBsVal,
                    paymentNote: ext.paymentNote || undefined,
                    createdAtIso: new Date().toISOString(),
                  },
                  true
                );
              }
            }
          } else if (botRes.action === 'ADMIN_APPROVE_PAYMENT' && botRes.approvedPayment) {
            const appPay = botRes.approvedPayment;
            const normDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
            const clientDigits = normDigits(appPay.clientPhone || '');
            const opRef = appPay.operationNumber || appPay.reference || '';
            const isMemApproval =
              appPay.category === 'membership' || appPay.orderCategory === 'membresia';

            if (isMemApproval) {
              const matchingPending = memberships.filter(
                (m) =>
                  m.status === 'pending_payment' &&
                  ((opRef && m.paymentRef === opRef) || normDigits(m.phone) === clientDigits)
              );
              for (const pendingMem of matchingPending) {
                const hasRealName =
                  Boolean(pendingMem.firstName.trim()) &&
                  !pendingMem.firstName.trim().toLowerCase().startsWith('operación:') &&
                  !pendingMem.firstName.trim().toLowerCase().startsWith('operacion:');
                const isReady = Boolean(pendingMem.cedula.trim()) && hasRealName;
                const startDate = pendingMem.startDate || getTodayIsoDate();
                const months = Math.max(1, pendingMem.prepaidMonths || 1);
                const nextExpiry = addCalendarMonths(startDate, months);
                await upsertMembershipRecord(
                  {
                    ...pendingMem,
                    status: isReady ? 'active' : 'awaiting_profile',
                    startDate,
                    expiresAt: nextExpiry,
                    prepaidMonths: months,
                  },
                  false
                );
              }
              showNotice(
                `El administrador aprobó por WhatsApp el Pago Móvil (Operación: ${opRef}) del cliente ${appPay.clientPhone}. Ya se retiró de la cola de pendientes en la web.`,
                'success'
              );
            } else {
              const matchingOrders = shopOrders.filter(
                (o) =>
                  o.status === 'pending_approval' &&
                  ((opRef && o.paymentRef === opRef) || normDigits(o.phone) === clientDigits)
              );
              for (const ord of matchingOrders) {
                await upsertShopOrderRecord({ ...ord, status: 'confirmed' }, false);
              }
              showNotice(
                `El administrador aprobó por WhatsApp el pedido (Operación: ${opRef}) de ${appPay.clientPhone}.`,
                'success'
              );
            }
          } else if (
            botRes.action === 'COMPLETE_PROFILE' &&
            (botRes.extractedProfile || Array.isArray(botRes.extractedProfiles))
          ) {
            const profilesList: Array<any> =
              Array.isArray(botRes.extractedProfiles) && botRes.extractedProfiles.length > 0
                ? botRes.extractedProfiles
                : [botRes.extractedProfile];
            const normDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
            const targetDigits = normDigits(phone);
            const isPlaceholderName = (name: string) =>
              !name.trim() ||
              name.trim().toLowerCase().startsWith('operación:') ||
              name.trim().toLowerCase().startsWith('operacion:');
            const todayIso = getTodayIsoDate();
            const usedSlotIds = new Set<string>();

            for (let idx = 0; idx < profilesList.length; idx++) {
              const prof = profilesList[idx];
              if (!prof) continue;
              const needsManualPhoneFlag = Boolean(prof.needsManualPhone);

              // Check if this is an advance renewal for an already-active member with the same Cedula or Phone
              const existingActiveMember = memberships.find(
                (m) =>
                  m.status === 'active' &&
                  !isPlaceholderName(m.firstName) &&
                  ((prof.cedula &&
                    m.cedula.replace(/\D/g, '') === String(prof.cedula).replace(/\D/g, '')) ||
                    (!needsManualPhoneFlag && normDigits(m.phone) === targetDigits && Boolean(botRes.isPayingInAdvance)))
              );

              // Find the first pending/awaiting slot for this client phone
              const slotToFill =
                memberships.find(
                  (m) =>
                    !usedSlotIds.has(m.id) &&
                    (normDigits(m.phone) === targetDigits ||
                      normDigits(m.paidByPhone || '') === targetDigits) &&
                    (m.status === 'awaiting_profile' ||
                      m.status === 'pending_payment' ||
                      !m.cedula.trim() ||
                      isPlaceholderName(m.firstName))
                ) || null;

              if (existingActiveMember && Boolean(botRes.isPayingInAdvance)) {
                const prevMonths = Math.max(1, existingActiveMember.prepaidMonths || 1);
                const nextMonths = prevMonths + 1;
                const baseStart =
                  existingActiveMember.startDate ||
                  inferStartDateFromExpiry(existingActiveMember.expiresAt, prevMonths);
                const extendedExpiry = addCalendarMonths(baseStart, nextMonths);

                if (slotToFill && slotToFill.id !== existingActiveMember.id) {
                  usedSlotIds.add(slotToFill.id);
                  setMemberships((prev) => prev.filter((item) => item.id !== slotToFill.id));
                  if (user) {
                    deleteDoc(doc(db, 'memberships', sanitizeId(slotToFill.id))).catch(() => {});
                  }
                }

                await upsertMembershipRecord(
                  {
                    ...existingActiveMember,
                    startDate: baseStart,
                    prepaidMonths: nextMonths,
                    membershipCount: nextMonths,
                    expiresAt: extendedExpiry,
                    priceUsd: Number((existingActiveMember.priceUsd + settings.membershipMonthlyUsd).toFixed(2)),
                    totalBs: Number((existingActiveMember.totalBs + settings.membershipMonthlyBs).toFixed(2)),
                    status: 'active',
                  },
                  false
                );
                continue;
              }

              if (slotToFill) {
                usedSlotIds.add(slotToFill.id);
                const startDate = slotToFill.startDate || todayIso;
                const months = Math.max(1, slotToFill.prepaidMonths || 1);
                const nextExpiry = addCalendarMonths(startDate, months);
                await upsertMembershipRecord(
                  {
                    ...slotToFill,
                    phone: needsManualPhoneFlag ? '' : slotToFill.phone || phone,
                    paidByPhone: needsManualPhoneFlag ? phone : slotToFill.paidByPhone,
                    needsManualPhone: needsManualPhoneFlag,
                    cedula: prof.cedula || slotToFill.cedula,
                    firstName: prof.firstName || slotToFill.firstName,
                    lastName: prof.lastName ?? '',
                    status: 'active',
                    startDate,
                    prepaidMonths: months,
                    expiresAt: nextExpiry,
                  },
                  false
                );
              } else {
                const nextExpiry = addCalendarMonths(todayIso, 1);
                await upsertMembershipRecord(
                  {
                    id: sanitizeId(`mem_prof_${ev.id}_${idx + 1}`),
                    ownerId: user?.uid || 'local_owner',
                    phone: needsManualPhoneFlag ? '' : phone,
                    paidByPhone: needsManualPhoneFlag ? phone : undefined,
                    needsManualPhone: needsManualPhoneFlag,
                    cedula: prof.cedula || 'V-00000000',
                    firstName: prof.firstName || 'Cliente',
                    lastName: prof.lastName || '',
                    planName: `Membresía Mensual ${settings.businessName}`,
                    status: 'active',
                    priceUsd: settings.membershipMonthlyUsd,
                    rateBs: settings.activeRate,
                    totalBs: settings.membershipMonthlyBs,
                    paymentRef: botRes.operationRef || '007583657705',
                    paymentMethod: `WhatsApp -> ${settings.ownerPhoneMemberships}`,
                    startDate: todayIso,
                    prepaidMonths: 1,
                    expiresAt: nextExpiry,
                    lastReminderSent: '',
                    createdAtIso: new Date().toISOString(),
                  },
                  true
                );
              }

              if (needsManualPhoneFlag) {
                showNotice(
                  `⚠️ Membresía registrada para un tercero (${prof.firstName} ${prof.lastName || ''} - ${prof.cedula}) pagada por ${phone}. Agrega manualmente el número de teléfono de esta persona en la tabla de Membresías.`,
                  'warning'
                );
              }
            }
          } else if (
            botRes.action === 'ADMIN_CREATE_MANUAL_MEMBERSHIP' &&
            botRes.createdManualMembership
          ) {
            const cm = botRes.createdManualMembership;
            const startDate = cm.startDate || getTodayIsoDate();
            const months = Math.max(1, Number(cm.prepaidMonths || cm.membershipCount || 1));
            const expiresAt = cm.expiresAt || addCalendarMonths(startDate, months);
            await upsertMembershipRecord(
              {
                id: sanitizeId(cm.id || `mem_admin_${ev.id}`),
                ownerId: user?.uid || 'local_owner',
                phone: cm.phone || '',
                cedula: cm.cedula || 'V-00000000',
                firstName: cm.firstName || 'Miembro',
                lastName: cm.lastName || '',
                planName: cm.planName || `Membresía Mensual ${settings.businessName}`,
                status: 'active',
                priceUsd: Number(cm.priceUsd || settings.membershipMonthlyUsd * months),
                rateBs: Number(cm.rateBs || settings.activeRate),
                totalBs: Number(cm.totalBs || settings.membershipMonthlyBs * months),
                paymentRef: cm.paymentRef || 'MANUAL-ADMIN',
                paymentMethod: cm.paymentMethod || `Registro Manual Admin (${phone})`,
                startDate,
                expiresAt,
                prepaidMonths: months,
                membershipCount: months,
                needsManualPhone: !cm.phone || Boolean(cm.needsManualPhone),
                paidByPhone: cm.paidByPhone || phone,
                lastReminderSent: '',
                createdAtIso: new Date().toISOString(),
              },
              true
            );
            showNotice(
              `Membresía manual agregada por el Admin desde WhatsApp: ${cm.firstName} ${cm.lastName} (${cm.cedula}) — Vence el ${formatSpanishDate(expiresAt)}.`,
              'success'
            );
          } else if (
            botRes.action === 'LINK_EXISTING_MEMBER_PHONE' &&
            botRes.linkedMembership
          ) {
            const lm = botRes.linkedMembership;
            const existingTarget = memberships.find(
              (m) =>
                m.id === lm.id ||
                (lm.cedula &&
                  m.cedula.replace(/\D/g, '') === String(lm.cedula).replace(/\D/g, ''))
            );
            if (existingTarget) {
              await upsertMembershipRecord(
                {
                  ...existingTarget,
                  phone: lm.phone || phone,
                  needsManualPhone: false,
                },
                false
              );
              showNotice(
                `El miembro ${existingTarget.firstName} ${existingTarget.lastName} (${existingTarget.cedula}) vinculó su número de WhatsApp (${lm.phone || phone}) automáticamente.`,
                'success'
              );
            }
          } else if (
            botRes.action === 'ASK_ADMIN_REGISTRATION_CHECK' &&
            botRes.registrationVerificationRequest
          ) {
            const req = botRes.registrationVerificationRequest;
            const normDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
            const existingTarget = memberships.find(
              (m) =>
                m.id === req.id ||
                (req.cedula &&
                  m.cedula.replace(/\D/g, '') === String(req.cedula).replace(/\D/g, '')) ||
                normDigits(m.phone) === normDigits(req.phone || phone)
            );
            const todayIso = getTodayIsoDate();
            if (existingTarget) {
              await upsertMembershipRecord(
                {
                  ...existingTarget,
                  phone: req.phone || phone,
                  cedula: req.cedula || existingTarget.cedula,
                  firstName: req.firstName || existingTarget.firstName,
                  lastName: req.lastName ?? existingTarget.lastName,
                  status:
                    existingTarget.status === 'active'
                      ? 'active'
                      : 'pending_registration_check',
                },
                false
              );
            } else {
              await upsertMembershipRecord(
                {
                  id: sanitizeId(req.id || `regcheck_${ev.id}`),
                  ownerId: user?.uid || 'local_owner',
                  phone: req.phone || phone,
                  cedula: req.cedula || 'V-00000000',
                  firstName: req.firstName || 'Cliente',
                  lastName: req.lastName || '',
                  planName: `Verificación de Inscripción Vitalicia — ${settings.businessName}`,
                  status: 'pending_registration_check',
                  priceUsd: settings.membershipMonthlyUsd,
                  rateBs: settings.activeRate,
                  totalBs: settings.membershipMonthlyBs,
                  paymentRef: `VERIF-INSC-${String(req.cedula || '').replace(/\D/g, '').slice(-4) || '0000'}`,
                  paymentMethod: 'Verificación de Inscripción con Admin',
                  startDate: todayIso,
                  expiresAt: todayIso,
                  prepaidMonths: 1,
                  membershipCount: 1,
                  isRegisteredForLife: false,
                  includesRegistration: false,
                  lastReminderSent: '',
                  createdAtIso: new Date().toISOString(),
                },
                true
              );
            }
            showNotice(
              `📋 Verificación de Inscripción Vitalicia solicitada por ${req.firstName} ${req.lastName} (${req.cedula}). Confirma en Membresías o Aprobación de Pagos si ya está inscrito.`,
              'warning'
            );
          } else if (
            botRes.action === 'ADMIN_VERIFY_REGISTRATION' &&
            botRes.verifiedRegistration
          ) {
            const vr = botRes.verifiedRegistration;
            const normDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
            const targetMem = memberships.find(
              (m) =>
                m.id === vr.id ||
                (vr.cedula &&
                  m.cedula.replace(/\D/g, '') === String(vr.cedula).replace(/\D/g, '')) ||
                normDigits(m.phone) === normDigits(vr.clientPhone || '')
            );
            if (targetMem) {
              if (vr.approved) {
                await upsertMembershipRecord(
                  {
                    ...targetMem,
                    isRegisteredForLife: true,
                    status:
                      targetMem.status === 'pending_registration_check'
                        ? 'expired'
                        : targetMem.status,
                  },
                  false
                );
                showNotice(
                  `✅ Inscripción vitalicia confirmada para ${vr.firstName} ${vr.lastName} (${vr.cedula}).`,
                  'success'
                );
              } else {
                if (targetMem.status === 'pending_registration_check') {
                  setMemberships((prev) => prev.filter((item) => item.id !== targetMem.id));
                }
                showNotice(
                  `⚠️ Se indicó que ${vr.firstName} ${vr.lastName} (${vr.cedula}) no está inscrito; el bot le cobrará Inscripción + Mensualidad.`,
                  'info'
                );
              }
            }
          } else if (botRes.action === 'CREATE_SHOP_ORDER') {
            const ord = botRes.extractedShopOrder || {};
            await upsertShopOrderRecord(
              {
                id: sanitizeId(`order_${ev.id}`),
                ownerId: user?.uid || 'local_owner',
                phone,
                itemsSummary: ord.itemsSummary || 'Pedido por WhatsApp',
                categoryGroup: ord.categoryGroup === 'ropa' ? 'ropa' : 'consumibles',
                status: 'pending_approval',
                totalUsd: Number(ord.totalUsd || 1),
                totalBs: Number(ord.totalBs || settings.activeRate),
                paymentRef: ord.paymentRef || '007583657705',
                pagoMovilTarget: ord.pagoMovilTarget || settings.ownerPhoneConsumables,
                receiptImageUrl: ord.receiptImageUrl || undefined,
                scannedAmountBs: ord.scannedAmountBs,
                expectedAmountBs: ord.expectedAmountBs,
              },
              true
            );
          } else if (botRes.action === 'REMIND_EXPIRING_5_DAYS' && botRes.memberId) {
            const targetMem = memberships.find((m) => m.id === botRes.memberId);
            if (targetMem) {
              await upsertMembershipRecord(
                {
                  ...targetMem,
                  status: 'expiring_soon',
                  lastReminderSent: botRes.reminderDate || new Date().toISOString().slice(0, 10),
                },
                false
              );
            }
          } else if (botRes.action === 'FORWARD_TO_SUPPORT') {
            setSupportSessions((prev) => [
              {
                id: `sup_${ev.id}`,
                clientPhone: phone,
                designatedSupportPhone: settings.ownerPhoneSupport,
                issueText: String(botRes.supportIssue || ev.clientMessage),
                status: 'forwarded_open',
                createdAtLabel: new Date().toLocaleTimeString('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
              ...prev,
            ]);
          }

          showNotice(
            `Nuevo mensaje de WhatsApp procesado (${phone}): "${ev.clientMessage}"`,
            'info'
          );
        }
      } catch {
        // Ignore polling errors
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [settings, user, memberships, shopOrders]);

  // Cloud Firestore real-time synchronization
  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.uid;

    const settingsQuery = query(collection(db, 'exchange_settings'), where('ownerId', '==', uid));
    const unsubSettings = onSnapshot(
      settingsQuery,
      async (snap) => {
        if (snap.empty) {
          const docId = sanitizeId(`settings_${uid}`);
          const payload = validateExchangeSettingsPayload(settings, uid);
          try {
            await setDoc(doc(db, 'exchange_settings', docId), {
              ...payload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'exchange_settings');
          }
        } else {
          const d = snap.docs[0];
          const data = d.data();
          setSettings((prev) => ({
            ...prev,
            id: d.id,
            ownerId: data.ownerId,
            mode: data.mode,
            manualRate: Number(data.manualRate),
            activeRate: Number(data.activeRate),
            bcvRate: Number(data.bcvRate),
            euroRate: Number(data.euroRate || Number(data.bcvRate) * 1.095),
            businessName: data.businessName || 'FormaGym',
            scheduleText: data.scheduleText,
            membershipMonthlyUsd: Number(data.membershipMonthlyUsd),
            membershipMonthlyBs: Number(
              data.membershipMonthlyBs || Number(data.membershipMonthlyUsd) * Number(data.activeRate)
            ),
            registrationUsd: Number(data.registrationUsd || prev.registrationUsd || 15),
            registrationBs: Number(
              data.registrationBs ||
                Number(data.registrationUsd || prev.registrationUsd || 15) * Number(data.activeRate)
            ),
            paymentMethodsText: data.paymentMethodsText,
            ownerPhoneMemberships: data.ownerPhoneMemberships || '+58 414-6734866',
            ownerPhoneConsumables: data.ownerPhoneConsumables || '+58 424-6559787',
            ownerPhoneSupport: data.ownerPhoneSupport || '+58 414-6734866',
          }));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'exchange_settings')
    );

    const memQuery = query(collection(db, 'memberships'), where('ownerId', '==', uid));
    const unsubMemberships = onSnapshot(
      memQuery,
      async (snap) => {
        const validDocs = snap.docs.filter((d) => {
          if (isLegacyDemoId(d.id)) {
            deleteDoc(doc(db, 'memberships', d.id)).catch(() => {});
            return false;
          }
          return true;
        });
        setMemberships((prev) => {
          const prevMap = new Map(prev.map((item) => [item.id, item]));
          return deduplicateMemberships(
            validDocs.map((d) => {
              const data = d.data();
              const existingLocal = prevMap.get(d.id);
              const decodedMeta = decodeReminderAndMeta(data.lastReminderSent || '');
              const months =
                decodedMeta.prepaidMonths ||
                existingLocal?.prepaidMonths ||
                existingLocal?.membershipCount ||
                1;
              const startDate =
                decodedMeta.startDate ||
                existingLocal?.startDate ||
                inferStartDateFromExpiry(data.expiresAt, months);
              return {
                id: d.id,
                ownerId: data.ownerId,
                phone: data.phone,
                cedula: data.cedula || '',
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                planName: data.planName,
                status: data.status,
                priceUsd: Number(data.priceUsd),
                rateBs: Number(data.rateBs),
                totalBs: Number(data.totalBs),
                paymentRef: data.paymentRef,
                paymentMethod: data.paymentMethod,
                startDate,
                expiresAt: data.expiresAt,
                prepaidMonths: months,
                lastReminderSent: decodedMeta.lastReminderSent || '',
                receiptImageUrl: existingLocal?.receiptImageUrl,
                membershipCount: existingLocal?.membershipCount || months,
                scannedAmountBs: existingLocal?.scannedAmountBs,
                expectedAmountBs: existingLocal?.expectedAmountBs,
                needsManualPhone:
                  existingLocal?.needsManualPhone ||
                  !data.phone ||
                  String(data.phone).trim() === '' ||
                  String(data.phone).includes('FALTA'),
                paidByPhone: existingLocal?.paidByPhone,
                paymentNote: existingLocal?.paymentNote,
                createdAtIso: existingLocal?.createdAtIso,
              };
            })
          );
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'memberships')
    );

    const orderQuery = query(collection(db, 'shop_orders'), where('ownerId', '==', uid));
    const unsubOrders = onSnapshot(
      orderQuery,
      async (snap) => {
        const validDocs = snap.docs.filter((d) => {
          if (isLegacyDemoId(d.id)) {
            deleteDoc(doc(db, 'shop_orders', d.id)).catch(() => {});
            return false;
          }
          return true;
        });
        setShopOrders((prev) => {
          const prevMap = new Map(prev.map((item) => [item.id, item]));
          return deduplicateShopOrders(
            validDocs.map((d) => {
              const data = d.data();
              const existingLocal = prevMap.get(d.id);
              return {
                id: d.id,
                ownerId: data.ownerId,
                phone: data.phone,
                itemsSummary: data.itemsSummary,
                categoryGroup: data.categoryGroup,
                status: data.status,
                totalUsd: Number(data.totalUsd),
                totalBs: Number(data.totalBs),
                paymentRef: data.paymentRef,
                pagoMovilTarget: data.pagoMovilTarget,
                receiptImageUrl: existingLocal?.receiptImageUrl,
                scannedAmountBs: existingLocal?.scannedAmountBs,
                expectedAmountBs: existingLocal?.expectedAmountBs,
                paymentNote: existingLocal?.paymentNote,
              };
            })
          );
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'shop_orders')
    );

    const prodQuery = query(collection(db, 'products'), where('ownerId', '==', uid));
    const unsubProducts = onSnapshot(
      prodQuery,
      async (snap) => {
        const validDocs = snap.docs.filter((d) => {
          if (isLegacyDemoId(d.id)) {
            deleteDoc(doc(db, 'products', d.id)).catch(() => {});
            return false;
          }
          return true;
        });
        setProducts(
          validDocs.map((d) => {
            const data = d.data();
            const usd = Number(data.basePriceUsd);
            const mode: RateMode =
              data.rateMode === 'auto_euro' || data.rateMode === 'manual'
                ? data.rateMode
                : 'auto_bcv';
            const bs =
              typeof data.priceBs === 'number'
                ? Number(data.priceBs)
                : Number((usd * getRateForMode(mode, settings)).toFixed(2));
            return {
              id: d.id,
              ownerId: data.ownerId,
              name: data.name,
              category: data.category,
              description: data.description,
              basePriceUsd: usd,
              priceBs: bs,
              rateMode: mode,
              isCustomBs: Boolean(data.isCustomBs),
              stock: Number(data.stock),
              available: Boolean(data.available),
            };
          })
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    return () => {
      unsubSettings();
      unsubMemberships();
      unsubOrders();
      unsubProducts();
    };
  }, [authReady, user]);

  const persistSettingsToFirestore = async (nextSettings: ExchangeSettings, uid: string) => {
    const docId = sanitizeId(
      nextSettings.id === 'default_settings' ? `settings_${uid}` : nextSettings.id
    );
    const payload = validateExchangeSettingsPayload(nextSettings, uid);
    try {
      await updateDoc(doc(db, 'exchange_settings', docId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch {
      try {
        await setDoc(doc(db, 'exchange_settings', docId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'exchange_settings');
      }
    }
  };

  const upsertMembershipRecord = async (record: MembershipRecord, isNew = false) => {
    const nextMemberships = memberships.some((m) => m.id === record.id)
      ? memberships.map((m) => (m.id === record.id ? record : m))
      : [record, ...memberships];
    setMemberships(nextMemberships);
    setNeedsBackupReminder(true);
    persistSnapshotNow({ memberships: nextMemberships });

    if (user) {
      const docId = sanitizeId(record.id);
      const payload = validateMembershipPayload(record, user.uid);
      try {
        if (isNew) {
          await setDoc(doc(db, 'memberships', docId), {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'memberships', docId), {
            phone: payload.phone,
            cedula: payload.cedula,
            firstName: payload.firstName,
            lastName: payload.lastName,
            planName: payload.planName,
            status: payload.status,
            priceUsd: payload.priceUsd,
            rateBs: payload.rateBs,
            totalBs: payload.totalBs,
            paymentRef: payload.paymentRef,
            paymentMethod: payload.paymentMethod,
            expiresAt: payload.expiresAt,
            lastReminderSent: payload.lastReminderSent,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, 'memberships');
      }
    }
  };

  const upsertShopOrderRecord = async (order: ShopOrderRecord, isNew = false) => {
    const nextOrders = shopOrders.some((o) => o.id === order.id)
      ? shopOrders.map((o) => (o.id === order.id ? order : o))
      : [order, ...shopOrders];
    setShopOrders(nextOrders);
    setNeedsBackupReminder(true);
    persistSnapshotNow({ shopOrders: nextOrders });

    if (user) {
      const docId = sanitizeId(order.id);
      const payload = validateShopOrderPayload(order, user.uid);
      try {
        if (isNew) {
          await setDoc(doc(db, 'shop_orders', docId), {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'shop_orders', docId), {
            status: payload.status,
            paymentRef: payload.paymentRef,
            totalUsd: payload.totalUsd,
            totalBs: payload.totalBs,
            pagoMovilTarget: payload.pagoMovilTarget,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, 'shop_orders');
      }
    }
  };

  // Delete membership -> Moves to DeletedMembershipsReport + triggers local download reminder!
  const handleDeleteMembershipRecord = async (memberId: string) => {
    const target = memberships.find((m) => m.id === memberId);
    if (!target) return;

    const deletedEntry: DeletedMembershipRecord = {
      ...target,
      deletedAt: new Date().toLocaleString('es-VE'),
    };

    const nextDeletedMemberships = [deletedEntry, ...deletedMemberships];
    const nextMemberships = memberships.filter((m) => m.id !== memberId);
    setDeletedMemberships(nextDeletedMemberships);
    setMemberships(nextMemberships);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedMemberships: nextDeletedMemberships,
      memberships: nextMemberships,
    });

    if (user) {
      try {
        await deleteDoc(doc(db, 'memberships', sanitizeId(memberId)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'memberships');
      }
    }
    showNotice(
      `Membresía de ${target.firstName || target.phone} movida al Reporte de Eliminados. Recuerda descargar tu respaldo en Excel/JSON.`,
      'warning'
    );
  };

  // Restore a deleted membership back to active list & Cloud
  const handleRestoreDeletedMembership = async (deletedItem: DeletedMembershipRecord) => {
    const { deletedAt: _deletedAt, deletedReason: _reason, ...restored } = deletedItem;
    setDeletedMemberships((prev) =>
      prev.filter((d) => !(d.id === deletedItem.id && d.deletedAt === deletedItem.deletedAt))
    );
    await upsertMembershipRecord(restored, true);
    showNotice(
      `Membresía de ${restored.firstName || restored.phone} restaurada exitosamente.`,
      'success'
    );
  };

  // Delete single product -> Moves to DeletedProductsReport + removes from Cloud
  const handleDeleteProductRecord = async (prodId: string) => {
    const target = products.find((p) => p.id === prodId);
    if (!target) return;

    const deletedEntry: DeletedProductRecord = {
      ...target,
      deletedAt: new Date().toLocaleString('es-VE'),
    };
    const nextDeletedProducts = [deletedEntry, ...deletedProducts];
    const nextProducts = products.filter((p) => p.id !== prodId);
    setDeletedProducts(nextDeletedProducts);
    setProducts(nextProducts);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedProducts: nextDeletedProducts,
      products: nextProducts,
    });

    if (user) {
      try {
        await deleteDoc(doc(db, 'products', sanitizeId(prodId)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'products');
      }
    }
    showNotice(
      `Producto "${target.name}" movido al Reporte de Eliminados. Puedes restaurarlo cuando quieras.`,
      'warning'
    );
  };

  // Delete entire products catalog database -> Moves all products to DeletedProductsReport
  const handleDeleteAllProductsDatabase = async () => {
    if (products.length === 0) return;
    const nowStr = new Date().toLocaleString('es-VE');
    const toDelete = [...products];
    const deletedEntries: DeletedProductRecord[] = toDelete.map((p) => ({
      ...p,
      deletedAt: nowStr,
    }));

    const nextDeletedProducts = [...deletedEntries, ...deletedProducts];
    setDeletedProducts(nextDeletedProducts);
    setProducts([]);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedProducts: nextDeletedProducts,
      products: [],
    });

    if (user) {
      for (const p of toDelete) {
        try {
          await deleteDoc(doc(db, 'products', sanitizeId(p.id)));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'products');
        }
      }
    }
    showNotice(
      `Se eliminaron ${toDelete.length} productos de la base de datos y se guardaron en el Reporte de Eliminados.`,
      'warning'
    );
  };

  // Restore a deleted product back to catalog & Cloud
  const handleRestoreDeletedProduct = async (deletedProd: DeletedProductRecord) => {
    const { deletedAt: _deletedAt, deletedReason: _reason, ...restored } = deletedProd;
    const nextDeletedProducts = deletedProducts.filter(
      (p) => !(p.id === deletedProd.id && p.deletedAt === deletedProd.deletedAt)
    );
    const nextProducts = [restored, ...products.filter((item) => item.id !== restored.id)];
    setDeletedProducts(nextDeletedProducts);
    setProducts(nextProducts);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedProducts: nextDeletedProducts,
      products: nextProducts,
    });

    if (user) {
      const payload = validateProductPayload(restored, user.uid);
      try {
        await setDoc(doc(db, 'products', sanitizeId(restored.id)), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'products');
      }
    }
    showNotice(`Producto "${restored.name}" restaurado al catálogo exitosamente.`, 'success');
  };

  // Delete single shop order / product sale -> Moves to DeletedShopOrdersReport
  const handleDeleteShopOrderRecord = async (orderId: string) => {
    const target = shopOrders.find((o) => o.id === orderId);
    if (!target) return;

    const digits = (target.phone || '').replace(/\D/g, '').slice(-10);
    const matchedMem = memberships.find(
      (m) =>
        (m.phone || '').replace(/\D/g, '').slice(-10) === digits &&
        m.firstName &&
        !m.firstName.toLowerCase().startsWith('operación:') &&
        !m.firstName.toLowerCase().startsWith('operacion:')
    );

    const deletedEntry: DeletedShopOrderRecord = {
      ...target,
      deletedAt: new Date().toLocaleString('es-VE'),
      buyerFullName:
        target.buyerName ||
        (matchedMem ? `${matchedMem.firstName} ${matchedMem.lastName}`.trim() : target.phone),
      buyerCedulaResolved: target.buyerCedula || matchedMem?.cedula || '',
    };

    const nextDeletedOrders = [deletedEntry, ...deletedShopOrders];
    const nextOrders = shopOrders.filter((o) => o.id !== orderId);
    setDeletedShopOrders(nextDeletedOrders);
    setShopOrders(nextOrders);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedShopOrders: nextDeletedOrders,
      shopOrders: nextOrders,
    });

    if (user) {
      try {
        await deleteDoc(doc(db, 'shop_orders', sanitizeId(orderId)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'shop_orders');
      }
    }
    showNotice(
      `Venta de producto (${target.itemsSummary}) movida al Reporte de Eliminados.`,
      'warning'
    );
  };

  // Delete entire shop orders / product sales database -> Moves all to DeletedShopOrdersReport
  const handleDeleteAllShopOrdersDatabase = async () => {
    if (shopOrders.length === 0) return;
    const nowStr = new Date().toLocaleString('es-VE');
    const toDelete = [...shopOrders];
    const deletedEntries: DeletedShopOrderRecord[] = toDelete.map((ord) => {
      const digits = (ord.phone || '').replace(/\D/g, '').slice(-10);
      const matchedMem = memberships.find(
        (m) =>
          (m.phone || '').replace(/\D/g, '').slice(-10) === digits &&
          m.firstName &&
          !m.firstName.toLowerCase().startsWith('operación:') &&
          !m.firstName.toLowerCase().startsWith('operacion:')
      );
      return {
        ...ord,
        deletedAt: nowStr,
        buyerFullName:
          ord.buyerName ||
          (matchedMem ? `${matchedMem.firstName} ${matchedMem.lastName}`.trim() : ord.phone),
        buyerCedulaResolved: ord.buyerCedula || matchedMem?.cedula || '',
      };
    });

    const nextDeletedOrders = [...deletedEntries, ...deletedShopOrders];
    setDeletedShopOrders(nextDeletedOrders);
    setShopOrders([]);
    setNeedsBackupReminder(true);
    persistSnapshotNow({
      deletedShopOrders: nextDeletedOrders,
      shopOrders: [],
    });

    if (user) {
      for (const ord of toDelete) {
        try {
          await deleteDoc(doc(db, 'shop_orders', sanitizeId(ord.id)));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'shop_orders');
        }
      }
    }
    showNotice(
      `Se eliminaron ${toDelete.length} ventas de productos de la base de datos y se guardaron en el Reporte de Eliminados.`,
      'warning'
    );
  };

  // Restore a deleted shop order / product sale back to active database & Cloud
  const handleRestoreDeletedShopOrder = async (deletedOrd: DeletedShopOrderRecord) => {
    const {
      deletedAt: _deletedAt,
      deletedReason: _reason,
      buyerFullName: _bfn,
      buyerCedulaResolved: _bcr,
      ...restored
    } = deletedOrd;
    setDeletedShopOrders((prev) =>
      prev.filter((o) => !(o.id === deletedOrd.id && o.deletedAt === deletedOrd.deletedAt))
    );
    await upsertShopOrderRecord(restored, true);
    showNotice(
      `Venta de producto (${restored.itemsSummary}) restaurada exitosamente.`,
      'success'
    );
  };

  const markDownloadTimestamp = () => {
    const nowStr = new Date().toLocaleString('es-VE');
    setLastLocalDownloadAt(nowStr);
    setNeedsBackupReminder(false);
    try {
      localStorage.setItem('formagym_last_download_at', nowStr);
    } catch {
      // ignore
    }
  };

  // Organized Excel (.CSV) Download with ALL sections (Memberships, Deleted Memberships, Shop Orders, Products)
  const handleDownloadOrganizedExcel = () => {
    const lines: string[][] = [];

    lines.push(['=== 1. MEMBRESIAS REGISTRADAS EN FORMAGYM ===']);
    lines.push([
      'Telefono',
      'Cedula',
      'Nombre',
      'Apellido',
      'Estado',
      'Plan',
      'Monto_USD',
      'Monto_Bs',
      'Referencia_PagoMovil',
      'Metodo_Pago',
      'Vencimiento',
    ]);
    memberships.forEach((m) => {
      lines.push([
        m.phone,
        m.cedula,
        m.firstName,
        m.lastName,
        STATUS_LABELS[m.status] || m.status,
        m.planName,
        m.priceUsd.toFixed(2),
        m.totalBs.toFixed(2),
        m.paymentRef,
        m.paymentMethod,
        m.expiresAt,
      ]);
    });

    lines.push([]);
    lines.push(['=== 2. REPORTE DE MEMBRESIAS ELIMINADAS (HISTORIAL DE SEGURIDAD) ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Telefono',
      'Cedula',
      'Nombre',
      'Apellido',
      'Monto_USD',
      'Monto_Bs',
      'Referencia_PagoMovil',
      'Vencimiento_Original',
    ]);
    deletedMemberships.forEach((d) => {
      lines.push([
        d.deletedAt,
        d.phone,
        d.cedula,
        d.firstName,
        d.lastName,
        d.priceUsd.toFixed(2),
        d.totalBs.toFixed(2),
        d.paymentRef,
        d.expiresAt,
      ]);
    });

    lines.push([]);
    lines.push(['=== 3. PEDIDOS DE TIENDA (JUGOS, BEBIDAS, COMIDA, ROPA) ===']);
    lines.push([
      'Telefono',
      'Productos',
      'Categoria',
      'Estado',
      'Total_USD',
      'Total_Bs',
      'Referencia_PagoMovil',
      'Cuenta_Destino',
    ]);
    shopOrders.forEach((o) => {
      lines.push([
        o.phone,
        o.itemsSummary,
        o.categoryGroup,
        o.status,
        o.totalUsd.toFixed(2),
        o.totalBs.toFixed(2),
        o.paymentRef,
        o.pagoMovilTarget,
      ]);
    });

    lines.push([]);
    lines.push(['=== 4. CATALOGO DE PRECIOS Y TASAS POR PRODUCTO ===']);
    lines.push(['Producto', 'Categoria', 'Precio_USD', 'Precio_Bs', 'Tasa_Asignada']);
    products.forEach((p) => {
      lines.push([
        p.name,
        p.category,
        p.basePriceUsd.toFixed(2),
        p.priceBs.toFixed(2),
        RATE_MODE_LABELS[p.rateMode] || p.rateMode,
      ]);
    });

    lines.push([]);
    lines.push(['=== 5. REPORTE DE PRODUCTOS ELIMINADOS DEL CATALOGO ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Producto',
      'Categoria',
      'Precio_USD',
      'Precio_Bs',
      'Tasa_Asignada',
      'Disponibilidad',
    ]);
    deletedProducts.forEach((dp) => {
      lines.push([
        dp.deletedAt,
        dp.name,
        dp.category,
        dp.basePriceUsd.toFixed(2),
        dp.priceBs.toFixed(2),
        RATE_MODE_LABELS[dp.rateMode] || dp.rateMode,
        dp.available !== false ? 'Con Stock' : 'Sin Stock',
      ]);
    });

    lines.push([]);
    lines.push(['=== 6. REPORTE DE VENTAS DE PRODUCTOS / PEDIDOS ELIMINADOS ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Cliente',
      'Telefono',
      'Productos_Vendidos',
      'Categoria',
      'Total_USD',
      'Total_Bs',
      'Referencia_PagoMovil',
      'Cuenta_Destino',
    ]);
    deletedShopOrders.forEach((doItem) => {
      lines.push([
        doItem.deletedAt,
        doItem.buyerFullName || doItem.buyerName || doItem.phone,
        doItem.phone,
        doItem.itemsSummary,
        doItem.categoryGroup,
        doItem.totalUsd.toFixed(2),
        doItem.totalBs.toFixed(2),
        doItem.paymentRef,
        doItem.pagoMovilTarget,
      ]);
    });

    const csvContent =
      '\uFEFF' +
      lines
        .map((row) =>
          row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formagym_base_datos_organizada_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    markDownloadTimestamp();
    showNotice('Base de datos completa descargada en Excel (.CSV) organizada.', 'success');
  };

  const handleDownloadDeletedOnlyCsv = () => {
    const lines: string[][] = [];

    lines.push(['=== 1. MEMBRESIAS ELIMINADAS ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Telefono',
      'Cedula',
      'Nombre',
      'Apellido',
      'Monto_USD',
      'Monto_Bs',
      'Referencia_PagoMovil',
      'Vencimiento_Original',
    ]);
    deletedMemberships.forEach((d) => {
      lines.push([
        d.deletedAt,
        d.phone,
        d.cedula,
        d.firstName,
        d.lastName,
        d.priceUsd.toFixed(2),
        d.totalBs.toFixed(2),
        d.paymentRef,
        d.expiresAt,
      ]);
    });

    lines.push([]);
    lines.push(['=== 2. PRODUCTOS ELIMINADOS DEL CATALOGO ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Producto',
      'Categoria',
      'Precio_USD',
      'Precio_Bs',
      'Tasa_Asignada',
      'Disponibilidad',
    ]);
    deletedProducts.forEach((dp) => {
      lines.push([
        dp.deletedAt,
        dp.name,
        dp.category,
        dp.basePriceUsd.toFixed(2),
        dp.priceBs.toFixed(2),
        RATE_MODE_LABELS[dp.rateMode] || dp.rateMode,
        dp.available !== false ? 'Con Stock' : 'Sin Stock',
      ]);
    });

    lines.push([]);
    lines.push(['=== 3. VENTAS DE PRODUCTOS / PEDIDOS ELIMINADOS ===']);
    lines.push([
      'Fecha_Eliminacion',
      'Cliente',
      'Telefono',
      'Productos_Vendidos',
      'Categoria',
      'Total_USD',
      'Total_Bs',
      'Referencia_PagoMovil',
      'Cuenta_Destino',
    ]);
    deletedShopOrders.forEach((doItem) => {
      lines.push([
        doItem.deletedAt,
        doItem.buyerFullName || doItem.buyerName || doItem.phone,
        doItem.phone,
        doItem.itemsSummary,
        doItem.categoryGroup,
        doItem.totalUsd.toFixed(2),
        doItem.totalBs.toFixed(2),
        doItem.paymentRef,
        doItem.pagoMovilTarget,
      ]);
    });

    const csvContent =
      '\uFEFF' +
      lines
        .map((row) =>
          row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formagym_reporte_eliminados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    markDownloadTimestamp();
    showNotice('Reporte completo de eliminados descargado en Excel (.CSV).', 'success');
  };

  // Organized JSON Download with all collections
  const handleDownloadOrganizedJson = () => {
    const organizedPayload = {
      metadata: {
        exportedAt: new Date().toISOString(),
        businessName: settings.businessName,
        cloudDatabaseId: 'ai-studio-7f6c7aef-5816-4e5d-af50-94313fbe6f39',
        counts: {
          activeAndPendingMemberships: memberships.length,
          deletedMemberships: deletedMemberships.length,
          deletedProducts: deletedProducts.length,
          deletedShopOrders: deletedShopOrders.length,
          shopOrders: shopOrders.length,
          products: products.length,
        },
      },
      configuracionBotYTasas: settings,
      membresiasRegistradas: memberships,
      reporteMembresiasEliminadas: deletedMemberships,
      reporteProductosEliminados: deletedProducts,
      reporteVentasProductosEliminadas: deletedShopOrders,
      pedidosDeTienda: shopOrders,
      catalogoProductosYPrecios: products,
    };

    const blob = new Blob([JSON.stringify(organizedPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formagym_base_datos_organizada_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    markDownloadTimestamp();
    showNotice('Base de datos organizada descargada en formato .JSON.', 'success');
  };

  // Human Confirmation 1: Confirm Membership Pago Móvil + Send WhatsApp via Baileys & activate profile conversation
  const handleHumanConfirmPayment = async (member: MembershipRecord) => {
    const todayIso = getTodayIsoDate();

    // Find all pending memberships sharing the same paymentRef & phone (e.g., 3 memberships paid together)
    const siblingPending = memberships.filter(
      (m) =>
        m.status === 'pending_payment' &&
        m.phone === member.phone &&
        m.paymentRef === member.paymentRef
    );
    const groupToApprove = siblingPending.length > 0 ? siblingPending : [member];

    let anyNeedsProfile = false;
    let computedExpiry = addCalendarMonths(todayIso, 1);

    for (const item of groupToApprove) {
      const hasRealName =
        Boolean(item.firstName.trim()) &&
        !item.firstName.trim().toLowerCase().startsWith('operación:') &&
        !item.firstName.trim().toLowerCase().startsWith('operacion:');
      const hasProfileAlready = Boolean(item.cedula.trim()) && hasRealName;
      if (!hasProfileAlready) anyNeedsProfile = true;
      const nextStatus: MembershipStatus = hasProfileAlready ? 'active' : 'awaiting_profile';

      const startDate = item.startDate || todayIso;
      const prepaidMonths = Math.max(1, item.prepaidMonths || 1);
      computedExpiry = addCalendarMonths(startDate, prepaidMonths);

      await upsertMembershipRecord(
        {
          ...item,
          status: nextStatus,
          startDate,
          prepaidMonths,
          expiresAt: computedExpiry,
        },
        false
      );
    }

    try {
      const res = await fetch('/api/bot/notify-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: member.phone,
          clientPhone: member.phone,
          paymentRef: member.paymentRef,
          reference: member.paymentRef,
          membershipCount: groupToApprove.length,
          planName: member.planName,
          alreadyHasProfile: !anyNeedsProfile,
          memberName: `${member.firstName} ${member.lastName}`.trim(),
          memberCedula: member.cedula,
          expiresAt: computedExpiry,
        }),
      });
      const notifyData = res.ok ? await res.json() : null;
      const wasSent = Boolean(notifyData?.sent);

      showNotice(
        `Pago de membresía (Operación: ${member.paymentRef}) aprobado para ${member.phone}. ${
          !anyNeedsProfile
            ? `Membresía ACTIVA hasta el ${formatSpanishDate(computedExpiry)}.`
            : wasSent
            ? `Se notificó por WhatsApp a ${member.phone} pidiendo Nombre, Apellido y Cédula (${groupToApprove.length} ${
                groupToApprove.length === 1 ? 'membresía' : 'membresías'
              }).`
            : `El bot quedó listo esperando que ${member.phone} responda su Nombre y Cédula (conecta Baileys en Configuración si deseas el envío automático a WhatsApp).`
        }`,
        'success'
      );
    } catch {
      showNotice(
        `Pago de membresía (Operación: ${member.paymentRef}) aprobado para ${member.phone}.`,
        'success'
      );
    }
  };

  // Human Confirmation 2: Confirm Non-Membership Shop Order Pago Móvil + Send WhatsApp via Baileys
  const handleHumanConfirmShopOrder = async (order: ShopOrderRecord) => {
    await upsertShopOrderRecord(
      {
        ...order,
        status: 'confirmed',
      },
      false
    );

    const msg = `✅ *¡Tu pago fue aprobado en ${settings.businessName}!*\n\n• *Pedido:* ${
      order.itemsSummary
    }\n• *Monto Verificado:* $${order.totalUsd.toFixed(2)} USD / *Bs. ${order.totalBs.toFixed(
      2
    )}*\n\n¡Ya puedes retirar tu pedido!`;

    fetch('/api/baileys/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: order.phone, message: msg }),
    }).catch(() => {});

    showNotice(
      `Pago Móvil de tienda aprobado para ${order.phone} (${order.itemsSummary}).`,
      'success'
    );
  };

  const handleSendRenewalReminder = async (member: MembershipRecord) => {
    const todayStr = getTodayIsoDate();
    const fullName = member.firstName
      ? `${member.firstName} ${member.lastName}`.trim()
      : member.phone;
    const expSpanish = formatSpanishDate(member.expiresAt);

    const memProd = products.find((p) => p.category === 'membresias');
    const usdToCharge = memProd ? memProd.basePriceUsd : settings.membershipMonthlyUsd;
    const bsToCharge = memProd ? memProd.priceBs : settings.membershipMonthlyBs;

    const reminderMsg = `🔔 *Recordatorio de Vencimiento — ${
      settings.businessName
    }*\n\nHola *${fullName}*, te recordamos que tu membresía vence el día *${expSpanish}* (*${
      member.expiresAt
    }*).\n\n💵 *Monto de Renovación:*\n• En Dólares: *$${usdToCharge.toFixed(
      2
    )} USD*\n• En Bolívares: *Bs. ${bsToCharge.toFixed(
      2
    )}*\n\n📲 *Para pagos de Mensualidad y Ropa:*\nBanco de Venezuela\n18318153\n04146734866.`;

    fetch('/api/baileys/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: member.phone, message: reminderMsg }),
    }).catch(() => {});

    await upsertMembershipRecord({ ...member, lastReminderSent: todayStr }, false);
    showNotice(
      `Recordatorio enviado por WhatsApp a ${fullName} (${member.phone}) — Vence el ${expSpanish}.`,
      'success'
    );
  };

  const handleBulkRenewalNotifications = async () => {
    const targets = memberships.filter(
      (m) => m.status === 'expiring_soon' || m.status === 'expired'
    );
    if (targets.length === 0) {
      showNotice('No hay miembros por vencer o vencidos en este momento.', 'info');
      return;
    }
    for (const m of targets) {
      await handleSendRenewalReminder(m);
    }
  };

  // Shop Price Management Handlers — Preserves edited USD prices!
  const handleSaveSingleProduct = async (updatedProd: ProductItem, silent = false) => {
    const nextProducts = products.map((p) => (p.id === updatedProd.id ? updatedProd : p));
    setProducts(nextProducts);
    setNeedsBackupReminder(true);

    let nextSettings = settings;
    if (updatedProd.category === 'membresias') {
      nextSettings = {
        ...settings,
        mode: updatedProd.rateMode || settings.mode,
        activeRate: getRateForMode(updatedProd.rateMode || settings.mode, settings),
        membershipMonthlyUsd: updatedProd.basePriceUsd,
        membershipMonthlyBs: updatedProd.priceBs,
      };
      setSettings(nextSettings);
      if (user) {
        await persistSettingsToFirestore(nextSettings, user.uid);
      }
    }

    persistSnapshotNow({ products: nextProducts, settings: nextSettings });

    if (user) {
      const payload = validateProductPayload(updatedProd, user.uid);
      try {
        await updateDoc(doc(db, 'products', updatedProd.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'products');
      }
    }

    if (!silent) {
      showNotice(
        `Precio guardado: ${updatedProd.name} ($${updatedProd.basePriceUsd.toFixed(
          2
        )} USD / Bs. ${updatedProd.priceBs.toFixed(2)} — Tasa: ${
          RATE_MODE_LABELS[updatedProd.rateMode]
        })`,
        'success'
      );
    }
  };

  const handleSaveAllDraftPrices = async (updatedList: ProductItem[]) => {
    setProducts(updatedList);
    setNeedsBackupReminder(true);

    let nextSettings = settings;
    const memProd = updatedList.find((p) => p.category === 'membresias');
    if (memProd) {
      nextSettings = {
        ...settings,
        mode: memProd.rateMode || settings.mode,
        activeRate: getRateForMode(memProd.rateMode || settings.mode, settings),
        membershipMonthlyUsd: memProd.basePriceUsd,
        membershipMonthlyBs: memProd.priceBs,
      };
      setSettings(nextSettings);
      if (user) {
        await persistSettingsToFirestore(nextSettings, user.uid);
      }
    }

    persistSnapshotNow({ products: updatedList, settings: nextSettings });

    if (user) {
      for (const prod of updatedList) {
        const payload = validateProductPayload(prod, user.uid);
        try {
          await updateDoc(doc(db, 'products', prod.id), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'products');
        }
      }
    }
    showNotice('Todos los precios en USD, Bolívares y tasas por producto fueron guardados.', 'success');
  };

  const handleApplyRateToAllProducts = async (overrideSettings?: ExchangeSettings) => {
    const activeSettings = overrideSettings || settings;

    const updatedProducts = products.map((p) => {
      const prodRate = getRateForMode(p.rateMode || activeSettings.mode, activeSettings);
      const nextBs = Number((p.basePriceUsd * prodRate).toFixed(2));
      return {
        ...p,
        priceBs: nextBs,
        isCustomBs: false,
      };
    });

    const memProd = updatedProducts.find((p) => p.category === 'membresias');
    const nextMemUsd = memProd ? memProd.basePriceUsd : activeSettings.membershipMonthlyUsd;
    const nextMemRate = memProd
      ? getRateForMode(memProd.rateMode, activeSettings)
      : activeSettings.activeRate;
    const nextMemBs = Number((nextMemUsd * nextMemRate).toFixed(2));
    const nextRegUsd = activeSettings.registrationUsd ?? 15;
    const nextRegBs = Number((nextRegUsd * nextMemRate).toFixed(2));

    const nextSettings: ExchangeSettings = {
      ...activeSettings,
      membershipMonthlyUsd: nextMemUsd,
      membershipMonthlyBs: nextMemBs,
      registrationUsd: nextRegUsd,
      registrationBs: nextRegBs,
    };
    setSettings(nextSettings);
    if (user) {
      await persistSettingsToFirestore(nextSettings, user.uid);
    }

    await handleSaveAllDraftPrices(updatedProducts);
    showNotice(
      'Se calculó el equivalente en Bolívares de cada producto, membresía e inscripción respetando tus precios en USD ($).',
      'success'
    );
  };

  // Verify or Reject whether a client is already registered for life when they claim to be registered
  const handleVerifyRegistration = async (member: MembershipRecord, approved: boolean) => {
    try {
      await fetch('/api/bot/verify-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          phone: member.phone,
          cedula: member.cedula,
          firstName: member.firstName,
          lastName: member.lastName,
          approved,
        }),
      });
    } catch {
      // ignore network error
    }

    if (approved) {
      await upsertMembershipRecord(
        {
          ...member,
          isRegisteredForLife: true,
          includesRegistration: false,
          status: member.status === 'pending_registration_check' ? 'expired' : member.status,
          planName: `Inscrito Vitalicio — Pendiente Pago Mensualidad (${settings.businessName})`,
        },
        false
      );
      showNotice(
        `✅ Confirmaste que ${member.firstName} ${member.lastName} (${member.cedula}) SÍ está inscrito de por vida. El bot ya le notificó que solo debe pagar la mensualidad ($${settings.membershipMonthlyUsd.toFixed(2)} USD).`,
        'success'
      );
    } else {
      const nextMemberships = memberships.filter((m) => m.id !== member.id);
      setMemberships(nextMemberships);
      persistSnapshotNow({ memberships: nextMemberships });
      if (user) {
        deleteDoc(doc(db, 'memberships', sanitizeId(member.id))).catch(() => {});
      }
      const regUsd = settings.registrationUsd ?? 15;
      const totalNewUsd = regUsd + settings.membershipMonthlyUsd;
      showNotice(
        `ℹ️ Indicaste que ${member.firstName} ${member.lastName} NO está inscrito. El bot le notificó por WhatsApp que debe pagar Inscripción Vitalicia ($${regUsd.toFixed(2)}) + Mensualidad ($${settings.membershipMonthlyUsd.toFixed(2)}) = $${totalNewUsd.toFixed(2)} USD.`,
        'info'
      );
    }
  };

  const stats = useMemo(() => {
    const active = memberships.filter((m) => m.status === 'active').length;
    const pendingMem = memberships.filter((m) => m.status === 'pending_payment').length;
    const awaitingProfile = memberships.filter((m) => m.status === 'awaiting_profile').length;
    const pendingShop = shopOrders.filter((o) => o.status === 'pending_approval').length;
    const confirmedShop = shopOrders.filter((o) => o.status === 'confirmed').length;
    const expiring = memberships.filter((m) => m.status === 'expiring_soon').length;
    const expired = memberships.filter((m) => m.status === 'expired').length;

    const totalMemUsd = memberships
      .filter((m) => m.status !== 'pending_payment')
      .reduce((acc, m) => acc + (m.priceUsd || 0), 0);
    const totalMemBs = memberships
      .filter((m) => m.status !== 'pending_payment')
      .reduce((acc, m) => acc + (m.totalBs || 0), 0);

    const totalShopUsd = shopOrders
      .filter((o) => o.status === 'confirmed')
      .reduce((acc, o) => acc + (o.totalUsd || 0), 0);
    const totalShopBs = shopOrders
      .filter((o) => o.status === 'confirmed')
      .reduce((acc, o) => acc + (o.totalBs || 0), 0);

    return {
      active,
      pendingMem,
      awaitingProfile,
      pendingShop,
      confirmedShop,
      expiring,
      expired,
      totalMemUsd,
      totalMemBs,
      totalShopUsd,
      totalShopBs,
    };
  }, [memberships, shopOrders]);

  const filteredMemberships = useMemo(() => {
    return memberships.filter((m) => {
      const matchesFilter = memberFilter === 'all' || m.status === memberFilter;
      const q = memberSearch.toLowerCase().trim();
      if (!q) return matchesFilter;
      const full = `${m.firstName} ${m.lastName} ${m.cedula} ${m.phone} ${m.paymentRef}`.toLowerCase();
      return matchesFilter && full.includes(q);
    });
  }, [memberships, memberFilter, memberSearch]);

  if (loggedInUsername !== 'formatilin') {
    return (
      <LoginScreen
        onLoginSuccess={(uname) => {
          try {
            localStorage.setItem(LOCAL_AUTH_KEY, uname);
          } catch {
            // ignore
          }
          setLoggedInUsername(uname);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Clean Navigation + Simplified/Statistics Toggle + Download Button */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('memberships');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {settings.businessName || 'FormaGym'}
          </a>

          <nav className="hidden xl:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              onClick={() => setActiveSection('memberships')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'memberships'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Membresías ({memberships.length})
            </button>
            <button
              onClick={() => setActiveSection('approvals')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeSection === 'approvals'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Aprobar Pagos ({stats.pendingMem + stats.pendingShop})</span>
              {stats.pendingMem + stats.pendingShop > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-slate-950 rounded-full">
                  {stats.pendingMem + stats.pendingShop}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveSection('analytics')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeSection === 'analytics'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Gráficas y Finanzas</span>
            </button>
            <button
              onClick={() => setActiveSection('shop')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'shop'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Tienda y Precios ({products.length})
            </button>
            <button
              onClick={() => setActiveSection('deleted_report')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'deleted_report'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Reporte Eliminados (
              {deletedMemberships.length + deletedProducts.length + deletedShopOrders.length})
            </button>
            <button
              onClick={() => setActiveSection('config')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeSection === 'config'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configuración</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* UI Mode Toggle: Simplified vs Statistics */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleToggleUiMode('simplified')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                uiMode === 'simplified'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Simplificado</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleUiMode('statistics')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                uiMode === 'statistics'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Estadísticas</span>
            </button>
          </div>

          {/* Direct Organized Download Buttons */}
          <button
            type="button"
            onClick={handleDownloadOrganizedExcel}
            className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Descargar toda la base de datos organizada en Excel (.CSV)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Descargar Excel</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadOrganizedJson}
            className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Descargar toda la base de datos organizada en formato .JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">.JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('config')}
            className="hidden md:flex px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Ver enlace de la página web independiente 24/7 y control de encendido/apagado"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Web 24/7 Activa</span>
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(LOCAL_AUTH_KEY);
              } catch {
                // ignore
              }
              setLoggedInUsername(null);
            }}
            className="px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="xl:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {(
          [
            ['memberships', `Membresías (${memberships.length})`],
            ['approvals', `Aprobar Pagos (${stats.pendingMem + stats.pendingShop})`],
            ['analytics', 'Gráficas y Finanzas'],
            ['shop', `Precios (${products.length})`],
            [
              'deleted_report',
              `Eliminados (${
                deletedMemberships.length + deletedProducts.length + deletedShopOrders.length
              })`,
            ],
            ['config', 'Configuración'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Live Notice Banner */}
      {bannerMessage && (
        <div className="bg-slate-900 text-white px-6 py-3 text-sm flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bannerMessage.text}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-xs text-slate-400 hover:text-white whitespace-nowrap cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Automatic Reminder Banner When Payments/Memberships/Products Change or Are Deleted */}
      {(needsBackupReminder ||
        deletedMemberships.length > 0 ||
        deletedProducts.length > 0 ||
        deletedShopOrders.length > 0) &&
        activeSection !== 'deleted_report' && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Respaldo de Seguridad:</strong> Tienes{' '}
                <strong>{memberships.length} membresías</strong>,{' '}
                <strong>{products.length} productos</strong> y{' '}
                <strong>
                  {deletedMemberships.length + deletedProducts.length + deletedShopOrders.length}{' '}
                  registros en el Reporte de Eliminados
                </strong>
                . Descarga tu copia local en Excel o JSON para asegurar que ningún registro se pierda.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadOrganizedExcel}
                className="px-3 py-1 bg-amber-900 hover:bg-amber-950 text-white font-semibold rounded cursor-pointer"
              >
                Descargar Excel Ahora (.CSV)
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('deleted_report')}
                className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold rounded cursor-pointer"
              >
                Ver Eliminados (
                {deletedMemberships.length + deletedProducts.length + deletedShopOrders.length})
              </button>
            </div>
          </div>
        )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* STATISTICS VIEW MODE DASHBOARD (Only visible when uiMode === 'statistics') */}
        {uiMode === 'statistics' && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 bg-white border border-slate-200 rounded-xl p-5">
              <div className="pr-4 lg:border-r border-slate-100">
                <p className="text-xs text-slate-500">Miembros Activos</p>
                <p className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                  {stats.active}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Por vencer: {stats.expiring} · Vencidos: {stats.expired}
                </p>
              </div>

              <div className="pr-4 lg:border-r border-slate-100">
                <p className="text-xs text-slate-500">Ingresos Membresías</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  ${stats.totalMemUsd.toFixed(2)} USD
                </p>
                <p className="text-xs text-emerald-700 font-mono tabular-nums mt-0.5">
                  Bs. {stats.totalMemBs.toFixed(2)}
                </p>
              </div>

              <div className="pr-4 lg:border-r border-slate-100">
                <p className="text-xs text-slate-500">Ingresos Tienda Confirmados</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  ${stats.totalShopUsd.toFixed(2)} USD
                </p>
                <p className="text-xs text-blue-700 font-mono tabular-nums mt-0.5">
                  Bs. {stats.totalShopBs.toFixed(2)} ({stats.confirmedShop} pedidos)
                </p>
              </div>

              <div className="pr-4 lg:border-r border-slate-100">
                <p className="text-xs text-slate-500">Pagos por Aprobar</p>
                <p className="text-base font-bold text-amber-600 font-mono tabular-nums mt-0.5">
                  {stats.pendingMem} Membresías
                </p>
                <p className="text-xs text-blue-600 font-mono tabular-nums mt-0.5">
                  {stats.pendingShop} Pedidos Tienda
                </p>
              </div>

              <div className="pr-4 lg:border-r border-slate-100">
                <p className="text-xs text-slate-500">Tasas del Día (Ocultas)</p>
                <p className="text-xs font-bold text-slate-900 font-mono tabular-nums mt-1">
                  BCV: Bs. {settings.bcvRate.toFixed(2)} · EUR: Bs. {settings.euroRate.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  Manual: Bs. {settings.manualRate.toFixed(2)}
                </p>
              </div>

              <div className="flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Almacenamiento Nube</span>
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <p className="text-xs font-mono text-slate-800 truncate mt-0.5">
                  Eliminados guardados:{' '}
                  {deletedMemberships.length + deletedProducts.length + deletedShopOrders.length}
                </p>
                <button
                  onClick={handleBulkRenewalNotifications}
                  className="mt-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Avisar Vencimientos ({stats.expiring + stats.expired})</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 1: MEMBERSHIPS & PENDING PAGO MÓVIL APPROVALS */}
        {activeSection === 'memberships' && (
          <div className="space-y-6">
            {/* ALERT FOR MEMBERSHIPS PAID BY ANOTHER PERSON MISSING PHONE NUMBER */}
            {memberships.some(
              (m) => m.needsManualPhone || !m.phone || !m.phone.trim() || m.phone.includes('FALTA')
            ) && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-950">
                      ⚠️ Alerta: Membresías pagadas por otra persona (Falta agregar Teléfono manualmente)
                    </h3>
                    <p className="text-xs text-amber-900 mt-0.5">
                      Estas membresías fueron pagadas desde el WhatsApp de otro cliente. Ingresa el número de teléfono real de cada persona para que el bot los reconozca y les avise 5 días antes de vencer:
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {memberships
                    .filter(
                      (m) =>
                        m.needsManualPhone || !m.phone || !m.phone.trim() || m.phone.includes('FALTA')
                    )
                    .map((missingMem) => (
                      <div
                        key={missingMem.id}
                        className="bg-white border border-amber-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">
                            {missingMem.firstName} {missingMem.lastName}
                          </span>{' '}
                          <span className="font-mono text-slate-600">({missingMem.cedula})</span>
                          {missingMem.paidByPhone && (
                            <span className="text-slate-500 ml-2">
                              · Pagado por: <span className="font-mono">{missingMem.paidByPhone}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={manualPhoneInputs[missingMem.id] ?? ''}
                            onChange={(e) =>
                              setManualPhoneInputs((prev) => ({
                                ...prev,
                                [missingMem.id]: e.target.value,
                              }))
                            }
                            placeholder="+58 412-1234567"
                            className="px-3 py-1.5 border border-amber-300 rounded-lg font-mono text-xs w-44"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const entered = (manualPhoneInputs[missingMem.id] || '').trim();
                              if (!entered) return;
                              await upsertMembershipRecord(
                                {
                                  ...missingMem,
                                  phone: entered,
                                  needsManualPhone: false,
                                },
                                false
                              );
                              showNotice(
                                `Teléfono ${entered} asignado manualmente a ${missingMem.firstName} ${missingMem.lastName}.`,
                                'success'
                              );
                            }}
                            className="px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white font-bold rounded-lg cursor-pointer"
                          >
                            Guardar Teléfono
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Quick Pending Payments Status Bar for Admin */}
            <div
              className={`border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 ${
                stats.pendingMem + stats.pendingShop > 0
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {stats.pendingMem + stats.pendingShop > 0 ? (
                  <ScanLine className="w-5 h-5 text-amber-700 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <div className="text-xs">
                  {stats.pendingMem + stats.pendingShop > 0 ? (
                    <span>
                      <strong>
                        Hay {stats.pendingMem + stats.pendingShop} pago(s) pendiente(s) por aprobar:
                      </strong>{' '}
                      {stats.pendingMem} de Membresías y {stats.pendingShop} de Productos/Tienda. También puedes escribir{' '}
                      <code className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                        pagos pendientes
                      </code>{' '}
                      desde tu WhatsApp de administrador para revisarlos.
                    </span>
                  ) : (
                    <span>
                      <strong>Estado de Pagos Pendientes:</strong> No hay pagos pendientes por aprobar en este momento (0 de membresías y 0 de tienda).
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('approvals')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer ${
                  stats.pendingMem + stats.pendingShop > 0
                    ? 'bg-amber-900 hover:bg-amber-950 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>
                  {stats.pendingMem + stats.pendingShop > 0
                    ? `Revisar y Aprobar Pagos (${stats.pendingMem + stats.pendingShop})`
                    : 'Abrir Centro de Pagos Pendientes'}
                </span>
              </button>
            </div>

            {/* Pending Approvals Row (Only shows when there are pending items in Simplified mode, or always in Statistics mode) */}
            {(uiMode === 'statistics' || stats.pendingMem > 0 || stats.pendingShop > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Queue A: Pending Membership Pago Móviles */}
                <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Pagos de Membresía Pendientes ({stats.pendingMem})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Redirigidos a {settings.ownerPhoneMemberships} (BDV 18318153)
                      </p>
                    </div>
                  </div>

                  {stats.pendingMem === 0 ? (
                    <div className="py-5 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                      No hay pagos de membresía pendientes por aprobar.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {memberships
                        .filter((m) => m.status === 'pending_payment')
                        .map((pending) => {
                          const opLabel =
                            pending.firstName &&
                            (pending.firstName.toLowerCase().startsWith('operación:') ||
                              pending.firstName.toLowerCase().startsWith('operacion:'))
                              ? pending.firstName
                              : `Operación: ${pending.paymentRef}`;
                          return (
                            <div
                              key={pending.id}
                              className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {pending.receiptImageUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewReceiptModal({
                                        imageUrl: pending.receiptImageUrl!,
                                        title: pending.planName,
                                        phone: pending.phone,
                                        operationRef: pending.paymentRef,
                                      })
                                    }
                                    className="relative group shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-emerald-300 bg-slate-100 cursor-pointer"
                                    title="Ver captura del Pago Móvil"
                                  >
                                    <img
                                      src={pending.receiptImageUrl}
                                      alt="Pago Móvil"
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Eye className="w-4 h-4" />
                                    </span>
                                  </button>
                                ) : (
                                  <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                                    <ScanLine className="w-4 h-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                                      {pending.phone}
                                    </span>
                                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold font-mono rounded-md">
                                      {opLabel}
                                    </span>
                                    {pending.lastName && (
                                      <span className="text-[11px] text-slate-500 font-medium">
                                        {pending.lastName}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-700 font-medium mt-0.5">
                                    {pending.planName}
                                  </p>
                                  <div className="mt-1 bg-slate-50 border border-slate-200 rounded p-2 text-[11px] space-y-0.5">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-slate-500">Monto escaneado (Arriba):</span>
                                      <span className="font-mono font-bold text-slate-900">
                                        Bs. {(pending.scannedAmountBs ?? pending.totalBs).toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-0.5">
                                      <span className="text-slate-500">Debería decir (Abajo):</span>
                                      <span className="font-mono font-bold text-emerald-700">
                                        Bs. {(pending.expectedAmountBs ?? pending.totalBs).toFixed(2)} ($
                                        {pending.priceUsd.toFixed(2)})
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-1">
                                    También puedes aprobar respondiendo{' '}
                                    <span className="font-mono font-semibold text-slate-700">
                                      yes
                                    </span>{' '}
                                    o{' '}
                                    <span className="font-mono font-semibold text-slate-700">
                                      aprobado
                                    </span>{' '}
                                    desde el WhatsApp admin ({settings.ownerPhoneMemberships}).
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {pending.receiptImageUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewReceiptModal({
                                        imageUrl: pending.receiptImageUrl!,
                                        title: pending.planName,
                                        phone: pending.phone,
                                        operationRef: pending.paymentRef,
                                      })
                                    }
                                    className="px-2.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1 cursor-pointer"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>Ver Foto</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleHumanConfirmPayment(pending)}
                                  className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Aprobar Membresía</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Queue B: Separate Pending Shop Orders */}
                <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Pagos de Tienda Pendientes — Jugos, Bebidas y Comida ({stats.pendingShop})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Redirigidos a {settings.ownerPhoneConsumables} (BDV 17636777)
                    </p>
                  </div>

                  {stats.pendingShop === 0 ? (
                    <div className="py-5 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                      No hay pedidos de tienda pendientes por aprobar.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {shopOrders
                        .filter((o) => o.status === 'pending_approval')
                        .map((ord) => (
                          <div
                            key={ord.id}
                            className="py-3 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {ord.receiptImageUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewReceiptModal({
                                      imageUrl: ord.receiptImageUrl!,
                                      title: ord.itemsSummary,
                                      phone: ord.phone,
                                      operationRef: ord.paymentRef,
                                    })
                                  }
                                  className="relative group shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-blue-300 bg-slate-100 cursor-pointer"
                                  title="Ver captura del Pago Móvil"
                                >
                                  <img
                                    src={ord.receiptImageUrl}
                                    alt="Pago Móvil Tienda"
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye className="w-3.5 h-3.5" />
                                  </span>
                                </button>
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                                    {ord.phone}
                                  </span>
                                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold font-mono rounded-md">
                                    Operación: {ord.paymentRef}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 font-medium mt-0.5">
                                  {ord.itemsSummary} ·{' '}
                                  <span className="font-mono font-semibold text-slate-900">
                                    ${ord.totalUsd.toFixed(2)} = Bs. {ord.totalBs.toFixed(2)}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {ord.receiptImageUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewReceiptModal({
                                      imageUrl: ord.receiptImageUrl!,
                                      title: ord.itemsSummary,
                                      phone: ord.phone,
                                      operationRef: ord.paymentRef,
                                    })
                                  }
                                  className="px-2.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-blue-700" />
                                  <span>Ver Foto</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleHumanConfirmShopOrder(ord)}
                                className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Aprobar Pedido</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Complete Memberships Table (Adapts to Simplified vs Statistics Mode) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Membresías de {settings.businessName} ({memberships.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {uiMode === 'simplified'
                      ? 'Vista Simplificada activa — cambia a "Estadísticas" arriba para ver todos los detalles financieros.'
                      : 'Vista de Estadísticas Completa — sincronizada con Firebase Cloud y respaldo local.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Buscar cédula, nombre, teléfono..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setModalEditRecord(null);
                      setShowAddMembershipModal(true);
                    }}
                    className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Membresía</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(
                  [
                    ['all', `Todos (${memberships.length})`],
                    ['active', `Activos (${stats.active})`],
                    [
                      'pending_registration_check',
                      `Verificar Inscripción (${
                        memberships.filter((m) => m.status === 'pending_registration_check').length
                      })`,
                    ],
                    ['pending_payment', `Pago Pendiente (${stats.pendingMem})`],
                    ['awaiting_profile', `Falta Cédula (${stats.awaitingProfile})`],
                    ['expiring_soon', `Por Vencer (${stats.expiring})`],
                    ['expired', `Vencidos (${stats.expired})`],
                  ] as const
                ).map(([statusKey, label]) => (
                  <button
                    key={statusKey}
                    onClick={() => setMemberFilter(statusKey)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      memberFilter === statusKey
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-3">Miembro</th>
                      <th className="py-3 px-3">Teléfono</th>
                      <th className="py-3 px-3">Cédula (ID)</th>
                      <th className="py-3 px-3">Estado</th>
                      {uiMode === 'statistics' && (
                        <>
                          <th className="py-3 px-3 text-right">Monto ($ / Bs.)</th>
                          <th className="py-3 px-3">Referencia Pago Móvil</th>
                        </>
                      )}
                      <th className="py-3 px-3">Inicio y Vencimiento (Mes Calendario)</th>
                      <th className="py-3 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredMemberships.map((m) => {
                      const isEditing = editingMemberId === m.id;
                      const monthsCount = Math.max(
                        1,
                        m.prepaidMonths ||
                          (m.status === 'active' ? m.membershipCount || 1 : 1)
                      );
                      const resolvedStartDate =
                        m.startDate || inferStartDateFromExpiry(m.expiresAt, monthsCount);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-3">
                            {isEditing ? (
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={profileForm.firstName}
                                  onChange={(e) =>
                                    setProfileForm((p) => ({ ...p, firstName: e.target.value }))
                                  }
                                  placeholder="Nombre"
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                                <input
                                  type="text"
                                  value={profileForm.lastName}
                                  onChange={(e) =>
                                    setProfileForm((p) => ({ ...p, lastName: e.target.value }))
                                  }
                                  placeholder="Apellido"
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                              </div>
                            ) : m.firstName || m.lastName ? (
                              <div className="flex items-center gap-2">
                                {m.receiptImageUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewReceiptModal({
                                        imageUrl: m.receiptImageUrl!,
                                        title: m.planName,
                                        phone: m.phone,
                                        operationRef: m.paymentRef,
                                      })
                                    }
                                    className="w-7 h-7 rounded border border-slate-300 overflow-hidden shrink-0 cursor-pointer"
                                    title="Ver foto del Pago Móvil"
                                  >
                                    <img
                                      src={m.receiptImageUrl}
                                      alt="Pago Móvil"
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                )}
                                <span
                                  className={`font-semibold ${
                                    m.firstName.toLowerCase().startsWith('operación:') ||
                                    m.firstName.toLowerCase().startsWith('operacion:')
                                      ? 'font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {m.firstName} {m.lastName}
                                </span>
                                {monthsCount > 1 && (
                                  <span
                                    className="px-1.5 py-0.5 bg-emerald-600 text-white text-[11px] font-bold font-mono rounded shadow-2xs"
                                    title={`Pagó ${monthsCount} meses de membresía`}
                                  >
                                    +{monthsCount}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                Operación: {m.paymentRef}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums font-medium">
                            {isEditing ? (
                              <input
                                type="text"
                                value={profileForm.phone}
                                onChange={(e) =>
                                  setProfileForm((p) => ({ ...p, phone: e.target.value }))
                                }
                                placeholder="+58 412-1234567"
                                className="w-36 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                              />
                            ) : m.needsManualPhone ||
                              !m.phone ||
                              !m.phone.trim() ||
                              m.phone.includes('FALTA') ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={manualPhoneInputs[m.id] ?? ''}
                                  onChange={(e) =>
                                    setManualPhoneInputs((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="⚠️ Ingresar Teléfono"
                                  className="w-36 px-2 py-1 border border-amber-400 bg-amber-50/70 rounded text-xs font-mono text-amber-950"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const entered = (manualPhoneInputs[m.id] || '').trim();
                                    if (!entered) return;
                                    await upsertMembershipRecord(
                                      {
                                        ...m,
                                        phone: entered,
                                        needsManualPhone: false,
                                      },
                                      false
                                    );
                                    showNotice(
                                      `Teléfono ${entered} guardado para ${m.firstName} ${m.lastName}.`,
                                      'success'
                                    );
                                  }}
                                  className="px-2 py-1 bg-amber-900 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                  OK
                                </button>
                              </div>
                            ) : (
                              m.phone
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums">
                            {isEditing ? (
                              <input
                                type="text"
                                value={profileForm.cedula}
                                onChange={(e) =>
                                  setProfileForm((p) => ({ ...p, cedula: e.target.value }))
                                }
                                placeholder="V-18318153"
                                className="w-28 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                              />
                            ) : (
                              m.cedula || 'Pendiente'
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <span>{STATUS_LABELS[m.status]}</span>
                                {m.status !== 'pending_registration_check' &&
                                  m.isRegisteredForLife !== false && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      Inscrito Vitalicio
                                    </span>
                                  )}
                                {m.includesRegistration && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    + Inscripción (${(settings.registrationUsd ?? 15).toFixed(0)})
                                  </span>
                                )}
                              </div>
                              {m.status === 'pending_registration_check' && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyRegistration(m, true)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded cursor-pointer"
                                  >
                                    ✅ Sí está inscrito (De por vida)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyRegistration(m, false)}
                                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[10px] font-semibold rounded cursor-pointer"
                                  >
                                    ❌ No está inscrito (Cobrar Inscripción)
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          {uiMode === 'statistics' && (
                            <>
                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                ${m.priceUsd.toFixed(2)} · Bs. {m.totalBs.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {m.paymentRef}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-sans text-slate-500">Inicio:</span>
                                  <input
                                    type="date"
                                    value={profileForm.startDate}
                                    onChange={(e) =>
                                      setProfileForm((p) => ({
                                        ...p,
                                        startDate: e.target.value || getTodayIsoDate(),
                                      }))
                                    }
                                    className="px-2 py-0.5 border border-slate-300 rounded text-xs font-mono"
                                  />
                                  <select
                                    value={profileForm.prepaidMonths}
                                    onChange={(e) =>
                                      setProfileForm((p) => ({
                                        ...p,
                                        prepaidMonths: Math.max(1, Number(e.target.value) || 1),
                                      }))
                                    }
                                    className="px-1.5 py-0.5 border border-emerald-300 bg-emerald-50 text-emerald-900 rounded text-xs font-bold"
                                  >
                                    {[1, 2, 3, 4, 5, 6, 12].map((num) => (
                                      <option key={num} value={num}>
                                        {num === 1 ? '1 mes' : `+${num} meses`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <span className="text-[11px] text-emerald-800 font-bold">
                                  Vence:{' '}
                                  {addCalendarMonths(
                                    profileForm.startDate,
                                    profileForm.prepaidMonths
                                  )}{' '}
                                  ({formatSpanishDate(
                                    addCalendarMonths(
                                      profileForm.startDate,
                                      profileForm.prepaidMonths
                                    )
                                  )})
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">{m.expiresAt}</span>
                                  <span className="text-[11px] font-sans text-slate-500">
                                    ({formatSpanishDate(m.expiresAt)})
                                  </span>
                                  {monthsCount > 1 && (
                                    <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">
                                      +{monthsCount}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextMonths = monthsCount + 1;
                                      const nextExpiry = addCalendarMonths(
                                        resolvedStartDate,
                                        nextMonths
                                      );
                                      await upsertMembershipRecord(
                                        {
                                          ...m,
                                          startDate: resolvedStartDate,
                                          prepaidMonths: nextMonths,
                                          membershipCount: nextMonths,
                                          expiresAt: nextExpiry,
                                        },
                                        false
                                      );
                                      showNotice(
                                        `Membresía de ${m.firstName || m.phone} extendida (+${nextMonths} meses) — Nueva fecha de vencimiento: ${formatSpanishDate(nextExpiry)} (${nextExpiry}).`,
                                        'success'
                                      );
                                    }}
                                    className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded cursor-pointer"
                                    title="Sumar +1 mes pagado y avanzar vencimiento al mes siguiente"
                                  >
                                    +1 Mes
                                  </button>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  Inició: {resolvedStartDate}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={async () => {
                                      const cleanStart =
                                        profileForm.startDate || resolvedStartDate || getTodayIsoDate();
                                      const cleanMonths = Math.max(
                                        1,
                                        profileForm.prepaidMonths || 1
                                      );
                                      const nextExpiry = addCalendarMonths(cleanStart, cleanMonths);
                                      const cleanPhone = profileForm.phone.trim();
                                      await upsertMembershipRecord(
                                        {
                                          ...m,
                                          phone: cleanPhone,
                                          needsManualPhone: !cleanPhone,
                                          cedula: profileForm.cedula.trim() || 'V-00000000',
                                          firstName: profileForm.firstName.trim() || 'Cliente',
                                          lastName: profileForm.lastName.trim() || '',
                                          startDate: cleanStart,
                                          prepaidMonths: cleanMonths,
                                          membershipCount: cleanMonths,
                                          expiresAt: nextExpiry,
                                          status: 'active',
                                        },
                                        false
                                      );
                                      setEditingMemberId(null);
                                      showNotice(
                                        `Membresía actualizada — Inicia: ${cleanStart} · Vence: ${formatSpanishDate(nextExpiry)} (${nextExpiry})${
                                          cleanMonths > 1 ? ` [+${cleanMonths}]` : ''
                                        }.`,
                                        'success'
                                      );
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded font-semibold cursor-pointer"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    onClick={() => setEditingMemberId(null)}
                                    className="px-2 py-1 border border-slate-200 text-slate-600 rounded cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  {m.receiptImageUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewReceiptModal({
                                          imageUrl: m.receiptImageUrl!,
                                          title: m.planName,
                                          phone: m.phone,
                                          operationRef: m.paymentRef,
                                        })
                                      }
                                      className="px-2 py-1 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded flex items-center gap-1 cursor-pointer"
                                      title="Ver foto del Pago Móvil"
                                    >
                                      <ImageIcon className="w-3 h-3" />
                                      <span>Pago Móvil</span>
                                    </button>
                                  )}
                                  {m.status === 'pending_payment' && (
                                    <button
                                      onClick={() => handleHumanConfirmPayment(m)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold cursor-pointer"
                                    >
                                      Aprobar
                                    </button>
                                  )}
                                  {m.status === 'awaiting_profile' && (
                                    <button
                                      onClick={() => {
                                        setEditingMemberId(m.id);
                                        setProfileForm({
                                          cedula: m.cedula,
                                          firstName: m.firstName,
                                          lastName: m.lastName,
                                          phone: m.phone,
                                          startDate: resolvedStartDate,
                                          prepaidMonths: monthsCount,
                                        });
                                      }}
                                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold cursor-pointer"
                                    >
                                      Cargar Cédula
                                    </button>
                                  )}
                                  {(m.status === 'expiring_soon' || m.status === 'expired') && (
                                    <button
                                      onClick={() => handleSendRenewalReminder(m)}
                                      className="px-2.5 py-1 bg-slate-900 text-white rounded font-semibold cursor-pointer"
                                    >
                                      Recordar
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setModalEditRecord(m);
                                      setShowAddMembershipModal(true);
                                    }}
                                    className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 rounded flex items-center gap-1 cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMembershipRecord(m.id)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                    title="Eliminar membresía (se guardará en el Reporte de Eliminados)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1B: DEDICATED PAYMENT APPROVALS TAB (SCANNED PRICE ON TOP vs EXPECTED PRICE BELOW) */}
        {activeSection === 'approvals' && (
          <PaymentApprovalsTab
            memberships={memberships}
            shopOrders={shopOrders}
            products={products}
            settings={settings}
            onApproveMembership={handleHumanConfirmPayment}
            onRejectMembership={handleDeleteMembershipRecord}
            onVerifyRegistration={handleVerifyRegistration}
            onApproveShopOrder={handleHumanConfirmShopOrder}
            onRejectShopOrder={handleDeleteShopOrderRecord}
            onPreviewReceipt={(data) => setPreviewReceiptModal(data)}
            onCreateEvaluatedPendingPayment={async (payload) => {
              const todayIso = getTodayIsoDate();
              const nextExpiry = addCalendarMonths(todayIso, 1);
              if (payload.category === 'consumibles' || payload.category === 'ropa') {
                await upsertShopOrderRecord(
                  {
                    id: sanitizeId(`order_eval_${Date.now()}`),
                    ownerId: user?.uid || 'local_owner',
                    phone: payload.phone,
                    itemsSummary: payload.conceptText,
                    categoryGroup: payload.category === 'ropa' ? 'ropa' : 'consumibles',
                    status: 'pending_approval',
                    totalUsd: payload.expectedAmountUsd,
                    totalBs: payload.expectedAmountBs,
                    paymentRef: payload.operationRef,
                    pagoMovilTarget:
                      payload.category === 'ropa'
                        ? settings.ownerPhoneMemberships
                        : settings.ownerPhoneConsumables,
                    receiptImageUrl: payload.receiptImageUrl,
                    scannedAmountBs: payload.scannedAmountBs,
                    expectedAmountBs: payload.expectedAmountBs,
                    paymentNote: payload.paymentNote,
                    createdAtIso: new Date().toISOString(),
                  },
                  true
                );
              } else {
                const count = Math.max(1, payload.membershipCount);
                const unitUsd = Number((payload.expectedAmountUsd / count).toFixed(2));
                const unitBs = Number((payload.expectedAmountBs / count).toFixed(2));
                for (let i = 0; i < count; i++) {
                  await upsertMembershipRecord(
                    {
                      id: sanitizeId(`mem_eval_${Date.now()}_${i + 1}`),
                      ownerId: user?.uid || 'local_owner',
                      phone: payload.phone,
                      cedula: '',
                      firstName: `Operación: ${payload.operationRef}`,
                      lastName: count > 1 ? `(Persona ${i + 1} de ${count})` : '',
                      planName:
                        count > 1
                          ? `${payload.conceptText} (${i + 1}/${count})`
                          : payload.conceptText,
                      status: 'pending_payment',
                      priceUsd: unitUsd,
                      rateBs: settings.activeRate,
                      totalBs: unitBs,
                      paymentRef: payload.operationRef,
                      paymentMethod: `WhatsApp -> ${settings.ownerPhoneMemberships}`,
                      startDate: todayIso,
                      prepaidMonths: 1,
                      expiresAt: nextExpiry,
                      lastReminderSent: '',
                      receiptImageUrl: payload.receiptImageUrl,
                      membershipCount: count,
                      scannedAmountBs: payload.scannedAmountBs,
                      expectedAmountBs: payload.expectedAmountBs,
                      paymentNote: payload.paymentNote,
                      createdAtIso: new Date().toISOString(),
                    },
                    true
                  );
                }
              }
              showNotice(
                `Pago evaluado (Operación: ${payload.operationRef}) agregado a la cola de aprobación.`,
                'success'
              );
            }}
          />
        )}

        {/* SECTION 1C: BUSINESS GRAPHICS & CATEGORY FINANCIAL ANALYTICS TAB */}
        {activeSection === 'analytics' && (
          <BusinessAnalyticsTab
            memberships={memberships}
            deletedMemberships={deletedMemberships}
            deletedProducts={deletedProducts}
            deletedShopOrders={deletedShopOrders}
            shopOrders={shopOrders}
            products={products}
            settings={settings}
            onDeleteMembershipSale={handleDeleteMembershipRecord}
            onDeleteShopOrderSale={handleDeleteShopOrderRecord}
            onDeleteAllShopOrdersDatabase={handleDeleteAllShopOrdersDatabase}
            onDeleteAllProductsCatalogDatabase={handleDeleteAllProductsDatabase}
          />
        )}

        {/* SECTION 2: SHOP / TIENDA WITH PER-PRODUCT TASA & PRESERVED USD PRICES */}
        {activeSection === 'shop' && (
          <ShopSection
            products={products}
            settings={settings}
            onSaveSettings={async (nextSettings: ExchangeSettings, silent = false) => {
              const hasMem = products.some((p) => p.category === 'membresias');
              const nextProducts: ProductItem[] = !hasMem
                ? [
                    {
                      id: 'prod_membresia_mensual',
                      ownerId: user?.uid || 'local_owner',
                      name: `Membresía Mensual ${nextSettings.businessName || 'FormaGym'}`,
                      category: 'membresias',
                      description: 'Acceso completo a pesas, máquinas, cardio y clases funcionales.',
                      basePriceUsd: nextSettings.membershipMonthlyUsd,
                      priceBs: nextSettings.membershipMonthlyBs,
                      rateMode: nextSettings.mode,
                      isCustomBs: false,
                      stock: 999,
                      available: true,
                    },
                    ...products,
                  ]
                : products.map((p) =>
                    p.category === 'membresias'
                      ? {
                          ...p,
                          basePriceUsd: nextSettings.membershipMonthlyUsd,
                          priceBs: nextSettings.membershipMonthlyBs,
                          rateMode: nextSettings.mode,
                        }
                      : p
                  );
              setSettings(nextSettings);
              setProducts(nextProducts);
              setNeedsBackupReminder(true);
              persistSnapshotNow({ settings: nextSettings, products: nextProducts });
              if (user) {
                await persistSettingsToFirestore(nextSettings, user.uid);
              }
              if (!silent) {
                showNotice(
                  `Tarifas guardadas — Mensualidad: $${nextSettings.membershipMonthlyUsd.toFixed(
                    2
                  )} USD (Bs. ${nextSettings.membershipMonthlyBs.toFixed(
                    2
                  )}) · Inscripción Vitalicia: $${(nextSettings.registrationUsd ?? 15).toFixed(
                    2
                  )} USD (Bs. ${(
                    nextSettings.registrationBs ??
                    Number(((nextSettings.registrationUsd ?? 15) * nextSettings.activeRate).toFixed(2))
                  ).toFixed(2)}).`,
                  'success'
                );
              }
            }}
            onSaveProductPrices={handleSaveSingleProduct}
            onSaveAllDraftPrices={handleSaveAllDraftPrices}
            onCreateProduct={async (newProdData) => {
              const newProd: ProductItem = {
                id: sanitizeId(`prod_${Date.now()}`),
                ownerId: user?.uid || 'local_owner',
                ...newProdData,
                available: newProdData.available ?? true,
              };
              const nextProducts = [newProd, ...products];
              setProducts(nextProducts);
              setNeedsBackupReminder(true);
              persistSnapshotNow({ products: nextProducts });
              if (user) {
                const payload = validateProductPayload(newProd, user.uid);
                try {
                  await setDoc(doc(db, 'products', newProd.id), {
                    ...payload,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                } catch (err) {
                  handleFirestoreError(err, OperationType.CREATE, 'products');
                }
              }
              showNotice(`Producto "${newProd.name}" creado exitosamente.`, 'success');
            }}
            onDeleteProduct={handleDeleteProductRecord}
            onDeleteAllProductsDatabase={handleDeleteAllProductsDatabase}
          />
        )}

        {/* SECTION 3: DELETED MEMBERSHIPS & PRODUCTS REPORT & LOCAL BACKUP REMINDER */}
        {activeSection === 'deleted_report' && (
          <DeletedMembershipsReport
            deletedMemberships={deletedMemberships}
            deletedProducts={deletedProducts}
            deletedShopOrders={deletedShopOrders}
            lastLocalDownloadAt={lastLocalDownloadAt}
            onRestoreMembership={handleRestoreDeletedMembership}
            onDeleteReportItem={(record) => {
              const nextDeletedMemberships = deletedMemberships.filter(
                (d) => !(d.id === record.id && d.deletedAt === record.deletedAt)
              );
              setDeletedMemberships(nextDeletedMemberships);
              persistSnapshotNow({ deletedMemberships: nextDeletedMemberships });
              showNotice(
                `Registro eliminado permanentemente del reporte de eliminados.`,
                'info'
              );
            }}
            onClearAllDeletedReports={() => {
              setDeletedMemberships([]);
              persistSnapshotNow({ deletedMemberships: [] });
              showNotice(
                'El reporte histórico de membresías eliminadas fue vaciado.',
                'info'
              );
            }}
            onRestoreProduct={handleRestoreDeletedProduct}
            onDeleteProductReportItem={(record) => {
              const nextDeletedProducts = deletedProducts.filter(
                (p) => !(p.id === record.id && p.deletedAt === record.deletedAt)
              );
              setDeletedProducts(nextDeletedProducts);
              persistSnapshotNow({ deletedProducts: nextDeletedProducts });
              showNotice(
                `Producto "${record.name}" eliminado permanentemente del reporte de eliminados.`,
                'info'
              );
            }}
            onClearAllDeletedProductsReport={() => {
              setDeletedProducts([]);
              persistSnapshotNow({ deletedProducts: [] });
              showNotice(
                'El reporte histórico de productos eliminados fue vaciado.',
                'info'
              );
            }}
            onRestoreShopOrder={handleRestoreDeletedShopOrder}
            onDeleteShopOrderReportItem={(record) => {
              const nextDeletedOrders = deletedShopOrders.filter(
                (o) => !(o.id === record.id && o.deletedAt === record.deletedAt)
              );
              setDeletedShopOrders(nextDeletedOrders);
              persistSnapshotNow({ deletedShopOrders: nextDeletedOrders });
              showNotice(
                `Venta de producto (${record.itemsSummary}) eliminada permanentemente del reporte.`,
                'info'
              );
            }}
            onClearAllDeletedShopOrdersReport={() => {
              setDeletedShopOrders([]);
              persistSnapshotNow({ deletedShopOrders: [] });
              showNotice(
                'El reporte histórico de ventas de productos eliminadas fue vaciado.',
                'info'
              );
            }}
            onDownloadDeletedCsv={handleDownloadDeletedOnlyCsv}
            onDownloadAllOrganizedExcel={handleDownloadOrganizedExcel}
            onDownloadAllOrganizedJson={handleDownloadOrganizedJson}
          />
        )}

        {/* SECTION 4: CENTRALIZED BOT CONFIG, CLOUD DATABASE MAP & WHATSAPP PHONE CONNECTION */}
        {activeSection === 'config' && (
          <BotConfigAndCloudSection
            settings={settings}
            rateSource={rateSource}
            rateUpdatedAt={rateUpdatedAt}
            memberships={memberships}
            deletedMemberships={deletedMemberships}
            shopOrders={shopOrders}
            products={products}
            isCloudConnected={Boolean(user)}
            cloudUserEmail={user?.email}
            onSelectRateMode={async (mode: RateMode, customRateValue?: number) => {
              const nextBcv =
                mode === 'auto_bcv' && customRateValue !== undefined
                  ? customRateValue
                  : settings.bcvRate;
              const nextEuro =
                mode === 'auto_euro' && customRateValue !== undefined
                  ? customRateValue
                  : settings.euroRate;
              const nextManual =
                mode === 'manual' && customRateValue !== undefined
                  ? customRateValue
                  : settings.manualRate;
              const nextActive =
                mode === 'auto_bcv' ? nextBcv : mode === 'auto_euro' ? nextEuro : nextManual;

              const currentMemUsd = settings.membershipMonthlyUsd;
              const nextMemBs = Number((currentMemUsd * nextActive).toFixed(2));
              const currentRegUsd = settings.registrationUsd ?? 15;
              const nextRegBs = Number((currentRegUsd * nextActive).toFixed(2));

              const nextSettings: ExchangeSettings = {
                ...settings,
                mode,
                bcvRate: Number(nextBcv.toFixed(2)),
                euroRate: Number(nextEuro.toFixed(2)),
                manualRate: Number(nextManual.toFixed(2)),
                activeRate: Number(nextActive.toFixed(2)),
                membershipMonthlyUsd: currentMemUsd,
                membershipMonthlyBs: nextMemBs,
                registrationUsd: currentRegUsd,
                registrationBs: nextRegBs,
              };
              const nextProducts = products.map((p) =>
                p.category === 'membresias'
                  ? {
                      ...p,
                      rateMode: mode,
                      basePriceUsd: currentMemUsd,
                      priceBs: nextMemBs,
                      isCustomBs: false,
                    }
                  : p
              );
              setSettings(nextSettings);
              setProducts(nextProducts);
              persistSnapshotNow({ settings: nextSettings, products: nextProducts });
              if (user) {
                await persistSettingsToFirestore(nextSettings, user.uid);
              }
              showNotice(
                `Tasa cambiada a Bs. ${nextActive.toFixed(
                  2
                )} — Mensualidad actualizada a $${currentMemUsd.toFixed(
                  2
                )} USD / Bs. ${nextMemBs.toFixed(2)}.`,
                'success'
              );
            }}
            onSaveSettings={async (nextSettings: ExchangeSettings, silent = false) => {
              const hasMem = products.some((p) => p.category === 'membresias');
              const nextProducts: ProductItem[] = !hasMem
                ? [
                    {
                      id: 'prod_membresia_mensual',
                      ownerId: user?.uid || 'local_owner',
                      name: `Membresía Mensual ${nextSettings.businessName || 'FormaGym'}`,
                      category: 'membresias',
                      description: 'Acceso completo a pesas, máquinas, cardio y clases funcionales.',
                      basePriceUsd: nextSettings.membershipMonthlyUsd,
                      priceBs: nextSettings.membershipMonthlyBs,
                      rateMode: nextSettings.mode,
                      isCustomBs: false,
                      stock: 999,
                      available: true,
                    },
                    ...products,
                  ]
                : products.map((p) =>
                    p.category === 'membresias'
                      ? {
                          ...p,
                          basePriceUsd: nextSettings.membershipMonthlyUsd,
                          priceBs: nextSettings.membershipMonthlyBs,
                          rateMode: nextSettings.mode,
                        }
                      : p
                  );
              setSettings(nextSettings);
              setProducts(nextProducts);
              setNeedsBackupReminder(true);
              persistSnapshotNow({ settings: nextSettings, products: nextProducts });
              if (user) {
                await persistSettingsToFirestore(nextSettings, user.uid);
              }
              if (!silent) {
                showNotice(
                  `Configuración guardada — Mensualidad: $${nextSettings.membershipMonthlyUsd.toFixed(
                    2
                  )} USD / Bs. ${nextSettings.membershipMonthlyBs.toFixed(2)}.`,
                  'success'
                );
              }
            }}
            onApplyRateToAllProducts={() => handleApplyRateToAllProducts()}
            onRefreshLiveRate={() => fetchLiveBcvRate(true)}
            onDownloadOrganizedExcel={handleDownloadOrganizedExcel}
            onDownloadOrganizedJson={handleDownloadOrganizedJson}
          />
        )}

        {showAddMembershipModal && (
          <AddMembershipModal
            defaultUsd={settings.membershipMonthlyUsd}
            defaultBs={settings.membershipMonthlyBs}
            defaultRegistrationUsd={settings.registrationUsd ?? 15}
            defaultRegistrationBs={
              settings.registrationBs ??
              Number(((settings.registrationUsd ?? 15) * settings.activeRate).toFixed(2))
            }
            defaultRateBs={settings.activeRate}
            bcvRate={settings.bcvRate}
            euroRate={settings.euroRate}
            manualRate={settings.manualRate}
            defaultRateMode={settings.mode}
            initialRecord={modalEditRecord}
            onClose={() => {
              setShowAddMembershipModal(false);
              setModalEditRecord(null);
            }}
            onSave={async (recordData, existingId) => {
              const targetId = existingId || sanitizeId(`mem_${Date.now()}`);
              const fullRecord: MembershipRecord = {
                id: targetId,
                ownerId: user?.uid || 'local_owner',
                ...recordData,
              };
              await upsertMembershipRecord(fullRecord, !existingId);
              showNotice(
                existingId
                  ? `Membresía de ${fullRecord.firstName || fullRecord.phone} actualizada.`
                  : `Nueva membresía (${fullRecord.firstName || fullRecord.phone}) registrada.`,
                'success'
              );
            }}
          />
        )}
        {previewReceiptModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Comprobante de Pago Móvil Escaneado
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                    Cliente: <span className="font-mono">{previewReceiptModal.phone}</span>
                  </h3>
                  <p className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 inline-block px-2 py-0.5 rounded mt-1">
                    Operación: {previewReceiptModal.operationRef}
                  </p>
                  {(previewReceiptModal.scannedBs !== undefined ||
                    previewReceiptModal.expectedBs !== undefined) && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-500">Monto escaneado (Arriba):</span>
                        <span className="font-mono font-bold text-slate-900">
                          Bs. {(previewReceiptModal.scannedBs ?? previewReceiptModal.expectedBs ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
                        <span className="text-slate-500">Monto que DEBERÍA decir (Abajo):</span>
                        <span className="font-mono font-bold text-emerald-700">
                          Bs. {(previewReceiptModal.expectedBs ?? previewReceiptModal.scannedBs ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPreviewReceiptModal(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-slate-950 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center max-h-[65vh]">
                <img
                  src={previewReceiptModal.imageUrl}
                  alt="Comprobante de Pago Móvil"
                  className="max-h-[65vh] w-auto object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>Concepto: {previewReceiptModal.title}</span>
                <button
                  onClick={() => setPreviewReceiptModal(null)}
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
