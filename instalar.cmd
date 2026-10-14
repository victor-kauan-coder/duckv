@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV - instalacao
echo.
echo  duckV - instalacao
echo  ====================
echo  Este assistente instala o que faltar e deixa tudo pronto. Responda as perguntas com S ou N.
echo.
rem Node.js antigo conta como faltando: o duckV precisa do 22 ou mais novo.
set "NODEMAJOR=0"
for /f "delims=." %%v in ('node -v 2^>nul') do set "NODEMAJOR=%%v"
set "NODEMAJOR=%NODEMAJOR:v=%"
if %NODEMAJOR% GEQ 22 goto temNode
if not "%NODEMAJOR%"=="0" echo O Node.js deste computador e a versao %NODEMAJOR%, antiga demais. O duckV precisa do 22 ou mais novo.
echo Vou instalar o Node.js pelo winget, o instalador oficial do Windows.
where winget >nul 2>nul || (echo O winget nao esta disponivel. Instale o Node.js em https://nodejs.org e rode este arquivo de novo. & pause & exit /b 1)
winget install -e --id OpenJS.NodeJS.LTS --force || (echo. & echo Nao consegui instalar o Node.js. Instale em https://nodejs.org e rode este arquivo de novo. & pause & exit /b 1)
rem O PATH desta janela ainda e o antigo: aponta direto para onde o Node.js acabou de ser instalado.
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
:temNode
echo Baixando as dependencias, isso leva um minuto...
call npm install --omit=dev --no-fund --no-audit || (echo. & echo A instalacao das dependencias falhou. Confira a internet e tente de novo. & pause & exit /b 1)
node setup.mjs
pause
