@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Ejecutable Todo-en-Uno (Servidor + Baileys Local + PM2 24/7)

echo ====================================================================
echo   🏋️‍♂️ FORMAGYM - EJECUTABLE INTEGRADO (WEB + BAILEYS LOCAL + PM2)
echo ====================================================================
echo.

REM 1. Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] ERROR: Node.js no esta instalado en esta computadora.
    echo     Descargalo gratis desde: https://nodejs.org/ (Boton verde LTS)
    start https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Instalar librerias del proyecto si es la primera vez (con esbuild ^0.28.0)
if not exist "node_modules\" (
    echo [1/4] Instalando librerias del sistema por primera vez...
    call npm install
) else (
    echo [1/4] Librerias del proyecto listas.
)

REM 3. Instalar PM2 automaticamente si no existe en esta PC
echo [2/4] Verificando motor 24/7 PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo       Instalando PM2 automaticamente...
    call npm install -g pm2
)

REM 4. Auto-generar ecosystem.config.cjs integrado si no existe
if not exist "ecosystem.config.cjs" (
    echo [i] Generando configuracion integrada de PM2 + Baileys Local...
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

REM 5. Iniciar Servidor Web + Bot Baileys Local dentro de PM2
echo [3/4] Activando Servidor Web + Bot Baileys Local en PM2 (24/7)...
set AUTO_START_BAILEYS=true
call pm2 delete formagym-bot-24-7 >nul 2>nul
call pm2 start ecosystem.config.cjs --update-env
call pm2 save >nul 2>nul

REM 6. Abrir el navegador en http://localhost:3000 y mostrar QR / mensajes en vivo
echo [4/4] Abriendo panel en http://localhost:3000 ...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

echo.
echo ====================================================================
echo   ✅ TODO ACTIVO EN PM2 (SERVIDOR WEB + BOT WHATSAPP BAILEYS LOCAL)
echo   • Panel Web: http://localhost:3000
echo   • Aunque cierres esta ventana, PM2 mantiene el Bot encendido 24/7.
echo   • Para apagar todo cuando quieras: haz doble clic en
echo     APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat
echo ====================================================================
echo.
call pm2 logs formagym-bot-24-7 --lines 35
pause
