'use strict';
// Unica ponte entre as paginas do duckV e o app: o numero de pedidos esperando (bandeja, icone e o aviso
// do canto da tela) e os botoes desse aviso. Nada daqui da acesso ao disco ou a programas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duckvApp', {
  contagem: (n) => ipcRenderer.send('duckv:contagem', Number(n) || 0),
  // Janela sem a barra de titulo do sistema: a pagina desenha o topo e passa as cores dos botoes.
  janelaPropria: true,
  plataforma: process.platform,
  barra: (fundo, simbolo) => ipcRenderer.send('duckv:barra', String(fundo), String(simbolo)),
  avisoTamanho: (altura) => ipcRenderer.send('duckv:aviso', 'tamanho', Number(altura) || 0),
  avisoVazio: () => ipcRenderer.send('duckv:aviso', 'vazio'),
  avisoEsconder: () => ipcRenderer.send('duckv:aviso', 'esconder'),
  avisoAbrir: (sessao) => ipcRenderer.send('duckv:aviso', 'abrir', String(sessao || '').slice(0, 120)),
  // A janela principal recebe o pedido de abrir uma sessao vindo do aviso.
  aoAbrirSessao: (f) => ipcRenderer.on('duckv:abrirSessao', (_ev, id) => f(String(id))),
});
