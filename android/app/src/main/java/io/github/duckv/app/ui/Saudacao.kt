package io.github.duckv.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Estado
import java.util.Calendar

/** Sol de dia. */
private val SOL = listOf(
    "....#....",
    ".#.....#.",
    "...###...",
    "..#####..",
    "#.#####.#",
    "..#####..",
    "...###...",
    ".#.....#.",
    "....#....",
)

/** Lua de noite, com duas estrelinhas. */
private val LUA = listOf(
    "..####..o",
    ".###.....",
    "###......",
    "###....o.",
    "###......",
    "###......",
    ".###.....",
    "..####...",
)

private data class Periodo(val oi: String, val noite: Boolean, val madrugada: Boolean)

private fun periodo(agora: Long): Periodo {
    val h = Calendar.getInstance().apply { timeInMillis = agora }.get(Calendar.HOUR_OF_DAY)
    return when (h) {
        in 5..11 -> Periodo("Bom dia", noite = false, madrugada = false)
        in 12..17 -> Periodo("Boa tarde", noite = false, madrugada = false)
        in 18..23 -> Periodo("Boa noite", noite = true, madrugada = false)
        else -> Periodo("Boa noite", noite = true, madrugada = true)
    }
}

/**
 * O patinho do lobby: cumprimenta conforme a hora, conta em uma frase como o bando esta
 * e mostra tres informacoes rapidas (sessoes abertas, a conta com mais folga e o proximo reinicio).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Saudacao(e: Estado, agora: Long, pato: String, modifier: Modifier = Modifier) {
    val c = cores
    val p = periodo(agora)
    // O nome vem do e-mail da primeira conta logada ("maria.silva@..." vira "Maria").
    val nome = e.contas.firstNotNullOfOrNull { it.email?.takeIf { m -> '@' in m } }
        ?.substringBefore('@')?.split('.', '_', '-')?.firstOrNull()?.takeIf { it.length in 2..16 && it.all(Char::isLetter) }
        ?.replaceFirstChar { it.uppercase() }
    val vivas = e.sessoes.filter { it.viva && !it.login }
    val trabalhando = vivas.count { it.status == "working" }
    val pedindo = e.contas.filter { ct -> vivas.any { it.conta == ct.id && it.precisa } }

    val frase = when {
        pedindo.size == 1 -> "${pedindo[0].nome} precisa de você."
        pedindo.size > 1 -> "${pedindo.size} contas precisam de você."
        trabalhando > 0 && p.madrugada -> "Ainda acordado? O bando segue trabalhando em ${sessoes(trabalhando)}."
        trabalhando > 0 -> "Seus patinhos estão trabalhando em ${sessoes(trabalhando)}."
        p.madrugada -> "Ainda acordado? Tudo quieto por aqui. Bom descanso."
        vivas.isNotEmpty() -> "Tudo pronto, esperando você."
        p.oi == "Bom dia" -> "Que tal começar o dia abrindo uma sessão?"
        p.noite -> "Tudo tranquilo. O bando descansa."
        else -> "Tudo calmo por aqui."
    }
    val bicho = when {
        pedindo.isNotEmpty() -> "pede"
        trabalhando > 0 -> "trabalha"
        p.madrugada || (p.noite && vivas.isEmpty()) -> "dorme"
        else -> "parado"
    }

    // informacoes rapidas
    val folga = e.contas.filter { it.cinco?.pct != null }.minByOrNull { it.cinco!!.pct!! }
    val reinicio = e.contas.mapNotNull { it.cinco?.resetsAt }.filter { it > agora }.minOrNull()
    val pilulas = buildList {
        add(if (vivas.isEmpty()) "Nenhuma sessão aberta" else "${sessoes(vivas.size).replaceFirstChar { it.uppercase() }} ${if (vivas.size == 1) "aberta" else "abertas"}")
        folga?.let { add("Mais folga: ${it.nome} · ${(100 - it.cinco!!.pct!!).toInt().coerceIn(0, 100)}% livre") }
        reinicio?.let { add("Próximo reinício às ${hora(it)}") }
    }

    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Bottom) {
            // o patinho, de pe no chao de pixels, olhando para o balao
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Pato(bicho, pato, Laranja, Modifier.size(width = 64.dp, height = 50.dp), andar = false)
                ChaoSaudacao(Modifier.width(58.dp))
            }
            // o balao de fala, com o rabinho em pixels apontando para o pato
            Row(Modifier.weight(1f).padding(bottom = 10.dp), verticalAlignment = Alignment.Bottom) {
                RabinhoBalao(c.cartao, Modifier.padding(bottom = 12.dp))
                Column(Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).background(c.cartao).padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (p.noite) PixelArte(LUA, Modifier.size(18.dp), mapOf('#' to Color(0xFFF2D06B), 'o' to c.apoio))
                        else PixelArte(SOL, Modifier.size(18.dp), mapOf('#' to Color(0xFFFFB22E)))
                        Text(
                            if (nome != null) "${p.oi}, $nome!" else "${p.oi}!",
                            style = Texto.conta.copy(fontWeight = FontWeight.SemiBold), color = c.texto, maxLines = 1,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    Text(frase, style = Texto.apoio, color = if (pedindo.isNotEmpty()) c.realce else c.apoio, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
        FlowRow(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (t in pilulas) {
                Text(
                    t, style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio, maxLines = 1,
                    modifier = Modifier.clip(CircleShape).background(c.cartao).padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }
        }
    }
}

private fun sessoes(n: Int) = if (n == 1) "1 sessão" else "$n sessões"

/** O rabinho do balao, em degraus de pixel, para combinar com o pato. */
@Composable
private fun RabinhoBalao(cor: Color, modifier: Modifier) {
    Canvas(modifier.size(width = 8.dp, height = 10.dp)) {
        val px = size.width / 4
        for (i in 0 until 4) {
            val alto = (i + 1) * px
            drawRect(cor, Offset(i * px, size.height - alto), Size(px + 0.5f, alto))
        }
    }
}

/** Chaozinho de pixels sob o pato da saudacao. */
@Composable
private fun ChaoSaudacao(modifier: Modifier) {
    Canvas(modifier.height(4.dp)) {
        val lado = 2.5.dp.toPx()
        val n = (size.width / lado).toInt()
        for (i in 0 until n) {
            val meio = 1f - kotlin.math.abs(i - n / 2f) / (n / 2f)
            drawRect(Laranja.copy(alpha = 0.12f + 0.45f * meio), Offset(i * lado, 0f), Size(lado - 0.5f, lado))
        }
    }
}
