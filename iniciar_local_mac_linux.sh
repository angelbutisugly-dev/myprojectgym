#!/usr/bin/env bash
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
