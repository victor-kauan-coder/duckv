package io.github.duckv.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import io.github.duckv.app.Conta
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Sessao
import io.github.duckv.app.Uso
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun relogio(e: Estado?): Long {
    val t by produceState(System.currentTimeMillis()) {
        while (true) {
            value = System.currentTimeMillis()
            delay(15_000)
        }
    }
    return t - (e?.desvio ?: 0)
}

/** O logo: "duck" na letra do app e o V em pixels, na cor da marca. */
@Composable
fun Logo(modifier: Modifier = Modifier, tamanho: Int = 22) {
    Row(modifier) {
        // as duas partes na mesma linha de base: o V em pixels pousa no chao do "duck"
        Text("duck", style = Texto.marca.copy(fontSize = tamanho.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.2).sp), color = cores.texto, modifier = Modifier.alignByBaseline())
        Text("V", style = Texto.marca.copy(fontFamily = Pixel, fontSize = (tamanho * 1.12f).sp, lineHeight = (tamanho * 1.12f).sp), color = Laranja, modifier = Modifier.alignByBaseline().padding(start = 1.dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Inicio(
    e: Estado?,
    ligado: Boolean?,
    pato: String,
    aoAbrirSessao: (String) -> Unit,
    aoNova: (String?) -> Unit,
    aoOpcoes: () -> Unit,
    aoVerTela: (Sessao) -> Unit,
    aoHistorico: (String) -> Unit = {},
) {
    val c = cores
    val agora = relogio(e)
    val ctx = LocalContext.current
    val aviso = LocalAviso.current
    var podeAvisar by remember {
        mutableStateOf(Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }
    val pedir = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { podeAvisar = it }
    LaunchedEffect(Unit) { if (!podeAvisar && Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS) }

    val contas = e?.contas.orEmpty()
    val pager = rememberPagerState { contas.size }
    val escopo = rememberCoroutineScope()
    var criando by remember { mutableStateOf(false) }
    var entrando by remember { mutableStateOf<Conta?>(null) }
    entrando?.let { ct ->
        if (e?.agente(ct.agente)?.loginNoTerminal == true) {
            LaunchedEffect(ct.id) {
                Hub.mandar(JSONObject().put("t", "login").put("account", ct.id).put("cols", 60).put("rows", 32)) { erro, r ->
                    entrando = null
                    if (erro != null) aviso(erro) else r?.optString("instance")?.takeIf { it.isNotEmpty() }?.let(aoAbrirSessao)
                }
            }
        } else EntrarNaConta(ct) { entrando = null }
    }
    // Volta para a ultima conta vista; so na primeira abertura do app pula para a que precisa de voce.
    LaunchedEffect(e != null) {
        if (e == null) return@LaunchedEffect
        val pede = if (Hub.pulouPede) -1 else contas.indexOfFirst { estadoDaConta(e, it, agora).bicho == "pede" }
        Hub.pulouPede = true
        val i = if (pede >= 0) pede else contas.indexOfFirst { it.id == Hub.contaVista }
        if (i > 0) pager.scrollToPage(i)
        snapshotFlow { pager.currentPage }.collect { p -> Hub.estado.value?.contas?.getOrNull(p)?.id?.let { Hub.contaVista = it } }
    }

    Box(Modifier.fillMaxSize().background(c.fundo)) {
        Column(Modifier.fillMaxSize()) {
            // barra do app: logo e opcoes
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().height(64.dp).padding(start = 16.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Logo(Modifier.weight(1f))
                IconButton(aoOpcoes) { Icon(Icons.Rounded.Settings, "Opções", tint = c.apoio) }
            }

            if (ligado != true) Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Aviso(
                    Icons.Rounded.WifiOff,
                    if (ligado == false) "Sem conexão com o computador" else "Conectando ao computador",
                    "Confira se ele está ligado, com o duckV aberto, e se o Tailscale está ativo neste celular. O app continua tentando.",
                    erro = ligado == false,
                )
            }
            if (e?.demo == true) Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Aviso(null, "Modo demonstração", "As contas, as sessões e os números desta tela são de mentira.", erro = false)
            }
            if (e == null) {
                Column(Modifier.padding(16.dp)) { Esqueleto() }
                return@Column
            }

            // contas: menu suspenso com todas; deslizar a tela tambem troca
            SeletorConta(e, contas, pager.currentPage, agora, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), aoNovaConta = { criando = true }) { i ->
                escopo.launch { pager.animateScrollToPage(i) }
            }

            HorizontalPager(pager, Modifier.fillMaxSize(), key = { contas.getOrNull(it)?.id ?: it }, beyondViewportPageCount = 1) { i ->
                val conta = contas.getOrNull(i) ?: return@HorizontalPager
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 8.dp, bottom = 104.dp).navigationBarsPadding(),
                ) {
                    CartaoConta(e, conta, agora, pato, Modifier.padding(horizontal = 16.dp))
                    // conta sem login: um toque para entrar, sem abrir o computador
                    if (!conta.instalado) Aviso(
                        null, "${e.agente(conta.agente).nome} não está instalado",
                        "Rode o instalador do duckV de novo no computador, ou instale com npm install -g.", erro = true,
                    )
                    if (conta.email == null && conta.instalado && e.host.disponivel && !e.demo) Botao(
                        "Entrar nesta conta", { entrando = conta },
                        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp), Icons.AutoMirrored.Rounded.Login, Peso.Principal,
                    )
                    val minhas = e.sessoes.filter { it.conta == conta.id }
                    val ss = minhas.sortedWith(compareByDescending<Sessao> { it.precisa }.thenByDescending { it.status == "working" }.thenBy { it.inicio })
                    // cabecalho das sessoes, com a contagem e o atalho para todas as conversas
                    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 24.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Sessões", style = Texto.conta, color = c.texto)
                        if (ss.isNotEmpty()) Text(
                            "${ss.size}", style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio,
                            modifier = Modifier.padding(start = 8.dp).clip(CircleShape).background(c.cartaoAlto).padding(horizontal = 8.dp, vertical = 1.dp),
                        )
                        Box(Modifier.weight(1f))
                        TextButton({ aoHistorico(conta.id) }) {
                            Icon(Icons.Rounded.History, null, tint = c.realce, modifier = Modifier.size(18.dp))
                            Text("Todas as conversas", style = Texto.rotulo, color = c.realce, modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (temPedidos(minhas)) Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) { Pedidos(e, minhas, aoVerTela) }
                    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(c.cartao).padding(vertical = 6.dp)) {
                        if (ss.isEmpty()) {
                            // estado vazio: o computador em pixels e o proximo passo
                            Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                PixelArte(NOTEBOOK, Modifier.size(64.dp), mapOf('#' to c.texto, 'o' to c.elevada, 'b' to c.apoio, 'm' to Color(conta.cor)))
                                Text("Nenhuma sessão aberta", style = Texto.rotulo, color = c.texto, modifier = Modifier.padding(top = 12.dp))
                                Text(
                                    if (e.host.disponivel) "Toque em Abrir sessão ou continue uma conversa antiga em Todas as conversas."
                                    else "Abra o atalho ${conta.id} no computador.",
                                    style = Texto.apoio, color = c.apoio, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                        for ((n, s) in ss.withIndex()) {
                            if (n > 0) Divisoria(Modifier.padding(start = 72.dp, end = 16.dp))
                            LinhaSessao(s, Color(conta.cor)) { aoAbrirSessao(s.id) }
                        }
                    }
                    // outras contas pedindo permissao: um atalho, sem precisar procurar
                    val outras = contas.filter { it.id != conta.id && estadoDaConta(e, it, agora).bicho == "pede" }
                    for (o in outras) {
                        Botao("${o.nome} precisa de você", { escopo.launch { pager.animateScrollToPage(contas.indexOf(o)) } }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), Icons.Rounded.NotificationsActive, Peso.Comum)
                    }
                    if (!podeAvisar) Box(Modifier.padding(16.dp)) {
                        Aviso(Icons.Rounded.NotificationsActive, "Avisos desligados", "Ative para saber quando uma conta pedir permissão, terminar ou reiniciar o limite.", erro = false) {
                            TextButton({ if (Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Ativar avisos", style = Texto.rotulo, color = c.realce) }
                        }
                    }
                    if (!e.host.disponivel) {
                        Text("Abrir sessões pelo celular está desligado: o computador não conseguiu carregar o terminal virtual. Rode a instalação de novo.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(16.dp))
                    }
                }
            }
        }
        // a acao principal da tela
        if (e != null && e.host.disponivel && contas.isNotEmpty()) {
            ExtendedFloatingActionButton(
                { aoNova(contas.getOrNull(pager.currentPage)?.id) },
                Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp),
                containerColor = c.primario, contentColor = c.noPrimario,
            ) {
                Icon(Icons.Rounded.Add, null)
                Spacer8()
                Text("Abrir sessão", style = Texto.rotulo)
            }
        }
    }

    if (criando) {
        NovaConta(
            aoFechar = { criando = false },
            agentes = e?.host?.agentes.orEmpty(),
            aoCriar = { nome, agente ->
                Hub.mandar(JSONObject().put("t", "conta").put("op", "nova").put("nome", nome).put("agente", agente)) { erro, r ->
                    if (erro != null) aviso(erro)
                    else {
                        criando = false
                        val id = r?.optString("id")
                        escopo.launch {
                            delay(300)
                            val i = Hub.estado.value?.contas?.indexOfFirst { it.id == id } ?: -1
                            if (i >= 0) pager.animateScrollToPage(i)
                            entrando = Hub.estado.value?.contas?.find { it.id == id } // ja oferece a entrada na conta nova
                        }
                    }
                }
            },
        )
    }
}

@Composable
private fun Spacer8() = Box(Modifier.width(12.dp))

/** Seletor de conta: mostra a conta atual e abre um menu com todas, cada uma com o patinho, o estado e o limite. */
@Composable
private fun SeletorConta(e: Estado, contas: List<Conta>, atual: Int, agora: Long, modifier: Modifier, aoNovaConta: () -> Unit, aoEscolher: (Int) -> Unit) {
    val c = cores
    val conta = contas.getOrNull(atual) ?: return
    val est = estadoDaConta(e, conta, agora)
    var aberto by remember { mutableStateOf(false) }
    // outra conta precisa de voce: o seletor avisa mesmo fechado
    val outraPede = contas.withIndex().any { (i, o) -> i != atual && estadoDaConta(e, o, agora).bicho == "pede" }
    Box(modifier) {
        androidx.compose.material3.Surface(
            { aberto = true }, Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = RoundedCornerShape(12.dp), color = Color.Transparent,
            border = androidx.compose.foundation.BorderStroke(1.dp, c.vazio),
        ) {
            Row(Modifier.padding(start = 8.dp, end = 12.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Pato(est.bicho, "parado", Color(conta.cor), Modifier.size(width = 40.dp, height = 32.dp), andar = false, tocavel = false, tipo = conta.pato)
                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(conta.nome, style = Texto.conta, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        AgenteIcone(e.agente(conta.agente), 14.dp, Modifier.padding(start = 8.dp))
                    }
                    // o estado so aparece aqui quando pede atencao; o resto as sessoes ja contam
                    if (est.bicho == "pede" || est.bicho == "cansado") Text(est.texto, style = Texto.pequeno, color = if (est.bicho == "pede") c.realce else c.perigo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (outraPede) Box(Modifier.padding(end = 8.dp).size(8.dp).clip(CircleShape).background(c.perigo))
                Icon(if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, "Trocar de conta", tint = c.apoio)
            }
        }
        androidx.compose.material3.DropdownMenu(
            aberto, { aberto = false }, Modifier.fillMaxWidth(0.92f), shape = RoundedCornerShape(16.dp), containerColor = c.elevada,
        ) {
            contas.forEachIndexed { i, o ->
                val eo = estadoDaConta(e, o, agora)
                androidx.compose.material3.DropdownMenuItem(
                    text = {
                        Column(Modifier.padding(vertical = 6.dp)) {
                            Text(o.nome, style = Texto.corpo.copy(fontWeight = if (i == atual) FontWeight.Medium else FontWeight.Normal), color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                AgenteIcone(e.agente(o.agente), 12.dp, Modifier.padding(end = 6.dp))
                                Text("${e.agente(o.agente).curto} · ${eo.texto}", style = Texto.pequeno, color = if (eo.bicho == "pede") c.realce else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    },
                    onClick = {
                        aberto = false
                        aoEscolher(i)
                    },
                    leadingIcon = { Pato(eo.bicho, "parado", Color(o.cor), Modifier.size(width = 44.dp, height = 36.dp), andar = false, tocavel = false, tipo = o.pato) },
                    trailingIcon = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            o.cinco?.pct?.let { Text("${it.toInt()}%", style = Texto.rotulo, color = if (it >= 100) c.perigo else c.apoio) }
                            if (i == atual) Icon(Icons.Rounded.Check, "Conta atual", tint = c.realce, modifier = Modifier.padding(start = 8.dp).size(20.dp))
                        }
                    },
                    modifier = Modifier.background(if (i == atual) c.invFundo.copy(alpha = 0.5f) else Color.Transparent),
                )
            }
            androidx.compose.material3.HorizontalDivider(Modifier.padding(vertical = 4.dp), color = c.linha)
            androidx.compose.material3.DropdownMenuItem(
                text = { Text("Adicionar conta", style = Texto.corpo, color = c.texto) },
                onClick = {
                    aberto = false
                    aoNovaConta()
                },
                leadingIcon = { Icon(Icons.Rounded.Add, null, tint = c.apoio) },
            )
        }
    }
}

/**
 * Entrar numa conta Claude sem tocar no computador: o duckV pede o link de entrada ao Claude Code,
 * o celular abre no navegador, voce entra e cola aqui o codigo que a pagina mostra no fim.
 */
@Composable
fun EntrarNaConta(conta: Conta, aoFechar: () -> Unit) {
    val c = cores
    val ctx = LocalContext.current
    val aviso = LocalAviso.current
    val area = androidx.compose.ui.platform.LocalClipboardManager.current
    var url by remember { mutableStateOf<String?>(null) }
    var codigo by remember { mutableStateOf("") }
    var erro by remember { mutableStateOf<String?>(null) }
    var enviando by remember { mutableStateOf(false) }
    val abrir = { u: String -> runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(u))) } }
    LaunchedEffect(conta.id) {
        Hub.mandar(JSONObject().put("t", "login").put("account", conta.id)) { er, r ->
            val u = r?.optString("url")?.takeIf { it.startsWith("https://") }
            if (er != null || u == null) erro = er ?: "O computador não mandou o link de entrada."
            else {
                url = u
                abrir(u)
            }
        }
    }
    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = c.elevada,
        title = { Text("Entrar em ${conta.nome}", style = Texto.titulo, color = c.texto) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when {
                    erro != null && url == null -> Text(erro!!, style = Texto.apoio, color = c.perigo)
                    url == null -> Text("Pedindo o link de entrada ao computador…", style = Texto.apoio, color = c.apoio)
                    else -> {
                        Text("1. No navegador que abriu, entre com a conta Claude que esta conta do duckV deve usar.", style = Texto.apoio, color = c.apoio)
                        Text("2. No fim, a página mostra um código. Copie e cole aqui.", style = Texto.apoio, color = c.apoio)
                        OutlinedTextField(
                            codigo, { codigo = it.trim() }, Modifier.fillMaxWidth(), singleLine = true,
                            label = { Text("Código da página") }, colors = campoCores(), textStyle = Texto.codigo.copy(color = c.texto),
                            trailingIcon = {
                                TextButton({ area.getText()?.text?.trim()?.let { codigo = it } }) { Text("Colar", style = Texto.rotulo, color = c.realce) }
                            },
                        )
                        erro?.let { Text(it, style = Texto.apoio, color = c.perigo) }
                        TextButton({ url?.let(abrir) }) { Text("Abrir o navegador de novo", style = Texto.rotulo, color = c.realce) }
                    }
                }
            }
        },
        confirmButton = {
            if (url != null) TextButton(
                {
                    enviando = true
                    erro = null
                    Hub.mandar(JSONObject().put("t", "loginCodigo").put("account", conta.id).put("codigo", codigo)) { er, r ->
                        enviando = false
                        if (er != null) erro = er
                        else {
                            aviso("Pronto: ${conta.nome} entrou${r?.optString("email")?.takeIf { it.isNotBlank() }?.let { " como $it" } ?: ""}.")
                            aoFechar()
                        }
                    }
                },
                enabled = codigo.length >= 8 && !enviando,
            ) { Text(if (enviando) "Conferindo…" else "Concluir", style = Texto.rotulo, color = c.realce) }
        },
        dismissButton = { TextButton(aoFechar) { Text("Cancelar", style = Texto.rotulo, color = c.realce) } },
    )
}

