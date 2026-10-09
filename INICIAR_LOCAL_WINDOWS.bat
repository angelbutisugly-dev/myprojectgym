@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Servidor Local + Baileys + PM2 24/7
echo ================================================================
echo   FORMAGYM - SISTEMA WEB + BOT LOCAL BAILEYS + PM2 (24/7)
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en esta computadora.
    echo Por favor descarga e instala Node.js LTS desde: https://nodejs.org
    start "" "https://nodejs.org"
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/4] Instalando dependencias por primera vez (esto toma 1 minuto)...
    call npm install
    if %errorlevel% neq 0 (
        call npm install --legacy-peer-deps
    )
)

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo [2/4] Instalando PM2 para mantener el servidor y Baileys activos 24/7...
    call npm install -g pm2
)

echo.
echo [3/4] Activando Servidor + Bot Local Baileys con PM2 en http://localhost:3000 ...
set AUTO_START_BAILEYS=true
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    call pm2 start ecosystem.config.cjs --update-env
    call pm2 save
    echo [4/4] Abriendo http://localhost:3000 y mostrando registros en vivo de Baileys...
    start "" "http://localhost:3000"
    call pm2 logs formagym-bot-24-7 --lines 40
) else (
    start "" "http://localhost:3000"
    call npx tsx server.ts
)
pause
