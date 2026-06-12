@echo off
setlocal enabledelayedexpansion

REM =========================================================
REM Nombre completo: subir-cambios.bat
REM Ruta o ubicación: /subir-cambios.bat
REM
REM Función:
REM 1. Inicializar Git si la carpeta todavía no lo tiene.
REM 2. Conectar la app con el repositorio jeffer91/eventos.
REM 3. Guardar cambios con commit.
REM 4. Subir cambios a GitHub.
REM
REM Con qué se conecta:
REM - Git
REM - GitHub
REM - Repositorio https://github.com/jeffer91/eventos.git
REM
REM Para qué sirve:
REM Para que Jeff solo ejecute este archivo y suba cambios
REM sin escribir comandos manualmente.
REM =========================================================

title AgendaJeff - Subir cambios a GitHub

set REPO_URL=https://github.com/jeffer91/eventos.git
set BRANCH=main

echo.
echo ========================================================
echo  AgendaJeff - Subir cambios a GitHub
echo ========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: Git no esta instalado o no esta agregado al PATH.
    echo Instala Git o abre esta carpeta desde Git Bash / GitHub Desktop.
    echo.
    pause
    exit /b 1
)

if not exist ".git" (
    echo No se encontro repositorio Git local.
    echo Inicializando Git...
    git init
    if errorlevel 1 (
        echo ERROR: No se pudo inicializar Git.
        pause
        exit /b 1
    )
)

echo.
echo Configurando rama principal...
git branch -M %BRANCH%

echo.
echo Revisando remoto origin...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo Agregando remoto origin...
    git remote add origin %REPO_URL%
) else (
    echo Actualizando remoto origin...
    git remote set-url origin %REPO_URL%
)

echo.
echo Revisando cambios...
git status --short > "%TEMP%\agendajeff_git_status.txt"

for %%A in ("%TEMP%\agendajeff_git_status.txt") do set STATUS_SIZE=%%~zA

if "%STATUS_SIZE%"=="0" (
    echo No hay cambios nuevos para subir.
    del "%TEMP%\agendajeff_git_status.txt" >nul 2>nul
    echo.
    pause
    exit /b 0
)

del "%TEMP%\agendajeff_git_status.txt" >nul 2>nul

echo.
echo Cambios detectados:
git status --short

echo.
set /p COMMIT_MSG=Escribe una descripcion corta del cambio y presiona ENTER: 

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Actualizacion de AgendaJeff
)

echo.
echo Agregando archivos...
git add .

if errorlevel 1 (
    echo ERROR: No se pudieron agregar los archivos.
    pause
    exit /b 1
)

echo.
echo Creando commit...
git commit -m "%COMMIT_MSG%"

if errorlevel 1 (
    echo ERROR: No se pudo crear el commit.
    echo Puede que no haya cambios validos o que Git necesite configurar usuario/correo.
    echo.
    echo Puedes configurar Git con:
    echo git config --global user.name "Jefferson Villarreal"
    echo git config --global user.email "jeffersonvillarreal91@gmail.com"
    echo.
    pause
    exit /b 1
)

echo.
echo Subiendo cambios a GitHub...
git push -u origin %BRANCH%

if errorlevel 1 (
    echo.
    echo ERROR: No se pudo subir a GitHub.
    echo Revisa tu sesion de GitHub, permisos o conexion a internet.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  LISTO: Cambios subidos correctamente a GitHub.
echo ========================================================
echo.

pause
exit /b 0