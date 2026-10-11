package io.github.duckv.app.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil

// ------------------------------------------------------------ formatos

private val BR = Locale("pt", "BR")
fun hora(ms: Long): String = SimpleDateFormat("HH:mm", BR).format(Date(ms))
fun diaDaSemana(ms: Long): String = SimpleDateFormat("EEEE", BR).format(Date(ms))

fun falta(ms: Long): String {
    val m = maxOf(1, ceil(ms / 60000.0).toLong())
    if (m < 60) return "$m min"
    val h = m / 60
    if (h < 24) return if (m % 60 != 0L) "$h h ${m % 60} min" else "$h h"
    val d = h / 24
    return if (h % 24 != 0L) "$d d ${h % 24} h" else "$d d"
}

fun compacto(n: Long): String = when {
    n < 1000 -> "$n"
    n < 1_000_000 -> String.format(BR, "%.1f mil", n / 1000.0).replace(",0 ", " ")
    n < 1_000_000_000 -> String.format(BR, "%.1f mi", n / 1_000_000.0).replace(",0 ", " ")
    else -> String.format(BR, "%.1f bi", n / 1_000_000_000.0).replace(",0 ", " ")
}

fun plural(n: Int, um: String, varios: String) = "$n ${if (n == 1) um else varios}"

// Aviso curto no rodape da tela (snackbar).
val LocalAviso = staticCompositionLocalOf<(String) -> Unit> { {} }

// ------------------------------------------------------------ medidor em casas

@Composable
fun Celulas(total: Int, cheias: Int, cor: Color, modifier: Modifier = Modifier, quenteDe: Int? = 16, agora: Int = -1, altura: Dp = 12.dp) {
    val c = cores
    Canvas(modifier.fillMaxWidth().height(altura)) {
        if (total <= 0) return@Canvas
        val gap = 2.dp.toPx()
        val w = (size.width - gap * (total - 1)) / total
        for (i in 0 until total) {
            val corCasa = when {
                i < cheias && quenteDe != null && i >= quenteDe -> c.texto
                i < cheias -> cor
                i == agora -> cor.copy(alpha = 0.45f)
                else -> c.linha
            }
            drawRect(corCasa, Offset(i * (w + gap), 0f), Size(w, size.height))
        }
    }
}

// ------------------------------------------------------------ botoes

enum class Peso { Principal, Comum, Quieto, Perigo, Invertido }

/** Botao de brinquedo: tem uma borda de baixo grossa que afunda ao toque. */
@Composable
fun Botao(
    texto: String?,
    aoTocar: () -> Unit,
    modifier: Modifier = Modifier,
    icone: ImageVector? = null,
    peso: Peso = Peso.Comum,
    habilitado: Boolean = true,
    altura: Dp = 48.dp,
    vertical: Boolean = false,
    descricao: String? = null,
    linhas: Int = 2,
) {
    val c = cores
    val toque = remember { MutableInteractionSource() }
    val apertado by toque.collectIsPressedAsState()
    val (fundo, frente, borda) = when (peso) {
        Peso.Principal -> Triple(Laranja, Tinta, LaranjaBorda)
        Peso.Comum -> Triple(c.superficie, c.texto, c.texto)
        Peso.Quieto -> Triple(c.superficie, c.texto, c.vazio)
        Peso.Perigo -> Triple(c.superficie, c.perigo, c.perigo)
        Peso.Invertido -> Triple(c.invTexto, c.invFundo, c.invTexto)
    }
    val fundoReal = if (habilitado) fundo else c.elevada
    val frenteReal = if (habilitado) frente else c.apoio
    val bordaReal = if (habilitado) borda else c.linha
    val fundura = 3.dp
    val desce by animateDpAsState(if (apertado && habilitado) fundura else 0.dp, label = "afunda")
    val forma = RoundedCornerShape(10.dp)
    Box(
        modifier.clickable(toque, null, enabled = habilitado, role = Role.Button, onClickLabel = descricao, onClick = aoTocar),
        propagateMinConstraints = true,
    ) {
        Box(Modifier.matchParentSize().padding(top = fundura).clip(forma).background(bordaReal))
        Box(
            Modifier
                .padding(top = desce, bottom = fundura - desce)
                .heightIn(min = altura)
                .clip(forma)
                .background(fundoReal)
                .border(1.5.dp, bordaReal, forma)
                .padding(horizontal = if (texto == null) 12.dp else 16.dp, vertical = if (vertical) 12.dp else 0.dp),
            contentAlignment = Alignment.Center,
        ) {
            val conteudo = @Composable {
                if (icone != null) Icon(icone, descricao ?: texto, tint = frenteReal, modifier = Modifier.size(if (vertical) 24.dp else 20.dp))
                if (icone != null && texto != null) Spacer(Modifier.size(if (vertical) 6.dp else 8.dp))
                if (texto != null) {
                    Text(
                        texto, color = frenteReal, style = Texto.rotulo.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                        textAlign = TextAlign.Center, maxLines = linhas, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (vertical) {
                Column(Modifier.heightIn(min = altura), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { conteudo() }
            } else {
                Row(Modifier.heightIn(min = altura), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) { conteudo() }
            }
        }
    }
}

/** Acoes que apagam ou encerram pedem um segundo toque no proprio botao. */
@Composable
fun BotaoConfirma(texto: String, icone: ImageVector, aoConfirmar: () -> Unit, modifier: Modifier = Modifier, peso: Peso = Peso.Comum, vertical: Boolean = false) {
    var armado by remember { mutableStateOf(false) }
    LaunchedEffect(armado) {
        if (armado) {
            delay(3500)
            armado = false
        }
    }
    Botao(
        if (armado) "Toque de novo para confirmar" else texto,
        {
            if (armado) {
                armado = false
                aoConfirmar()
            } else armado = true
        },
        modifier, icone, if (armado) Peso.Perigo else peso, vertical = vertical,
    )
}

@Composable
fun Escolha(texto: String, marcado: Boolean, aoTocar: () -> Unit, modifier: Modifier = Modifier) {
    val c = cores
    val forma = RoundedCornerShape(10.dp)
    Box(
        modifier
            .heightIn(min = 44.dp)
            .clip(forma)
            .background(if (marcado) c.texto else c.superficie)
            .border(1.5.dp, if (marcado) c.texto else c.linha, forma)
            .clickable(role = Role.RadioButton, onClick = aoTocar)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(texto, style = Texto.rotulo, color = if (marcado) c.fundo else c.texto, textAlign = TextAlign.Center)
    }
}

@Composable
fun TituloSecao(texto: String, modifier: Modifier = Modifier) {
    Text(texto.uppercase(BR), style = Texto.secao, color = cores.apoio, modifier = modifier.padding(bottom = 10.dp))
}

@Composable
fun Cartao(modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    val c = cores
    val forma = RoundedCornerShape(16.dp)
    Column(
        modifier
            .fillMaxWidth()
            .clip(forma)
            .background(c.superficie)
            .border(1.dp, c.linha, forma),
    ) { conteudo() }
}

@Composable
fun Marca(cor: Color, modifier: Modifier = Modifier, tamanho: Dp = 10.dp) {
    Box(modifier.size(tamanho).clip(RoundedCornerShape(2.dp)).background(cor))
}

@Composable
fun Divisoria(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(cores.linha))
}

@Composable
fun Espaco(dp: Dp) = Spacer(Modifier.size(dp))

@Composable
fun EspacoLargo(dp: Dp) = Spacer(Modifier.width(dp))
