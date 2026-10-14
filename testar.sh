#!/bin/sh
# Testa o duckV neste computador. Leva cerca de um minuto e nao usa as suas contas.
cd "$(dirname "$0")" || exit 1
exec npm test
