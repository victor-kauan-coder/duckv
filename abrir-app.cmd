@echo off
rem duckV com janela propria (app do computador). Para usar so pelo terminal, abra iniciar-duckv.cmd.
cd /d "%~dp0"
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo Instalando o app do duckV pela primeira vez, isso leva um minuto...
  call npm install --prefix desktop --no-fund --no-audit || (echo Nao consegui instalar o app. & pause & exit /b 1)
)
start "" "desktop\node_modules\electron\dist\electron.exe" "%~dp0desktop"
