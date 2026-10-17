package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Automacao
import io.github.duckv.app.Estado
import io.github.duckv.app.Execucao
import io.github.duckv.app.Hub
import io.github.duckv.app.Quando
import io.github.duckv.app.lerHistorico
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// Automacoes agendadas: na hora marcada, o computador abre uma sessao (conta, pasta) com a primeira
// mensagem escrita aqui. Nada roda atrasado: com o computador desligado na hora, a execucao entra no
// historico como perdida e a automacao espera a proxima. Quem conta as horas e o hub/automacoes.mjs.

private val BR = Locale("pt", "BR")
private val DIA_CURTO = SimpleDateFormat("EEE, d 'de' MMM", BR)
val DIAS_SEMANA = listOf("domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado")
private val TIPOS = listOf("diario" to "Todo dia", "dias-uteis" to "Dias úteis", "semanal" to "Uma vez por semana", "cron" to "Cron")

/** "hoje às 08:30", "amanhã às 08:30" ou "sex., 23 de out. às 08:30". */
fun quandoRelativo(ms: Long?): String {
    if (ms == null || ms <= 0) return ""
    val dia = { t: Long -> Calendar.getInstance().apply { timeInMillis = t }.let { it.get(Calendar.YEAR) * 1000 + it.get(Calendar.DAY_OF_YEAR) } }
    val d = Calendar.getInstance().apply { timeInMillis = ms }
    val hoje = Calendar.getInstance()
    val quantos = dia(ms) - dia(hoje.timeInMillis)
    val quando = when (quantos) {
        0 -> "hoje"
        1 -> "amanhã"
        -1 -> "ontem"
        else -> DIA_CURTO.format(Date(ms))
    }
    return "$quando às ${hora(d.timeInMillis)}"
}

/** Uma execucao em uma frase: a sessao que abriu, o erro, ou a hora perdida com o computador desligado. */
fun textoDaExecucao(e: Estado, x: Execucao): String = when {
    x.perdida -> "Perdida ${quandoRelativo(x.marcada ?: x.em)}: o computador estava desligado"
    x.erro != null -> "Não abriu ${quandoRelativo(x.em)}: ${x.erro}"
    else -> "Abriu a sessão ${quandoRelativo(x.em)}" + (x.conta?.let { " em ${e.conta(it).nome}" } ?: "") + (if (x.manual) " (rodada à mão)" else "")
}

/** A lista das automacoes: nome, quando, proxima execucao e como foi a ultima. */
@Composable
fun TelaAutomacoes(e: Estado?, aoVoltar: () -> Unit, aoAbrir: (String?) -> Unit) {
    val c = cores
    Column(Modifier.fillMaxSize().background(c.fundo)) {
        Topo("Automações", "O computador abre a sessão na hora marcada.", aoVoltar)
        val lista = e?.automacoes.orEmpty()
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (e == null) {
                Text("Esperando o computador.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
            } else if (lista.isEmpty()) {
                Text(
                    "Nenhuma automação ainda. Por exemplo: todo dia às 8h, rodar os testes e corrigir o que falhar; ou toda sexta, revisar o que mudou na semana.",
                    style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 8.dp),
                )
            } else {
                for (a in lista) androidx.compose.runtime.key(a.id) { LinhaAutomacao(e, a) { aoAbrir(a.id) } }
            }
        }
        // A acao principal fica presa embaixo: nunca some atras da rolagem.
        Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Botao("Nova automação", { aoAbrir(null) }, Modifier.fillMaxWidth(), Icons.Rounded.Add, Peso.Principal, habilitado = e != null)
        }
    }
}

@Composable
private fun LinhaAutomacao(e: Estado, a: Automacao, aoTocar: () -> Unit) {
    val c = cores
    val conta = a.conta?.let { e.conta(it).nome } ?: "conta automática"
    val proxima = if (!a.ativa) "Pausada" else if (a.proxima != null) "Próxima: ${quandoRelativo(a.proxima)}" else "Sem próxima hora possível"
    val ultima = a.ultima?.let { textoDaExecucao(e, it) } ?: "Ainda não rodou"
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao)
            .clickable(role = Role.Button, onClickLabel = "Abrir ${a.nome}") { aoTocar() }
            .heightIn(min = 72.dp).padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Rounded.Schedule, null, Modifier.size(24.dp).padding(top = 2.dp), tint = if (a.ativa) c.realce else c.apoio)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(a.nome, style = Texto.conta, color = if (a.ativa) c.texto else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${a.quandoTexto}, $conta, ${io.github.duckv.app.pasta(a.pasta)}", style = Texto.apoio, color = c.apoio, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                proxima, style = Texto.apoio.copy(fontWeight = FontWeight.Medium),
                color = if (a.ativa && a.proxima != null) c.realce else c.apoio, modifier = Modifier.padding(top = 2.dp),
            )
            Text(ultima, style = Texto.pequeno, color = if (a.ultima?.erro != null) c.perigo else c.apoio, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, Modifier.size(20.dp), tint = c.apoio)
    }
}

