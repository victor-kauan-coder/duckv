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

/** O logo: "claude" na letra do app e o V em pixels, na cor da marca. */
@Composable
fun Logo(modifier: Modifier = Modifier, tamanho: Int = 22) {
    Row(modifier) {
        // as duas partes na mesma linha de base: o V em pixels pousa no chao do "claude"
        Text("claude", style = Texto.marca.copy(fontSize = tamanho.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.2).sp), color = cores.texto, modifier = Modifier.alignByBaseline())
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
    // Ao abrir, vai direto para a conta que precisa de voce.
    var pulou by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(e != null) {
        if (e == null || pulou) return@LaunchedEffect
        pulou = true
        val i = contas.indexOfFirst { estadoDaConta(e, it, agora).bicho == "pede" }
        if (i > 0) pager.scrollToPage(i)
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
                    "Confira se ele está ligado, com o claudeV aberto, e se o Tailscale está ativo neste celular. O app continua tentando.",
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
                    val minhas = e.sessoes.filter { it.conta == conta.id }
                    // cabecalho das sessoes, com o atalho para todas as conversas
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Sessões", style = Texto.secao, color = c.apoio, modifier = Modifier.weight(1f))
                        TextButton({ aoHistorico(conta.id) }) { Text("Todas as conversas", style = Texto.rotulo, color = c.realce) }
                    }
                    if (temPedidos(minhas)) Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) { Pedidos(e, minhas, aoVerTela) }
                    val ss = minhas.sortedWith(compareByDescending<Sessao> { it.precisa }.thenByDescending { it.status == "working" }.thenBy { it.inicio })
                    if (ss.isEmpty()) {
                        Text(
                            if (e.host.disponivel) "Nenhuma sessão aberta. Toque em Abrir sessão, ou abra o atalho ${conta.id} no computador."
                            else "Nenhuma sessão aberta. Abra o atalho ${conta.id} no computador.",
                            style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        )
                    }
                    for ((n, s) in ss.withIndex()) {
                        if (n > 0) Divisoria(Modifier.padding(start = 72.dp, end = 16.dp))
                        LinhaSessao(s, Color(conta.cor)) { aoAbrirSessao(s.id) }
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
            aoCriar = { nome ->
                Hub.mandar(JSONObject().put("t", "conta").put("op", "nova").put("nome", nome)) { erro, r ->
                    if (erro != null) aviso(erro)
                    else {
                        criando = false
                        aviso("Conta criada. Abra uma sessão nela e envie /login para entrar.")
                        val id = r?.optString("id")
                        escopo.launch {
                            delay(300)
                            val i = Hub.estado.value?.contas?.indexOfFirst { it.id == id } ?: -1
                            if (i >= 0) pager.animateScrollToPage(i)
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
            Row(Modifier.padding(start = 16.dp, end = 12.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Marca(Color(conta.cor), tamanho = 12.dp)
                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                    Text(conta.nome, style = Texto.conta, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                            Text(eo.texto, style = Texto.pequeno, color = if (eo.bicho == "pede") c.realce else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
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

@Composable
private fun NovaConta(aoFechar: () -> Unit, aoCriar: (String) -> Unit) {
    val c = cores
    var nome by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = c.elevada,
        title = { Text("Adicionar conta", style = Texto.titulo, color = c.texto) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("O claudeV cria uma pasta própria para a conta no computador, com atalho e canal prontos. Depois, abra uma sessão nela e envie /login para entrar com a conta Claude.", style = Texto.apoio, color = c.apoio)
                OutlinedTextField(nome, { nome = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Nome da conta") }, singleLine = true, colors = campoCores())
            }
        },
        confirmButton = { TextButton({ aoCriar(nome.trim()) }) { Text("Criar conta", style = Texto.rotulo, color = c.realce) } },
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

/** A conta: pato, nome, estado, o limite de 5 horas em destaque, semana e tokens lado a lado. */
@Composable
private fun CartaoConta(e: Estado, conta: Conta, agora: Long, pato: String, modifier: Modifier) {
    val c = cores
    val cor = Color(conta.cor)
    val est = estadoDaConta(e, conta, agora)
    Cartao(modifier) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            // o pato mora aqui; um toque e ele reage
            Pato(est.bicho, pato, cor, Modifier.size(width = 76.dp, height = 60.dp), andar = false, tipo = conta.pato)
            Column(Modifier.weight(1f).padding(start = 4.dp)) {
                Text(conta.email ?: conta.nome, style = Texto.rotulo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                conta.plano?.let { p -> Text("Plano ${p.replaceFirstChar { it.uppercase() }}", style = Texto.pequeno, color = c.apoio, maxLines = 1) }
            }
        }
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 16.dp)) {
            Medidor("Limite de 5 horas", "five_hour", conta.cinco, conta, cor, agora, grande = true)
            Divisoria(Modifier.padding(vertical = 14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.weight(1f)) { Medidor("Semana", "seven_day", conta.semana, conta, cor, agora, grande = false) }
                Column(Modifier.weight(1f)) {
                    Text("Tokens nas últimas 5 horas", style = Texto.pequeno, color = c.apoio)
                    Text(conta.tokens?.let { compacto(it.novos) } ?: "sem leitura", style = Texto.rotulo.copy(fontSize = 16.sp), color = c.texto)
                    conta.tokens?.takeIf { it.cr > 0 }?.let { Text("${compacto(it.cr)} relidos do cache", style = Texto.pequeno, color = c.apoio) }
                }
            }
        }
    }
}

@Composable
private fun Medidor(rotulo: String, janela: String, u: Uso?, conta: Conta, cor: Color, agora: Long, grande: Boolean) {
    val c = cores
    Column {
        if (grande) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(rotulo, style = Texto.apoio, color = c.apoio, modifier = Modifier.weight(1f).padding(bottom = 4.dp))
                Text(if (u?.pct == null) "sem leitura" else "${u.pct.toInt()}%", style = if (u?.pct == null) Texto.apoio else Texto.numero, color = if ((u?.pct ?: 0.0) >= 100) c.perigo else c.texto)
            }
        } else {
            Text(rotulo, style = Texto.pequeno, color = c.apoio)
            Text(if (u?.pct == null) "sem leitura" else "${u.pct.toInt()}%", style = Texto.rotulo.copy(fontSize = 16.sp), color = if ((u?.pct ?: 0.0) >= 100) c.perigo else c.texto)
        }
        Box(Modifier.padding(vertical = if (grande) 8.dp else 6.dp)) {
            Celulas(100, (u?.pct ?: 0.0).toInt().coerceIn(0, 100), cor, quenteDe = 80, altura = 4.dp)
        }
        val texto = when {
            u?.pct == null -> "Aparece depois da primeira resposta do Claude nesta conta."
            u.resetsAt != null && u.resetsAt > agora -> {
                val resta = u.resetsAt - agora
                if (janela == "five_hour" || resta < 20 * 3600_000L) "Reinicia às ${hora(u.resetsAt)}, em ${falta(resta)}"
                else "Reinicia ${diaDaSemana(u.resetsAt)} às ${hora(u.resetsAt)}"
            }
            u.fresh -> {
                val r = conta.reinicio?.takeIf { it.janela == janela }?.let { " às ${hora(it.em)}" }.orEmpty()
                "Reiniciou$r. Conta de novo no próximo uso"
            }
            else -> "Reinício não informado"
        } + (conta.lidoEm?.takeIf { u?.pct != null && u.fresh.not() && agora - it > 5 * 60_000 }?.let { ". Leitura de ${falta(agora - it)} atrás" } ?: "")
        Text(texto, style = Texto.pequeno, color = c.apoio)
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
        Box(Modifier.size(40.dp).clip(CircleShape).background(if (s.precisa) c.invFundo else c.cartaoAlto), contentAlignment = Alignment.Center) {
            Text(s.titulo.take(1).uppercase(), style = Texto.conta, color = if (s.precisa) c.invTexto else c.apoio)
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
