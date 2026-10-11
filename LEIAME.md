# claudeV

App para o celular que acompanha e comanda as sessões do Claude Code de três contas, sem trocar de login. Ferramenta pessoal, não oficial, sem ligação com a Anthropic.

O claudeV tem duas partes:

- **No computador**: um servidor pequeno (esta pasta) que conversa com cada sessão do Claude Code.
- **No celular**: uma página que você instala na tela inicial como um app.

## O que dá para fazer

| | Sessão aberta no computador | Sessão aberta pelo celular |
|---|---|---|
| Ver estado, conversa, tarefas e tokens | sim | sim |
| Ver uso do limite de 5 horas e da semana, e quando reinicia | sim | sim |
| Mandar mensagem e usar as mensagens rápidas | sim | sim |
| Aceitar ou recusar pedido de permissão, com ou sem recado | sim | sim |
| Trocar modelo e esforço por botões | não | sim |
| Passar para o próximo modo de permissão | não | sim |
| Interromper, compactar, limpar a conversa e encerrar | não | sim |
| Responder perguntas do Claude Code por botões | no próprio computador | sim |
| Digitar comandos como `/model opus` | não | sim |

A sessão aberta no computador é o Claude Code normal, numa janela sua. A sessão aberta pelo celular roda escondida dentro do claudeV e é comandada por botões. A tela crua do terminal continua existindo, guardada em Controles, para o caso raro de precisar dela.

## O que você precisa

