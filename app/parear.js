// Espera o computador liberar este navegador. O pedido chega no # do endereco e nao vai para o servidor.
const [espera, sas] = location.hash.slice(1).split('.');
history.replaceState(null, '', '/parear.html');
const msg = document.getElementById('msg');
document.getElementById('sas').textContent = sas || '····';

async function esperar() {
  if (!espera) return (msg.textContent = 'Abra de novo o link de pareamento da janela do claudeV.');
  for (;;) {
    let r;
    try {
      r = await (await fetch('/api/parear/espera', { method: 'POST', body: JSON.stringify({ espera, navegador: true }) })).json();
    } catch {
      await new Promise((ok) => setTimeout(ok, 2000));
      continue;
    }
    if (r.estado === 'ok') return location.replace('/');
    if (r.estado !== 'pendente') {
      msg.textContent = r.estado === 'negado' ? 'O computador recusou este aparelho.' : 'O pedido expirou. Escaneie o código de novo.';
      return;
    }
  }
}
esperar();
