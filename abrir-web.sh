#!/bin/sh
# duckV no navegador (macOS e Linux): liga o duckV nesta janela de terminal e abre a tela dele no
# navegador. Na primeira vez, o navegador mostra 4 numeros: digite-os aqui para liberar.
# Deixe esta janela aberta enquanto usa o duckV.
cd "$(dirname "$0")" || exit 1
printf '\033]0;duckV\007'
exec node hub/server.mjs --abrir "$@"
