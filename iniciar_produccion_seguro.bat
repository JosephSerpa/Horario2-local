@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Horario2 - Produccion Segura

REM Ir a la carpeta del proyecto (donde esta este .bat)
cd /d "%~dp0"

echo ============================================================
echo   Horario2 - Lanzador de Produccion (seguro)
echo ============================================================
echo.

REM Verificar herramientas base
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH.
  pause
  exit /b 1
)

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx no esta disponible en PATH.
  pause
  exit /b 1
)

REM Crear .env inicial si no existe
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [INFO] Se creo .env desde .env.example. Revisa sus valores.
  ) else (
    echo [ERROR] No existe .env ni .env.example.
    pause
    exit /b 1
  )
)

REM Exigir ADMIN_PASSWORD seguro desde .env o variable de entorno
set "HAS_ADMIN_PASSWORD="
if defined ADMIN_PASSWORD set "HAS_ADMIN_PASSWORD=1"
if not defined HAS_ADMIN_PASSWORD (
  findstr /r /c:"^[ ]*ADMIN_PASSWORD[ ]*=" ".env" >nul 2>nul
  if not errorlevel 1 set "HAS_ADMIN_PASSWORD=1"
)

if not defined HAS_ADMIN_PASSWORD (
  echo [ERROR] Falta ADMIN_PASSWORD en .env o en variables del sistema.
  echo         Edita .env y define:
  echo         ADMIN_USERNAME=admin
  echo         ADMIN_PASSWORD=una-clave-larga-y-fuerte
  pause
  exit /b 1
)

REM Exigir fecha de rotacion de clave
set "HAS_ADMIN_PASSWORD_SET_AT="
if defined ADMIN_PASSWORD_SET_AT set "HAS_ADMIN_PASSWORD_SET_AT=1"
if not defined HAS_ADMIN_PASSWORD_SET_AT (
  findstr /r /c:"^[ ]*ADMIN_PASSWORD_SET_AT[ ]*=" ".env" >nul 2>nul
  if not errorlevel 1 set "HAS_ADMIN_PASSWORD_SET_AT=1"
)

if not defined HAS_ADMIN_PASSWORD_SET_AT (
  echo [ERROR] Falta ADMIN_PASSWORD_SET_AT en .env o variables del sistema.
  echo         Ejemplo: ADMIN_PASSWORD_SET_AT=2026-04-17
  pause
  exit /b 1
)

REM Variables de seguridad/produccion
set "NODE_ENV=production"
if not defined PORT set "PORT=3000"

echo [INFO] NODE_ENV=%NODE_ENV%
echo [INFO] PORT=%PORT%
echo.

REM Si no existe dist, construir
if not exist "dist\index.html" (
  echo [INFO] No existe build de frontend. Ejecutando npm run build...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Fallo la compilacion de frontend.
    pause
    exit /b 1
  )
  echo.
)

echo [INFO] Iniciando servidor en modo produccion...
echo [INFO] Presiona Ctrl + C para detener.
echo.

REM Arranque en produccion
call npx tsx server.ts
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] El servidor finalizo con codigo %EXIT_CODE%.
) else (
  echo [OK] Servidor detenido correctamente.
)
pause
exit /b %EXIT_CODE%
