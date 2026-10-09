import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  HardDrive,
  KeyRound,
  Phone,
  Plus,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Wifi,
} from 'lucide-react';
import {
  DeletedMembershipRecord,
  ExchangeSettings,
  MembershipRecord,
  ProductItem,
  RateMode,
  ShopOrderRecord,
} from '../types';
import { InteractiveWikiGuide } from './InteractiveWikiGuide';

interface BaileysStatusResponse {
  connectionState: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrDataUrl: string | null;
  pairingCode: string | null;
  connectedPhone: string | null;
  statusMessage: string;
  logs: Array<{ id: string; time: string; text: string }>;
}

interface BotConfigAndCloudSectionProps {
  settings: ExchangeSettings;
  rateSource: string;
  rateUpdatedAt: string;
  memberships: MembershipRecord[];
  deletedMemberships: DeletedMembershipRecord[];
  shopOrders: ShopOrderRecord[];
  products: ProductItem[];
  isCloudConnected: boolean;
  cloudUserEmail?: string | null;
  onSelectRateMode: (mode: RateMode, customRateValue?: number) => Promise<void>;
  onSaveSettings: (nextSettings: ExchangeSettings, silent?: boolean) => Promise<void>;
  onApplyRateToAllProducts: () => Promise<void>;
  onRefreshLiveRate: () => Promise<void>;
  onDownloadOrganizedExcel: () => void;
  onDownloadOrganizedJson: () => void;
}

