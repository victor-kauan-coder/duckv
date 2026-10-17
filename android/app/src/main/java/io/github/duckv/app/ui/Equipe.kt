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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    val pastaDela = io.github.duckv.app.pasta(sessoes.firstOrNull()?.cwd)
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
    }
}
