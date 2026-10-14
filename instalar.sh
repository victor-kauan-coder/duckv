#!/bin/sh
# Instalacao do duckV no Linux e no macOS: confere o Node.js, baixa as dependencias e
# chama o assistente (setup.mjs), que prepara as contas, o Claude Code, o Tailscale e os atalhos.
cd "$(dirname "$0")" || exit 1
echo
echo " duckV - instalacao"
echo " =================="
echo " Responda as perguntas com S ou N."
echo
versao() { node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null; }
if [ "$(versao)" = "" ] || [ "$(versao)" -lt 22 ]; then
  echo "O duckV precisa do Node.js 22 ou mais novo."
  if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    printf "Instalar o Node.js pelo Homebrew agora? (S/n) "
    read -r r
    case "$r" in [nN]*) exit 1 ;; esac
    brew install node || exit 1
  else
    echo "Instale pelo gerenciador de pacotes do seu sistema ou em https://nodejs.org e rode este arquivo de novo."
    echo "  Ubuntu/Debian: https://github.com/nodesource/distributions"
    echo "  Fedora:        sudo dnf install nodejs"
    echo "  Arch:          sudo pacman -S nodejs npm"
    echo "  macOS:         brew install node"
    exit 1
  fi
fi
echo "Baixando as dependencias, isso leva um minuto..."
npm install --omit=dev --no-fund --no-audit || { echo; echo "A instalacao das dependencias falhou. Confira a internet e tente de novo."; exit 1; }
exec node setup.mjs
