@echo off
title FormaGym - Servidor Local y Bot de WhatsApp 24/7
echo ================================================================
echo   FORMAGYM - SISTEMA WEB + BOT DE WHATSAPP (MODO LOCAL)
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en esta computadora.
    echo Por favor descarga e instala Node.js LTS desde: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] Instalando dependencias por primera vez (esto toma 1 minuto)...
    call npm install
)

echo.
echo [2/2] Iniciando servidor de FormaGym en http://localhost:3000 ...
echo       Puedes abrir http://localhost:3000 en tu navegador.
echo       No cierres esta ventana mientras quieras que el bot siga activo.
echo.
start "" "http://localhost:3000"
call npm run dev
pause