@Composable
private fun NovaConta(agentes: List<io.github.duckv.app.Agente>, aoFechar: () -> Unit, aoCriar: (String, String) -> Unit) {
    val c = cores
    var nome by remember { mutableStateOf("") }
    var agente by remember { mutableStateOf("claude") }
    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = c.elevada,
        title = { Text("Adicionar conta", style = Texto.titulo, color = c.texto) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Qual agente esta conta usa?", style = Texto.rotulo, color = c.texto)
                // um agente por linha, com o icone, o nome e de quem e
                Column(Modifier.clip(RoundedCornerShape(16.dp)).background(c.cartao)) {
                    agentes.forEachIndexed { i, ag ->
                        if (i > 0) Divisoria(Modifier.padding(start = 52.dp))
                        Row(
                            Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { agente = ag.id }
                                .background(if (agente == ag.id) Color(ag.cor).copy(alpha = 0.14f) else Color.Transparent)
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AgenteIcone(ag, 24.dp)
                            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                                Text(ag.nome, style = Texto.corpo.copy(fontWeight = FontWeight.Medium), color = c.texto)
                                Text(ag.empresa, style = Texto.pequeno, color = c.apoio)
                            }
                            androidx.compose.material3.RadioButton(agente == ag.id, { agente = ag.id }, colors = androidx.compose.material3.RadioButtonDefaults.colors(selectedColor = Color(ag.cor)))
                        }
                    }
                }
                OutlinedTextField(nome, { nome = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Nome da conta") }, singleLine = true, colors = campoCores())
                Text("O duckV cria uma pasta própria para a conta no computador e um atalho. Em seguida, você entra na conta pelo próprio celular.", style = Texto.pequeno, color = c.apoio)
            }
        },
        confirmButton = { TextButton({ aoCriar(nome.trim(), agente) }) { Text("Criar conta", style = Texto.rotulo, color = c.realce) } },
        dismissButton = { TextButton(aoFechar) { Text("Cancelar", style = Texto.rotulo, color = c.realce) } },
    )
}

