// Quem pode falar com o duckV pela rede.
import net from 'node:net';

// DNS rebinding: um site de fora pode apontar o proprio nome para 127.0.0.1 e falar com o duckV
// pelo navegador, com Origin e Host iguais. So aceitamos nomes que um site de fora nao controla:
// IP literal, localhost, o nome deste computador no Tailscale e, com --lan, nomes .local da rede de casa.
export function hostPermitido(host, { tailnet = null, lan = false } = {}) {
  // So o que um Host de verdade tem: letras, numeros, ponto, hifen, porta e colchetes do IPv6.
  if (typeof host !== 'string' || !/^[A-Za-z0-9.\-:[\]]{1,300}$/.test(host)) return false;
  let nome;
  try {
    nome = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (nome === 'localhost' || net.isIP(nome.replace(/^\[|\]$/g, ''))) return true;
  if (tailnet && (nome === tailnet || nome === tailnet.split('.')[0])) return true;
  return lan && /^[a-z0-9-]+\.local$/.test(nome);
}
