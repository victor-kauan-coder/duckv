package io.github.duckv.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import io.github.duckv.app.Hub
import kotlinx.coroutines.launch
import org.json.JSONObject
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
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
import io.github.duckv.app.Sessao
import io.github.duckv.app.Uso
import kotlinx.coroutines.delay

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

    Column(Modifier.fillMaxSize().background(c.fundo)) {
        // barra do topo
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 8.dp, top = 6.dp, bottom = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("claudeV", style = Texto.marca, color = c.texto)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (ligado == true) c.ok else if (ligado == false) c.perigo else c.vazio))
                    EspacoLargo(6.dp)
                    Text(if (ligado == true) "Ligado ao computador" else if (ligado == false) "Sem conexão" else "Conectando", style = Texto.pequeno, color = c.apoio)
                }
            }
            IconButton(aoOpcoes, Modifier.size(52.dp)) { Icon(Icons.Rounded.Settings, "Opções", tint = c.texto) }
        }

        if (ligado == false) Box(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
            Faixa(Icons.Rounded.WifiOff, "Sem conexão com o computador", "Confira se ele está ligado, com o claudeV aberto, e se o Tailscale está ativo neste celular. O app continua tentando.", c.perigo)
        }
        if (e?.demo == true) Box(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
            Faixa(null, "Modo demonstração", "As contas, as sessões e os números desta tela são de mentira.", c.texto)
        }

        if (e == null) {
            Column(Modifier.padding(16.dp)) { Esqueleto() }
            return@Column
        }

        // seletor de contas: um toque ou um deslize troca de conta
        val abas = rememberLazyListState()
        LaunchedEffect(pager.currentPage) { abas.animateScrollToItem(maxOf(0, pager.currentPage - 1)) }
        LazyRow(
            state = abas,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(contas, key = { _, it -> it.id }) { i, conta ->
                AbaConta(conta, estadoDaConta(e, conta, agora), i == pager.currentPage) { escopo.launch { pager.animateScrollToPage(i) } }
            }
            item {
                val forma = RoundedCornerShape(12.dp)
                Box(
                    Modifier.size(44.dp).clip(forma).border(1.5.dp, c.linha, forma).clickable(role = Role.Button) { criando = true },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.Add, "Adicionar conta", tint = c.texto) }
            }
        }

        HorizontalPager(pager, Modifier.fillMaxSize(), key = { contas.getOrNull(it)?.id ?: it }, beyondViewportPageCount = 1) { i ->
            val conta = contas.getOrNull(i) ?: return@HorizontalPager
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 4.dp, bottom = 32.dp).navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                val minhas = e.sessoes.filter { it.conta == conta.id }
                if (temPedidos(minhas)) Pedidos(e, minhas, aoVerTela)
                CartaoConta(e, conta, agora, pato, aoAbrirSessao)
                if (e.host.disponivel) Botao("Abrir sessão em ${conta.nome}", { aoNova(conta.id) }, Modifier.fillMaxWidth(), Icons.Rounded.Add, Peso.Principal)
                // outras contas pedindo permissao: um atalho, sem precisar procurar
                val outras = contas.filter { it.id != conta.id && estadoDaConta(e, it, agora).bicho == "pede" }
                for (o in outras) {
                    Botao("${o.nome} precisa de você", { escopo.launch { pager.animateScrollToPage(contas.indexOf(o)) } }, Modifier.fillMaxWidth(), Icons.Rounded.NotificationsActive, Peso.Quieto)
                }
                if (!podeAvisar) {
                    Text("Receba um aviso quando uma conta pedir permissão, terminar ou reiniciar o limite.", style = Texto.apoio, color = c.apoio)
                    Botao("Ativar avisos", { if (Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS) }, icone = Icons.Rounded.NotificationsActive, peso = Peso.Quieto)
                }
                if (!e.host.disponivel) {
                    Text("Abrir sessões pelo celular está desligado: o computador não conseguiu carregar o terminal virtual. Rode a instalação de novo.", style = Texto.apoio, color = c.apoio)
                }
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
private fun AbaConta(conta: Conta, est: EstadoConta, marcada: Boolean, aoTocar: () -> Unit) {
    val c = cores
    val cor = Color(conta.cor)
    val forma = RoundedCornerShape(12.dp)
    Row(
        Modifier.height(44.dp).clip(forma)
            .background(if (marcada) c.texto else c.superficie)
            .border(1.5.dp, if (marcada) c.texto else c.linha, forma)
            .clickable(role = Role.Tab, onClick = aoTocar).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Marca(if (est.acesa) cor else cor.copy(alpha = 0.4f), tamanho = 10.dp)
        EspacoLargo(8.dp)
        Text(conta.nome, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = if (marcada) c.fundo else c.texto, maxLines = 1)
        when (est.bicho) {
            "pede" -> { EspacoLargo(8.dp); Box(Modifier.size(9.dp).clip(CircleShape).background(Laranja)) }
            "trabalha", "festa" -> { EspacoLargo(8.dp); Box(Modifier.size(7.dp).clip(CircleShape).background(if (marcada) c.fundo.copy(alpha = 0.7f) else c.apoio)) }
            else -> {}
        }
    }
}

