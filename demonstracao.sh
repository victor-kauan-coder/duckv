#!/bin/sh
# Modo demonstracao: contas e numeros de mentira, nada toca nas suas contas.
# Abra no navegador o link que aparecer abaixo.
cd "$(dirname "$0")" || exit 1
exec node tools/simular.mjs "$@"
