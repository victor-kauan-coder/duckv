#!/bin/sh
# Liga o duckV nesta janela de terminal (Linux e macOS). Deixe a janela aberta.
# O proprio duckV se publica na sua rede privada do Tailscale, se ele estiver instalado.
cd "$(dirname "$0")" || exit 1
printf '\033]0;duckV\007'
exec node hub/server.mjs "$@"