@Composable
private fun NovaConta(aoFechar: () -> Unit, aoCriar: (String) -> Unit) {
    val c = cores
    var nome by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = c.superficie,
        title = { Text("Adicionar conta", style = Texto.titulo, color = c.texto) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("O claudeV cria uma pasta própria para a conta no computador, com atalho e canal prontos. Depois, abra uma sessão nela e envie /login para entrar com a conta Claude.", style = Texto.apoio, color = c.apoio)
                OutlinedTextField(
                    nome, { nome = it.take(30) }, Modifier.fillMaxWidth(),
                    label = { Text("Nome da conta") }, singleLine = true, shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.texto, unfocusedBorderColor = c.linha, cursorColor = Laranja, focusedLabelColor = c.texto),
                )
            }
        },
        confirmButton = { Botao("Criar conta", { aoCriar(nome.trim()) }, peso = Peso.Principal, altura = 42.dp) },
        dismissButton = { Botao("Cancelar", aoFechar, peso = Peso.Quieto, altura = 42.dp) },
    )
}

@Composable
private fun Faixa(icone: androidx.compose.ui.graphics.vector.ImageVector?, titulo: String, texto: String, cor: Color) {
    val c = cores
    val forma = RoundedCornerShape(14.dp)
    Row(
        Modifier.widthIn(max = 600.dp).fillMaxWidth().clip(forma).border(1.5.dp, cor, forma).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icone != null) Icon(icone, null, tint = cor, modifier = Modifier.size(22.dp))
        Column {
            Text(titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
            Text(texto, style = Texto.apoio, color = c.apoio)
        }
    }
}

@Composable
private fun Esqueleto() {
    val c = cores
    Cartao(Modifier.widthIn(max = 600.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth(0.4f).height(24.dp).clip(RoundedCornerShape(6.dp)).background(c.linha))
            Box(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(4.dp)).background(c.linha))
            Box(Modifier.fillMaxWidth(0.7f).height(12.dp).clip(RoundedCornerShape(4.dp)).background(c.linha))
        }
    }
}

