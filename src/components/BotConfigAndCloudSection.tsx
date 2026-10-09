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

  const [settingsViewTab, setSettingsViewTab] = useState<'pm2_bot' | 'config_form' | 'wiki_db'>(
    'pm2_bot'
  );

  const handleDownloadWindowsLauncher = () => {
    const batContent = `@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Ejecutable Todo-en-Uno (Servidor + Baileys Local + PM2 24/7)

echo ====================================================================
echo   🏋️‍♂️ FORMAGYM - EJECUTABLE INTEGRADO (WEB + BAILEYS LOCAL + PM2)
echo ====================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en esta computadora.
    echo Descargalo gratis desde: https://nodejs.org (Boton verde LTS)
    start "" "https://nodejs.org"
    pause
    exit /b 1
)

if not exist "node_modules\\" (
    echo [1/4] Instalando librerias por primera vez...
    call npm install
) else (
    echo [1/4] Librerias listas.
)

echo [2/4] Verificando motor 24/7 PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo       Instalando PM2 automaticamente...
    call npm install -g pm2
)

if not exist "ecosystem.config.cjs" (
    (
        echo module.exports = {
        echo   apps: [{
        echo     name: 'formagym-bot-24-7',
        echo     script: './node_modules/tsx/dist/cli.mjs',
        echo     args: 'server.ts',
        echo     autorestart: true,
        echo     max_memory_restart: '750M',
        echo     env: { NODE_ENV: 'development', PORT: 3000, AUTO_START_BAILEYS: 'true' }
        echo   }]
        echo };
    ) > ecosystem.config.cjs
)

echo [3/4] Activando Servidor + Bot Local Baileys dentro de PM2...
set AUTO_START_BAILEYS=true
call pm2 delete formagym-bot-24-7 >nul 2>nul
call pm2 start ecosystem.config.cjs --update-env
call pm2 save >nul 2>nul

echo [4/4] Abriendo http://localhost:3000 ...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call pm2 logs formagym-bot-24-7 --lines 35
pause
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CLIC_AQUI_INICIAR_WINDOWS.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadWindowsStopLauncher = () => {
    const stopBatContent = `@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Apagar Servidor y Bot PM2
echo ====================================================================
echo   🛑 APAGANDO SERVIDOR FORMAGYM Y BOT BAILEYS EN PM2
echo ====================================================================
call pm2 stop formagym-bot-24-7
call pm2 delete formagym-bot-24-7
call pm2 save --force >nul 2>nul
echo.
echo [OK] El servidor y el bot de WhatsApp se han apagado por completo.
pause
`;
    const blob = new Blob([stopBatContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadUnixLauncher = () => {
    const shContent = `#!/usr/bin/env bash
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "================================================================"
echo "  FORMAGYM - EJECUTABLE INTEGRADO (WEB + BAILEYS LOCAL + PM2)"
echo "================================================================"
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no está instalado. Instálalo desde https://nodejs.org"
  exit 1
fi
if [ ! -d "node_modules" ]; then
  npm install
fi
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 || true
fi
if [ ! -f "ecosystem.config.cjs" ]; then
  cat << 'EOF' > ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'formagym-bot-24-7',
    script: './node_modules/tsx/dist/cli.mjs',
    args: 'server.ts',
    autorestart: true,
    max_memory_restart: '750M',
    env: { NODE_ENV: 'development', PORT: 3000, AUTO_START_BAILEYS: 'true' }
  }]
};
EOF
fi
export AUTO_START_BAILEYS=true
pm2 delete formagym-bot-24-7 >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null 2>&1 || true
(sleep 3 && open "http://localhost:3000" 2>/dev/null || true) &
pm2 logs formagym-bot-24-7 --lines 35
`;
    const blob = new Blob([shContent], { type: 'text/x-sh;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CLIC_AQUI_INICIAR_MAC.command';
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

  // Generate standalone Baileys script pre-configured with localhost:3000 + @lid resolution + safe JSON parsing
  const buildBaileysStandaloneScript = () => {
    const localApiUrl = 'http://localhost:3000/api/whatsapp/chat';
    return `// ============================================================================
