#!/bin/sh
# Desfaz o que a instalacao configurou (atalhos e canal das contas). O login das contas continua.
cd "$(dirname "$0")" || exit 1
exec node setup.mjs --remover