@Composable
private fun CartaoConta(e: Estado, conta: Conta, agora: Long, pato: String, aoAbrirSessao: (String) -> Unit) {
    val c = cores
    val cor = Color(conta.cor)
    val est = estadoDaConta(e, conta, agora)
    Cartao {
        // cabecalho: nome, estado e o pato andando no proprio cartao
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Marca(if (est.acesa) cor else cor.copy(alpha = 0.35f), tamanho = 12.dp)
                    EspacoLargo(10.dp)
                    Text(conta.nome, style = Texto.conta, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    est.texto, style = Texto.rotulo,
                    color = if (est.bicho == "pede") c.realce else c.apoio,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Pato(est.bicho, pato, cor, Modifier.weight(1.1f).height(92.dp))
        }
        Column(Modifier.padding(horizontal = 16.dp).padding(top = 6.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Medidor("Limite de 5 horas", "five_hour", conta.cinco, conta, cor, agora)
            Medidor("Limite da semana", "seven_day", conta.semana, conta, cor, agora)
            conta.tokens?.let { t ->
                // Atualiza a cada poucos segundos, somado dos historicos desta conta no computador.
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("Tokens nas últimas 5 horas", style = Texto.rotulo, color = c.texto, modifier = Modifier.weight(1f))
                        Text(compacto(t.novos), style = Texto.numero, color = c.texto)
                    }
                    Text(
                        buildString {
                            append("Entrada ").append(compacto(t.entrada)).append(" · saída ").append(compacto(t.saida))
                            if (t.cr > 0) append(" · relidos do cache ").append(compacto(t.cr))
                        },
                        style = Texto.apoio, color = c.apoio,
                    )
                }
            }
        }
        val ss = e.sessoes.filter { it.conta == conta.id }.sortedBy { it.inicio }
        if (ss.isNotEmpty()) {
            Divisoria()
            for ((i, s) in ss.withIndex()) {
                if (i > 0) Divisoria(Modifier.padding(start = 16.dp))
                LinhaSessao(s, cor) { aoAbrirSessao(s.id) }
            }
        } else {
            Text(
                if (e.host.disponivel) "Para pôr esta conta para trabalhar, toque em Abrir sessão ou abra o atalho ${conta.id} no computador."
                else "Para pôr esta conta para trabalhar, abra o atalho ${conta.id} no computador.",
                style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
            )
        }
    }
}

@Composable
private fun Medidor(rotulo: String, janela: String, u: Uso?, conta: Conta, cor: Color, agora: Long) {
    val c = cores
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(rotulo, style = Texto.rotulo, color = c.texto, modifier = Modifier.weight(1f))
            if (u?.pct == null) Text("sem leitura", style = Texto.apoio, color = c.apoio)
            else {
                Text(u.pct.toInt().toString(), style = Texto.numero, color = c.texto)
                Text("%", style = Texto.numero.copy(fontSize = 16.sp), color = c.apoio, modifier = Modifier.padding(start = 1.dp, bottom = 2.dp))
            }
        }
        Celulas(20, if (u?.pct == null) 0 else minOf(20, kotlin.math.ceil(u.pct / 5).toInt()), cor)
        val texto = when {
            u?.pct == null -> "O número aparece depois da primeira resposta do Claude nesta conta."
            u.resetsAt != null && u.resetsAt > agora -> {
                val resta = u.resetsAt - agora
                if (janela == "five_hour" || resta < 20 * 3600_000L) "Reinicia às ${hora(u.resetsAt)}, em ${falta(resta)}."
                else "Reinicia ${diaDaSemana(u.resetsAt)} às ${hora(u.resetsAt)}, em ${falta(resta)}."
            }
            u.fresh -> {
                val r = conta.reinicio?.takeIf { it.janela == janela }?.let { " às ${hora(it.em)}" }.orEmpty()
                "Reiniciou$r. A contagem recomeça no próximo uso."
            }
            else -> "Horário de reinício ainda não informado."
        } + (conta.lidoEm?.takeIf { u?.pct != null && u.fresh.not() && agora - it > 5 * 60_000 }?.let { " Leitura de ${falta(agora - it)} atrás." } ?: "")
        Text(texto, style = Texto.apoio, color = c.apoio)
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

@Composable
private fun LinhaSessao(s: Sessao, cor: Color, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = aoTocar).padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PontoStatus(s.status, cor)
        EspacoLargo(12.dp)
        Column(Modifier.weight(1f)) {
            Text(s.titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(oQueFaz(s), style = Texto.apoio, color = if (s.precisa) c.realce else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        s.ctx?.pct?.let { Text("${it.toInt()}%", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 8.dp)) }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = c.apoio)
    }
}
