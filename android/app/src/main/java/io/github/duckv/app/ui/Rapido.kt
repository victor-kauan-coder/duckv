package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Conta
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Sessao
import io.github.duckv.app.pasta
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Para onde a folha rapida leva o app quando fecha. */
sealed interface Destino {
    data class Sessao(val id: String) : Destino
    data class Equipe(val id: String, val falhas: List<String>) : Destino
    data class Nova(val conta: String?) : Destino
    data object Inicio : Destino
}

/**
 * A folha rapida: abre por cima de qualquer app (bloco das configuracoes rapidas, atalho do icone e widget).
 * De cima para baixo: o que a sessao deve fazer, a conta, a pasta, Abrir sessao, as sessoes da conta e Mais opcoes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolhaRapida(aoFechar: () -> Unit, aoIr: (Destino) -> Unit) {
    val c = cores
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val escopo = rememberCoroutineScope()
    // fecha com a folha descendo, e so depois leva ao app
    val ir: (Destino?) -> Unit = { d ->
        escopo.launch { estado.hide() }.invokeOnCompletion { if (d == null) aoFechar() else aoIr(d) }
    }
    val e by Hub.estado.collectAsState()
    val ligado by Hub.ligado.collectAsState()
    val pareado by Hub.pareado.collectAsState()
    val opcoes by Hub.opcoes.collectAsState()
    ModalBottomSheet({ aoFechar() }, sheetState = estado, containerColor = c.fundo, contentColor = c.texto) {
        val est = e
        Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding()) {
            when {
                !pareado -> NaoPareado { ir(Destino.Inicio) }
                ligado == false -> Desligado()
                est == null -> Conectando()
                else -> Escolhas(est, opcoes.pato, ir)
            }
        }
    }
}

@Composable
private fun Escolhas(e: Estado, pato: String, ir: (Destino?) -> Unit) {
    val c = cores
    val agora = relogio(e)
    val equipe = contasDaEquipe(e)
    // a escolha da ultima vez, se ainda existir
    var escolha by rememberSaveable {
        val guardada = Hub.contaRapida
        mutableStateOf(
            when {
                guardada == TODAS && equipe.size >= 2 -> TODAS
                e.contas.any { it.id == guardada } -> guardada
                else -> AUTO
            },
        )
    }
    val auto = contaAutomatica(e)
    val conta: Conta? = when (escolha) {
        AUTO -> auto
        TODAS -> null
        else -> e.contas.find { it.id == escolha }
    }
    val todas = escolha == TODAS
    var texto by rememberSaveable { mutableStateOf("") }
    var cwd by rememberSaveable { mutableStateOf("") }
    var erro by remember { mutableStateOf<String?>(null) }
    var erroTexto by remember { mutableStateOf<String?>(null) }
    var abrindo by remember { mutableStateOf(false) }

    // pastas recentes, com a pasta padrao da conta escolhida na frente
    val padrao = conta?.padroes?.cwd?.takeIf { it.isNotBlank() }
    val pastas = (listOfNotNull(padrao) + e.host.pastas).distinctBy { it.trimEnd('\\', '/').lowercase() }.take(8)
    LaunchedEffect(escolha, conta?.id) {
        cwd = padrao ?: cwd.takeIf { it in pastas } ?: pastas.firstOrNull().orEmpty()
        erro = null
        erroTexto = null
    }

    // sem resposta do computador em 20 s: provavelmente uma versao antiga do duckV, que ignora o pedido
    LaunchedEffect(abrindo) {
        if (!abrindo) return@LaunchedEffect
        delay(20_000)
        if (abrindo) {
            abrindo = false
            erro = "O computador não respondeu. Confira se o duckV dele está atualizado."
        }
    }

    // o campo da tarefa ja vem com o teclado aberto
    val foco = remember { FocusRequester() }
    val teclado = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) {
        delay(150)
        runCatching { foco.requestFocus() }
        teclado?.show()
    }

    fun abrir() {
        erro = null
        erroTexto = null
        val t = texto.trim()
        if (todas) {
            if (t.length < 3) {
                erroTexto = "Escreva o que a equipe deve fazer."
                return
            }
            abrindo = true
            abrirEquipe(e, cwd, t) { er, id, falhas ->
                abrindo = false
                if (er != null || id == null) erro = er else ir(Destino.Equipe(id, falhas))
            }
            return
        }
        val ct = conta ?: return
        val ag = e.agenteDa(ct.id)
        val p = ct.padroes
        abrindo = true
        Hub.mandar(
            JSONObject().put("t", "start").put("account", ct.id).put("cwd", cwd).put("name", "")
                .put("model", p.model?.takeIf { m -> ag.modelos.any { it.id == m } } ?: "default")
                .put("effort", p.effort?.takeIf { m -> ag.esforcos.any { it.id == m } } ?: JSONObject.NULL)
                .put("mode", p.mode?.takeIf { m -> ag.modos.any { it.id == m } } ?: ag.modos.firstOrNull()?.id ?: "manual")
                .put("cols", 60).put("rows", 32)
                .apply { if (t.isNotEmpty()) put("texto", t.take(8000)) },
        ) { er, r ->
            abrindo = false
            val id = r?.optString("instance")?.takeIf { it.isNotEmpty() }
            if (er != null || id == null) erro = er ?: "O computador não abriu a sessão." else ir(Destino.Sessao(id))
        }
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // 1. a tarefa: vira a primeira mensagem da sessao
        Column {
            Text(
                if (todas) "O que a equipe deve fazer?" else "O que a sessão deve fazer?",
                style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, modifier = Modifier.padding(bottom = 8.dp),
            )
            OutlinedTextField(
                texto, { texto = it.take(8000); erroTexto = null }, Modifier.fillMaxWidth().focusRequester(foco),
                placeholder = { Text(if (todas) "Ex.: revise o app inteiro e corrija o que estiver quebrado" else "Opcional. Ex.: rode os testes e corrija o que falhar", color = c.apoio) },
                minLines = 2, maxLines = 6, isError = erroTexto != null,
                supportingText = {
                    Text(
                        erroTexto ?: if (todas) "Obrigatório. As contas dividem a tarefa entre si." else "Vira a primeira mensagem. Em branco, a sessão abre esperando você.",
                        color = if (erroTexto != null) c.perigo else c.apoio,
                    )
                },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                shape = RoundedCornerShape(12.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
            )
        }

        // 2. a conta
        Column {
            CabecalhoAjuste(
                "Conta",
                when {
                    todas -> plural(equipe.size, "conta juntas", "contas juntas")
                    escolha == AUTO && auto != null -> "Agora seria ${auto.nome}"
                    else -> null
                },
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChipConta("Automática", null, escolha == AUTO, { escolha = AUTO; Hub.contaRapida = AUTO }) {
                    Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp))
                }
                for (ct in e.contas) ChipConta(ct.nome, usoCurto(ct), escolha == ct.id, { escolha = ct.id; Hub.contaRapida = ct.id }, habilitado = ct.instalado) {
                    Marca(Color(ct.cor), tamanho = 10.dp)
                }
                if (equipe.size >= 2) ChipConta("Todas as contas", null, todas, { escolha = TODAS; Hub.contaRapida = TODAS }) {
                    Patinhos(equipe)
                }
            }
        }

        // 3. a pasta
        Column {
            CabecalhoAjuste("Pasta", cwd.takeIf { it.isNotEmpty() }?.let { if (it.length > 34) "…" + it.takeLast(33) else it })
            if (pastas.isEmpty()) Text("Nenhuma pasta usada ainda. Toque em Mais opções para procurar no computador.", style = Texto.apoio, color = c.apoio)
            else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (f in pastas) ChipConta(pasta(f).ifEmpty { f }, null, cwd == f, { cwd = f }, descricao = f) {
                    Icon(Icons.Rounded.Folder, null, Modifier.size(18.dp))
                }
            }
        }

        // 4. a acao principal
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val aviso = if (!e.host.disponivel) "O computador não conseguiu carregar o terminal virtual, então não dá para abrir sessões por aqui. Rode a instalação de novo." else erro
            aviso?.let { Text(it, style = Texto.apoio, color = c.perigo) }
            Botao(
                when {
                    abrindo -> if (todas) "Abrindo as contas" else "Abrindo"
                    todas -> "Abrir com ${equipe.size} contas"
                    else -> "Abrir sessão"
                },
                ::abrir, Modifier.fillMaxWidth(), Icons.Rounded.Add, Peso.Principal, altura = 48.dp,
                habilitado = e.host.disponivel && !abrindo && cwd.isNotEmpty() && (todas || conta != null),
            )
        }

        // 5. as sessoes vivas da conta escolhida (ou de todas)
        val vivas = (if (todas) e.sessoes.filter { it.viva && !it.remota } else e.vivas(conta?.id.orEmpty()))
            .sortedWith(compareByDescending<Sessao> { it.precisa }.thenByDescending { it.status == "working" }.thenByDescending { it.inicio })
        Column {
            TituloSecao(if (todas) "Sessões das contas" else "Sessões de ${conta?.nome ?: "nenhuma conta"}")
            if (vivas.isEmpty()) Text(
                if (todas) "Nenhuma sessão aberta agora." else "Nenhuma sessão aberta em ${conta?.nome ?: "nenhuma conta"}.",
                style = Texto.apoio, color = c.apoio,
            )
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(vertical = 4.dp)) {
                for (s in vivas.take(5)) LinhaRapida(s, e.conta(s.conta), todas) { ir(Destino.Sessao(s.id)) }
                if (vivas.size > 5) Text("E mais ${vivas.size - 5} no app.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
        }

        // 6. a tela completa de nova sessao
        TextButton({ ir(Destino.Nova(escolha.takeIf { it != AUTO } ?: conta?.id)) }, Modifier.align(Alignment.CenterHorizontally).heightIn(min = 48.dp)) {
            Icon(Icons.Rounded.Tune, null, tint = c.realce, modifier = Modifier.size(18.dp))
            Text("Mais opções", style = Texto.rotulo, color = c.realce, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

/** Chip de escolha com um icone a esquerda e, quando houver, um numero de apoio ao lado do nome. */
@Composable
private fun ChipConta(
    texto: String,
    apoio: String?,
    marcado: Boolean,
    aoTocar: () -> Unit,
    habilitado: Boolean = true,
    descricao: String? = null,
    icone: @Composable () -> Unit,
) {
    val c = cores
    FilterChip(
        marcado, { io.github.duckv.app.Sons.clique(); aoTocar() },
        {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(texto, style = Texto.rotulo, maxLines = 1)
                if (apoio != null) Text(apoio, style = Texto.pequeno, color = if (marcado) c.invApoio else c.apoio, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
            }
        },
        Modifier.heightIn(min = 40.dp).semantics { if (descricao != null) contentDescription = descricao },
        enabled = habilitado,
        leadingIcon = icone,
        shape = RoundedCornerShape(8.dp),
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = c.invFundo, selectedLabelColor = c.invTexto, selectedLeadingIconColor = c.invTexto,
            labelColor = c.texto, iconColor = c.apoio, containerColor = Color.Transparent,
        ),
        border = FilterChipDefaults.filterChipBorder(habilitado, marcado, borderColor = c.vazio, selectedBorderColor = Color.Transparent),
    )
}

