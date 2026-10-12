@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV - testes
echo Testando o duckV neste computador. Leva cerca de um minuto e nao usa as suas contas.
call npm test
pause
