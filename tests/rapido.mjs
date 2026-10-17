// Abertura rapida (Ctrl+Alt+Espaco): o atalho, a janela do popup e a ponte com a pagina. Confere no
// codigo o que nao da para apertar num teste: quem pode mandar o que, e o que a pagina nunca faz.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};

const main = ler('desktop/main.cjs');
const preload = ler('desktop/preload.cjs');
const html = ler('app/desktop-rapido.html');
const js = ler('app/desktop-rapido.js');
const css = ler('app/desktop-rapido.css');

// atalho e jeitos de abrir
ok(main.includes("ATALHO_RAPIDO = 'Control+Alt+Space'") && /globalShortcut\.register\(ATALHO_RAPIDO/.test(main), 'o atalho global e Ctrl+Alt+Espaco');
ok(/second-instance', \(_ev, argv\) => \(pediuRapido\(argv\)/.test(main), '`--rapido` numa segunda abertura mostra o popup na instancia que ja roda');
ok(/ready-to-show', \(\) => \(pediuRapido\(process\.argv\) \? abrirRapido\(\)/.test(main), '`--rapido` com o duckV desligado liga escondido e mostra so o popup');
ok(/Abertura rápida/.test(main) && /click: abrirRapido/.test(main), 'o menu da bandeja tambem abre o popup');
ok(/will-quit', \(\) => globalShortcut\.unregisterAll\(\)\)/.test(main), 'o atalho e devolvido ao sistema ao sair');
ok(/GlobalShortcutsPortal/.test(main), 'no Linux com Wayland o atalho vai pelo portal do sistema');

// a janela do popup: isolada como as outras
const janela = main.slice(main.indexOf('function janelaRapido'), main.indexOf('function posicionarRapido'));
ok(/contextIsolation: true/.test(janela) && /sandbox: true/.test(janela) && /nodeIntegration: false/.test(janela) && /webviewTag: false/.test(janela), 'o popup roda isolado (sandbox, contextIsolation, sem Node)');
ok(/will-navigate', \(ev\) => ev\.preventDefault\(\)/.test(janela) && /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/.test(janela), 'o popup nao navega nem abre janelas');
ok(/rapido\.on\('blur'/.test(janela), 'clicar fora fecha o popup');

// so o popup do duckV fala pelo canal duckv:rapido, com valores conferidos
const canal = main.slice(main.indexOf("ipcMain.on('duckv:rapido'"), main.indexOf('function sair'));
ok(/ev\.sender !== rapido\.webContents/.test(canal) && /ehDoDuckV\(ev\.senderFrame\?\.url/.test(canal), 'o canal do popup so aceita a pagina do proprio popup, servida pelo duckV');
ok(/\/\^\[\\w\.:-\]\{1,120\}\$\/\.test\(id\)/.test(canal) && /\.slice\(0, 4\)/.test(canal), 'os ids de sessao sao conferidos e no maximo 4 abrem lado a lado');
ok(/\/\^\[\\w\.-\]\{1,60\}\$\/\.test\(String\(o\.conta\)\)/.test(canal), 'a conta de "Mais opcoes" e conferida');
ok(/cwd: typeof o\.cwd === 'string' \? o\.cwd\.slice\(0, 1000\)/.test(canal) && /texto: typeof o\.texto === 'string' \? o\.texto\.slice\(0, 8000\) : ''/.test(canal), '"Mais opcoes" leva a pasta e o texto, com tamanho conferido no main');
ok(/rapidoNova: \(conta, cwd, texto\) =>[^\n]*texto: String\(texto \|\| ''\)\.slice\(0, 8000\)/.test(preload) && /aoAbrirNova:[^\n]*texto: String\(o\?\.texto/.test(preload), 'a ponte passa o texto nos dois sentidos, ja cortado');
ok(/app\.rapidoNova\?\.\(escolha\.conta === 'todas' \? 'todas' : contaReal\(\)\?\.id \|\| '', escolha\.pasta, texto\.value\)/.test(js) && !/mais\.hidden = todas/.test(js), '"Mais opcoes" manda a conta (ou Todas), a pasta e o texto, e aparece tambem com Todas');

// a ponte: so mensagens, nada de disco ou programas
ok(['rapidoTamanho', 'rapidoFechar', 'rapidoAbrir', 'rapidoAbrirTodas', 'rapidoNova', 'aoMostrarRapido', 'aoAbrirNova'].every((f) => preload.includes(`${f}:`)), 'a ponte expoe as funcoes do popup');
ok(!/require\('(node:)?(fs|child_process|path|os)'\)/.test(preload), 'a ponte nao da acesso a disco nem a programas');

// a pagina
ok(!/<script>|<script(?![^>]*src=)[^>]*>|style=/.test(html) && /src="\/desktop-rapido\.js"/.test(html), 'a pagina do popup nao tem script nem estilo embutidos (vale a CSP padrao)');
ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/.test(js), 'a pagina monta tudo com elementos, nunca com HTML em texto');
ok(/t: 'start', account: c\.id, cwd: escolha\.pasta, texto:/.test(js), 'abrir manda start com a conta, a pasta e a primeira mensagem');
ok(/t: 'equipe', cwd: escolha\.pasta, texto: t/.test(js) && /t\.length < 3/.test(js), '"Todas" manda equipe e exige a tarefa');
ok(/ev\.key === 'Escape'/.test(js) && /ev\.ctrlKey \|\| ev\.metaKey\) && \/\^\[1-9\]\$\//.test(js), 'Esc fecha e Ctrl+1 a 9 escolhe a conta');
ok(/role: 'radiogroup'/.test(js) && /role: 'listbox'/.test(js) && /'aria-checked'/.test(js), 'conta e pasta sao grupos de radio e as sessoes uma lista, para leitores de tela');
const visivel = [...js.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).join('\n') + css;
ok(!/[–—]/.test(visivel + html), 'nenhum travessao no texto do popup');
ok(/prefers-reduced-motion/.test(js) && /semMovimento\.matches/.test(js), 'a entrada animada respeita o movimento reduzido');
