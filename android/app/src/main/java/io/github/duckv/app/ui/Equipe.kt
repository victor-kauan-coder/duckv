package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Conta
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Sessao
import org.json.JSONArray
import org.json.JSONObject

/** Escolhas especiais de conta ao abrir sessao: a de mais limite livre e todas juntas (equipe). */
const val AUTO = "auto"
const val TODAS = "todas"

/**
 * A conta que "Automatica" pega agora: a de mais limite livre. A mesma regra da janela do computador
 * (contaAutomatica em app/desktop.js): limite de 5 horas, semana acima de 70% e sessoes abertas pesam.
 */
fun contaAutomatica(e: Estado): Conta? {
    fun de(agente: String?): Conta? {
        fun nota(c: Conta): Double {
            val u5 = c.cinco?.pct
            val u7 = c.semana?.pct
            if ((u5 ?: 0.0) >= 100 || (u7 ?: 0.0) >= 100) return 1000 + (u5 ?: 0.0)
            return (u5 ?: 50.0) + maxOf(0.0, (u7 ?: 0.0) - 70) + e.vivas(c.id).size * 4
        }
        return e.contas.filter { it.instalado && (agente == null || it.agente == agente) }.minByOrNull(::nota)
    }
    return de("claude") ?: de(null)
}

/** Contas que entram em "Todas as contas": instaladas, com login e com limite sobrando. */
fun contasDaEquipe(e: Estado) = e.contas.filter {
    it.instalado && !it.semLogin && (it.cinco?.pct ?: 0.0) < 100 && (it.semana?.pct ?: 0.0) < 100
}

/** "32% em 5 h", ou nada sem leitura. */
fun usoCurto(c: Conta) = c.cinco?.pct?.let { "${it.toInt()}% em 5 h" }

/**
 * Abre uma equipe: uma sessao por conta na mesma pasta, que dividem a tarefa.
 * [pronto] recebe o erro, ou o id da equipe e as contas que nao abriram.
 */
fun abrirEquipe(e: Estado, cwd: String, texto: String, extra: JSONObject.() -> Unit = {}, pronto: (erro: String?, equipe: String?, falhas: List<String>) -> Unit) {
    val ids = contasDaEquipe(e).map { it.id }
    val m = JSONObject().put("t", "equipe").put("cwd", cwd).put("texto", texto).put("contas", JSONArray(ids)).apply(extra)
    Hub.mandar(m) { er, r ->
        if (er != null) return@mandar pronto(er, null, emptyList())
        val id = r?.optString("equipe")?.takeIf { it.isNotEmpty() }
            ?: return@mandar pronto("O computador não abriu a equipe. Ele pode estar com uma versão antiga do duckV.", null, emptyList())
        val f = r.optJSONArray("falhas")
        val falhas = List(f?.length() ?: 0) { i ->
            val o = f!!.optJSONObject(i)
            "${e.conta(o?.optString("conta").orEmpty()).nome}: ${o?.optString("erro").orEmpty()}"
        }
        pronto(null, id, falhas)
    }
}

/** Os patinhos de varias contas juntos, um meio por cima do outro: o icone de "Todas as contas". */
@Composable
fun Patinhos(contas: List<Conta>, modifier: Modifier = Modifier, alto: androidx.compose.ui.unit.Dp = 18.dp) {
    val mostra = contas.take(4)
    val passo = alto * 0.55f
    Box(modifier.width(alto * 1.25f + passo * (mostra.size - 1).coerceAtLeast(0)).height(alto)) {
        mostra.forEachIndexed { i, ct ->
            Pato(
                "parado", "parado", Color(ct.cor), Modifier.offset(x = passo * i).size(width = alto * 1.25f, height = alto),
                andar = false, tocavel = false, tipo = ct.pato,
            )
        }
    }
}

