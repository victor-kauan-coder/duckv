'use strict';
// Versao web do duckV: escolhe a tela certa para este aparelho antes de desenhar qualquer coisa.
//   - computador (desktop.html): tela larga com mouse ou trackpad, como um Mac ou um notebook;
//   - celular (index.html): iPhone, Android pelo navegador, tablet na mao.
// A escolha manual (Opcoes > "Versão para ...", ou ?tela=celular / ?tela=computador no endereco)
// fica guardada neste navegador. O app do computador (Electron) sempre usa a tela do computador.
(() => {
  if (window.duckvApp) return;
  const pedida = new URLSearchParams(location.search).get('tela');
  let guardada = null;
  try {
    if (pedida === 'celular' || pedida === 'computador') localStorage.setItem('duckv-tela', pedida);
    else if (pedida === 'auto') localStorage.removeItem('duckv-tela');
    guardada = localStorage.getItem('duckv-tela');
  } catch {
    /* navegador sem armazenamento: decide pelo tamanho da tela */
  }
  const grande = matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)').matches;
  const quer = guardada || (grande ? 'computador' : 'celular');
  const aqui = /\/desktop\.html$/.test(location.pathname) ? 'computador' : 'celular';
  if (quer !== aqui) location.replace(quer === 'computador' ? '/desktop.html' : '/');
  else if (pedida) history.replaceState(null, '', location.pathname + location.hash);
})();

// Troca de versao a pedido (botao nas Opcoes de cada tela).
window.duckvTrocarTela = (para) => location.replace(`${para === 'computador' ? '/desktop.html' : '/'}?tela=${para}`);
