#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "===================================================================="
echo "  🛑 FORMAGYM - APAGANDO SERVIDOR Y BOT DE WHATSAPP EN PM2"
echo "===================================================================="
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop formagym-bot-24-7 || true
  pm2 delete formagym-bot-24-7 || true
  pm2 save || true
  echo "✅ El servidor y el bot de Baileys en PM2 fueron apagados correctamente."
else
  echo "No se encontró PM2 activo."
fi
