#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "================================================================"
echo "  🏋️‍♂️ FORMAGYM - SISTEMA WEB + BOT LOCAL BAILEYS + PM2 (24/7)"
echo "================================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no está instalado. Instálalo desde https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/4] Instalando dependencias por primera vez..."
  npm install || npm install --legacy-peer-deps
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[2/4] Instalando PM2 para modo 24/7..."
  npm install -g pm2 || true
fi

export AUTO_START_BAILEYS=true
echo "[3/4] Activando Servidor + Bot Local de Baileys en http://localhost:3000 ..."
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://localhost:3000") &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://localhost:3000") &
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --update-env
  pm2 save
  echo "[4/4] Mostrando registros en vivo y Código QR de Baileys (Ctrl+C para salir de la vista sin apagar PM2)..."
  pm2 logs formagym-bot-24-7 --lines 40
else
  npx tsx server.ts
fi
