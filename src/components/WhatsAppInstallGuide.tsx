import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  HardDrive,
  Smartphone,
  Terminal,
  Upload,
} from 'lucide-react';
import {
  ExchangeSettings,
  MembershipRecord,
  ProductItem,
  ShopOrderRecord,
} from '../types';

interface WhatsAppInstallGuideProps {
  settings: ExchangeSettings;
  products: ProductItem[];
  memberships: MembershipRecord[];
  shopOrders: ShopOrderRecord[];
  autoDownloadCsv: boolean;
  onToggleAutoDownloadCsv: (val: boolean) => void;
  onDownloadCsv: () => void;
  onDownloadJson: () => void;
  onImportJson: (file: File) => void;
}

export const WhatsAppInstallGuide: React.FC<WhatsAppInstallGuideProps> = ({
  settings,
  products,
  memberships,
  shopOrders,
  autoDownloadCsv,
  onToggleAutoDownloadCsv,
  onDownloadCsv,
  onDownloadJson,
  onImportJson,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildStandalonePythonCode = () => {
    const cleanProducts = products.map((p) => ({
      name: p.name,
      category: p.category,
      basePriceUsd: p.basePriceUsd,
      priceBs: p.priceBs,
      rateMode: p.rateMode || 'auto_bcv',
      available: p.available,
    }));

    const cleanMemberships = memberships.map((m) => ({
      phone: m.phone,
      firstName: m.firstName,
      lastName: m.lastName,
      cedula: m.cedula,
      status: m.status,
      planName: m.planName,
      amountUsd: m.priceUsd,
      amountBs: m.totalBs,
      paymentRef: m.paymentRef,
      expiresAt: m.expiresAt,
    }));

    return `# ==============================================================================
# FORMAGYM — BOT DE WHATSAPP 100% LOCAL EN PYTHON (SIN DEPENDER DE NINGUNA WEB)
# Guarda todas las membresías y pagos en tu computadora en:
#   1) membresias_formagym.json (Base de datos local)
#   2) membresias_formagym.csv  (Ábrelo directamente en Microsoft Excel)
# ==============================================================================
# CÓMO INSTALAR EN TU PC (1 SOLA VEZ):
#   pip install flask twilio requests google-genai
#
# CÓMO EJECUTARLO:
#   python formagym_bot_local.py
# ==============================================================================

import os
import re
import csv
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify

app = Flask(__name__)

ARCHIVO_JSON_LOCAL = "membresias_formagym.json"
ARCHIVO_EXCEL_CSV = "membresias_formagym.csv"

# CONFIGURACIÓN LOCAL EXPORTADA DESDE TU PANEL FORMAGYM
CONFIG_LOCAL = {
    "gym_name": ${JSON.stringify(settings.businessName || 'FormaGym')},
    "bcv_rate": ${Number(settings.bcvRate || 68.45)},
    "euro_rate": ${Number(settings.euroRate || 74.2)},
    "manual_rate": ${Number(settings.manualRate || 70.0)},
    "membership_usd": ${Number(settings.membershipMonthlyUsd || 30)},
    "membership_bs": ${Number(settings.membershipMonthlyBs || 2053.5)},
    "owner_phone_memberships": ${JSON.stringify(settings.ownerPhoneMemberships || '+58 414-6734866')},
    "owner_phone_consumables": ${JSON.stringify(settings.ownerPhoneConsumables || '+58 424-6559787')},
    "owner_phone_support": ${JSON.stringify(settings.ownerPhoneSupport || '+58 414-6734866')},
}

PAGO_MOVIL_TEXTO = """Para pagos de Jugos, Bebidas, Comida
Banco de Venezuela
17636777
04246559787

Para pagos de Mensualidad y Ropa
Banco de Venezuela
18318153
04146734866."""

HORARIO_TEXTO = """🕒 *Horario de FormaGym:*
• *Lunes a Viernes:* 7:00 AM a 9:00 PM
• *Sábados (horario especial aparte):* 10:00 AM a 3:00 PM
• *Domingos:* Cerrado"""

PRODUCTOS = ${JSON.stringify(cleanProducts, null, 4)}

MEMBRESIAS_INICIALES = ${JSON.stringify(cleanMemberships, null, 4)}


def cargar_db_local():
    if os.path.exists(ARCHIVO_JSON_LOCAL):
        with open(ARCHIVO_JSON_LOCAL, "r", encoding="utf-8") as f:
            return json.load(f)
    db = {
        "membresias": {m["phone"]: m for m in MEMBRESIAS_INICIALES},
        "pedidos_tienda": [],
        "soporte_activo": {}
    }
    guardar_db_local(db)
    return db


def guardar_db_local(db):
    with open(ARCHIVO_JSON_LOCAL, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    # También actualiza el archivo CSV para abrir en Excel en cualquier momento
    with open(ARCHIVO_EXCEL_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Telefono", "Cedula", "Nombre", "Apellido", "Estado",
            "Monto_USD", "Monto_Bs", "Referencia_PagoMovil", "Inicio", "Vencimiento"
        ])
        for tel, m in db.get("membresias", {}).items():
            writer.writerow([
                tel,
                m.get("cedula", ""),
                m.get("firstName", ""),
                m.get("lastName", ""),
                m.get("status", ""),
                m.get("amountUsd", 0),
                m.get("amountBs", 0),
                m.get("paymentRef", ""),
                m.get("startDate", ""),
                m.get("expiresAt", "")
            ])


def responder_mensaje_formagym(telefono, mensaje, tiene_foto=False):
    db = cargar_db_local()
    texto = (mensaje or "").strip().lower()
    mem_usd = CONFIG_LOCAL["membership_usd"]
    mem_bs = CONFIG_LOCAL["membership_bs"]

    # 1. Si el número encargado de soporte responde, reenviar al cliente
    if telefono == CONFIG_LOCAL["owner_phone_support"] and db.get("ultimo_cliente_soporte"):
        cliente_destino = db["ultimo_cliente_soporte"]
        return {
            "reply": f"✅ Respuesta enviada al cliente {cliente_destino}.",
            "reenviar_a": cliente_destino,
            "mensaje_reenviado": f"💬 *Respuesta de Soporte FormaGym:*\\n\\n{mensaje}"
        }

    # 2. Saludo o Ayuda
    if texto in ["hola", "buenas", "ayuda", "menu", "info", "informacion"]:
        return {
            "reply": (
                "👋 *¡Hola! Bienvenido a FormaGym* 🏋️‍♂️\\n\\n"
                "Esto es todo lo que puedes consultarme:\\n"
                "1️⃣ *Precios de Tienda:* Jugos, agua, bebidas, comida o ropa.\\n"
                "2️⃣ *Mensualidad / Membresía:* Precio, estado de tu membresía o reportar pago.\\n"
                "3️⃣ *Pago Móvil:* Escribe *«cuál es el pago móvil»*.\\n"
                "4️⃣ *Horario:* Escribe *«cuál es el horario»*.\\n"
                "5️⃣ *Ayuda / Soporte:* Si tienes otro problema, escríbelo y lo reenviaré al encargado."
            )
        }

    # 3. Pago Móvil
    if "pago movil" in texto or "pagomovil" in texto or "pago mobil" in texto or "banco" in texto:
        return {"reply": f"📲 *Datos Oficiales de Pago Móvil — FormaGym:*\\n\\n{PAGO_MOVIL_TEXTO}"}

    # 4. Horario
    if "horario" in texto or "abren" in texto or "cierran" in texto or "sabado" in texto:
        return {"reply": HORARIO_TEXTO}

    # 5. Guardar Cédula, Nombre y Apellido (ej: "18318153 Juan Perez")
    match_cedula = re.search(r"\\b([veVE]?[-.]?\\d{6,9})\\b", mensaje)
    if match_cedula and telefono in db["membresias"]:
        cedula_raw = re.sub(r"\\D", "", match_cedula.group(1))
        resto = mensaje.replace(match_cedula.group(0), "").strip()
        partes = [p for p in resto.split() if len(p) > 1]
        if len(partes) >= 1:
            nombre = partes[0].capitalize()
            apellido = " ".join(partes[1:]).title() if len(partes) > 1 else ""
            hoy = datetime.now().strftime("%Y-%m-%d")
            vence = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            db["membresias"][telefono].update({
                "cedula": f"V-{cedula_raw}",
                "firstName": nombre,
                "lastName": apellido,
                "status": "active",
                "startDate": hoy,
                "expiresAt": vence
            })
            guardar_db_local(db)
            return {
                "reply": (
                    f"✅ *¡Registro Completado en FormaGym!*\\n\\n"
                    f"• *Cédula:* V-{cedula_raw}\\n"
                    f"• *Nombre:* {nombre} {apellido}\\n"
                    f"• *Estado:* Membresía ACTIVA hasta el {vence}"
                )
            }

    # 6. Detectar pago o consulta de productos / membresía
    ref_match = re.search(r"\\b(\\d{6,15})\\b", mensaje)
    referencia = ref_match.group(1) if ref_match else "007575948032"
    es_pago = any(w in texto for w in ["pague", "pagué", "voy a pagar", "ref", "referencia", "comprobante", "capture"]) or tiene_foto

    productos_encontrados = [p for p in PRODUCTOS if p["name"].lower() in texto]
    if productos_encontrados and "mensualidad" not in texto and "membresia" not in texto:
        total_usd = sum(float(p["basePriceUsd"]) for p in productos_encontrados)
        total_bs = sum(float(p["priceBs"]) for p in productos_encontrados)
        nombres = ", ".join(p["name"] for p in productos_encontrados)
        if es_pago:
            db["pedidos_tienda"].append({
                "phone": telefono,
                "items": nombres,
                "totalUsd": total_usd,
                "totalBs": total_bs,
                "paymentRef": referencia,
                "status": "pending_approval"
            })
            guardar_db_local(db)
            encargado = CONFIG_LOCAL["owner_phone_consumables"]
            return {
                "reply": (
                    f"🛒 *Pedido de Tienda PENDIENTE DE APROBACIÓN:*\\n"
                    f"• *Productos:* {nombres}\\n"
                    f"• *Total:* \${total_usd:.2f} USD = Bs. {total_bs:.2f}\\n"
                    f"• *Referencia:* {referencia}\\n"
                    f"• *Redirigido con foto al encargado:* {encargado}"
                ),
                "reenviar_a": encargado,
                "mensaje_reenviado": f"{telefono}: [📸 Comprobante Ref {referencia}] Pagó {nombres} (\${total_usd:.2f} / Bs. {total_bs:.2f})"
            }
        return {
            "reply": f"🥤 *Precio en FormaGym:*\\n• {nombres}: *\${total_usd:.2f} USD* = *Bs. {total_bs:.2f}*\\n\\n{PAGO_MOVIL_TEXTO}"
        }

    if "mensualidad" in texto or "membresia" in texto or "membresía" in texto or es_pago:
        if es_pago:
            hoy = datetime.now().strftime("%Y-%m-%d")
            vence = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            db["membresias"][telefono] = {
                "phone": telefono,
                "firstName": "",
                "lastName": "",
                "cedula": "",
                "status": "pending_payment",
                "planName": "Membresía Mensual FormaGym",
                "amountUsd": mem_usd,
                "amountBs": mem_bs,
                "paymentRef": referencia,
                "startDate": hoy,
                "expiresAt": vence
            }
            guardar_db_local(db)
            encargado = CONFIG_LOCAL["owner_phone_memberships"]
            return {
                "reply": (
                    f"⏳ *Pago de Membresía en Estado PENDIENTE:*\\n"
                    f"• *Monto:* \${mem_usd:.2f} USD = Bs. {mem_bs:.2f}\\n"
                    f"• *Referencia:* {referencia}\\n"
                    f"• *Redirigido a:* {encargado} para confirmación humana."
                ),
                "reenviar_a": encargado,
                "mensaje_reenviado": f"{telefono}: [📸 Comprobante Ref {referencia}] Pagó Membresía Mensual (\${mem_usd:.2f} / Bs. {mem_bs:.2f})"
            }
        return {
            "reply": (
                f"🏋️‍♂️ *Membresía Mensual FormaGym:* *\${mem_usd:.2f} USD* = *Bs. {mem_bs:.2f}*\\n\\n"
                f"Para pagos de Mensualidad y Ropa\\nBanco de Venezuela\\n18318153\\n04146734866."
            )
        }

    # 7. Cualquier otra duda o problema se reenvía al número de soporte
    encargado_soporte = CONFIG_LOCAL["owner_phone_support"]
    db["ultimo_cliente_soporte"] = telefono
    guardar_db_local(db)
    return {
        "reply": f"📩 Tu consulta fue enviada a nuestro encargado ({encargado_soporte}). Te responderemos por aquí en breve.",
        "reenviar_a": encargado_soporte,
        "mensaje_reenviado": f"{telefono}: {mensaje}"
    }


@app.route("/whatsapp", methods=["POST"])
def webhook_whatsapp():
    remitente = request.values.get("From", "").replace("whatsapp:", "").strip() or "+58 412-0000000"
    cuerpo = request.values.get("Body", "").strip()
    num_media = int(request.values.get("NumMedia", "0") or "0")
    resultado = responder_mensaje_formagym(remitente, cuerpo, tiene_foto=(num_media > 0))
    return jsonify(resultado)


if __name__ == "__main__":
    cargar_db_local()
    print("✅ FormaGym Bot 100% Local iniciado.")
    print(f"📁 Tus membresías están guardadas localmente en: {os.path.abspath(ARCHIVO_EXCEL_CSV)}")
    app.run(host="0.0.0.0", port=5000)
`;
  };

  const handleDownloadPythonScript = () => {
    const code = buildStandalonePythonCode();
    const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formagym_bot_local.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyPython = () => {
    navigator.clipboard.writeText(buildStandalonePythonCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: 100% LOCAL STORAGE ON USER'S COMPUTER */}
      <div className="bg-[#111827] border border-emerald-500/30 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Tus Datos Guardados Localmente en tu Computadora (Sin depender de ninguna Web)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Todas tus membresías ({memberships.length}), pedidos ({shopOrders.length}) y precios (
                {products.length} productos) se guardan automáticamente en la memoria local de tu PC
                y puedes descargarlos en <strong>Excel (.CSV)</strong> o <strong>.JSON</strong> en
                cualquier momento.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onDownloadCsv}
              className="px-3.5 py-2 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Descargar Membresías (Excel .CSV)
            </button>

            <button
              onClick={onDownloadJson}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Guardar Respaldo Total (.JSON)
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              Cargar Archivo Local (.JSON)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportJson(file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#090D16] border border-slate-800 rounded-lg p-3.5">
          <div>
            <p className="text-xs font-semibold text-white">
              Auto-Descargar archivo Excel (.CSV) en tu PC cada vez que se agregue o apruebe una
              membresía
            </p>
            <p className="text-[11px] text-slate-400">
              Si activas esta opción, cada vez que apruebes o agregues un miembro se descargará
              automáticamente el archivo actualizado directamente en tu carpeta de Descargas.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoDownloadCsv}
              onChange={(e) => onToggleAutoDownloadCsv(e.target.checked)}
              className="w-4 h-4 accent-[#25D366] rounded cursor-pointer"
            />
            <span className="text-xs font-bold text-emerald-400">
              {autoDownloadCsv ? 'Auto-Guardado en PC ACTIVO' : 'Activar Auto-Guardado en PC'}
            </span>
          </label>
        </div>
      </div>

      {/* SECTION 2: STEP BY STEP HOW TO PUT THE BOT ON YOUR REAL WHATSAPP NUMBER */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Cómo poner el Bot en tu Número de WhatsApp Real (100% en tu PC sin URL externa)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                El código Python de abajo ya tiene <strong>todos tus precios actuales</strong>, tus{' '}
                <strong>tasas por producto</strong>, tus <strong>números de Pago Móvil</strong> y tus{' '}
                <strong>{memberships.length} membresías actuales</strong> guardadas adentro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPythonScript}
              className="px-4 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Download className="w-4 h-4" />
              Descargar formagym_bot_local.py
            </button>
            <button
              onClick={handleCopyPython}
              className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copiedCode ? 'Copiado' : 'Copiar Código'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#090D16] border border-slate-800 rounded-lg p-4">
            <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[11px] font-bold mb-2">
              PASO 1 — Descargar en tu PC
            </span>
            <h4 className="text-sm font-bold text-white mb-1">
              Guarda el archivo <code className="text-emerald-400">formagym_bot_local.py</code>
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Haz clic en el botón verde <strong>“Descargar formagym_bot_local.py”</strong> arriba.
              Ponlo en una carpeta en tu escritorio (por ejemplo, <code className="text-slate-200">C:\FormaGymBot</code>).
              Cuando lo abras con Python, creará automáticamente en esa misma carpeta el archivo{' '}
              <code className="text-emerald-400">membresias_formagym.csv</code> (que abres con Excel)
              y <code className="text-emerald-400">membresias_formagym.json</code>.
            </p>
          </div>

          <div className="bg-[#090D16] border border-slate-800 rounded-lg p-4">
            <span className="inline-block px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 font-mono text-[11px] font-bold mb-2">
              PASO 2 — Encender en Python
            </span>
            <h4 className="text-sm font-bold text-white mb-1">
              Ejecuta el Bot en tu Computadora
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed mb-2">
              Abre la terminal (CMD) en esa carpeta e instala Flask una sola vez:
            </p>
            <pre className="bg-slate-950 border border-slate-800 rounded p-2 text-[11px] font-mono text-emerald-300 overflow-x-auto">
              pip install flask requests{'\n'}python formagym_bot_local.py
            </pre>
            <p className="text-[11px] text-slate-400 mt-2">
              No necesitas ninguna página web externa: toda la base de datos queda guardada en tu
              propio disco duro.
            </p>
          </div>

          <div className="bg-[#090D16] border border-slate-800 rounded-lg p-4">
            <span className="inline-block px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono text-[11px] font-bold mb-2">
              PASO 3 — Conectar al Número de WhatsApp
            </span>
            <h4 className="text-sm font-bold text-white mb-1">
              Vincular tu línea de WhatsApp
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Para conectarlo a tu número de teléfono en Venezuela tienes 2 formas fáciles:
            </p>
            <ul className="text-[11px] text-slate-300 space-y-1.5 mt-2 list-disc pl-4">
              <li>
                <strong>Con AutoResponder para WA (Android - Sin URL):</strong> Instala la app{' '}
                <em>AutoResponder para WA</em> en el teléfono del gimnasio y pon como servidor local
                la IP WiFi de tu PC (<code className="text-amber-300">http://192.168.1.X:5000/whatsapp</code>).
                ¡Funciona por WiFi local sin internet externo!
              </li>
              <li>
                <strong>Con Twilio / Meta WhatsApp API:</strong> Apunta el Webhook de tu número al
                puerto <code className="text-amber-300">5000/whatsapp</code> de tu PC.
              </li>
            </ul>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Vista Previa de tu Bot Local (con tus precios y membresías actuales integrados)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Encargados: Mensualidad ({settings.ownerPhoneMemberships}) | Jugos ({settings.ownerPhoneConsumables})
            </span>
          </div>
          <pre className="bg-[#090D16] border border-slate-800 rounded-lg p-4 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-80">
            {buildStandalonePythonCode()}
          </pre>
        </div>
      </div>
    </div>
  );
};