/** Uma sessao viva na folha: o pato da conta, o titulo e o que ela faz, com o estado escrito. */
@Composable
private fun LinhaRapida(s: Sessao, conta: Conta, comConta: Boolean, aoTocar: () -> Unit) {
    val c = cores
    val pede = s.precisa
    val cor = Color(conta.cor)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp).clip(RoundedCornerShape(12.dp))
            .background(if (pede) c.invFundo else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = "Abrir a conversa", onClick = aoTocar)
            .heightIn(min = 56.dp).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(if (pede) c.fundo else cor.copy(alpha = if (c.escuro) 0.24f else 0.18f).compositeOver(c.cartao)),
            contentAlignment = Alignment.Center,
        ) {
            Pato(bichoDaSessao(s), "calmo", cor, Modifier.size(30.dp), andar = false, tocavel = false, tipo = conta.pato)
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(s.titulo, style = Texto.corpo.copy(fontWeight = FontWeight.Medium), color = if (pede) c.invTexto else c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                (if (comConta) "${conta.nome} · " else "") + oQueFaz(s), style = Texto.apoio,
                color = if (pede) c.invApoio else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        PontoStatus(s.status, cor)
    }
}

/** Celular sem pareamento: a folha so leva ao app, que mostra o codigo para escanear. */
@Composable
private fun NaoPareado(aoAbrir: () -> Unit) {
    val c = cores
    Column(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        PixelArte(CELULAR, Modifier.size(width = 40.dp, height = 46.dp), mapOf('#' to c.texto, 'o' to Laranja))
        Text("Este celular ainda não está pareado", style = Texto.conta, color = c.texto, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 16.dp))
        Text(
            "Abra o duckV e escaneie o código da janela do duckV no computador. Depois, esta folha abre sessões em um toque.",
            style = Texto.apoio, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
        )
        Botao("Abrir o duckV para parear", aoAbrir, Modifier.fillMaxWidth(), peso = Peso.Principal, altura = 48.dp)
    }
}

/** Ainda sem resposta do computador. */
@Composable
private fun Conectando() {
    val c = cores
    Column(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Pato("parado", "animado", Laranja, Modifier.size(width = 64.dp, height = 52.dp), andar = false, tocavel = false)
        Text("Conectando ao computador", style = Texto.conta, color = c.texto, modifier = Modifier.padding(top = 12.dp))
        androidx.compose.material3.LinearProgressIndicator(
            Modifier.padding(top = 16.dp).fillMaxWidth(0.5f).clip(CircleShape), color = c.realce, trackColor = c.elevada,
        )
    }
}

/** Computador fora de alcance: o que esta na nuvem continua, e e o que da para abrir daqui. */
@Composable
private fun Desligado() {
    val c = cores
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.erroCont).padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(Icons.Rounded.WifiOff, null, tint = c.noErroCont, modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f)) {
                Text("Computador desligado", style = Texto.rotulo, color = c.noErroCont)
                Text(
                    "Ou fora de alcance. Confira se ele está ligado, com o duckV aberto, e se o Tailscale está ativo neste celular.",
                    style = Texto.apoio, color = c.noErroCont,
                )
            }
        }
        PainelNuvemSemComputador()
    }
}
