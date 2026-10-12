@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV
rem O proprio duckV se publica na sua rede privada do Tailscale, se ele estiver instalado.
node hub\server.mjs %*
pause
