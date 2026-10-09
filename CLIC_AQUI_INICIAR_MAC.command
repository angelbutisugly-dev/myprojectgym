#!/usr/bin/env bash
# Archivo ejecutable con doble clic para macOS (.command)
cd "$(dirname "$0")"

# Asegurar que las rutas comunes de Node en Mac estén en el PATH al abrir con doble clic
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

echo "===================================================================="
echo "  🏋️‍♂️ FORMAGYM - INICIADOR AUTOMÁTICO PARA MAC (DOBLE CLIC)"
echo "===================================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[AVISO] Node.js no está instalado en esta Mac."
  echo "Abriendo https://nodejs.org para que descargues el instalador LTS..."
  open "https://nodejs.org"
  read -p "Presiona Enter después de instalar Node.js para cerrar..."
  exit 1
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp ".env.example" ".env"
fi

if [ ! -d "node_modules" ]; then
  echo "[1/2] Primera vez en esta computadora: instalando librerías necesarias..."
  npm install
fi

echo ""
echo "[2/2] Iniciando servidor FormaGym y Bot de WhatsApp en http://localhost:3000 ..."
echo "      Abriendo tu navegador automáticamente..."
echo "      IMPORTANTE: No cierres esta ventana mientras quieras usar el bot."
echo ""

(sleep 3 && open "http://localhost:3000") &
npm run dev