export const BotConfigAndCloudSection: React.FC<BotConfigAndCloudSectionProps> = ({
  settings,
  rateSource,
  rateUpdatedAt,
  memberships,
  deletedMemberships,
  shopOrders,
  products,
  isCloudConnected,
  cloudUserEmail,
  onSelectRateMode,
  onSaveSettings,
  onApplyRateToAllProducts,
  onRefreshLiveRate,
  onDownloadOrganizedExcel,
  onDownloadOrganizedJson,
}) => {
  const [adminNumbers, setAdminNumbers] = useState<string>(
    settings.adminNumbers || ''
  );
  const [newAdminPhoneInput, setNewAdminPhoneInput] = useState<string>('');
  const [ownerPhoneMemberships, setOwnerPhoneMemberships] = useState<string>(
    settings.ownerPhoneMemberships || '+58 414-6734866'
  );
  const [ownerPhoneConsumables, setOwnerPhoneConsumables] = useState<string>(
    settings.ownerPhoneConsumables || '+58 424-6559787'
  );
  const [ownerPhoneSupport, setOwnerPhoneSupport] = useState<string>(
    settings.ownerPhoneSupport || '+58 414-6734866'
  );

  const [bcvInput, setBcvInput] = useState<string>(settings.bcvRate.toFixed(2));
  const [euroInput, setEuroInput] = useState<string>(settings.euroRate.toFixed(2));
  const [manualInput, setManualInput] = useState<string>(settings.manualRate.toFixed(2));

  const [businessName, setBusinessName] = useState<string>(
    settings.businessName || 'FormaGym'
  );
  const [scheduleText, setScheduleText] = useState<string>(settings.scheduleText);
  const [paymentMethodsText, setPaymentMethodsText] = useState<string>(
    settings.paymentMethodsText
  );
  const [memUsdInput, setMemUsdInput] = useState<string>(
    settings.membershipMonthlyUsd.toFixed(2)
  );
  const [memBsInput, setMemBsInput] = useState<string>(
    settings.membershipMonthlyBs.toFixed(2)
  );
  const [regUsdInput, setRegUsdInput] = useState<string>(
    (settings.registrationUsd ?? 15).toFixed(2)
  );
  const [regBsInput, setRegBsInput] = useState<string>(
    (
      settings.registrationBs ??
      Number(((settings.registrationUsd ?? 15) * (settings.activeRate || 68.45)).toFixed(2))
    ).toFixed(2)
  );

  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [copiedProdUrl, setCopiedProdUrl] = useState<boolean>(false);
  const [copiedDevUrl, setCopiedDevUrl] = useState<boolean>(false);

  // 24/7 Standalone Server & Bot Power State
  const [botRunning247, setBotRunning247] = useState<boolean>(true);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [isToggling247, setIsToggling247] = useState<boolean>(false);
  const [localUrl, setLocalUrl] = useState<string>('http://localhost:3000');
  const [lanUrl, setLanUrl] = useState<string>('http://192.168.1.100:3000');
  const [guideTab, setGuideTab] = useState<'local' | 'hosting' | 'sync' | 'manual'>('local');
  const [copiedStepKey, setCopiedStepKey] = useState<string | null>(null);
  const liveWebUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://ais-dev-ymynqlimtqabrw24fwdz5p-878245638537.us-east1.run.app';
  const standaloneFullUrl = `${liveWebUrl}/?standalone=1`;

  const copyStepWithFeedback = (key: string, text: string) => {
    copyToClipboardSafe(text);
    setCopiedStepKey(key);
    setTimeout(() => {
      setCopiedStepKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  const handleDownloadWindowsLauncher = () => {
    const batContent = `@echo off
title FormaGym - Servidor Local y Bot de WhatsApp 24/7
echo ================================================================
echo   FORMAGYM - SISTEMA WEB + BOT DE WHATSAPP (MODO LOCAL)
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en esta computadora.
    echo Por favor descarga e instala Node.js LTS desde: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] Instalando dependencias por primera vez (esto toma 1 minuto)...
    call npm install
)

echo.
echo [2/2] Iniciando servidor de FormaGym en http://localhost:3000 ...
echo       Puedes abrir http://localhost:3000 en tu navegador.
echo       No cierres esta ventana mientras quieras que el bot siga activo.
echo.
start "" "http://localhost:3000"
call npm run dev
pause
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'INICIAR_LOCAL_WINDOWS.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadUnixLauncher = () => {
    const shContent = `#!/usr/bin/env bash
set -e
echo "================================================================"
echo "  FORMAGYM - SISTEMA WEB + BOT DE WHATSAPP (MODO LOCAL)"
echo "================================================================"
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no está instalado. Instálalo desde https://nodejs.org"
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "[1/2] Instalando dependencias por primera vez..."
  npm install
fi
echo "[2/2] Iniciando servidor de FormaGym en http://localhost:3000 ..."
npm run dev
`;
    const blob = new Blob([shContent], { type: 'text/x-sh;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'iniciar_local_mac_linux.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDockerfile = () => {
    const dockerContent = `FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
`;
    const blob = new Blob([dockerContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Dockerfile';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboardSafe = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // ignore
    }
  };

  // Live Baileys State
  const [baileysStatus, setBaileysStatus] = useState<BaileysStatusResponse>({
    connectionState: 'disconnected',
    qrDataUrl: null,
    pairingCode: null,
    connectedPhone: null,
    statusMessage: 'Desconectado. Haz clic en "Conectar con Código QR" o "Conectar con Código de 8 Dígitos".',
    logs: [],
  });
  const [pairingPhoneInput, setPairingPhoneInput] = useState<string>(
    settings.ownerPhoneMemberships || '+58 414-6734866'
  );
  const [isTriggeringBaileys, setIsTriggeringBaileys] = useState<boolean>(false);

  useEffect(() => {
    setAdminNumbers((prev) =>
      prev !== (settings.adminNumbers || '') ? settings.adminNumbers || '' : prev
    );
    setOwnerPhoneMemberships((prev) =>
      prev !== (settings.ownerPhoneMemberships || '+58 414-6734866')
        ? settings.ownerPhoneMemberships || '+58 414-6734866'
        : prev
    );
    setOwnerPhoneConsumables((prev) =>
      prev !== (settings.ownerPhoneConsumables || '+58 424-6559787')
        ? settings.ownerPhoneConsumables || '+58 424-6559787'
        : prev
    );
    setOwnerPhoneSupport((prev) =>
      prev !== (settings.ownerPhoneSupport || '+58 414-6734866')
        ? settings.ownerPhoneSupport || '+58 414-6734866'
        : prev
    );
    setBcvInput((prev) =>
      Math.abs((Number(prev) || 0) - settings.bcvRate) > 0.001
        ? settings.bcvRate.toFixed(2)
        : prev
    );
    setEuroInput((prev) =>
      Math.abs((Number(prev) || 0) - settings.euroRate) > 0.001
        ? settings.euroRate.toFixed(2)
        : prev
    );
    setManualInput((prev) =>
      Math.abs((Number(prev) || 0) - settings.manualRate) > 0.001
        ? settings.manualRate.toFixed(2)
        : prev
    );
    setBusinessName((prev) =>
      prev !== (settings.businessName || 'FormaGym')
        ? settings.businessName || 'FormaGym'
        : prev
    );
    setScheduleText((prev) =>
      prev !== settings.scheduleText ? settings.scheduleText : prev
    );
    setPaymentMethodsText((prev) =>
      prev !== settings.paymentMethodsText ? settings.paymentMethodsText : prev
    );
    setMemUsdInput((prev) =>
      Math.abs((Number(prev) || 0) - settings.membershipMonthlyUsd) > 0.001
        ? settings.membershipMonthlyUsd.toFixed(2)
        : prev
    );
    setMemBsInput((prev) =>
      Math.abs((Number(prev) || 0) - settings.membershipMonthlyBs) > 0.001
        ? settings.membershipMonthlyBs.toFixed(2)
        : prev
    );
    const nextRegUsd = settings.registrationUsd ?? 15;
    const nextRegBs =
      settings.registrationBs ??
      Number((nextRegUsd * (settings.activeRate || 68.45)).toFixed(2));
    setRegUsdInput((prev) =>
      Math.abs((Number(prev) || 0) - nextRegUsd) > 0.001
        ? nextRegUsd.toFixed(2)
        : prev
    );
    setRegBsInput((prev) =>
      Math.abs((Number(prev) || 0) - nextRegBs) > 0.001
        ? nextRegBs.toFixed(2)
        : prev
    );
  }, [settings]);

  // Poll live Baileys & 24/7 System status from the backend
  const fetchBaileysStatus = async () => {
    try {
      const [resBaileys, resSys] = await Promise.all([
        fetch('/api/baileys/status'),
        fetch('/api/system/24-7-status'),
      ]);
      if (resBaileys.ok) {
        const data = await resBaileys.json();
        setBaileysStatus(data);
      }
      if (resSys.ok) {
        const sysData = await resSys.json();
        if (typeof sysData.botRunning247 === 'boolean') {
          setBotRunning247(sysData.botRunning247);
        }
        if (typeof sysData.uptimeSeconds === 'number') {
          setUptimeSeconds(sysData.uptimeSeconds);
        }
        if (sysData.localUrl) {
          setLocalUrl(String(sysData.localUrl));
        }
        if (sysData.lanUrl) {
          setLanUrl(String(sysData.lanUrl));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleToggle247Power = async (nextEnabled: boolean) => {
    setIsToggling247(true);
    try {
      const res = await fetch('/api/system/24-7-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setBotRunning247(Boolean(data.botRunning247));
      }
      await fetchBaileysStatus();
    } finally {
      setIsToggling247(false);
    }
  };

  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${s}s activo sin interrupción`;
    if (mins > 0) return `${mins}m ${s}s activo sin interrupción`;
    return `${s}s activo sin interrupción`;
  };

  useEffect(() => {
    fetchBaileysStatus();
    const timer = setInterval(fetchBaileysStatus, 2500);
    return () => clearInterval(timer);
  }, []);

  const handleStartBaileysQr = async () => {
    setIsTriggeringBaileys(true);
    try {
      await fetch('/api/baileys/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchBaileysStatus();
    } finally {
      setIsTriggeringBaileys(false);
    }
  };

  const handleStartBaileysPairingCode = async () => {
    if (!pairingPhoneInput.trim()) return;
    setIsTriggeringBaileys(true);
    try {
      await fetch('/api/baileys/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneForPairing: pairingPhoneInput.trim() }),
      });
      setTimeout(fetchBaileysStatus, 2400);
    } finally {
      setIsTriggeringBaileys(false);
    }
  };

  const handleDisconnectBaileys = async () => {
    setIsTriggeringBaileys(true);
    try {
      await fetch('/api/baileys/disconnect', { method: 'POST' });
      await fetchBaileysStatus();
    } finally {
      setIsTriggeringBaileys(false);
    }
  };

  const persistCurrentConfigDraft = async (
    overrides?: {
      mode?: RateMode;
      bcv?: string;
      euro?: string;
      manual?: string;
      usd?: string;
      bs?: string;
      regUsd?: string;
      regBs?: string;
      adminNumbers?: string;
      ownerMem?: string;
      ownerCons?: string;
      ownerSup?: string;
      bizName?: string;
      sched?: string;
      payMethods?: string;
      silent?: boolean;
    }
  ) => {
    const modeToUse = overrides?.mode ?? settings.mode;
    const rawBcv = overrides?.bcv !== undefined ? overrides.bcv : bcvInput;
    const rawEuro = overrides?.euro !== undefined ? overrides.euro : euroInput;
    const rawManual = overrides?.manual !== undefined ? overrides.manual : manualInput;
    const rawUsd = overrides?.usd !== undefined ? overrides.usd : memUsdInput;
    const rawBs = overrides?.bs !== undefined ? overrides.bs : memBsInput;
    const rawRegUsd = overrides?.regUsd !== undefined ? overrides.regUsd : regUsdInput;
    const rawRegBs = overrides?.regBs !== undefined ? overrides.regBs : regBsInput;

    const nextBcv = Math.max(0.01, Number(rawBcv) || settings.bcvRate);
    const nextEuro = Math.max(0.01, Number(rawEuro) || settings.euroRate);
    const nextManual = Math.max(0.01, Number(rawManual) || settings.manualRate);
    const nextActive =
      modeToUse === 'auto_bcv'
        ? nextBcv
        : modeToUse === 'auto_euro'
        ? nextEuro
        : nextManual;

    const nextUsd = Math.max(0.01, Number(rawUsd) || settings.membershipMonthlyUsd);
    const nextBs = Math.max(
      0.01,
      Number(rawBs) || Number((nextUsd * nextActive).toFixed(2))
    );
    const nextRegUsd = Math.max(0.01, Number(rawRegUsd) || (settings.registrationUsd ?? 15));
    const nextRegBs = Math.max(
      0.01,
      Number(rawRegBs) || Number((nextRegUsd * nextActive).toFixed(2))
    );

    const resolvedAdminNumbers = (
      overrides?.adminNumbers !== undefined ? overrides.adminNumbers : adminNumbers
    ).trim();
    const resolvedOwnerMem = (
      overrides?.ownerMem !== undefined ? overrides.ownerMem : ownerPhoneMemberships
    ).trim();
    const resolvedOwnerCons = (
      overrides?.ownerCons !== undefined ? overrides.ownerCons : ownerPhoneConsumables
    ).trim();
    const resolvedOwnerSup = (
      overrides?.ownerSup !== undefined ? overrides.ownerSup : ownerPhoneSupport
    ).trim();
    const resolvedBizName = (
      overrides?.bizName !== undefined ? overrides.bizName : businessName
    ).trim();
    const resolvedSched =
      overrides?.sched !== undefined ? overrides.sched : scheduleText;
    const resolvedPayMethods =
      overrides?.payMethods !== undefined ? overrides.payMethods : paymentMethodsText;

    const updatedSettings: ExchangeSettings = {
      ...settings,
      mode: modeToUse,
      bcvRate: Number(nextBcv.toFixed(2)),
      euroRate: Number(nextEuro.toFixed(2)),
      manualRate: Number(nextManual.toFixed(2)),
      activeRate: Number(nextActive.toFixed(2)),
      businessName: resolvedBizName || 'FormaGym',
      scheduleText: resolvedSched,
      paymentMethodsText: resolvedPayMethods,
      membershipMonthlyUsd: Number(nextUsd.toFixed(2)),
      membershipMonthlyBs: Number(nextBs.toFixed(2)),
      registrationUsd: Number(nextRegUsd.toFixed(2)),
      registrationBs: Number(nextRegBs.toFixed(2)),
      adminNumbers: resolvedAdminNumbers,
      ownerPhoneMemberships: resolvedOwnerMem || '+58 414-6734866',
      ownerPhoneConsumables: resolvedOwnerCons || '+58 424-6559787',
      ownerPhoneSupport: resolvedOwnerSup || '+58 414-6734866',
    };

    await onSaveSettings(updatedSettings, Boolean(overrides?.silent));
  };

  const handleMemUsdChange = (val: string) => {
    setMemUsdInput(val);
    const usdNum = Math.max(0, Number(val) || 0);
    const currentRate =
      settings.mode === 'auto_bcv'
        ? Number(bcvInput) || settings.bcvRate
        : settings.mode === 'auto_euro'
        ? Number(euroInput) || settings.euroRate
        : Number(manualInput) || settings.manualRate;
    if (usdNum > 0 && currentRate > 0) {
      const nextBsStr = (usdNum * currentRate).toFixed(2);
      setMemBsInput(nextBsStr);
      persistCurrentConfigDraft({ usd: val, bs: nextBsStr, silent: true });
    }
  };

  const handleRegUsdChange = (val: string) => {
    setRegUsdInput(val);
    const usdNum = Math.max(0, Number(val) || 0);
    const currentRate =
      settings.mode === 'auto_bcv'
        ? Number(bcvInput) || settings.bcvRate
        : settings.mode === 'auto_euro'
        ? Number(euroInput) || settings.euroRate
        : Number(manualInput) || settings.manualRate;
    if (usdNum > 0 && currentRate > 0) {
      const nextRegBsStr = (usdNum * currentRate).toFixed(2);
      setRegBsInput(nextRegBsStr);
      persistCurrentConfigDraft({ regUsd: val, regBs: nextRegBsStr, silent: true });
    }
  };

  const handleRecalculateMemBsWithMode = (modeToUse: RateMode) => {
    const rateVal =
      modeToUse === 'auto_bcv'
        ? Number(bcvInput) || settings.bcvRate
        : modeToUse === 'auto_euro'
        ? Number(euroInput) || settings.euroRate
        : Number(manualInput) || settings.manualRate;
    const usdNum = Math.max(0.01, Number(memUsdInput) || settings.membershipMonthlyUsd);
    const nextBsStr = (usdNum * rateVal).toFixed(2);
    const rUsdNum = Math.max(0.01, Number(regUsdInput) || (settings.registrationUsd ?? 15));
    const nextRegBsStr = (rUsdNum * rateVal).toFixed(2);
    setMemBsInput(nextBsStr);
    setRegBsInput(nextRegBsStr);
    persistCurrentConfigDraft({
      mode: modeToUse,
      usd: String(usdNum),
      bs: nextBsStr,
      regUsd: String(rUsdNum),
      regBs: nextRegBsStr,
      silent: false,
    });
  };

  const parsedAdminNumbersList = adminNumbers
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const handleAddAdminNumber = async () => {
    const clean = newAdminPhoneInput.trim();
    if (!clean) return;
    const digits = clean.replace(/\D/g, '').slice(-10);
    if (digits.length < 7) return;
    const alreadyExists = parsedAdminNumbersList.some(
      (existing) => existing.replace(/\D/g, '').slice(-10) === digits
    );
    const updatedList = alreadyExists
      ? parsedAdminNumbersList
      : [...parsedAdminNumbersList, clean];
    const nextStr = updatedList.join(', ');
    setAdminNumbers(nextStr);
    setNewAdminPhoneInput('');
    await persistCurrentConfigDraft({ adminNumbers: nextStr, silent: false });
  };

  const handleRemoveAdminNumber = async (phoneToRemove: string) => {
    const updatedList = parsedAdminNumbersList.filter((item) => item !== phoneToRemove);
    const nextStr = updatedList.join(', ');
    setAdminNumbers(nextStr);
    await persistCurrentConfigDraft({ adminNumbers: nextStr, silent: false });
  };

  const handleSaveAllConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await persistCurrentConfigDraft();
    } finally {
      setSavingConfig(false);
    }
  };

  // Generate standalone Baileys script pre-configured with the user's current settings & panel URL
  const buildBaileysStandaloneScript = () => {
    const panelApiUrl = `${window.location.origin}/api/whatsapp/chat`;
    return `// ============================================================================
// FORMAGYM — BOT DE WHATSAPP OFICIAL CON BAILEYS (@whiskeysockets/baileys)
// Conecta cualquier número de WhatsApp escaneando el código QR y sincroniza
// todos los pagos, precios y membresías con tu panel de FormaGym.
// ============================================================================
// PASO 1: Instala Node.js desde https://nodejs.org (botón verde LTS)
// PASO 2: Abre la terminal (CMD) en esta carpeta y ejecuta (una sola vez):
//         npm init -y
//         npm install @whiskeysockets/baileys qrcode-terminal pino
// PASO 3: Inicia tu bot ejecutando:
//         node bot_baileys_formagym.js
// ============================================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const PANEL_API_URL = ${JSON.stringify(panelApiUrl)};

function formatearTelefono(jid) {
  const digitos = (jid || '').split('@')[0].split(':')[0].replace(/\\D/g, '');
  if (digitos.startsWith('58') && digitos.length === 12) {
    return '+58 ' + digitos.slice(2, 5) + '-' + digitos.slice(5);
  }
  return '+' + digitos;
}

function telefonoAJid(telefono) {
  let digitos = (telefono || '').replace(/\\D/g, '');
  if (digitos.startsWith('04') && digitos.length === 11) {
    digitos = '58' + digitos.slice(1);
  }
  return digitos ? digitos + '@s.whatsapp.net' : null;
}

async function iniciarBotFormaGym() {
  const { state, saveCreds } = await useMultiFileAuthState('./sesion_whatsapp_formagym');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['FormaGym Bot', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\\n========================================================');
      console.log('📲 ESCANEA ESTE CÓDIGO QR DESDE EL WHATSAPP DEL GIMNASIO:');
      console.log('   (Abre WhatsApp -> Dispositivos vinculados -> Vincular)');
      console.log('========================================================\\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\\n✅ ¡BOT FORMAGYM CONECTADO EXITOSAMENTE A WHATSAPP!');
      console.log('🤖 Escuchando mensajes de clientes en tiempo real...\\n');
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconectando con WhatsApp...');
        setTimeout(iniciarBotFormaGym, 3000);
      } else {
        console.log('❌ Sesión cerrada desde el teléfono. Borra la carpeta sesion_whatsapp_formagym para volver a escanear.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) continue;

      const telefonoCliente = formatearTelefono(msg.key.participant || remoteJid);
      const texto =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';
      const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const textoCitado =
        quotedMsg?.conversation ||
        quotedMsg?.extendedTextMessage?.text ||
        quotedMsg?.imageMessage?.caption ||
        '';
      const tieneFoto = Boolean(msg.message.imageMessage);

      if (!texto.trim() && !tieneFoto) continue;

      console.log('📩 Mensaje de ' + telefonoCliente + ':', texto);

      try {
        let bufferFoto = null;
        let receiptImageUrl = undefined;
        if (tieneFoto) {
          try {
            bufferFoto = await downloadMediaMessage(msg, 'buffer', {});
            const mime = msg.message.imageMessage?.mimetype || 'image/jpeg';
            receiptImageUrl = 'data:' + mime + ';base64,' + bufferFoto.toString('base64');
          } catch (e) {
            console.error('No se pudo descargar la imagen:', e.message);
          }
        }

        const res = await fetch(PANEL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: telefonoCliente,
            message: texto || 'Comprobante adjunto',
            fromExternal: true,
            receiptImageUrl,
            context: { hasPhotoAttached: tieneFoto, quotedText: textoCitado, receiptImageUrl },
          }),
        });

        const datos = await res.json();

        // 1. Responder al remitente en WhatsApp
        if (datos.reply) {
          await sock.sendMessage(remoteJid, { text: datos.reply });
        }

        // 2. Si el administrador aprobó un Pago Móvil escribiendo "approved" o "aprobado", notificar al cliente y pedir Cédula y Nombre
        if (datos.action === 'ADMIN_APPROVE_PAYMENT' && datos.approvedPayment?.clientPhone && datos.clientNotificationMessage) {
          const jidClienteAprobado = telefonoAJid(datos.approvedPayment.clientPhone);
          if (jidClienteAprobado) {
            await sock.sendMessage(jidClienteAprobado, {
              text: datos.clientNotificationMessage,
            });
            console.log('✅ Pago aprobado por Admin -> Notificación enviada al cliente:', datos.approvedPayment.clientPhone);
          }
        }

        // 3. Si el encargado de soporte respondió, enviarle la respuesta directamente al cliente
        if (datos.action === 'SUPPORT_AGENT_REPLY' && datos.targetClientPhone && datos.supportReplyText) {
          const jidCliente = telefonoAJid(datos.targetClientPhone);
          if (jidCliente) {
            await sock.sendMessage(jidCliente, {
              text: '💬 *Mensaje de FormaGym:*\\n\\n' + datos.supportReplyText,
            });
            console.log('✅ Respuesta de soporte enviada al cliente:', datos.targetClientPhone);
          }
        }

        // 4. Si es un pago o soporte del cliente, reenviar automáticamente al teléfono del encargado (con la foto si la envió)
        const telefonoEncargado = datos.redirectedToPhone || datos.designatedSupportPhone;
        const mensajeReenviado = datos.forwardedPaymentNotification || datos.forwardedMessageFormatted;

        if (telefonoEncargado && mensajeReenviado) {
          const jidEncargado = telefonoAJid(telefonoEncargado);
          if (jidEncargado) {
            if (tieneFoto && bufferFoto) {
              await sock.sendMessage(jidEncargado, {
                image: bufferFoto,
                caption: mensajeReenviado,
              });
            } else {
              await sock.sendMessage(jidEncargado, { text: mensajeReenviado });
            }
            console.log('📤 Pago/Soporte reenviado a encargado:', telefonoEncargado);
          }
        }
      } catch (err) {
        console.error('Error procesando mensaje:', err.message);
      }
    }
  });
}

iniciarBotFormaGym();
`;
  };

  const handleDownloadBaileysScript = () => {
    const code = buildBaileysStandaloneScript();
    const blob = new Blob([code], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bot_baileys_formagym.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 0. STANDALONE 24/7 WEBSITE LINK & MASTER POWER CONTROL (SEPARATE FROM AI STUDIO) */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-6 space-y-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                  botRunning247
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    botRunning247 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {botRunning247
                  ? 'Modo 24/7 Activo — Corriendo Continuamente'
                  : 'Sistema en Pausa (Apagado Manualmente)'}
              </span>
              <span className="text-xs font-mono text-slate-400">
                • {formatUptime(uptimeSeconds)}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Enlace Directo de tu Página Web Independiente 24/7 ({settings.businessName})
              </span>
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Usa cualquiera de estos enlaces para abrir el programa completo en una pestaña independiente, en la computadora del gimnasio o en tu celular,{' '}
              <strong className="text-white">totalmente separado de la página de AI Studio</strong>. El bot y la base de datos se mantienen encendidos 24/7 hasta que decidas apagarlos con el botón de la derecha.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {botRunning247 ? (
              <button
                type="button"
                disabled={isToggling247}
                onClick={() => handleToggle247Power(false)}
                className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <PowerOff className="w-4 h-4 text-red-400" />
                <span>Apagar Bot / Pausar 24/7</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isToggling247}
                onClick={() => handleToggle247Power(true)}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Power className="w-4 h-4" />
                <span>Encender Bot y Sistema 24/7</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Link 1: Main Direct Live Server URL */}
          <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                1. Enlace Web Directo de FormaGym (Servidor 24/7 Activo)
              </span>
              <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                Enlace Principal Activo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={liveWebUrl}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 select-all"
              />
              <button
                type="button"
                onClick={() => {
                  copyToClipboardSafe(liveWebUrl);
                  setCopiedDevUrl(true);
                  setTimeout(() => setCopiedDevUrl(false), 2500);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedDevUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedDevUrl ? 'Copiado' : 'Copiar'}</span>
              </button>
              <a
                href={liveWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir Web</span>
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Ábrelo en una nueva pestaña o guárdalo en Favoritos. Entra directo al panel sin bloqueos y guarda cada cambio en tiempo real.
            </p>
          </div>

          {/* Link 2: Fullscreen Standalone App Mode */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                2. Enlace Web Modo Pantalla Completa Independiente
              </span>
              <span className="text-[11px] text-slate-400">Acceso directo sin paneles</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={standaloneFullUrl}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-sky-300 select-all"
              />
              <button
                type="button"
                onClick={() => {
                  copyToClipboardSafe(standaloneFullUrl);
                  setCopiedProdUrl(true);
                  setTimeout(() => setCopiedProdUrl(false), 2500);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedProdUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedProdUrl ? 'Copiado' : 'Copiar'}</span>
              </button>
              <a
                href={standaloneFullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir Web</span>
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Conectado a la misma base de datos 24/7 del gimnasio para que todos tus cambios persistan al recargar.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>¿Cómo hacer cambios en el futuro?</strong> Usa tu enlace independiente todos los días. Cuando quieras modificar algo del diseño o del bot, simplemente abre de nuevo este proyecto aquí en AI Studio, pide el cambio y se actualizará al instante sin perder tus membresías ni productos.
            </span>
          </div>
        </div>
      </div>

      {/* 0B. INTERACTIVE WIKIPEDIA-STYLE GUIDE WITH CLICKABLE BLUE CODE EXPLANATIONS & ONE-CLICK LAUNCHERS */}
      <InteractiveWikiGuide
        localUrl={localUrl}
        lanUrl={lanUrl}
        onDownloadOrganizedExcel={onDownloadOrganizedExcel}
        onDownloadOrganizedJson={onDownloadOrganizedJson}
      />

      {/* 1. LIVE BAILEYS WHATSAPP CONNECTION ENGINE (DIRECT QR OR PAIRING CODE + STEP-BY-STEP GUIDE) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Conexión Directa a WhatsApp con Baileys (@whiskeysockets/baileys)
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Conectar el Bot de {settings.businessName} al Número de Teléfono donde Correrá
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl">
              Baileys conecta el bot directamente al WhatsApp de tu teléfono como un{' '}
              <strong>Dispositivo Vinculado</strong> (igual que WhatsApp Web), sin necesidad de pagar APIs externas. Puedes vincularlo aquí mismo en pantalla o descargando el archivo para tu PC.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {baileysStatus.connectionState === 'connected' ? (
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-900 text-xs font-bold rounded-lg flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span>Conectado en {baileysStatus.connectedPhone}</span>
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">
                Estado: {baileysStatus.connectionState === 'qr_ready' ? 'Esperando Escaneo' : baileysStatus.connectionState === 'connecting' ? 'Conectando...' : 'Sin Vincular'}
              </span>
            )}
          </div>
        </div>

        {/* Live Interactive Baileys QR / Pairing Code Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 text-white rounded-xl p-5">
          <div className="lg:col-span-7 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span>Opción A (Inmediata): Vincular con Baileys directamente desde este Panel</span>
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                El servidor ya tiene instalado <strong>@whiskeysockets/baileys</strong>. Elige si prefieres escanear un <strong>Código QR</strong> o escribir el número de teléfono para recibir un <strong>Código de 8 dígitos</strong> en tu WhatsApp:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Method 1: Generate QR */}
              <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-emerald-400">
                  1. Vincular Escaneando Código QR
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Abre WhatsApp en el celular del gimnasio → toca los 3 puntos (o Configuración) →{' '}
                  <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.
                </p>
                <button
                  type="button"
                  disabled={isTriggeringBaileys}
                  onClick={handleStartBaileysQr}
                  className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Generar Código QR en Pantalla</span>
                </button>
              </div>

              {/* Method 2: Generate 8-digit Pairing Code by Phone Number */}
              <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-2.5">
                <div className="text-xs font-bold text-sky-400">
                  2. O Vincular con Número (Código de 8 dígitos)
                </div>
                <p className="text-[11px] text-slate-300">
                  Escribe el número de WhatsApp donde correrá el bot (ej. <code className="text-white">+58 414-6734866</code>):
                </p>
                <input
                  type="text"
                  value={pairingPhoneInput}
                  onChange={(e) => setPairingPhoneInput(e.target.value)}
                  placeholder="+58 414-6734866"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
                <button
                  type="button"
                  disabled={isTriggeringBaileys}
                  onClick={handleStartBaileysPairingCode}
                  className="w-full py-2 px-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Obtener Código de 8 Dígitos</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-300">{baileysStatus.statusMessage}</span>
              {baileysStatus.connectionState !== 'disconnected' && (
                <button
                  type="button"
                  onClick={handleDisconnectBaileys}
                  className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Desconectar / Cambiar Número</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Side: QR Display / Pairing Code Display / Live Activity Log */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-xl p-5 min-h-[260px]">
            {baileysStatus.connectionState === 'connected' ? (
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                  <Check className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-white">
                  ¡Bot FormaGym Activo en WhatsApp!
                </h4>
                <p className="text-xs font-mono text-emerald-400">
                  Número conectado: {baileysStatus.connectedPhone}
                </p>
                <p className="text-xs text-slate-400 max-w-xs">
                  El bot ya está respondiendo mensajes en español, calculando precios en Bs. y reenviando fotos de pago a tus números encargados.
                </p>
              </div>
            ) : baileysStatus.pairingCode ? (
              <div className="text-center space-y-3">
                <span className="text-xs font-bold uppercase text-sky-400">
                  Código de Vinculación de WhatsApp
                </span>
                <div className="px-5 py-3 bg-slate-900 border-2 border-sky-500 rounded-xl font-mono text-2xl font-bold tracking-widest text-white">
                  {baileysStatus.pairingCode}
                </div>
                <p className="text-xs text-slate-300 max-w-xs">
                  En tu teléfono abre WhatsApp → <strong>Dispositivos vinculados</strong> →{' '}
                  <strong>Vincular con el número de teléfono</strong> y escribe este código.
                </p>
              </div>
            ) : baileysStatus.qrDataUrl ? (
              <div className="text-center space-y-2.5">
                <span className="text-xs font-bold text-emerald-400">
                  Escanea este Código QR con el WhatsApp del Gimnasio:
                </span>
                <div className="bg-white p-2.5 rounded-xl inline-block">
                  <img
                    src={baileysStatus.qrDataUrl}
                    alt="Código QR de WhatsApp Baileys"
                    className="w-52 h-52 object-contain"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  WhatsApp → Dispositivos vinculados → Vincular un dispositivo
                </p>
              </div>
            ) : (
              <div className="text-center space-y-2 text-slate-400">
                <QrCode className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-xs font-semibold text-slate-300">
                  Haz clic en &ldquo;Generar Código QR&rdquo; o &ldquo;Obtener Código de 8 Dígitos&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  El código aparecerá aquí al instante para vincular el teléfono donde funcionará el bot.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Beginner-Friendly Step-by-Step Explanation to Run Baileys on Any PC if Desired */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Guía Explicada Paso a Paso (Para Cualquier Persona sin Experiencia)
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                Opción B: Cómo ejecutar el Bot con Baileys en la Computadora del Gimnasio en 3 Pasos Simples
              </h3>
              <p className="text-xs text-slate-600">
                Si prefieres tener el programa de Baileys abierto también en tu propia computadora de escritorio o laptop, sigue estos 3 pasos:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadBaileysScript}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar bot_baileys_formagym.js</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(buildBaileysStandaloneScript());
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2500);
                }}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Código Copiado' : 'Copiar Código'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-emerald-800">
                PASO 1 — Instalar Node.js y Guardar el Archivo
              </span>
              <h4 className="text-sm font-bold text-slate-900">
                Crea una carpeta en tu Escritorio
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. Si no tienes Node.js, entra en <strong>nodejs.org</strong>, descarga el botón verde <strong>LTS</strong> e instálalo dando clic en <em>Siguiente</em>.<br />
                2. Crea una carpeta en tu Escritorio llamada <code className="font-mono font-bold text-slate-900">FormaGymBot</code> y mete adentro el archivo <strong>bot_baileys_formagym.js</strong> que descargaste arriba.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800">
                  PASO 2 — Instalar Baileys y Encender
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      'npm init -y && npm install @whiskeysockets/baileys qrcode-terminal pino && node bot_baileys_formagym.js'
                    );
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 2500);
                  }}
                  className="text-[11px] font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Copiado' : 'Copiar comando'}</span>
                </button>
              </div>
              <h4 className="text-sm font-bold text-slate-900">
                Pega este comando en la Terminal (CMD)
              </h4>
              <p className="text-xs text-slate-600">
                Abre la carpeta <code className="font-mono">FormaGymBot</code>, escribe <code className="font-mono font-bold">cmd</code> en la barra de dirección de arriba, presiona Enter y pega:
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                npm init -y && npm install @whiskeysockets/baileys qrcode-terminal pino{'\n'}node bot_baileys_formagym.js
              </pre>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-purple-800">
                PASO 3 — Escanear el QR con tu Celular
              </span>
              <h4 className="text-sm font-bold text-slate-900">
                Vincular el WhatsApp del Gimnasio
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. En la ventana negra aparecerá un <strong>Código QR grande</strong>.<br />
                2. Toma el celular que tiene el número de WhatsApp del gimnasio, abre WhatsApp → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong> y apunta la cámara al QR.<br />
                3. ¡Listo! Quedará guardado en la carpeta <code className="font-mono">sesion_whatsapp_formagym</code> para que no tengas que volver a escanearlo.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. EXACT DATA STORAGE LOCATION & ORGANIZED DOWNLOADS */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Ubicación Exacta de tus Datos Financieros (Nube + Respaldo Local)
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              ¿Dónde se guarda exactamente toda la información y los pagos de {settings.businessName}?
            </h2>
            <p className="text-xs text-slate-600">
              Tus datos están sincronizados en la nube y respaldados localmente para proteger cada pago recibido.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onDownloadOrganizedExcel}
              className="px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Descargar Base de Datos en Excel (.CSV)</span>
            </button>
            <button
              type="button"
              onClick={onDownloadOrganizedJson}
              className="px-4 py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Base de Datos Organizada (.JSON)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <Database className="w-4 h-4" />
              <span>1. Base de Datos Permanente 24/7 del Sistema</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>ID del Sistema:</strong>{' '}
              <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                ai-studio-7f6c7aef-5816-4e5d-af50-94313fbe6f39
              </code>
            </p>
            <ul className="text-xs text-slate-600 space-y-1 font-mono">
              <li>• /memberships ({memberships.length} registros)</li>
              <li>• /shop_orders ({shopOrders.length} pedidos)</li>
              <li>• /products ({products.length} productos)</li>
              <li>• /exchange_settings (Configuración y tasas)</li>
            </ul>
            <p className="text-[11px] text-emerald-700 font-semibold">
              Estado: Sincronización Automática 24/7 Activa
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Database className="w-4 h-4 text-blue-600" />
              <span>2. Servidor & Memoria Local Automática</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cada cambio se escribe instantáneamente en el disco del servidor y en tu navegador:
            </p>
            <ul className="text-xs text-slate-600 space-y-1 font-mono">
              <li>• Archivo: /formagym_local_db.json</li>
              <li>• LocalStorage: formagym_local_db_v1</li>
              <li>• Historial Eliminados: {deletedMemberships.length} guardados</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <HardDrive className="w-4 h-4 text-amber-600" />
              <span>3. Descarga Directa a tu PC (Excel / JSON)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Los botones de arriba descargan un archivo organizado con todas las tablas:
              <strong> Membresías Activas/Pendientes</strong>,{' '}
              <strong>Membresías Eliminadas</strong>, <strong>Pedidos de Tienda</strong> y{' '}
              <strong>Lista de Precios</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* 3. CENTRALIZED BOT & PHONE NUMBERS CONFIGURATION FORM */}
      <form
        onSubmit={handleSaveAllConfig}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Panel Central de Configuración del Bot
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Números de Teléfono, Tasas de Cambio y Respuestas del Bot ({settings.businessName})
            </h3>
          </div>
          <button
            type="submit"
            disabled={savingConfig}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{savingConfig ? 'Guardando...' : 'Guardar Toda la Configuración del Bot'}</span>
          </button>
        </div>

        {/* Phone Numbers Grid */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-700" />
            <span>1. Admin Numbers y Redirección de Pagos / Soporte</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-300 space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <label className="block text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Admin Numbers</span>
                </label>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-950">
                  {parsedAdminNumbersList.length} admin(s)
                </span>
              </div>
              <p className="text-[11px] text-emerald-900 leading-snug">
                Agrega los números que quieras que sean <strong>Admin</strong> en el bot (estadísticas, revisar/aprobar pendientes, buscar miembros, agregar membresía manual). <strong>NO reciben los pagos de ningún Pago Móvil ni el contestador de soporte.</strong>
              </p>

              {/* Add single admin number input + button */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newAdminPhoneInput}
                  onChange={(e) => setNewAdminPhoneInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAdminNumber();
                    }
                  }}
                  placeholder="+58 412-1234567"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-emerald-300 rounded-lg text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAddAdminNumber}
                  className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>

              {/* List of added admin numbers with delete button */}
              {parsedAdminNumbersList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parsedAdminNumbersList.map((admPhone) => (
                    <span
                      key={admPhone}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-emerald-300 text-[11px] font-mono font-semibold text-slate-900"
                    >
                      <span>{admPhone}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAdminNumber(admPhone)}
                        className="text-red-500 hover:text-red-700 cursor-pointer"
                        title="Quitar este número de Admin Numbers"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800/80 italic">
                  Aún no has agregado números extra en Admin Numbers. Escribe un número arriba y pulsa Agregar.
                </p>
              )}

              {/* Optional direct comma-separated input */}
              <input
                type="text"
                value={adminNumbers}
                onChange={(e) => {
                  const v = e.target.value;
                  setAdminNumbers(v);
                  persistCurrentConfigDraft({ adminNumbers: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                placeholder="+58 412-0000000, +58 414-0000000"
                className="w-full px-2.5 py-1.5 text-[11px] font-mono bg-white/80 border border-emerald-200 rounded-lg text-slate-700"
                title="Lista de Admin Numbers separados por coma"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-900">
                Número para Pagos de Membresías y Ropa
              </label>
              <p className="text-[11px] text-slate-500">
                Recibe la foto del comprobante y pago de mensualidad/ropa.
              </p>
              <input
                type="text"
                value={ownerPhoneMemberships}
                onChange={(e) => {
                  const v = e.target.value;
                  setOwnerPhoneMemberships(v);
                  persistCurrentConfigDraft({ ownerMem: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                placeholder="+58 414-6734866"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-900">
                Número para Pagos de Jugos, Bebidas y Comida
              </label>
              <p className="text-[11px] text-slate-500">
                Recibe la foto del comprobante y pedido de jugos/agua/comida.
              </p>
              <input
                type="text"
                value={ownerPhoneConsumables}
                onChange={(e) => {
                  const v = e.target.value;
                  setOwnerPhoneConsumables(v);
                  persistCurrentConfigDraft({ ownerCons: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                placeholder="+58 424-6559787"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-900">
                Número Encargado de Soporte / Ayuda
              </label>
              <p className="text-[11px] text-slate-500">
                Recibe dudas especiales (“+58...: problema”) y reenvía respuestas.
              </p>
              <input
                type="text"
                value={ownerPhoneSupport}
                onChange={(e) => {
                  const v = e.target.value;
                  setOwnerPhoneSupport(v);
                  persistCurrentConfigDraft({ ownerSup: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                placeholder="+58 414-6734866"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Exchange Rates Grid */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                2. Tasas de Cambio Internas (Dólar BCV, Euro BCV y Manual — Ocultas al Cliente)
              </h4>
              <p className="text-xs text-slate-500">
                Fuente: {rateSource} ({rateUpdatedAt}). El bot calcula en Bs. sin mencionar la tasa al cliente.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshLiveRate}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar BCV Ahora</span>
              </button>
              <button
                type="button"
                onClick={onApplyRateToAllProducts}
                className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
              >
                Aplicar Tasa a Todos los Productos (Respetando USD)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                settings.mode === 'auto_bcv'
                  ? 'border-emerald-600 bg-emerald-50/40'
                  : 'border-slate-200 bg-slate-50'
              } space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Tasa Dólar BCV (Bs./$)</span>
                <button
                  type="button"
                  onClick={() => handleRecalculateMemBsWithMode('auto_bcv')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                    settings.mode === 'auto_bcv'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  {settings.mode === 'auto_bcv' ? 'Predeterminada (Recalcular)' : 'Usar esta tasa'}
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={bcvInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setBcvInput(v);
                  const r = Number(v) || 0;
                  if (r > 0) {
                    if (settings.mode === 'auto_bcv') {
                      const u = Number(memUsdInput) || settings.membershipMonthlyUsd;
                      const nextBsStr = (u * r).toFixed(2);
                      const ru = Number(regUsdInput) || (settings.registrationUsd ?? 15);
                      const nextRegBsStr = (ru * r).toFixed(2);
                      setMemBsInput(nextBsStr);
                      setRegBsInput(nextRegBsStr);
                      persistCurrentConfigDraft({
                        bcv: v,
                        bs: nextBsStr,
                        regBs: nextRegBsStr,
                        silent: true,
                      });
                    } else {
                      persistCurrentConfigDraft({ bcv: v, silent: true });
                    }
                  }
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div
              className={`p-4 rounded-xl border ${
                settings.mode === 'auto_euro'
                  ? 'border-emerald-600 bg-emerald-50/40'
                  : 'border-slate-200 bg-slate-50'
              } space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Tasa Euro BCV (Bs./€)</span>
                <button
                  type="button"
                  onClick={() => handleRecalculateMemBsWithMode('auto_euro')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                    settings.mode === 'auto_euro'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  {settings.mode === 'auto_euro' ? 'Predeterminada (Recalcular)' : 'Usar esta tasa'}
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={euroInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setEuroInput(v);
                  const r = Number(v) || 0;
                  if (r > 0) {
                    if (settings.mode === 'auto_euro') {
                      const u = Number(memUsdInput) || settings.membershipMonthlyUsd;
                      const nextBsStr = (u * r).toFixed(2);
                      const ru = Number(regUsdInput) || (settings.registrationUsd ?? 15);
                      const nextRegBsStr = (ru * r).toFixed(2);
                      setMemBsInput(nextBsStr);
                      setRegBsInput(nextRegBsStr);
                      persistCurrentConfigDraft({
                        euro: v,
                        bs: nextBsStr,
                        regBs: nextRegBsStr,
                        silent: true,
                      });
                    } else {
                      persistCurrentConfigDraft({ euro: v, silent: true });
                    }
                  }
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div
              className={`p-4 rounded-xl border ${
                settings.mode === 'manual'
                  ? 'border-emerald-600 bg-emerald-50/40'
                  : 'border-slate-200 bg-slate-50'
              } space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Tasa Manual Propia (Bs.)</span>
                <button
                  type="button"
                  onClick={() => handleRecalculateMemBsWithMode('manual')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                    settings.mode === 'manual'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  {settings.mode === 'manual' ? 'Predeterminada (Recalcular)' : 'Usar esta tasa'}
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setManualInput(v);
                  const r = Number(v) || 0;
                  if (r > 0) {
                    if (settings.mode === 'manual') {
                      const u = Number(memUsdInput) || settings.membershipMonthlyUsd;
                      const nextBsStr = (u * r).toFixed(2);
                      const ru = Number(regUsdInput) || (settings.registrationUsd ?? 15);
                      const nextRegBsStr = (ru * r).toFixed(2);
                      setMemBsInput(nextBsStr);
                      setRegBsInput(nextRegBsStr);
                      persistCurrentConfigDraft({
                        manual: v,
                        bs: nextBsStr,
                        regBs: nextRegBsStr,
                        silent: true,
                      });
                    } else {
                      persistCurrentConfigDraft({ manual: v, silent: true });
                    }
                  }
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Bot Messages, Gym Name & Base Membership + Registration Price */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span>
                3. Nombre del Bot, Precios de Mensualidad e Inscripción (Vitalicia), Horario y Pago Móvil
              </span>
            </h4>
            <button
              type="button"
              onClick={() => handleRecalculateMemBsWithMode(settings.mode)}
              className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Aplicar Tasa a Mensualidad e Inscripción</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del Gimnasio / Bot
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => {
                  const v = e.target.value;
                  setBusinessName(v);
                  persistCurrentConfigDraft({ bizName: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tasa Compartida para Mensualidad e Inscripción Vitalicia
              </label>
              <select
                value={settings.mode}
                onChange={(e) => handleRecalculateMemBsWithMode(e.target.value as RateMode)}
                className="w-full px-3 py-2 text-xs font-semibold border border-emerald-300 bg-emerald-50/60 text-slate-900 rounded-lg"
              >
                <option value="auto_bcv">
                  Dólar BCV (Bs. {(Number(bcvInput) || settings.bcvRate).toFixed(2)})
                </option>
                <option value="auto_euro">
                  Euro BCV (Bs. {(Number(euroInput) || settings.euroRate).toFixed(2)})
                </option>
                <option value="manual">
                  Tasa Manual (Bs. {(Number(manualInput) || settings.manualRate).toFixed(2)})
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mensualidad Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Membresía Mensual (Renovable cada mes)
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  1 Mes Calendario
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Precio Mensualidad ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={memUsdInput}
                    onChange={(e) => handleMemUsdChange(e.target.value)}
                    onBlur={() => persistCurrentConfigDraft({ silent: false })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Precio Mensualidad (Bs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={memBsInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMemBsInput(v);
                      if (Number(v) > 0) {
                        persistCurrentConfigDraft({ bs: v, silent: true });
                      }
                    }}
                    onBlur={() => persistCurrentConfigDraft({ silent: false })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-emerald-800 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Inscripción Vitalicia Box */}
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Inscripción Vitalicia (De por vida — Requisito para Membresía)
                </span>
                <span className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                  Pago Único de por Vida
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Precio Inscripción ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={regUsdInput}
                    onChange={(e) => handleRegUsdChange(e.target.value)}
                    onBlur={() => persistCurrentConfigDraft({ silent: false })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Precio Inscripción (Bs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={regBsInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRegBsInput(v);
                      if (Number(v) > 0) {
                        persistCurrentConfigDraft({ regBs: v, silent: true });
                      }
                    }}
                    onBlur={() => persistCurrentConfigDraft({ silent: false })}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-amber-950 bg-white border border-amber-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Respuesta del Bot al preguntar “¿Cuál es el horario?”
              </label>
              <textarea
                rows={4}
                value={scheduleText}
                onChange={(e) => {
                  const v = e.target.value;
                  setScheduleText(v);
                  persistCurrentConfigDraft({ sched: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Respuesta del Bot al preguntar “¿Cuál es el Pago Móvil?”
              </label>
              <textarea
                rows={4}
                value={paymentMethodsText}
                onChange={(e) => {
                  const v = e.target.value;
                  setPaymentMethodsText(v);
                  persistCurrentConfigDraft({ payMethods: v, silent: true });
                }}
                onBlur={() => persistCurrentConfigDraft({ silent: false })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