/** As equipes que tem alguma sessao viva, da mais nova para a mais antiga. */
fun equipesVivas(e: Estado): List<Pair<String, List<Sessao>>> =
    e.sessoes.filter { it.equipe != null }.groupBy { it.equipe!!.id }
        .filter { (_, ss) -> ss.any { it.viva } }
        .map { (id, ss) -> id to ss.sortedBy { it.equipe!!.ordem } }
        .sortedByDescending { (_, ss) -> ss.maxOf { it.inicio } }

/** A equipe em uma frase: quantas pedem, trabalham ou ja terminaram. */
private fun resumoEquipe(ss: List<Sessao>): Pair<String, Boolean> {
    val pedem = ss.count { it.viva && it.precisa }
    val trabalham = ss.count { it.viva && !it.precisa && it.status == "working" }
    val terminaram = ss.count { !it.viva }
    return when {
        pedem > 0 -> (if (pedem == 1) "1 pede você" else "$pedem pedem você") to true
        trabalham > 0 -> (if (trabalham == 1) "1 trabalhando" else "$trabalham trabalhando") to false
        terminaram == ss.size -> "Todas terminaram" to false
        else -> "Esperando sua mensagem" to false
    }
}

private fun fazAgora(s: Sessao) = when {
    !s.viva -> "Terminou"
    s.precisa -> "Pede você"
    s.status == "working" -> s.atividade.ifBlank { "Trabalhando" }
    s.status == "error" -> "Parou com erro"
    else -> "Esperando"
}

/**
 * Cartao da equipe no inicio: uma pista larga onde os patos de cada conta andam lado a lado.
 * Trabalhando, o pato anda; pedindo, pula com a exclamacao; parado, respira; terminou, dorme.
 * Embaixo de cada pato, o nome da conta e o que ele faz. Tocar num pato abre a sessao dele.
 */
@Composable
fun CartaoEquipe(e: Estado, sessoes: List<Sessao>, pato: String, modifier: Modifier = Modifier, aoAbrir: (String) -> Unit) {
    val c = cores
    val (resumo, pede) = resumoEquipe(sessoes)
    // Isolada, cada sessao abre na copia dela: a pasta que o cartao mostra e sempre a do projeto.
    val primeira = sessoes.firstOrNull()
    val pastaDela = io.github.duckv.app.pasta(primeira?.equipe?.principal ?: primeira?.cwd)
    val total = sessoes.maxOfOrNull { it.equipe?.total ?: 0 }?.coerceAtLeast(sessoes.size) ?: sessoes.size
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(top = 14.dp, bottom = 12.dp)) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Equipe", style = Texto.conta, color = c.texto)
                Text(
                    listOfNotNull(pastaDela.ifEmpty { null }, plural(total, "conta", "contas")).joinToString(" · "),
                    style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            // o estado da equipe sempre escrito; em pessego quando alguem pede voce
            Row(
                Modifier.padding(start = 12.dp).clip(CircleShape).background(if (pede) c.invFundo else c.fundo).padding(start = 10.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (pede) c.realce else if (resumo.endsWith("trabalhando")) Laranja else c.ok))
                Text(resumo, style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = if (pede) c.invTexto else c.texto, maxLines = 1, modifier = Modifier.padding(start = 8.dp))
            }
        }
        // a pista: um chao so, e cada pato na sua faixa, todos andando juntos
        Box(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp)) {
            // o chao e neutro: a cor de cada conta fica so na sombra embaixo do pato dela
            if (pato != "nenhum") Box(Modifier.padding(top = 60.dp, start = 6.dp, end = 6.dp).fillMaxWidth()) { Chao(c.vazio, Modifier.fillMaxWidth()) }
            Row(Modifier.fillMaxWidth()) {
                for (s in sessoes) {
                    val ct = e.conta(s.conta)
                    val cor = Color(ct.cor)
                    val faz = fazAgora(s)
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .clickable(role = Role.Button, onClickLabel = "Abrir a sessão de ${ct.nome}") { aoAbrir(s.id) }
                            .semantics(mergeDescendants = true) { contentDescription = "${ct.nome}: $faz" }
                            .heightIn(min = 48.dp).padding(horizontal = 4.dp, vertical = 2.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        if (pato != "nenhum") Pato(
                            bichoDaSessao(s), pato, cor, Modifier.fillMaxWidth().height(60.dp),
                            andar = true, tocavel = false, tipo = ct.pato, vivo = lembrarPato("equipe" + s.id),
                        )
                        else Marca(cor, Modifier.padding(top = 8.dp), tamanho = 12.dp)
                        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Marca(cor, tamanho = 8.dp)
                            Text(ct.nome, style = Texto.rotulo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp))
                        }
                        Text(
                            faz, style = Texto.pequeno, color = if (s.viva && s.precisa) c.realce else c.apoio,
                            maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
        }
        ResultadoDaEquipe(e, primeira?.equipe, sessoes.joinToString { it.status })
    }
}