/** Faixa de aviso do Material 3: cartao tonal com icone, titulo e explicacao. */
@Composable
fun Aviso(icone: androidx.compose.ui.graphics.vector.ImageVector?, titulo: String, texto: String, erro: Boolean, acao: (@Composable () -> Unit)? = null) {
    val c = cores
    val fundo = if (erro) c.erroCont else c.cartao
    val frente = if (erro) c.noErroCont else c.texto
    Column(Modifier.widthIn(max = 600.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(fundo).padding(16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (icone != null) Icon(icone, null, tint = frente, modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f)) {
                Text(titulo, style = Texto.rotulo, color = frente)
                Text(texto, style = Texto.apoio, color = if (erro) frente else c.apoio)
            }
        }
        if (acao != null) Box(Modifier.align(Alignment.End)) { acao() }
    }
}

@Composable
private fun Esqueleto() {
    val c = cores
    Cartao(Modifier.widthIn(max = 600.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth(0.4f).height(20.dp).clip(RoundedCornerShape(6.dp)).background(c.elevada))
            Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(c.elevada))
            Box(Modifier.fillMaxWidth(0.7f).height(12.dp).clip(RoundedCornerShape(4.dp)).background(c.elevada))
        }
    }
}

/**
 * A conta em destaque: um cartao tingido com a cor dela, o pato de pe no chao de pixels,
 * o limite de 5 horas grande e, embaixo, semana e tokens em dois blocos.
 */