// FORMAGYM — BOT DE WHATSAPP OFICIAL CON BAILEYS (@whiskeysockets/baileys)
// NOTA: Al hacer doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat, el servidor ya
// inicia este bot automáticamente dentro de PM2 (sin necesidad de correr esto aparte).
// Si deseas correr este archivo manualmente, se conecta directo a tu servidor
// local en http://localhost:3000/api/whatsapp/chat (sin errores de HTML/JSON)
// y resuelve identificadores @lid de WhatsApp automáticamente.
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

const LOCAL_API_URL = process.env.FORMAGYM_API_URL || ${JSON.stringify(localApiUrl)};
const mapaTelefonoAJid = new Map();

function formatearTelefono(jid) {
  const digitos = (jid || '').split('@')[0].split(':')[0].replace(/\\D/g, '');
  if (digitos.startsWith('58') && digitos.length === 12) {
    return '+58 ' + digitos.slice(2, 5) + '-' + digitos.slice(5);
  }
  return digitos ? '+' + digitos : '+58 412-0000000';
}

function extraerTelefonoReal(msg) {
  const key = msg.key || {};
  const remoteJid = key.remoteJid || '';
  const senderPn = key.senderPn || key.remoteJidAlt || key.participantAlt || '';
  const participant = key.participant || '';
  // Priorizar JID con @s.whatsapp.net para obtener el número real y no el ID @lid
  const candidato =
    [senderPn, remoteJid, participant].find((j) => j && j.endsWith('@s.whatsapp.net')) ||
    senderPn ||
    participant ||
    remoteJid;
  const telefono = formatearTelefono(candidato);
  const clave = telefono.replace(/\\D/g, '').slice(-10);
  if (clave && remoteJid) {
    mapaTelefonoAJid.set(clave, remoteJid);
  }
  return { telefonoCliente: telefono, replyJid: remoteJid };
}

function telefonoAJid(telefono) {
  let digitos = (telefono || '').replace(/\\D/g, '');
  const clave = digitos.slice(-10);
  if (clave && mapaTelefonoAJid.has(clave)) {
    return mapaTelefonoAJid.get(clave);
  }
  if (digitos.startsWith('04') && digitos.length === 11) {
    digitos = '58' + digitos.slice(1);
  }
  return digitos ? digitos + '@s.whatsapp.net' : null;
}

