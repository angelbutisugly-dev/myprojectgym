#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "================================================================"
echo "  🏋️‍♂️ FORMAGYM - SISTEMA WEB + BOT DE WHATSAPP (MODO LOCAL)"
echo "================================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no está instalado. Descárgalo e instálalo desde https://nodejs.org"
  if command -v open >/dev/null 2>&1; then
    open "https://nodejs.org"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://nodejs.org"
  fi
  read -p "Presiona Enter para salir..."
  exit 1
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp ".env.example" ".env"
fi

if [ ! -d "node_modules" ]; then
  echo "[1/2] Primera vez en esta computadora: instalando dependencias (toma 1 minuto)..."
  npm install
fi

echo "[2/2] Iniciando servidor de FormaGym en http://localhost:3000 ..."
(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
  fi
) &
npm run dev
