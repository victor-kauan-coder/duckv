'use strict';
// Unica ponte entre as paginas do duckV e o app: o numero de pedidos esperando (bandeja, icone e o aviso
// do canto da tela) e os botoes desse aviso. Nada daqui da acesso ao disco ou a programas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duckvApp', {
  contagem: (n) => ipcRenderer.send('duckv:contagem', Number(n) || 0),
  // quantas sessoes abertas pelo duckV estao vivas: sair do app pergunta antes de encerrar
  sessoesAbertas: (n) => ipcRenderer.send('duckv:sessoes', Number(n) || 0),
  // Janela sem a barra de titulo do sistema: a pagina desenha o topo e passa as cores dos botoes.
  janelaPropria: true,
  plataforma: process.platform,
  barra: (fundo, simbolo) => ipcRenderer.send('duckv:barra', String(fundo), String(simbolo)),
  avisoTamanho: (altura) => ipcRenderer.send('duckv:aviso', 'tamanho', Number(altura) || 0),
  avisoVazio: () => ipcRenderer.send('duckv:aviso', 'vazio'),
  avisoEsconder: () => ipcRenderer.send('duckv:aviso', 'esconder'),
  avisoAbrir: (sessao) => ipcRenderer.send('duckv:aviso', 'abrir', String(sessao || '').slice(0, 120)),
  // A janela principal recebe o pedido de abrir uma sessao vindo do aviso ou do popup rapido.
  aoAbrirSessao: (f) => ipcRenderer.on('duckv:abrirSessao', (_ev, id, aoLado) => f(String(id), !!aoLado)),
  aoAbrirNova: (f) => ipcRenderer.on('duckv:abrirNova', (_ev, o) => f({ conta: o?.conta || null, cwd: String(o?.cwd || ''), texto: String(o?.texto || '') })),
  // Popup rapido (Ctrl+Alt+Espaco)
  rapidoTamanho: (altura) => ipcRenderer.send('duckv:rapido', 'tamanho', Number(altura) || 0),
  rapidoFechar: () => ipcRenderer.send('duckv:rapido', 'fechar'),
  rapidoAbrir: (sessao) => ipcRenderer.send('duckv:rapido', 'abrir', String(sessao || '').slice(0, 120)),
  rapidoAbrirTodas: (ids) => ipcRenderer.send('duckv:rapido', 'abrirTodas', (Array.isArray(ids) ? ids : []).slice(0, 4).map((x) => String(x).slice(0, 120))),
  rapidoNova: (conta, cwd, texto) => ipcRenderer.send('duckv:rapido', 'nova', { conta: String(conta || ''), cwd: String(cwd || '').slice(0, 1000), texto: String(texto || '').slice(0, 8000) }),
  aoMostrarRapido: (f) => ipcRenderer.on('duckv:rapidoMostrou', () => f()),
});
