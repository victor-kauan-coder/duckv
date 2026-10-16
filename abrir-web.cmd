@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV
rem duckV no navegador: liga o duckV nesta janela e abre a tela dele no navegador.
rem Na primeira vez, o navegador mostra 4 numeros: digite-os aqui para liberar.
node hub\server.mjs --abrir %*
pause
