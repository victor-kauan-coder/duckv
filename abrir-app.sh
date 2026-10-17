#!/bin/sh
# duckV com janela propria (app do computador). Para usar so pelo terminal, rode ./iniciar-duckv.sh.
cd "$(dirname "$0")" || exit 1
if [ ! -x desktop/node_modules/.bin/electron ]; then
  echo "Instalando o app do duckV pela primeira vez, isso leva um minuto..."
  npm install --prefix desktop --no-fund --no-audit || { echo "Nao consegui instalar o app."; exit 1; }
fi
exec desktop/node_modules/.bin/electron "$(pwd)/desktop" "$@"
