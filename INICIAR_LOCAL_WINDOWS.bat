@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Servidor Local y Bot de WhatsApp 24/7
echo ================================================================
echo   FORMAGYM - SISTEMA WEB + BOT DE WHATSAPP (MODO LOCAL)
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] Node.js no esta instalado en esta computadora.
    echo Intentando instalar Node.js LTS automaticamente...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    echo Descarga e instala Node.js LTS desde: https://nodejs.org
    start "" "https://nodejs.org"
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul 2>nul
    )
)

if not exist "node_modules" (
    echo [1/2] Instalando dependencias por primera vez (esto toma 1 minuto)...
    call npm install
)

echo.
echo [2/2] Iniciando servidor de FormaGym en http://localhost:3000 ...
echo       Se abrira automaticamente http://localhost:3000 en tu navegador.
echo       No cierres esta ventana mientras quieras que el bot siga activo.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm run dev
pause
