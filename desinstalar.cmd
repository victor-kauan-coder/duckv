@echo off
chcp 65001 >nul
cd /d "%~dp0"
title duckV - desinstalar
node setup.mjs --remover
pause