@Composable
private fun CartaoConta(e: Estado, conta: Conta, agora: Long, pato: String, modifier: Modifier) {
    val c = cores
    val cor = Color(conta.cor)
    val est = estadoDaConta(e, conta, agora)
    val fundo = cor.copy(alpha = if (c.escuro) 0.16f else 0.13f).compositeOver(c.cartao)
    val cinco = conta.cinco?.pct
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(fundo).padding(start = 20.dp, end = 16.dp, top = 18.dp, bottom = 16.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f).padding(bottom = 6.dp)) {
                Text(conta.nome, style = Texto.titulo.copy(fontWeight = FontWeight.Medium), color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(conta.email, conta.plano?.let { p -> "Plano ${p.replaceFirstChar { it.uppercase() }}" }).joinToString(" · "),
                    style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                SeloAgente(e.agente(conta.agente), Modifier.padding(top = 10.dp))
                EstadoPilula(est, cor, Modifier.padding(top = 8.dp))
            }
            // o pato mora aqui, de pe no chao; um toque e ele reage
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Pato(est.bicho, pato, cor, Modifier.size(width = 104.dp, height = 82.dp), andar = false, tipo = conta.pato)
                Chao(cor, Modifier.width(96.dp))
            }
        }

        Row(Modifier.padding(top = 18.dp), verticalAlignment = Alignment.Bottom) {
            if (cinco == null) {
                Text("—", style = Texto.numero.copy(fontSize = 52.sp, lineHeight = 56.sp), color = c.apoio)
            } else {
                Text("${cinco.toInt()}", style = Texto.numero.copy(fontSize = 52.sp, lineHeight = 56.sp, letterSpacing = (-1.5).sp), color = if (cinco >= 100) c.perigo else c.texto)
                Text("%", style = Texto.titulo, color = c.apoio, modifier = Modifier.padding(start = 2.dp, bottom = 8.dp))
            }
            Column(Modifier.weight(1f).padding(start = 16.dp, bottom = 8.dp), horizontalAlignment = Alignment.End) {
                Text("limite de 5 horas", style = Texto.pequeno, color = c.apoio)
                Text(reinicio("five_hour", conta.cinco, conta, agora, curto = true), style = Texto.rotulo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Celulas(100, (cinco ?: 0.0).toInt().coerceIn(0, 100), cor, Modifier.padding(top = 4.dp), quenteDe = 80, altura = 6.dp)
        if (cinco == null) Text(if (conta.agente == "claude" || conta.agente == "codex") "Aparece depois da primeira resposta nesta conta." else "O ${e.agente(conta.agente).nome} não informa limite de uso.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 8.dp))

        Row(Modifier.padding(top = 16.dp).height(androidx.compose.foundation.layout.IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Bloco("Semana", conta.semana?.pct?.let { "${it.toInt()}%" } ?: "—", reinicio("seven_day", conta.semana, conta, agora, curto = true), Modifier.weight(1f).fillMaxHeight()) {
                Celulas(100, (conta.semana?.pct ?: 0.0).toInt().coerceIn(0, 100), cor, Modifier.padding(top = 8.dp), quenteDe = 80, altura = 4.dp)
            }
            Bloco(
                "Tokens em 5 h", conta.tokens?.let { compacto(it.novos) } ?: "—",
                conta.tokens?.takeIf { it.cr > 0 }?.let { "${compacto(it.cr)} do cache" } ?: "sem leitura ainda",
                Modifier.weight(1f).fillMaxHeight(),
            )
        }
        conta.lidoEm?.takeIf { conta.cinco?.pct != null && agora - it > 5 * 60_000 }?.let {
            Text("Leitura de ${falta(agora - it)} atrás", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

/** Quando a janela reinicia, em texto curto para caber ao lado do numero. */
private fun reinicio(janela: String, u: Uso?, conta: Conta, agora: Long, curto: Boolean): String = when {
    u?.pct == null -> "sem leitura"
    u.resetsAt != null && u.resetsAt > agora -> {
        val resta = u.resetsAt - agora
        if (janela == "five_hour" || resta < 20 * 3600_000L) "reinicia às ${hora(u.resetsAt)}" + if (curto) "" else ", em ${falta(resta)}"
        else "reinicia ${diaDaSemana(u.resetsAt)}"
    }
    u.fresh -> "reiniciou" + (conta.reinicio?.takeIf { it.janela == janela }?.let { " às ${hora(it.em)}" }.orEmpty())
    else -> "reinício não informado"
}

/** Bloco claro dentro do cartao da conta: rotulo, numero e uma linha de apoio. */
@Composable
private fun Bloco(rotulo: String, valor: String, apoio: String, modifier: Modifier, extra: @Composable () -> Unit = {}) {
    val c = cores
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(c.fundo.copy(alpha = if (c.escuro) 0.55f else 0.75f)).padding(horizontal = 14.dp, vertical = 12.dp)) {
        Text(rotulo, style = Texto.pequeno, color = c.apoio)
        Text(valor, style = Texto.titulo.copy(fontWeight = FontWeight.Medium), color = c.texto, modifier = Modifier.padding(top = 2.dp))
        extra()
        Text(apoio, style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
    }
}

/** O estado da conta numa pilula: ponto colorido e a frase. */
@Composable
private fun EstadoPilula(est: EstadoConta, cor: Color, modifier: Modifier = Modifier) {
    val c = cores
    val pede = est.bicho == "pede"
    val cansado = est.bicho == "cansado"
    Row(
        modifier.clip(CircleShape).background(if (pede) c.invFundo else c.fundo.copy(alpha = if (c.escuro) 0.55f else 0.75f)).padding(start = 10.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (pede) c.realce else if (cansado) c.perigo else if (est.acesa) cor else c.ok))
        Text(est.texto, style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = if (pede) c.invTexto else c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
    }
}

/** O chao de pixels onde o pato pisa: tijolinhos na cor da conta, sumindo nas pontas. */
@Composable
private fun Chao(cor: Color, modifier: Modifier) {
    androidx.compose.foundation.Canvas(modifier.height(6.dp)) {
        val lado = 3.dp.toPx()
        val n = (size.width / lado).toInt()
        for (i in 0 until n) {
            val meio = 1f - kotlin.math.abs(i - n / 2f) / (n / 2f)
            drawRect(cor.copy(alpha = 0.15f + 0.55f * meio), androidx.compose.ui.geometry.Offset(i * lado, 0f), androidx.compose.ui.geometry.Size(lado - 0.5f, lado))
            if (i % 2 == 0) drawRect(cor.copy(alpha = 0.08f + 0.25f * meio), androidx.compose.ui.geometry.Offset(i * lado, lado), androidx.compose.ui.geometry.Size(lado - 0.5f, lado))
        }
    }
}

@Composable
fun PontoStatus(status: String, cor: Color) {
    val c = cores
    val corPonto = when (status) {
        "working" -> cor
        "waiting" -> c.realce
        "error" -> c.perigo
        "ended" -> c.vazio
        else -> c.ok
    }
    Box(Modifier.size(10.dp).clip(CircleShape).background(corPonto))
}

/** Sessao como item de lista do Material 3: avatar com a inicial, titulo, o que faz e o contexto. */
@Composable
private fun LinhaSessao(s: Sessao, cor: Color, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = aoTocar).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // avatar com a inicial, tingido com a cor da conta; quem precisa de voce ganha o tom de destaque
        Box(Modifier.size(40.dp).clip(CircleShape).background(if (s.precisa) c.invFundo else cor.copy(alpha = if (c.escuro) 0.22f else 0.16f).compositeOver(c.cartao)), contentAlignment = Alignment.Center) {
            Text(s.titulo.take(1).uppercase(), style = Texto.conta, color = if (s.precisa) c.invTexto else c.texto)
        }
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Text(s.titulo, style = Texto.corpo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(oQueFaz(s), style = Texto.apoio, color = if (s.precisa) c.realce else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(Modifier.padding(start = 8.dp), horizontalAlignment = Alignment.End) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PontoStatus(s.status, cor)
                s.ctx?.pct?.let { Text("${it.toInt()}%", style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio, modifier = Modifier.padding(start = 6.dp)) }
            }
            if (s.ctx?.pct != null) Text("contexto", style = Texto.pequeno.copy(fontSize = 11.sp), color = c.apoio)
        }
    }
}