/** Por que os patos nao ganharam uma copia cada: a mesma frase da janela do computador. */
private val MOTIVO_SEM_COPIA = mapOf(
    "nao-git" to "A pasta não é um repositório git: os patos trabalham todos nos mesmos arquivos.",
    "sem-commits" to "O repositório ainda não tem nenhum commit: os patos trabalham todos nos mesmos arquivos.",
    "desligado" to "As cópias foram desligadas ao abrir: os patos trabalham todos nos mesmos arquivos.",
    "erro" to "Não deu para criar as cópias: os patos trabalham todos nos mesmos arquivos.",
)

private data class PatoFeito(
    val conta: String,
    val nome: String,
    val branch: String,
    val commits: Int,
    val mais: Int,
    val menos: Int,
    val pendentes: Int,
    val juntado: Boolean,
    val erro: String?,
)

private data class Resultado(val patos: List<PatoFeito>, val principalLimpa: Boolean)

/**
 * O que cada pato fez: com uma copia por pato, o branch, os commits a frente da base e as linhas de
 * cada um, "Juntar este" (merge na pasta principal) e "Limpar a equipe" no fim. Le so quando aberto:
 * cada leitura roda git no computador. Sem copias, uma frase diz por que todos usam os mesmos arquivos.
 */
@Composable
private fun ResultadoDaEquipe(e: Estado, eq: io.github.duckv.app.Equipe?, marcaDosEstados: String) {
    val c = cores
    val aviso = LocalAviso.current
    val id = eq?.id ?: return
    if (!eq.isolado) {
        val porque = MOTIVO_SEM_COPIA[eq.motivo] ?: return
        Text(porque, style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp))
        return
    }
    var aberto by rememberSaveable(id) { mutableStateOf(false) }
    var r by remember(id) { mutableStateOf<Resultado?>(null) }
    var erro by remember(id) { mutableStateOf<String?>(null) }
    var lendo by remember(id) { mutableStateOf(false) }
    var juntando by remember(id) { mutableStateOf<String?>(null) }

    fun ler() {
        if (lendo) return
        lendo = true
        Hub.mandar(JSONObject().put("t", "equipeResultado").put("equipe", id)) { er, resp ->
            lendo = false
            erro = er
            if (er != null) return@mandar
            val a = resp?.optJSONArray("patos")
            r = Resultado(
                List(a?.length() ?: 0) { i ->
                    val o = a!!.getJSONObject(i)
                    val conta = o.optString("conta")
                    PatoFeito(
                        conta, o.optString("nome").ifEmpty { e.conta(conta).nome }, o.optString("branch"),
                        o.optInt("commits"), o.optInt("mais"), o.optInt("menos"), o.optInt("pendentes"),
                        !o.isNull("juntado") && o.optString("juntado").isNotEmpty(),
                        o.optString("erro").takeIf { !o.isNull("erro") && it.isNotEmpty() },
                    )
                },
                resp?.optBoolean("principalLimpa") == true,
            )
        }
    }
    // um pato terminou o turno: com o resultado aberto, le de novo (os commits podem ter mudado)
    LaunchedEffect(aberto, marcaDosEstados) { if (aberto) ler() }

    Column(Modifier.padding(top = 4.dp)) {
        Divisoria(Modifier.padding(horizontal = 16.dp))
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { aberto = !aberto }.heightIn(min = 48.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("O que cada pato fez", style = Texto.rotulo, color = c.texto, modifier = Modifier.weight(1f))
            Icon(
                if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                if (aberto) "Esconder o que cada pato fez" else "Ver o que cada pato fez",
                Modifier.size(20.dp), tint = c.apoio,
            )
        }
        if (!aberto) return@Column
        val res = r
        val erroAgora = erro
        when {
            erroAgora != null -> Text(erroAgora, style = Texto.apoio, color = c.perigo, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            res == null -> Text("Lendo os branches…", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            else -> Column(Modifier.padding(horizontal = 16.dp)) {
                if (!res.principalLimpa) Text(
                    "A pasta principal tem mudanças sem commit. Faça um commit (ou guarde as mudanças) antes de juntar um pato.",
                    style = Texto.apoio, color = c.realce, modifier = Modifier.padding(vertical = 8.dp),
                )
                for ((i, p) in res.patos.withIndex()) {
                    if (i > 0) Divisoria()
                    val feito = when {
                        p.erro != null -> p.erro
                        p.commits > 0 -> plural(p.commits, "commit", "commits") + ", +" + p.mais + " −" + p.menos
                        else -> "Ainda não commitou nada"
                    }
                    val extra = when {
                        p.juntado -> "Já juntado na pasta principal"
                        p.pendentes > 0 -> plural(p.pendentes, "arquivo", "arquivos") + " ainda sem commit"
                        else -> null
                    }
                    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Marca(Color(e.conta(p.conta).cor), tamanho = 8.dp)
                            Text(p.nome, style = Texto.rotulo, color = c.texto, modifier = Modifier.padding(start = 8.dp))
                        }
                        Text(p.branch, style = Texto.codigo, color = c.apoio, modifier = Modifier.padding(top = 2.dp))
                        Text(listOfNotNull(feito, extra).joinToString(". "), style = Texto.apoio, color = if (p.erro != null) c.perigo else c.apoio)
                        Botao(
                            if (p.juntado) "Juntado" else if (juntando == p.conta) "Juntando…" else "Juntar este",
                            {
                                juntando = p.conta
                                Hub.mandar(JSONObject().put("t", "equipeJuntar").put("equipe", id).put("conta", p.conta)) { er, resp ->
                                    juntando = null
                                    if (er != null) {
                                        aviso(er)
                                    } else {
                                        aviso(resp?.optString("msg")?.takeIf { it.isNotEmpty() } ?: ("O trabalho de " + p.nome + " foi juntado na pasta principal"))
                                        ler()
                                    }
                                }
                            },
                            Modifier.padding(top = 8.dp), null, Peso.Quieto,
                            habilitado = p.commits > 0 && !p.juntado && res.principalLimpa && juntando == null,
                        )
                    }
                }
                Text(
                    "Juntar traz o branch do pato para a pasta principal com um merge. Limpar apaga as cópias e os branches, depois que as sessões terminam.",
                    style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 10.dp, bottom = 8.dp),
                )
                BotaoConfirma("Limpar a equipe", Icons.Rounded.Delete, {
                    Hub.mandar(JSONObject().put("t", "equipeLimpar").put("equipe", id)) { er, _ ->
                        if (er != null) {
                            aviso(er)
                        } else {
                            aviso("Cópias e branches da equipe removidos")
                            ler()
                        }
                    }
                }, Modifier.fillMaxWidth().padding(bottom = 10.dp), Peso.Perigo)
            }
        }
    }
}
