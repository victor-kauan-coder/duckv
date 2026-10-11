@echo off
chcp 65001 >nul
cd /d "%~dp0"
title claudeV - desinstalar
node setup.mjs --remover
pause
