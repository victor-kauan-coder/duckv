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

## Começar em 3 passos

1. **No computador (Windows):** dê dois cliques em `instalar.cmd` e responda as perguntas com S ou N. Ele instala o que faltar (Node.js, Claude Code e, se você quiser, o Tailscale), abre o navegador para você entrar em cada conta Claude, cria o atalho **claudeV** na área de trabalho e liga o claudeV.
2. **No celular (Android):** instale o `claudeV.apk` da página de Releases e o app Tailscale, entrando no Tailscale com a mesma conta do computador. No claudeV, toque em **Escanear código** e aponte para o código da janela.
3. **Confirme:** o celular mostra 4 números. Digite-os na janela do claudeV, no computador, e aperte Enter. Pronto.

Pulou o login de alguma conta? Entre depois pelo próprio celular: o cartão da conta mostra **Entrar nesta conta**, o navegador do celular abre, você entra e cola o código que a página mostra.

No dia a dia, basta abrir o atalho **claudeV** (ou deixar que ele ligue junto com o Windows, se escolheu isso na instalação).

## O que você precisa

- Windows 10 ou 11 (o instalador usa o winget, que já vem no Windows, para instalar o que faltar).
- As contas Claude.
- Um celular Android.
- Para usar fora de casa: [Tailscale](https://tailscale.com/download) no computador e no celular, na mesma conta. O claudeV se publica sozinho na sua rede do Tailscale; não precisa mexer no painel dele.

## Instalação manual

Se preferir fazer à mão: instale o [Node.js](https://nodejs.org) 20+ e o Claude Code, rode `instalar.cmd`, entre em cada conta com `conta1.cmd` e `/login` (ou `claude auth login` com `CLAUDE_CONFIG_DIR` apontando para a pasta da conta) e abra `iniciar-claudev.cmd`.

A instalação não mexe no seu Claude Code de sempre: as três contas do claudeV vivem em pastas próprias. Seu login atual, o app desktop e as configurações em `C:\Users\voce\.claude` continuam como estão.

Para conferir se tudo funciona neste computador, rode `testar.cmd` depois do passo 1. Ele testa o servidor, o canal e as sessões abertas pelo celular com dados de mentira, em cerca de um minuto, sem usar as suas contas.

Quer ver o app antes de instalar tudo? Rode `demonstracao.cmd` depois do passo 1 e abra o link no navegador do computador. As contas e os números são de mentira.

## App Android

O jeito recomendado no celular é o app nativo: baixe o `claudeV.apk` na página de Releases do repositório e instale (o Android pede para permitir "instalar apps desconhecidos"). Na primeira abertura, toque em "Escanear código" e aponte para o QR da janela do claudeV, ou cole o link de pareamento.

- Uma conta por tela: toque no nome no topo ou deslize para trocar. Um ponto laranja marca a conta que precisa de você.
- "Adicionar conta", no seletor de contas, cria uma conta nova e já abre a entrada nela pelo celular.
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
2. Abra o claudeV. Ele se publica sozinho só dentro da sua rede do Tailscale: em HTTPS se os certificados estiverem ligados no painel do Tailscale (DNS > HTTPS Certificates), senão em HTTP, que dentro do Tailscale já viaja criptografado de ponta a ponta.

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

- O código do QR muda cada vez que o claudeV liga e depois de cada pareamento, e sozinho não dá acesso: o celular mostra 4 números que você digita na janela do computador. Um código vazado (num print, por exemplo) não basta para entrar, e três números errados derrubam os pedidos abertos. Cada celular recebe uma chave própria; no computador fica só um resumo dela, então nem uma sessão do Claude lendo a pasta `data` consegue se passar pelo seu celular.
- "Desparear este celular" apaga a chave daquele celular no computador. Para desparear todos de uma vez, rode `node hub/server.mjs --novo-token`.
- Pelo celular não dá para abrir sessão no modo que pula todas as permissões, nem mandar comandos com `!` ou comandos de barra que mexem em permissões. Valem `/model`, `/effort`, `/compact`, `/clear`, `/login`, `/status`, `/cost`, `/usage`, `/context`, `/help`, `/init`, `/resume`, `/rename` e `/review`.
- Quando uma pergunta do Claude Code vira botão, o app mostra a tela inteira acima das opções, e "não perguntar de novo" pede um segundo toque.
- Aceitar um pedido pelo aviso exige desbloquear o celular.
- O celular só abre sessões dentro da sua pasta pessoal, em pastas que já tiveram sessão aberta no computador, ou nas que você listar em `pastasPermitidas` no arquivo `data/config.json`. Exemplo: `"pastasPermitidas": ["D:\\projetos"]`.
- O claudeV nunca vê suas senhas. O login de cada conta é feito na página da Anthropic; pelo celular, o claudeV só repassa ao Claude Code o código de uso único que a página mostra.
- Arquivos anexados pelo celular ficam em `data/anexos`, só para celulares pareados, com até 25 MB cada.
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
