@echo off
setlocal enabledelayedexpansion

REM =========================================================
REM Nombre completo: publicar-version.bat
REM Ruta o ubicación: /publicar-version.bat
REM
REM Función:
REM 1. Preparar dependencias.
REM 2. Guardar cambios pendientes.
REM 3. Subir automaticamente la version de package.json.
REM 4. Crear tag de version.
REM 5. Subir tag a GitHub para activar GitHub Actions.
REM
REM Con qué se conecta:
REM - package.json
REM - package-lock.json
REM - Git
REM - GitHub Actions
REM - .github/workflows/release.yml
REM
REM Para qué sirve:
REM Para publicar una nueva version instalable de AgendaJeff.
REM =========================================================

title AgendaJeff - Publicar version

set BRANCH=main
set DEFAULT_VERSION_TYPE=patch

echo.
echo ========================================================
echo  AgendaJeff - Publicar nueva version
echo ========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: Git no esta instalado o no esta agregado al PATH.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js / npm no esta instalado o no esta agregado al PATH.
    pause
    exit /b 1
)

if not exist ".git" (
    echo ERROR: Esta carpeta todavia no tiene Git inicializado.
    echo Primero ejecuta subir-cambios.bat.
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo ERROR: No se encontro package.json.
    echo Ejecuta este archivo desde la carpeta principal de la app.
    echo.
    pause
    exit /b 1
)

echo Tipos de version:
echo.
echo  patch  = cambio pequeno. Ejemplo: 1.0.0 a 1.0.1
echo  minor  = mejora mediana. Ejemplo: 1.0.0 a 1.1.0
echo  major  = cambio grande.  Ejemplo: 1.0.0 a 2.0.0
echo  beta   = version de prueba. Ejemplo: 1.0.1-beta.0
echo.

set VERSION_TYPE=%1

if "%VERSION_TYPE%"=="" (
    set /p VERSION_TYPE=Escribe patch, minor, major o beta y presiona ENTER: 
)

if "%VERSION_TYPE%"=="" (
    set VERSION_TYPE=%DEFAULT_VERSION_TYPE%
)

if /I "%VERSION_TYPE%"=="patch" goto VALID_VERSION
if /I "%VERSION_TYPE%"=="minor" goto VALID_VERSION
if /I "%VERSION_TYPE%"=="major" goto VALID_VERSION
if /I "%VERSION_TYPE%"=="beta" goto VALID_VERSION

echo.
echo ERROR: Tipo de version no valido: %VERSION_TYPE%
echo Usa patch, minor, major o beta.
echo.
pause
exit /b 1

:VALID_VERSION

echo.
echo Instalando / actualizando dependencias...
npm install

if errorlevel 1 (
    echo.
    echo ERROR: npm install fallo.
    echo Revisa tu conexion a internet o errores de dependencias.
    echo.
    pause
    exit /b 1
)

echo.
echo Configurando rama principal...
git branch -M %BRANCH%

echo.
echo Revisando cambios pendientes antes de versionar...
git status --short > "%TEMP%\agendajeff_git_status_publish.txt"

for %%A in ("%TEMP%\agendajeff_git_status_publish.txt") do set STATUS_SIZE=%%~zA

if not "%STATUS_SIZE%"=="0" (
    echo Hay cambios pendientes. Se guardaran antes de publicar.
    git add .
    git commit -m "Cambios antes de publicar version"
    if errorlevel 1 (
        echo.
        echo ERROR: No se pudieron guardar los cambios pendientes.
        del "%TEMP%\agendajeff_git_status_publish.txt" >nul 2>nul
        pause
        exit /b 1
    )
)

del "%TEMP%\agendajeff_git_status_publish.txt" >nul 2>nul

echo.
echo Creando nueva version...

if /I "%VERSION_TYPE%"=="beta" (
    npm version prerelease --preid=beta -m "Version %s"
) else (
    npm version %VERSION_TYPE% -m "Version %s"
)

if errorlevel 1 (
    echo.
    echo ERROR: No se pudo crear la version.
    echo Puede que ya exista un tag igual o que Git tenga algun problema.
    echo.
    pause
    exit /b 1
)

echo.
echo Subiendo commits y tags a GitHub...
git push -u origin %BRANCH% --follow-tags

if errorlevel 1 (
    echo.
    echo ERROR: No se pudo subir la version a GitHub.
    echo Revisa tu sesion, permisos o conexion.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  LISTO: Version publicada.
echo  GitHub Actions creara el instalador automaticamente.
echo ========================================================
echo.

pause
exit /b 0