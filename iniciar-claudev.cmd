@echo off
chcp 65001 >nul
cd /d "%~dp0"
title claudeV
rem O proprio claudeV se publica na sua rede privada do Tailscale, se ele estiver instalado.
node hub\server.mjs %*
pause
