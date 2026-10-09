@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Apagar Servidor y Bot PM2

echo ====================================================================
echo   🛑 FORMAGYM - APAGANDO SERVIDOR Y BOT DE WHATSAPP EN PM2
echo ====================================================================
echo.

where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    call pm2 stop formagym-bot-24-7
    call pm2 delete formagym-bot-24-7
    call pm2 save
    echo.
    echo ✅ El servidor y el bot de Baileys en PM2 fueron apagados correctamente.
    echo    Cuando quieras volver a encenderlos, haz doble clic en:
    echo    CLIC_AQUI_INICIAR_WINDOWS.bat
) else (
    echo No se encontro ningun proceso de PM2 activo.
)
echo.
pause
