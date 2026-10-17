'use strict';
// App do duckV para o computador (Windows e Linux; no macOS tambem roda). Liga o servidor do duckV
// (hub/server.mjs) com o Node.js do computador, entrega a ele pelo canal IPC uma chave que so existe
// na memoria dos dois processos e abre a janela, presa ao proprio duckV.
//
// Seguranca:
//  - a chave nunca vai para o disco, para a linha de comando nem para variaveis de ambiente;
//  - o servidor so aceita essa chave em conexoes de 127.0.0.1 (nunca pelo Tailscale);
//  - a janela roda isolada (contextIsolation, sandbox, sem Node), so navega no duckV e so abre
//    links https fora dele, no navegador do sistema;
//  - so a permissao de avisos e a de area de transferencia sao concedidas, e so para o duckV.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, dialog, Notification, nativeTheme, screen, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const WIN = process.platform === 'win32';
app.setAppUserModelId('io.github.duckv.desktop');
// A demonstracao tem pasta de dados propria: abre ao lado do duckV de verdade, sem misturar nada.
if (process.env.DUCKV_DEMO === '1') app.setPath('userData', path.join(app.getPath('appData'), 'duckV-demonstracao'));
// No Linux com Wayland, o atalho global so funciona pelo portal do sistema (GNOME, KDE).
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
// `duckv --rapido` (ou abrir-app --rapido) abre so o popup rapido: com o duckV ja ligado, a instancia
// que esta rodando recebe o pedido; desligado, ele liga escondido e mostra o popup.
const pediuRapido = (argv) => argv.includes('--rapido');
const ATALHO_RAPIDO = 'Control+Alt+Space';
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// DUCKV_DEBUG=1 mostra no terminal cada passo da abertura.
const passo = (...a) => process.env.DUCKV_DEBUG && fs.appendFileSync(process.env.DUCKV_DEBUG, `${a.join(' ')}
`);
let janela = null;
let bandeja = null;
let servidor = null;
let saindo = false;
let avisouBandeja = false;
let base = '';
const lerJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ onde esta o duckV e o Node.js
// A pasta do duckV: a indicada em DUCKV_PASTA, a de cima (rodando da pasta desktop/) ou a que a
// instalacao anotou em ~/.duckv/instalacao.json (o executavel instalado fica em outro lugar).
function pastaDoDuckV() {
  const anotada = lerJson(path.join(os.homedir(), '.duckv', 'instalacao.json'))?.pasta;
  const candidatas = [process.env.DUCKV_PASTA, app.isPackaged ? null : path.resolve(__dirname, '..'), anotada];
  return candidatas.find((p) => typeof p === 'string' && fs.existsSync(path.join(p, 'hub', 'server.mjs'))) || null;
}
// O Node.js do computador (22 ou mais novo). Programas abertos pelo menu nem sempre herdam o PATH do
// terminal (nvm, volta, Homebrew), entao os lugares de costume tambem sao conferidos.
function acharNode() {
  const casa = os.homedir();
  const nvm = path.join(casa, '.nvm', 'versions', 'node');
  const doNvm = fs.existsSync(nvm) ? fs.readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((v) => path.join(nvm, v, 'bin', 'node')) : [];
  const lista = [
    process.env.DUCKV_NODE,
    WIN ? 'node.exe' : 'node',
    ...(WIN ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')] : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node', path.join(casa, '.volta', 'bin', 'node'), ...doNvm]),
  ];
  for (const bin of lista) {
    if (!bin) continue;
    try {
      const v = execFileSync(bin, ['-v'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
      if (Number(v.replace(/^v/, '').split('.')[0]) >= 22) return bin;
    } catch {
      /* tenta o proximo */
    }
  }
  return null;
}
const DEMO = process.env.DUCKV_DEMO === '1';
const portaDe = (pasta) => (DEMO ? 8766 : Number(process.env.PAINEL_PORT) || Number(lerJson(path.join(pasta, 'data', 'config.json'))?.port) || 8765);

// Algo ja responde nessa porta? (o duckV aberto num terminal, por exemplo)
function responde(porta) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: '/api/state', timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

// ------------------------------------------------------------ o servidor
function ligarServidor(pasta, node, chave) {
  const env = { ...process.env };
  // Variaveis do proprio Electron, ou de uma sessao de agente de onde o app foi aberto, nao podem vazar
  // para o Node.js do duckV nem para os agentes que ele abre.
  for (const k of Object.keys(env)) if (/^ELECTRON_|^NODE_OPTIONS$|^CHROME_|^PAINEL_(?!DATA$|CONTAS$)|^CLAUDE_CODE_|^CLAUDECODE$/.test(k)) delete env[k];
  const log = path.join(pasta, 'data', 'app.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  try {
    if (fs.statSync(log).size > 2 * 1024 * 1024) fs.renameSync(log, `${log}.1`);
  } catch {
    /* primeiro registro */
  }
  const saida = fs.createWriteStream(log, { flags: 'a' });
  saida.write(`\n--- duckV aberto pelo app em ${new Date().toISOString()} ---\n`);
  // DUCKV_DEMO=1: contas e sessoes de mentira (tools/simular.mjs), sem tocar nas contas de verdade.
  const script = DEMO ? path.join(pasta, 'tools', 'simular.mjs') : path.join(pasta, 'hub', 'server.mjs');
  const filho = spawn(node, [script, '--desktop', '--sem-qr'], { cwd: pasta, env, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  filho.stdout.pipe(saida);
  filho.stderr.pipe(saida);
  filho.send({ t: 'desktop', chave });
  filho.on('exit', (codigo) => {
    servidor = null;
    if (saindo) return;
    const r = dialog.showMessageBoxSync({
      type: 'error',
      title: 'duckV',
      message: 'O duckV parou de funcionar.',
      detail: `O servidor fechou (código ${codigo}). O registro está em ${log}.`,
      buttons: ['Abrir de novo', 'Sair'],
      defaultId: 0,
    });
    if (r === 0) iniciar();
    else sair();
  });
  return filho;
}

async function iniciar() {
  const pasta = pastaDoDuckV();
  passo('pasta', pasta);
  if (!pasta) {
    dialog.showErrorBox('duckV', 'Não encontrei a pasta do duckV. Rode a instalação do duckV (instalar.cmd ou instalar.sh) e abra o app de novo.');
    return sair();
  }
  const node = acharNode();
  if (!node) {
    dialog.showErrorBox('duckV', 'O duckV precisa do Node.js 22 ou mais novo. Instale em https://nodejs.org e abra o app de novo.');
    return sair();
  }
  passo('node', node);
  const porta = portaDe(pasta);
  base = `http://127.0.0.1:${porta}`;
  if (await responde(porta)) {
    // Ja ha um duckV ligado (num terminal): a pessoa escolheu o terminal. O app nao derruba aquela janela.
    const r = dialog.showMessageBoxSync({
      type: 'info',
      title: 'duckV',
      message: 'O duckV já está aberto num terminal.',
      detail: 'Ele continua funcionando por lá, com o celular e os atalhos das contas. Para usar esta janela, feche o terminal do duckV (Ctrl+C) e clique em Tentar de novo.',
      buttons: ['Tentar de novo', 'Sair'],
      defaultId: 0,
    });
    return r === 0 ? iniciar() : sair();
  }
  const chave = crypto.randomBytes(32).toString('base64url');
  passo('ligando o servidor na porta', porta);
  servidor = ligarServidor(pasta, node, chave);
  for (let i = 0; i < 80 && !(await responde(porta)); i++) await new Promise((r) => setTimeout(r, 250));
  passo('servidor respondeu; abrindo a janela');
  await abrirJanela(pasta, chave);
}

// ------------------------------------------------------------ a janela
const ehDoDuckV = (url) => {
  try {
    return new URL(url).origin === base;
  } catch {
    return false;
  }
};
const abrirFora = (url) => {
  // So https sai para o navegador do sistema (paginas de login das contas, links da conversa).
  if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
};

async function abrirJanela(pasta, chave) {
  const icone = nativeImage.createFromPath(path.join(pasta, 'app', 'icons', 'icone-512.png'));
  if (!janela) {
    janela = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 720,
      minHeight: 520,
      title: 'duckV',
      icon: icone,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a120e' : '#fff8f5',
      // Sem a barra de titulo do sistema: o topo do proprio app vira a barra (arrasta a janela), e os
      // botoes de minimizar, maximizar e fechar ficam por cima dele, nas cores do tema (a pagina avisa).
      titleBarStyle: 'hidden',
      ...(process.platform === 'darwin'
        ? { trafficLightPosition: { x: 18, y: 18 } }
        : { titleBarOverlay: { color: nativeTheme.shouldUseDarkColors ? '#1a120e' : '#fff8f5', symbolColor: nativeTheme.shouldUseDarkColors ? '#f1dfd6' : '#221a15', height: 52 } }),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        partition: 'persist:duckv',
        devTools: !app.isPackaged,
      },
    });
    Menu.setApplicationMenu(null);
    const ses = janela.webContents.session;
    ses.setPermissionRequestHandler((wc, permissao, responder) => responder(ehDoDuckV(wc.getURL()) && ['notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permissao)));
    ses.setPermissionCheckHandler((wc, permissao, origem) => origem === base && ['notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permissao));
    janela.webContents.setWindowOpenHandler(({ url }) => {
      abrirFora(url);
      return { action: 'deny' };
    });
    janela.webContents.on('will-navigate', (ev, url) => {
      if (ehDoDuckV(url)) return;
      ev.preventDefault();
      abrirFora(url);
    });
    janela.webContents.on('will-redirect', (ev, url) => !ehDoDuckV(url) && ev.preventDefault());
    janela.on('close', (ev) => {
      if (saindo || !bandeja) return;
      // Fechar a janela deixa o duckV ligado na bandeja: os celulares e as sessoes continuam.
      ev.preventDefault();
      janela.hide();
      if (!avisouBandeja && Notification.isSupported()) {
        avisouBandeja = true;
        new Notification({ title: 'O duckV continua ligado', body: 'Ele fica na bandeja, perto do relógio. Para desligar, use Sair no menu dele.', icon: icone }).show();
      }
    });
    janela.once('ready-to-show', () => (pediuRapido(process.argv) ? abrirRapido() : janela.show()));
    // Com a janela em foco, o aviso do canto some; saindo dela, volta se ainda ha pedido.
    janela.on('focus', revisarAviso);
    janela.on('blur', () => setTimeout(revisarAviso, 300));
    janela.on('hide', revisarAviso);
    criarBandeja(icone);
    registrarAtalho();
  }
  // A chave vai como cookie so desta sessao (sem data de validade: nao fica gravada) e so para o duckV.
  await janela.webContents.session.cookies.set({ url: base, name: 'painel', value: chave, httpOnly: true, sameSite: 'strict' });
  await janela.loadURL(`${base}/desktop.html`);
  // Foto do popup rapido (desenvolvimento): DUCKV_FOTO_RAPIDO=arquivo.png, com DUCKV_ROTEIRO_RAPIDO
  // (JS rodado no popup antes da foto).
  if (process.env.DUCKV_FOTO_RAPIDO && !app.isPackaged) {
    setTimeout(() => {
      abrirRapido();
      setTimeout(async () => {
        if (process.env.DUCKV_ROTEIRO_RAPIDO) await rapido.webContents.executeJavaScript(process.env.DUCKV_ROTEIRO_RAPIDO).catch((e) => console.error(e));
        setTimeout(async () => {
          fs.writeFileSync(process.env.DUCKV_FOTO_RAPIDO, (await rapido.webContents.capturePage()).toPNG());
          sair();
        }, Number(process.env.DUCKV_FOTO_ESPERA) || 1500);
      }, 2500);
    }, 3000);
  }
  // So para conferir as telas durante o desenvolvimento: DUCKV_FOTO=arquivo.png tira uma foto e fecha.
  if (process.env.DUCKV_FOTO && !app.isPackaged) {
    const roteiro = process.env.DUCKV_ROTEIRO || '';
    setTimeout(async () => {
      if (roteiro) await janela.webContents.executeJavaScript(roteiro).catch((e) => console.error(e));
      setTimeout(async () => {
        fs.writeFileSync(process.env.DUCKV_FOTO, (await janela.webContents.capturePage()).toPNG());
        if (!process.env.DUCKV_FOTO_AVISO) return sair();
        janela.hide();
        setTimeout(async () => {
          if (aviso && !aviso.isDestroyed()) fs.writeFileSync(process.env.DUCKV_FOTO_AVISO, (await aviso.webContents.capturePage()).toPNG());
          sair();
        }, 3000);
      }, Number(process.env.DUCKV_FOTO_ESPERA) || 2500);
    }, 4000);
  }
}

function mostrar() {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function criarBandeja(icone) {
  try {
    bandeja = new Tray(icone.resize({ width: WIN ? 16 : 22, height: WIN ? 16 : 22 }));
  } catch {
    bandeja = null; // ambiente sem bandeja (alguns Linux): fechar a janela desliga o duckV
    return;
  }
  bandeja.setToolTip('duckV');
  bandeja.on('click', mostrar);
  atualizarBandeja(0);
}
function atualizarBandeja(n) {
  if (!bandeja) return;
  bandeja.setToolTip(n ? `duckV: ${n} ${n === 1 ? 'pedido esperando' : 'pedidos esperando'}` : 'duckV');
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o duckV', click: mostrar },
      { label: atalhoOk ? 'Abertura rápida (Ctrl+Alt+Espaço)' : 'Abertura rápida', click: abrirRapido },
      { label: n ? `${n} ${n === 1 ? 'pedido esperando' : 'pedidos esperando'}` : 'Nada esperando você', enabled: false },
      { type: 'separator' },
      { label: 'Sair do duckV', click: sair },
    ]),
  );
}

// ------------------------------------------------------------ aviso no canto da tela
// Com a janela fora de foco (ou escondida na bandeja), o pedido mais antigo aparece num cartao no canto
// da tela, por cima das outras janelas, com Aceitar e Recusar. Ele nao rouba o foco de quem esta digitando.
let aviso = null;
let pedidos = 0;
let escondidoCom = 0; // "Esconder" vale ate chegar um pedido novo
let alturaAviso = 0;
const LARGURA_AVISO = 408;

function janelaAviso() {
  if (aviso && !aviso.isDestroyed()) return aviso;
  aviso = new BrowserWindow({
    width: LARGURA_AVISO,
    height: 220,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'duckV: precisa de você',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      partition: 'persist:duckv',
      devTools: !app.isPackaged,
    },
  });
  aviso.setAlwaysOnTop(true, 'pop-up-menu');
  aviso.setVisibleOnAllWorkspaces?.(true);
  aviso.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  aviso.webContents.on('will-navigate', (ev) => ev.preventDefault());
  aviso.on('closed', () => (aviso = null));
  alturaAviso = 0;
  aviso.loadURL(`${base}/desktop-aviso.html`);
  return aviso;
}
const querAviso = () => pedidos > 0 && pedidos > escondidoCom && !(janela?.isVisible() && janela.isFocused());
function posicionarAviso() {
  if (!aviso || aviso.isDestroyed() || !alturaAviso) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const altura = Math.max(120, Math.min(560, alturaAviso));
  aviso.setBounds({ x: area.x + area.width - LARGURA_AVISO - 16, y: area.y + area.height - altura - 16, width: LARGURA_AVISO, height: altura });
}
function revisarAviso() {
  if (!querAviso()) {
    if (aviso && !aviso.isDestroyed() && aviso.isVisible()) aviso.hide();
    return;
  }
  const a = janelaAviso();
  if (alturaAviso && !a.isVisible()) {
    posicionarAviso();
    a.showInactive();
  }
}

// A pagina avisa quantos pedidos esperam: vira o numero da bandeja, o selo do icone, o piscar da barra
// de tarefas e o aviso do canto da tela.
ipcMain.on('duckv:contagem', (ev, n) => {
  if (!janela || ev.sender !== janela.webContents || !ehDoDuckV(ev.senderFrame?.url || '')) return;
  n = Math.max(0, Math.min(999, Math.floor(Number(n) || 0)));
  if (n < escondidoCom) escondidoCom = n;
  pedidos = n;
  atualizarBandeja(n);
  app.setBadgeCount?.(n);
  if (n && !janela.isFocused()) janela.flashFrame(true);
  if (!n) janela.flashFrame(false);
  revisarAviso();
});
// A pagina manda as cores do tema escolhido: os botoes da janela acompanham (claro, escuro).
ipcMain.on('duckv:barra', (ev, fundo, simbolo) => {
  if (!janela || ev.sender !== janela.webContents || !ehDoDuckV(ev.senderFrame?.url || '')) return;
  const cor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : null);
  if (!cor(fundo) || !cor(simbolo) || process.platform === 'darwin') return;
  try {
    janela.setTitleBarOverlay({ color: cor(fundo), symbolColor: cor(simbolo), height: 52 });
  } catch {
    /* sistema sem botoes sobrepostos */
  }
});
ipcMain.on('duckv:aviso', (ev, acao, valor) => {
  if (!aviso || aviso.isDestroyed() || ev.sender !== aviso.webContents || !ehDoDuckV(ev.senderFrame?.url || '')) return;
  if (acao === 'tamanho') {
    alturaAviso = Math.floor(Number(valor) || 0);
    posicionarAviso();
    revisarAviso();
  } else if (acao === 'vazio') {
    aviso.hide();
  } else if (acao === 'esconder') {
    escondidoCom = pedidos;
    aviso.hide();
  } else if (acao === 'abrir') {
    aviso.hide();
    mostrar();
    if (/^[\w.:-]{1,120}$/.test(String(valor))) janela?.webContents.send('duckv:abrirSessao', String(valor));
  }
});

// ------------------------------------------------------------ popup rapido (Ctrl+Alt+Espaco)
// Uma janela pequena, sem moldura, por cima de tudo: escolher a conta, a pasta e abrir uma sessao (ou
// pular para uma que ja esta aberta) sem passar pela janela grande. Some ao perder o foco ou com Esc.
let rapido = null;
let alturaRapido = 0;
let atalhoOk = false;
const LARGURA_RAPIDO = 680;

function registrarAtalho() {
  try {
    atalhoOk = globalShortcut.register(ATALHO_RAPIDO, alternarRapido);
  } catch {
    atalhoOk = false;
  }
  // Outro programa ja usa a combinacao (ou o sistema nao deixa): o menu da bandeja e o `--rapido` continuam.
  passo('atalho rapido', atalhoOk ? 'registrado' : 'indisponivel');
  atualizarBandeja(pedidos);
}
function janelaRapido() {
  if (rapido && !rapido.isDestroyed()) return rapido;
  rapido = new BrowserWindow({
    width: LARGURA_RAPIDO,
    height: 460,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'duckV: abertura rápida',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      partition: 'persist:duckv',
      devTools: !app.isPackaged,
    },
  });
  rapido.setAlwaysOnTop(true, 'pop-up-menu');
  rapido.setVisibleOnAllWorkspaces?.(true);
  rapido.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  rapido.webContents.on('will-navigate', (ev) => ev.preventDefault());
  // Clicou fora: o popup some, como um menu. (Nas fotos de conferencia ele fica.)
  rapido.on('blur', () => !process.env.DUCKV_FOTO_RAPIDO && rapido?.hide());
  rapido.on('closed', () => (rapido = null));
  alturaRapido = 0;
  rapido.loadURL(`${base}/desktop-rapido.html`);
  return rapido;
}
function posicionarRapido() {
  if (!rapido || rapido.isDestroyed()) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const largura = Math.min(LARGURA_RAPIDO, area.width - 32);
  const altura = Math.max(200, Math.min(area.height - 64, alturaRapido || 460));
  rapido.setBounds({ x: Math.round(area.x + (area.width - largura) / 2), y: Math.round(area.y + area.height * 0.18), width: largura, height: altura });
}
function abrirRapido() {
  if (!base) return;
  const r = janelaRapido();
  const mostrarJa = () => {
    passo('popup rapido aberto');
    posicionarRapido();
    r.show();
    r.focus();
    r.webContents.send('duckv:rapidoMostrou');
  };
  if (r.webContents.isLoading()) r.webContents.once('did-finish-load', () => setTimeout(mostrarJa, 60));
  else mostrarJa();
}
function alternarRapido() {
  if (rapido && !rapido.isDestroyed() && rapido.isVisible() && rapido.isFocused()) rapido.hide();
  else abrirRapido();
}
ipcMain.on('duckv:rapido', (ev, acao, valor) => {
  if (!rapido || rapido.isDestroyed() || ev.sender !== rapido.webContents || !ehDoDuckV(ev.senderFrame?.url || '')) return;
  if (acao !== 'tamanho') passo('popup rapido:', acao, JSON.stringify(valor ?? null));
  if (acao === 'tamanho') {
    alturaRapido = Math.floor(Number(valor) || 0);
    if (rapido.isVisible()) posicionarRapido();
  } else if (acao === 'fechar') {
    rapido.hide();
  } else if (acao === 'abrir' || acao === 'abrirTodas') {
    // a sessao (ou as sessoes de uma equipe, lado a lado) abre na janela grande
    const ids = (acao === 'abrir' ? [valor] : Array.isArray(valor) ? valor : []).map(String).filter((id) => /^[\w.:-]{1,120}$/.test(id)).slice(0, 4);
    if (!ids.length) return;
    rapido.hide();
    mostrar();
    ids.forEach((id, i) => janela?.webContents.send('duckv:abrirSessao', id, i > 0));
  } else if (acao === 'nova') {
    rapido.hide();
    mostrar();
    const o = valor && typeof valor === 'object' ? valor : {};
    janela?.webContents.send('duckv:abrirNova', { conta: /^[\w.-]{1,60}$/.test(String(o.conta)) ? String(o.conta) : null, cwd: typeof o.cwd === 'string' ? o.cwd.slice(0, 1000) : '' });
  }
});

function sair() {
  saindo = true;
  if (servidor) {
    try {
      servidor.disconnect(); // o servidor fecha sozinho quando o canal cai
      servidor.kill();
    } catch {
      /* ja fechou */
    }
  }
  app.quit();
}

// Nada de abas, janelas ou visoes embutidas extras.
app.on('web-contents-created', (_ev, wc) => {
  wc.on('will-attach-webview', (ev) => ev.preventDefault());
});
app.on('second-instance', (_ev, argv) => (pediuRapido(argv) ? abrirRapido() : mostrar()));
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => !bandeja && sair());
app.on('before-quit', () => {
  saindo = true;
  if (servidor) servidor.kill();
});
app.whenReady().then(iniciar);