async function iniciarBotFormaGym() {
  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');
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
      console.log('🔗 Conectado al servidor local en: ' + LOCAL_API_URL);
      console.log('🤖 Escuchando mensajes de clientes en tiempo real...\\n');
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconectando con WhatsApp...');
        setTimeout(iniciarBotFormaGym, 3000);
      } else {
        console.log('❌ Sesión cerrada desde el teléfono. Borra la carpeta baileys_auth_info para volver a escanear.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) continue;

      const { telefonoCliente, replyJid } = extraerTelefonoReal(msg);
      const rawInner =
        msg.message?.ephemeralMessage?.message ||
        msg.message?.viewOnceMessage?.message ||
        msg.message?.viewOnceMessageV2?.message ||
        msg.message;
      const imageMsgObj = rawInner?.imageMessage || msg.message?.imageMessage;
      const extTextObj = rawInner?.extendedTextMessage || msg.message?.extendedTextMessage;
      const texto =
        rawInner?.conversation ||
        msg.message?.conversation ||
        extTextObj?.text ||
        imageMsgObj?.caption ||
        '';
      const quotedMsg = extTextObj?.contextInfo?.quotedMessage || imageMsgObj?.contextInfo?.quotedMessage;
      const textoCitado =
        quotedMsg?.conversation ||
        quotedMsg?.extendedTextMessage?.text ||
        quotedMsg?.imageMessage?.caption ||
        '';
      const tieneFoto = Boolean(imageMsgObj);

      if (!texto.trim() && !tieneFoto) continue;

      console.log('📩 Mensaje de ' + telefonoCliente + ':', texto);

      try {
        let bufferFoto = null;
        let receiptImageUrl = undefined;
        if (tieneFoto) {
          try {
            bufferFoto = await downloadMediaMessage(msg, 'buffer', {});
            const mime = imageMsgObj?.mimetype || 'image/jpeg';
            receiptImageUrl = 'data:' + mime + ';base64,' + bufferFoto.toString('base64');
          } catch (e) {
            console.error('No se pudo descargar la imagen:', e.message);
          }
        }

        const res = await fetch(LOCAL_API_URL, {
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

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.error('⚠️ El servidor en ' + LOCAL_API_URL + ' no devolvió JSON. Asegúrate de haber iniciado CLIC_AQUI_INICIAR_WINDOWS.bat para que http://localhost:3000 esté activo.');
          continue;
        }

        const datos = await res.json();

        // 1. Responder al remitente en WhatsApp (funciona con @s.whatsapp.net y @lid)
        if (datos.reply) {
          await sock.sendMessage(replyJid, { text: datos.reply });
        }

        // 2. Si el administrador aprobó un Pago Móvil escribiendo "approved" o "aprobado", notificar al cliente
        if (datos.action === 'ADMIN_APPROVE_PAYMENT' && (datos.targetClientPhone || datos.approvedPayment?.clientPhone) && datos.clientNotificationMessage) {
          const telAprobado = datos.targetClientPhone || datos.approvedPayment.clientPhone;
          const jidClienteAprobado = telefonoAJid(telAprobado);
          if (jidClienteAprobado) {
            await sock.sendMessage(jidClienteAprobado, {
              text: datos.clientNotificationMessage,
            });
            console.log('✅ Pago aprobado por Admin -> Notificación enviada al cliente:', telAprobado);
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

        // 4. Si es un pago o soporte del cliente, reenviar automáticamente al teléfono del encargado
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
        console.error('Error conectando con http://localhost:3000 (asegúrate de encender el servidor con CLIC_AQUI_INICIAR_WINDOWS.bat):', err.message);
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
    <div className="space-y-5">
      {/* CLEAN, SIMPLE TOP SUB-NAVIGATION FOR SETTINGS (NO OVERLOAD) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsViewTab('pm2_bot')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              settingsViewTab === 'pm2_bot'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>1. Ejecutable Doble Clic (PM2 + Baileys) y QR</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsViewTab('config_form')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              settingsViewTab === 'config_form'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>2. Precios, Tasas y Teléfonos del Bot</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsViewTab('wiki_db')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              settingsViewTab === 'wiki_db'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>3. Wiki del Código y Descargar Excel / Base de Datos</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
              baileysStatus.connectionState === 'connected'
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {baileysStatus.connectionState === 'connected'
                ? `WhatsApp Activo (${baileysStatus.connectedPhone})`
                : 'WhatsApp: Listo para vincular'}
            </span>
          </span>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: SIMPLE PM2 + BAILEYS EXECUTABLE & WHATSAPP CONNECTION
      ===================================================================== */}
      {settingsViewTab === 'pm2_bot' && (
        <div className="space-y-5">
          {/* Card 1: Integrated PM2 + Baileys Double-Click Executable & Simple Guide */}
          <div className="bg-white border-2 border-emerald-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-bold uppercase">
                  Todo Integrado en 1 Solo Archivo (Sin Comandos)
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Ejecutable de Doble Clic con PM2 + Bot Baileys Local Integrado
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Ya no necesitas abrir el bot manual por separado. Este ejecutable lleva{' '}
                  <strong>PM2 + el Servidor Web + el Bot Baileys Local integrados adentro</strong> (y con{' '}
                  <code className="font-mono bg-slate-100 px-1 rounded">esbuild ^0.28.0</code> listo). Solo hazle doble clic y todo funciona sin el error de HTML.
                </p>
              </div>

              {/* Clean Download Buttons for Start & Stop Executables */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadWindowsLauncher}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>1. Descargar INICIAR (Windows .bat con PM2)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadWindowsStopLauncher}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <PowerOff className="w-4 h-4" />
                  <span>2. Descargar APAGAR PM2 (Windows .bat)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadUnixLauncher}
                  className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Mac / Linux (.command)</span>
                </button>
              </div>
            </div>

            {/* Simple 3-Box Visual Guide: How to Start, What PM2 Does, How to Stop */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Box 1: How to turn it on */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                <div className="text-xs font-bold text-emerald-900 uppercase">
                  PASO 1 — Cómo Encender Todo
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Solo haz Doble Clic en Iniciar
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Guarda <code className="font-mono font-bold">CLIC_AQUI_INICIAR_WINDOWS.bat</code> dentro de la carpeta del proyecto (ya viene incluido ahí también) y hazle <strong>doble clic</strong>.
                </p>
                <p className="text-[11px] text-emerald-900 font-semibold">
                  ✓ Instala las librerías solo, configura PM2, enciende Baileys Local y te abre http://localhost:3000.
                </p>
              </div>

              {/* Box 2: What PM2 is and how it works inside */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
                <div className="text-xs font-bold text-blue-900 uppercase">
                  PASO 2 — ¿Qué hace PM2 por dentro?
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mantiene el Bot Vivo 24/7 sin Caerse
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  El propio ejecutable crea el archivo <code className="font-mono">ecosystem.config.cjs</code> y arranca el proceso <code className="font-mono font-bold">formagym-bot-24-7</code> con <code className="font-mono">AUTO_START_BAILEYS=true</code>.
                </p>
                <p className="text-[11px] text-blue-900 font-semibold">
                  ✓ Si cierras la ventana negra o falla el internet, PM2 mantiene el bot encendido en segundo plano y lo reinicia solo en 3 segundos.
                </p>
              </div>

              {/* Box 3: How to turn it off */}
              <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-2">
                <div className="text-xs font-bold text-rose-900 uppercase">
                  PASO 3 — Cómo Apagar PM2
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Doble Clic en el Botón de Apagado
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Como PM2 sigue corriendo oculto en segundo plano aunque cierres la ventana, para apagarlo de verdad haz <strong>doble clic</strong> en <code className="font-mono font-bold">APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat</code>.
                </p>
                <p className="text-[11px] text-rose-900 font-semibold">
                  ✓ O si usas terminal: <code className="font-mono bg-white px-1 rounded">npm run pm2:stop</code> para apagar y <code className="font-mono bg-white px-1 rounded">npm run pm2:logs</code> para ver mensajes.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Clean WhatsApp QR / 8-Digit Pairing Box */}
          <div className="bg-slate-900 text-white rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Vincular el Número de WhatsApp del Gimnasio
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Escanea el Código QR o usa el Código de 8 Dígitos
                </h3>
              </div>
              {baileysStatus.connectionState !== 'disconnected' && (
                <button
                  type="button"
                  onClick={handleDisconnectBaileys}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Desconectar / Cambiar Número</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-emerald-400">
                    Opción 1: Escanear Código QR
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    En el celular del gimnasio abre WhatsApp → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.
                  </p>
                  <button
                    type="button"
                    disabled={isTriggeringBaileys}
                    onClick={handleStartBaileysQr}
                    className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Generar Código QR</span>
                  </button>
                </div>

                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold text-sky-400">
                    Opción 2: Código de 8 Dígitos
                  </div>
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

              <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-xl p-5 min-h-[210px]">
                {baileysStatus.connectionState === 'connected' ? (
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                      <Check className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      ¡WhatsApp Conectado ({baileysStatus.connectedPhone})!
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      El bot ya responde mensajes y procesa pagos automáticamente.
                    </p>
                  </div>
                ) : baileysStatus.pairingCode ? (
                  <div className="text-center space-y-2">
                    <span className="text-xs font-bold uppercase text-sky-400">
                      Código de 8 Dígitos:
                    </span>
                    <div className="px-5 py-2.5 bg-slate-900 border-2 border-sky-500 rounded-xl font-mono text-xl font-bold tracking-widest text-white">
                      {baileysStatus.pairingCode}
                    </div>
                  </div>
                ) : baileysStatus.qrDataUrl ? (
                  <div className="text-center space-y-2">
                    <div className="bg-white p-2 rounded-xl inline-block">
                      <img
                        src={baileysStatus.qrDataUrl}
                        alt="Código QR WhatsApp"
                        className="w-44 h-44 object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-1.5 text-slate-400">
                    <QrCode className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="text-xs font-semibold text-slate-300">
                      Pulsa &ldquo;Generar Código QR&rdquo; para vincular
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: INTERACTIVE WIKI & DATABASE DOWNLOADS
      ===================================================================== */}
      {settingsViewTab === 'wiki_db' && (
        <InteractiveWikiGuide
          localUrl={localUrl}
          lanUrl={lanUrl}
          onDownloadOrganizedExcel={onDownloadOrganizedExcel}
          onDownloadOrganizedJson={onDownloadOrganizedJson}
        />
      )}

      {/* =====================================================================
          TAB 2: CENTRALIZED BOT & PHONE NUMBERS CONFIGURATION FORM
      ===================================================================== */}
      {settingsViewTab === 'config_form' && (
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
      )}
    </div>
  );
};

