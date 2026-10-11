@echo off
chcp 65001 >nul
cd /d "%~dp0"
title claudeV - instalacao
where node >nul 2>nul || (echo Nao encontrei o Node.js. Instale a versao 20 ou mais nova em https://nodejs.org e rode este arquivo de novo. & pause & exit /b 1)
echo Baixando as dependencias, isso leva um minuto...
call npm install --omit=dev --no-fund --no-audit || (echo. & echo A instalacao das dependencias falhou. Confira a internet e tente de novo. & pause & exit /b 1)
node setup.mjs
pause
