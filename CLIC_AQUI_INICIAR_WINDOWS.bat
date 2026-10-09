@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title FormaGym - Iniciar Sistema y Bot de WhatsApp (Doble Clic)

echo ====================================================================
echo   🏋️‍♂️ FORMAGYM - INICIADOR AUTOMATICO PARA WINDOWS (SIN COMANDOS)
echo ====================================================================
echo.
echo [Paso 1/3] Verificando si Node.js esta instalado en esta computadora...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Node.js aun no esta instalado en esta computadora.
    echo Intentando instalar Node.js automaticamente con Windows Winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    echo.
    echo Si se instalo correctamente, cierra esta ventana y vuelve a hacer doble clic.
    echo Si no se abrio el instalador, se abrira la pagina oficial https://nodejs.org
    echo Descarga el boton verde que dice "LTS", instalalo con Siguiente -> Siguiente,
    echo y vuelve a hacer doble clic en este archivo.
    start "" "https://nodejs.org"
    pause
    exit /b 1
)

echo [OK] Node.js detectado correctamente.
echo.

if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul 2>nul
    )
)

if not exist "node_modules" (
    echo [Paso 2/3] Primera vez en esta computadora: descargando librerias necesarias...
    echo            (Esto toma aproximadamente 1 minuto, por favor espera...)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Hubo un problema instalando las librerias. Verifica tu conexion a internet.
        pause
        exit /b 1
    )
) else (
    echo [Paso 2/3] Librerias listas (node_modules ya instalado).
)

echo.
echo [Paso 3/3] Iniciando FormaGym y el Bot de WhatsApp 24/7...
echo            Abriendo http://localhost:3000 en tu navegador automaticamente...
echo.
echo IMPORTANTE: Deja esta ventana abierta o minimizada mientras quieras usar el sistema.
echo ====================================================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm run dev

echo.
echo El servidor se detuvo. Presiona cualquier tecla para cerrar esta ventana.
pause
