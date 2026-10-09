#!/usr/bin/env bash
# Ejecutable Todo-en-Uno con Doble Clic para macOS (.command) — Incluye PM2 + Baileys Local
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

echo "===================================================================="
echo "  🏋️‍♂️ FORMAGYM - EJECUTABLE INTEGRADO (WEB + BAILEYS LOCAL + PM2)"
echo "===================================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[!] ERROR: Node.js no está instalado. Descárgalo en https://nodejs.org/"
  open "https://nodejs.org/"
  read -p "Presiona Enter para salir..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/4] Instalando librerías por primera vez..."
  npm install
else
  echo "[1/4] Librerías listas."
fi

echo "[2/4] Verificando motor 24/7 PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
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

echo "[3/4] Activando Servidor Web + Bot Baileys Local en PM2..."
export AUTO_START_BAILEYS=true
pm2 delete formagym-bot-24-7 >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null 2>&1 || true

echo "[4/4] Abriendo http://localhost:3000 ..."
(sleep 3 && open "http://localhost:3000") &

echo "===================================================================="
echo "  ✅ TODO ACTIVO EN PM2 (SERVIDOR WEB + BOT WHATSAPP BAILEYS LOCAL)"
echo "  • Para apagar todo usa: apagar_servidor_y_pm2_mac_linux.sh"
echo "===================================================================="
pm2 logs formagym-bot-24-7 --lines 35
