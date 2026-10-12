@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV - demonstracao
echo Modo demonstracao: contas e numeros de mentira, nada toca nas suas contas.
echo Abra no navegador o link que aparecer abaixo.
node tools\simular.mjs %*
pause
