@echo off
chcp 65001 >nul
cd /d "%~dp0"
title claudeV
rem Publica o claudeV na sua rede privada do Tailscale, se ele estiver instalado.
set "TS=tailscale"
where tailscale >nul 2>nul || set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
"%TS%" serve --bg --https=443 localhost:8765 >nul 2>nul
node hub\server.mjs %*
pause
