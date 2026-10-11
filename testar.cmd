@echo off
chcp 65001 >nul
cd /d "%~dp0"
title claudeV - testes
echo Testando o claudeV neste computador. Leva cerca de um minuto e nao usa as suas contas.
call npm test
pause