/** A tela de uma automacao: os campos, as acoes e o historico. [id] nulo e uma automacao nova. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TelaAutomacao(e: Estado?, id: String?, aoVoltar: () -> Unit, aoAbriuSessao: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val atual = e?.automacoes?.find { it.id == id }
    if (e == null || (id != null && atual == null)) {
        Column(Modifier.fillMaxSize().background(c.fundo)) {
            Topo(if (id == null) "Nova automação" else "Automação", null, aoVoltar)
            Text(
                if (e == null) "Esperando o computador." else "Esta automação não está mais no computador. Ela pode ter sido apagada em outro aparelho.",
                style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(16.dp),
            )
        }
        return
    }
    // Os campos nascem do que o computador tem; o que a pessoa digita vale ate ela sair da tela.
    var nome by rememberSaveable(id) { mutableStateOf(atual?.nome.orEmpty()) }
    var tipo by rememberSaveable(id) { mutableStateOf(atual?.quando?.tipo ?: "dias-uteis") }
    var horaTexto by rememberSaveable(id) { mutableStateOf(atual?.quando?.hora ?: "09:00") }
    var diaSemana by rememberSaveable(id) { mutableStateOf(atual?.quando?.dia ?: 1) }
    var cron by rememberSaveable(id) { mutableStateOf(atual?.quando?.cron.orEmpty()) }
    var conta by rememberSaveable(id) { mutableStateOf(atual?.conta.orEmpty()) }
    var pasta by rememberSaveable(id) { mutableStateOf(atual?.pasta ?: e.host.pastas.firstOrNull().orEmpty()) }
    var texto by rememberSaveable(id) { mutableStateOf(atual?.texto.orEmpty()) }
    var erroDe by remember { mutableStateOf<Pair<String, String>?>(null) }
    var salvando by remember { mutableStateOf(false) }
    var verRecentes by rememberSaveable { mutableStateOf(false) }
    var escolhendoHora by remember { mutableStateOf(false) }
    var historico by remember { mutableStateOf<List<Execucao>?>(null) }
    var apagada by remember { mutableStateOf(false) }

    fun lerOHistorico() {
        if (id == null) return
        Hub.mandar(JSONObject().put("t", "automacaoHistorico").put("id", id)) { er, r ->
            historico = if (er != null) emptyList() else lerHistorico(r?.optJSONArray("historico"))
        }
    }
    LaunchedEffect(id) { lerOHistorico() }
    // apagada aqui: volta para a lista assim que o computador confirma
    LaunchedEffect(apagada) { if (apagada) aoVoltar() }

    val erroDoCampo = { campo: String -> erroDe?.takeIf { it.first == campo }?.second }

    Column(Modifier.fillMaxSize().background(c.fundo).imePadding()) {
        Topo(atual?.nome ?: "Nova automação", atual?.let { if (it.ativa) it.quandoTexto else "${it.quandoTexto}, pausada" }, aoVoltar)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(26.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlinedTextField(
                    nome, { nome = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Nome") },
                    placeholder = { Text("Ex.: Testes da manhã", color = c.apoio) },
                    isError = erroDoCampo("nome") != null,
                    supportingText = erroDoCampo("nome")?.let { { Text(it, color = c.perigo) } },
                    singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                Column {
                    CabecalhoAjuste("Quando", null)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for ((v, t) in TIPOS) Escolha(t, tipo == v, { tipo = v })
                    }
                    erroDoCampo("quando")?.let { Text(it, style = Texto.apoio, color = c.perigo, modifier = Modifier.padding(top = 8.dp)) }
                }
                if (tipo != "cron") Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.superficie)
                        .clickable(role = Role.Button, onClickLabel = "Escolher a hora") { escolhendoHora = true }
                        .heightIn(min = 56.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Hora", style = Texto.rotulo, color = c.apoio, modifier = Modifier.weight(1f))
                    Text(horaTexto, style = Texto.conta, color = c.texto)
                }
                if (tipo == "semanal") Column {
                    CabecalhoAjuste("Dia da semana", null)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for ((i, d) in DIAS_SEMANA.withIndex()) Escolha(d.replaceFirstChar { it.uppercase() }, diaSemana == i, { diaSemana = i })
                    }
                }
                if (tipo == "cron") OutlinedTextField(
                    cron, { cron = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Expressão cron") },
                    placeholder = { Text("30 8 * * 1-5", color = c.apoio) },
                    supportingText = { Text("Minuto, hora, dia do mês, mês e dia da semana. Ex.: 30 8 * * 1-5 (8:30 de segunda a sexta).", color = c.apoio) },
                    singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.codigo.copy(color = c.texto),
                )
                Column {
                    CabecalhoAjuste("Conta", null)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Escolha("Automática", conta.isEmpty(), { conta = "" })
                        for (ct in e.contas.filter { it.instalado }) Escolha(ct.nome, conta == ct.id, { conta = ct.id }, marca = androidx.compose.ui.graphics.Color(ct.cor))
                    }
                    Text(
                        if (conta.isEmpty()) "Na hora, o duckV escolhe a conta de mais limite livre." else "Sempre nesta conta.",
                        style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 8.dp),
                    )
                    erroDoCampo("conta")?.let { Text(it, style = Texto.apoio, color = c.perigo, modifier = Modifier.padding(top = 4.dp)) }
                }
                Column {
                    OutlinedTextField(
                        pasta, { pasta = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Pasta do projeto") },
                        placeholder = { Text(e.host.home, color = c.apoio) },
                        isError = erroDoCampo("pasta") != null,
                        supportingText = erroDoCampo("pasta")?.let { { Text(it, color = c.perigo) } },
                        singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                    )
                    if (e.host.pastas.isNotEmpty()) {
                        if (verRecentes) Column(Modifier.padding(top = 4.dp)) {
                            Text("Usadas há pouco", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp, bottom = 4.dp))
                            for (f in e.host.pastas.take(6)) Text(
                                f, style = Texto.apoio, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                    .clickable(role = Role.Button) { pasta = f; verRecentes = false }
                                    .heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 14.dp),
                            )
                        } else TextButton({ verRecentes = true }, Modifier.heightIn(min = 48.dp)) {
                            Icon(Icons.Rounded.History, null, Modifier.size(18.dp), tint = c.realce)
                            Text("Pastas usadas há pouco", style = Texto.rotulo, color = c.realce, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
                OutlinedTextField(
                    texto, { texto = it.take(8000) }, Modifier.fillMaxWidth(), label = { Text("Primeira mensagem da sessão") },
                    placeholder = { Text("Ex.: rode os testes e corrija o que estiver falhando", color = c.apoio) },
                    isError = erroDoCampo("texto") != null,
                    supportingText = erroDoCampo("texto")?.let { { Text(it, color = c.perigo) } },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences),
                    minLines = 3, maxLines = 8, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                Botao(
                    if (salvando) "Salvando…" else if (atual == null) "Criar automação" else "Salvar",
                    {
                        erroDe = null
                        val quando = JSONObject().put("tipo", tipo)
                        if (tipo == "cron") quando.put("cron", cron.trim()) else quando.put("hora", horaTexto.trim())
                        if (tipo == "semanal") quando.put("dia", diaSemana)
                        val corpo = JSONObject()
                            .put("nome", nome.trim())
                            .put("quando", quando)
                            .put("conta", conta.ifEmpty { JSONObject.NULL })
                            .put("pasta", pasta.trim())
                            .put("texto", texto.trim())
                            .put("ativa", atual?.ativa ?: true)
                        val m = JSONObject().put("t", if (atual == null) "automacaoCriar" else "automacaoEditar").put("automacao", corpo)
                        if (atual != null) m.put("id", atual.id)
                        salvando = true
                        Hub.mandar(m) { er, r ->
                            salvando = false
                            if (er != null) {
                                erroDe = (r?.optString("campo")?.takeIf { it.isNotEmpty() } ?: "quando") to er
                                return@mandar
                            }
                            if (atual == null) {
                                aviso("Automação criada. Próxima: ${quandoRelativo(r?.optJSONObject("automacao")?.optLong("proxima"))}")
                                aoVoltar()
                            } else {
                                aviso("Automação salva")
                                lerOHistorico()
                            }
                        }
                    },
                    Modifier.fillMaxWidth(), null, Peso.Principal, habilitado = !salvando,
                )
            }

            if (atual != null) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TituloSecao("Esta automação")
                Botao("Rodar agora", {
                    Hub.mandar(JSONObject().put("t", "automacaoRodar").put("id", atual.id)) { er, r ->
                        if (er != null) return@mandar aviso(er)
                        aviso("${atual.nome}: sessão aberta")
                        lerOHistorico()
                        r?.optString("instance")?.takeIf { it.isNotEmpty() }?.let(aoAbriuSessao)
                    }
                }, Modifier.fillMaxWidth(), Icons.Rounded.Bolt, Peso.Comum)
                Botao(if (atual.ativa) "Pausar" else "Voltar a contar", {
                    Hub.mandar(JSONObject().put("t", "automacaoPausar").put("id", atual.id).put("ativa", !atual.ativa)) { er, r ->
                        if (er != null) return@mandar aviso(er)
                        val liga = r?.optJSONObject("automacao")?.optBoolean("ativa") == true
                        aviso(if (liga) "Ligada. Próxima: ${quandoRelativo(r?.optJSONObject("automacao")?.optLong("proxima"))}" else "Automação pausada")
                    }
                }, Modifier.fillMaxWidth(), if (atual.ativa) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, Peso.Comum)
                BotaoConfirma("Apagar automação", Icons.Rounded.Delete, {
                    Hub.mandar(JSONObject().put("t", "automacaoApagar").put("id", atual.id)) { er, _ ->
                        if (er != null) return@mandar aviso(er)
                        aviso("${atual.nome} apagada")
                        apagada = true
                    }
                }, Modifier.fillMaxWidth(), Peso.Perigo)
            }

            if (atual != null) Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(bottom = 24.dp)) {
                TituloSecao("Últimas execuções")
                val h = historico
                when {
                    h == null -> Text("Lendo o histórico…", style = Texto.apoio, color = c.apoio)
                    h.isEmpty() -> Text("Ainda não rodou nenhuma vez.", style = Texto.apoio, color = c.apoio)
                    else -> for ((i, x) in h.withIndex()) {
                        if (i > 0) Divisoria(Modifier.padding(vertical = 2.dp))
                        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
                            val cor = if (x.erro != null) c.perigo else if (x.perdida) c.apoio else c.ok
                            Icon(
                                if (x.erro != null) Icons.Rounded.ErrorOutline else if (x.perdida) Icons.Rounded.Schedule else Icons.Rounded.CheckCircle,
                                null, Modifier.size(18.dp), tint = cor,
                            )
                            Text(textoDaExecucao(e, x), style = Texto.apoio, color = if (x.erro != null) c.perigo else c.apoio, modifier = Modifier.padding(start = 10.dp))
                        }
                    }
                }
            }
        }
    }

    if (escolhendoHora) DialogoHora(horaTexto, { escolhendoHora = false }) { escolhido ->
        horaTexto = escolhido
        escolhendoHora = false
    }
}

/** O relogio do Material 3 para escolher a hora, com o que foi escolhido sempre escrito no campo. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DialogoHora(hora: String, aoFechar: () -> Unit, aoEscolher: (String) -> Unit) {
    val partes = hora.split(":")
    val estado = rememberTimePickerState(
        initialHour = partes.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 9,
        initialMinute = partes.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0,
        is24Hour = true,
    )
    AlertDialog(
        aoFechar,
        confirmButton = { TextButton({ aoEscolher("%02d:%02d".format(estado.hour, estado.minute)) }) { Text("Escolher", style = Texto.rotulo, color = cores.realce) } },
        dismissButton = { TextButton(aoFechar) { Text("Cancelar", style = Texto.rotulo, color = cores.apoio) } },
        title = { Text("Hora da automação", style = Texto.titulo, color = cores.texto) },
        text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TimePicker(estado) } },
        containerColor = cores.elevada,
    )
}

/** O "quando" em uma frase, quando o computador ainda nao mandou a dele (automacao sendo criada). */
fun quandoEmTexto(q: Quando): String = when (q.tipo) {
    "cron" -> "No cron ${q.cron}"
    "diario" -> "Todo dia às ${q.hora}"
    "dias-uteis" -> "De segunda a sexta às ${q.hora}"
    else -> "Toda ${DIAS_SEMANA.getOrElse(q.dia) { "segunda-feira" }} às ${q.hora}"
}