- Windows com [Node.js](https://nodejs.org) 20 ou mais novo.
- Claude Code instalado e atualizado (`claude update`).
- As três contas Claude.
- [Tailscale](https://tailscale.com/download) no computador e no celular, na mesma conta, para usar fora de casa.
- Chrome no Android.

## Instalação

1. Dê dois cliques em `instalar.cmd`. Ele baixa as dependências, cria uma pasta separada para cada conta em `C:\Users\voce\.claude-contas\` e gera os atalhos `conta1.cmd`, `conta2.cmd` e `conta3.cmd`.
2. Abra `conta1.cmd`. Quando o Claude Code abrir, digite `/login` e entre com a primeira conta. Feche e repita com `conta2.cmd` e `conta3.cmd`. Isso é feito uma vez só.
3. Dê dois cliques em `iniciar-claudev.cmd` e deixe a janela aberta.
4. No celular, com o Tailscale ligado, aponte a câmera para o código que aparece na janela. No Chrome, abra o menu e escolha "Adicionar à tela inicial".

A instalação não mexe no seu Claude Code de sempre: as três contas do claudeV vivem em pastas próprias. Seu login atual, o app desktop e as configurações em `C:\Users\voce\.claude` continuam como estão.

Para conferir se tudo funciona neste computador, rode `testar.cmd` depois do passo 1. Ele testa o servidor, o canal e as sessões abertas pelo celular com dados de mentira, em cerca de um minuto, sem usar as suas contas.

Quer ver o app antes de instalar tudo? Rode `demonstracao.cmd` depois do passo 1 e abra o link no navegador do computador. As contas e os números são de mentira.

## App Android

O jeito recomendado no celular é o app nativo: baixe o `claudeV.apk` na página de Releases do repositório e instale (o Android pede para permitir "instalar apps desconhecidos"). Na primeira abertura, toque em "Escanear código" e aponte para o QR da janela do claudeV, ou cole o link de pareamento.

- Uma conta por tela: toque no nome no topo ou deslize para trocar. Um ponto laranja marca a conta que precisa de você.
- O botão + no topo adiciona uma conta nova. Depois, abra uma sessão nela e envie `/login`.
- Avisos nativos com Aceitar e Recusar direto na notificação, mesmo com o app fechado.

Para compilar: `cd android` e `gradlew assembleRelease` (precisa do Android SDK). A assinatura fica em `android/assinatura.properties`, fora do repositório.

## Uso no dia a dia

**Pelo celular.** Toque em "Abrir sessão", escolha a conta, a pasta do projeto, o modelo, o esforço e o modo de permissão. Na primeira vez em cada pasta o Claude Code pergunta se você confia nela: a pergunta aparece no app com um botão para cada resposta. Depois é só escrever, ou tocar numa mensagem rápida. Na aba Controles ficam os botões de interromper, compactar, limpar e encerrar, a troca de modelo, de esforço e de modo. Comandos também valem na caixa de mensagem, por exemplo `/model opus`.

**Pelo computador.** Abra `conta2.cmd` e informe a pasta do projeto (ou arraste a pasta para cima do atalho). O Claude Code mostra um aviso sobre "development channels": escolha "I am using this for local development". Esse aviso aparece toda vez, porque o canal do claudeV usa um recurso do Claude Code que ainda está em prévia.

**Pedidos de permissão** aparecem no topo do app, com o comando inteiro e três saídas: aceitar, recusar, ou recusar dizendo ao Claude o que fazer no lugar. Nas sessões abertas no computador, o pedido aparece também na janela, e vale a primeira resposta.

## Opções

A engrenagem no topo abre as Opções:

- **Aparência neste celular**: tema claro, escuro ou igual ao do celular; tamanho do texto; pato animado, sem gracinhas ou parado; mostrar ou esconder na conversa as ferramentas que o Claude usa.
- **Contas**: nome, cor e como cada conta começa uma sessão aberta pelo celular (modelo, esforço, modo de permissão e pasta).
- **Avisos**: quais avisos chegam, e a partir de quanto uso o reinício do limite merece aviso.
- **Mensagens rápidas**: as frases que viram botão acima da caixa de mensagem. Até 12.
- **Este celular**: desparear.

A aparência fica guardada em cada celular. O resto fica no computador e vale para todos os celulares pareados.

## Acesso de qualquer lugar

1. Instale o Tailscale no computador e no celular e entre com a mesma conta nos dois.
2. No painel do Tailscale na web, em DNS, ative o MagicDNS e os certificados HTTPS.
3. Abra `iniciar-claudev.cmd`. Ele publica o claudeV só dentro da sua rede do Tailscale e mostra o endereço `https://seu-computador.sua-rede.ts.net`.

Nada fica exposto na internet aberta. Sem o Tailscale, o claudeV só abre no próprio computador, em `http://localhost:8765`.

## Avisos no celular

No rodapé do app, toque em "Ativar avisos neste celular". Você recebe aviso quando uma conta pede permissão, quando uma sessão termina a vez e quando um limite que estava acima de 80% reinicia. O aviso de permissão tem os botões Aceitar e Recusar. Os avisos só funcionam pelo endereço https do Tailscale.

## O pato

Cada conta tem um pato, e o que ele faz diz como a conta está:

- anda de um lado para o outro: a conta está trabalhando;
- pula e grasna com um ponto de exclamação: a conta precisa de você;
- parado em pé: esperando sua mensagem;
- sentado, de olho fechado, com um z subindo: nenhuma sessão aberta;
- cinza e tombado: o limite de 5 horas acabou;
- correndo e pulando: o limite acabou de reiniciar.

De vez em quando ele faz uma gracinha por conta própria: grasna, bate a asa, balança o rabo, pisca, cisca, olha para trás ou dá um pulinho. Se o celular estiver com a opção de reduzir movimento ligada, o pato fica parado e o estado continua escrito ao lado.

## O que os números significam

- **Limite de 5 horas e da semana**: o percentual usado e o horário de reinício, informados pelo próprio Claude Code. Só atualizam quando alguma sessão daquela conta conversa com o Claude; por isso o app mostra a idade da leitura quando ela passa de 5 minutos.
- **Tokens nesta janela**: soma feita pelo claudeV a partir dos históricos guardados neste computador. Não inclui o que você gastou no claude.ai, no app desktop com outra pasta de configuração ou em outro aparelho. O número que vale para o limite é o percentual.
- **Contexto**: quanto da memória da conversa já está ocupado.
- As quatro últimas casas de cada medidor acendem na cor do texto: é a zona acima de 80%.

## Segurança

- Quem tiver o código de pareamento controla as sessões. Trate o link e o código como uma senha. Para trocar, rode `node hub/server.mjs --novo-token`.
- Pelo celular não dá para abrir sessão no modo que pula todas as permissões.
- O celular só abre sessões dentro da sua pasta pessoal, em pastas que já tiveram sessão aberta no computador, ou nas que você listar em `pastasPermitidas` no arquivo `data/config.json`. Exemplo: `"pastasPermitidas": ["D:\\projetos"]`.
- O claudeV nunca vê suas senhas. O login de cada conta é feito no próprio Claude Code.
- Manter três contas pessoais é uma decisão sua: os termos da Anthropic dizem que os limites dos planos pressupõem uso individual comum. Vale conferir os termos.

## Limites conhecidos

- **Não foi testado no Windows nem com sessões reais do Claude Code.** Tudo foi testado em Linux: o servidor, o canal (com um cliente real do protocolo), a instalação e as sessões abertas pelo celular (com um programa de terminal de mentira no lugar do Claude Code). Os primeiros minutos no seu computador são o teste de verdade; se algo falhar, a mensagem de erro ajuda a corrigir.
- O canal das sessões abertas no computador depende de um recurso em prévia do Claude Code. Uma atualização pode mudá-lo.
- As perguntas do Claude Code viram botões porque o claudeV lê a tela do terminal e reconhece os menus numerados. Se uma pergunta não virar botão, abra Controles, Avançado, "Ver a tela do terminal" e responda com as teclas de lá. Essa tela mostra texto simples, sem cores.
- O modo de permissão não tem escolha direta: o botão passa para o próximo modo, como o Shift+Tab, e o app mostra o que o Claude Code diz estar ativo.
- O texto das perguntas vem do Claude Code, em inglês.
- Sessões abertas pelo celular fecham se você fechar a janela do claudeV. A conversa fica salva e pode ser retomada com `claude --resume`.
- O computador precisa ficar ligado e acordado.

## Problemas comuns

| O que acontece | O que fazer |
|---|---|
| O app diz "Sem conexão" | Confira se a janela do claudeV está aberta e se o Tailscale está ligado no celular. |
| "Este celular ainda não foi pareado" | Aponte a câmera de novo para o código da janela do claudeV. |
| A conta mostra "sem leitura" | Normal até a primeira resposta do Claude numa sessão daquela conta. |
| A sessão aberta no computador não recebe mensagens | Ela precisa ser aberta pelo atalho da conta, com o aviso de canal aceito. |
| Não aparece "Abrir sessão" | O terminal virtual não carregou. Rode `instalar.cmd` de novo e veja a mensagem. |
| A sessão aberta pelo celular parece parada logo ao abrir | Pode haver uma pergunta que não virou botão. Veja a tela do terminal em Controles, Avançado. |
| "Pasta fora das pastas permitidas" | Inclua a pasta em `pastasPermitidas` (veja Segurança). |
| A porta 8765 já está em uso | O claudeV já está aberto em outra janela. |

## Personalizar

Nomes, cores e padrões das contas mudam pelas Opções do app. Para acrescentar ou tirar contas, ou usar uma cor fora da paleta, edite `contas.json` (cores em hexadecimal), rode `instalar.cmd` de novo e reinicie o claudeV. O app escolhe sozinho a cor do texto que fica legível em cima de cada cor.

## Desinstalar

Rode `desinstalar.cmd`. Ele retira das três pastas de conta o que a instalação configurou. Os logins e os históricos ficam em `C:\Users\voce\.claude-contas\`; apague essa pasta e esta se não quiser mais nada.

## Créditos

Fontes Bricolage Grotesque, Pixelify Sans e JetBrains Mono (SIL Open Font License). Ícones Phosphor (MIT). O pato foi desenhado para este app.
