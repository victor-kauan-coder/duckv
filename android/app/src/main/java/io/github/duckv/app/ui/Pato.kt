package io.github.duckv.app.ui

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

// Pato em pixels, desenhado para este app. Mora direto no fundo da tela, sem
// caixa colorida atras: a cor da conta aparece so na sombra embaixo dele.
// Letras: O/B cabeca, o/b corpo, T/t rabo, w asa, k bico, q queixo, e olho, f/g pes.
private val SPRITE = listOf(
    ".........OOOO...",
    "........OBBBBO..",
    "........OBBeBkkk",
    "........OBBBBqq.",
    ".T......obbbo...",
    "TtT...oobbbbo...",
    "Tttooobbbbbbbo..",
    "obbbbwwwbbbbbo..",
    ".obbbbwwwbbbo...",
    "..obbbbbbbbo....",
    "...oooooooo.....",
    ".....f...g......",
    "....ff..gg......",
)
private val CELULAS = SPRITE.flatMapIndexed { y, l -> l.mapIndexedNotNull { x, c -> if (c == '.') null else Triple(x, y, c) } }
private val SOM = listOf(17f to 1f, 18f to 0f, 17f to 3.6f)
private val EXCLAMA = listOf(11f to -5f, 11f to -4f, 11f to -3f, 11f to -1f)
private val SONO = listOf(14 to -4, 15 to -4, 16 to -4, 15 to -3, 14 to -2, 15 to -2, 16 to -2)

private val TRUQUES = mapOf(
    "parado" to listOf("grasna", "bate", "rabo", "pisca", "cisca", "olha", "pulinho"),
    "trabalha" to listOf("grasna", "bate", "rabo", "pisca", "pulinho"),
    "festa" to listOf("grasna", "bate"),
    "dorme" to listOf("espia", "rabo"),
)
private val DURACAO = mapOf(
    "grasna" to 900L, "bate" to 800L, "rabo" to 800L, "pisca" to 320L, "cisca" to 1300L, "olha" to 1200L, "pulinho" to 480L, "espia" to 1100L,
    // reacoes ao toque
    "amor" to 1600L, "salto" to 900L, "danca" to 1400L, "quaa" to 1000L, "bravo" to 1300L,
)
private val REACOES = listOf("amor", "salto", "danca", "quaa")
private val Coracao = Color(0xFFFF5A5F)

/**
 * Tipos de patinho: cada um tem a propria plumagem e a cor da conta que vem com ele.
 * [cabeca] pinta a cabeca de outra cor (o marreco); [contorno] troca o contorno escuro.
 */
data class TipoPato(
    val id: String, val nome: String, val sobre: String,
    val penas: Color, val asa: Color, val bico: Color, val pes: Color,
    val cor: String, val cabeca: Color? = null, val contorno: Color? = null,
)

val TIPOS_PATO = listOf(
    TipoPato("classico", "Clássico", "Branquinho, bico amarelo", Color(0xFFFFF6EE), Color(0xFFE6D3BF), Color(0xFFFFD84A), Color(0xFFFF9A3D), "#ff7a1a"),
    TipoPato("borracha", "De borracha", "O da banheira", Color(0xFFFFD23F), Color(0xFFF2B705), Color(0xFFFF8A00), Color(0xFFFF8A00), "#f2a900"),
    TipoPato("marreco", "Marreco", "Cabeça verde de lago", Color(0xFFD9C7A8), Color(0xFF8C6E4E), Color(0xFFE8C547), Color(0xFFF28C28), "#2b8a6e", cabeca = Color(0xFF2E7D4F)),
    TipoPato("pessego", "Pêssego", "Rosado e fofo", Color(0xFFFFDCCB), Color(0xFFF7B79A), Color(0xFFFF8A65), Color(0xFFFF8A65), "#f26b4e"),
    TipoPato("chocolate", "Chocolate", "Marrom de quintal", Color(0xFF9A6644), Color(0xFF6B4226), Color(0xFFF2B24C), Color(0xFFE07B39), "#b5651d"),
    TipoPato("mar", "Do mar", "Penas cinza-azuladas", Color(0xFFE6EEF5), Color(0xFF9EC3DD), Color(0xFFFFC94A), Color(0xFF6FA8DC), "#3d8bfd"),
    TipoPato("noturno", "Noturno", "Plumagem de madrugada", Color(0xFF4A4152), Color(0xFF6E6279), Color(0xFFFFB347), Color(0xFFFFB347), "#7e57c2", contorno = Color(0xFF15111A)),
    TipoPato("rosa", "Rosa", "Para quem gosta de cor", Color(0xFFFFC9DF), Color(0xFFF48FB1), Color(0xFFFFD84A), Color(0xFFF06292), "#e0569a"),
)
fun tipoPato(id: String?) = TIPOS_PATO.find { it.id == id } ?: TIPOS_PATO[0]
private val Cansado = Color(0xFFCFC4BA)
private val AsaCansada = Color(0xFFB9ADA2)
private val BicoCansado = Color(0xFFCDB35C)

/**
 * @param estado trabalha, festa, pede, parado, dorme ou cansado
 * @param modo animado, calmo (sem gracinhas) ou parado
 * @param andar se o pato pode passear de um lado a outro da largura toda
 * @param repouso onde ele fica quando nao anda: 0 na ponta esquerda, 0.5 no meio
 */
@Composable
fun Pato(estado: String, modo: String, cor: Color, modifier: Modifier = Modifier, andar: Boolean = true, tocavel: Boolean = true, tipo: String? = null, repouso: Float = 0.5f) {
    val ctx = LocalContext.current
    val semMovimento = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val anima = modo != "parado" && !semMovimento
    val t by produceState(0L, anima) {
        if (!anima) return@produceState
        val t0 = withFrameMillis { it }
        while (true) withFrameMillis { value = it - t0 }
    }
    var truque by remember { mutableStateOf<String?>(null) }
    var truqueDesde by remember { mutableLongStateOf(0L) }
    LaunchedEffect(estado, anima, modo) {
        truque = null
        if (!anima || modo != "animado") return@LaunchedEffect
        delay(1500L + Random.nextLong(4000))
        while (true) {
            val opcoes = TRUQUES[estado].orEmpty()
            if (opcoes.isNotEmpty()) {
                val tr = opcoes.random()
                truque = tr
                truqueDesde = System.nanoTime() / 1_000_000
                delay(DURACAO[tr] ?: 800)
                truque = null
            }
            delay(3500L + Random.nextLong(6000))
        }
    }
    // Toque no pato: ele reage. Varios toques seguidos o deixam bravo.
    val vibra = androidx.compose.ui.platform.LocalHapticFeedback.current
    var toques by remember { mutableStateOf(listOf<Long>()) }
    val c = cores
    val tocar = Modifier.pointerInput(anima) {
        detectTapGestures {
            val agora = System.nanoTime() / 1_000_000
            toques = (toques + agora).filter { agora - it < 1800 }
            vibra.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
            truque = if (toques.size >= 4) "bravo" else REACOES.filter { it != truque }.random()
            truqueDesde = agora
            // a voz do pato para cada reacao (se os sons dos patinhos estiverem ligados)
            io.github.duckv.app.Sons.pato(truque ?: "quaa")
        }
    }
    // a reacao ao toque some sozinha no fim
    LaunchedEffect(truqueDesde) {
        val tr = truque ?: return@LaunchedEffect
        if (tr in REACOES || tr == "bravo") {
            delay(DURACAO[tr] ?: 900)
            if (truque == tr) truque = null
        }
    }
    Canvas(modifier.then(if (tocavel) tocar else Modifier)) {
        val dt = System.nanoTime() / 1_000_000 - truqueDesde
        desenhar(estado, if (anima) t else 0L, truque, dt, andar && anima, cor, c, tipoPato(tipo), repouso)
    }
}

private fun DrawScope.desenhar(estado: String, t: Long, truque: String?, dt: Long, andar: Boolean, cor: Color, c: Cores, tp: TipoPato, repouso: Float = 0.5f) {
    val u = size.height / 19.5f
    val largura = 16 * u
    val anda = andar && (estado == "trabalha" || estado == "festa")
    val sentado = estado == "dorme" || estado == "cansado"
    val passo = (t / 220) % 2 == 0L

    // posicao na pista
    var x: Float
    var paraDireita = true
    val livre = (size.width - largura - u * 2).coerceAtLeast(0f)
    if (anda) {
        val periodo = if (estado == "festa") 3400L else 10000L
        val fase = (t % periodo) / periodo.toFloat()
        val ida = fase < 0.5f
        x = u + livre * (if (ida) fase * 2 else 2 - fase * 2)
        paraDireita = ida
    } else x = u + livre * repouso
    if (truque == "olha") paraDireita = !paraDireita
    // meia-volta no ar durante o salto
    if (truque == "salto" && dt in 300..650) paraDireita = !paraDireita

    // altura: pulo, ginga e sentar
    var pulo = 0f
    when {
        truque == "salto" -> pulo = sin(dt / 900.0 * PI).toFloat().coerceAtLeast(0f) * 5f
        truque == "amor" -> pulo = abs(sin(dt / 400.0 * PI)).toFloat() * 0.8f
        estado == "festa" -> pulo = abs(sin(t / 300.0 * PI)).toFloat() * 2.5f
        estado == "pede" -> pulo = abs(sin(t / 400.0 * PI)).toFloat() * 2f
        truque == "pulinho" -> pulo = abs(sin(dt / 240.0 * PI)).toFloat() * 1.2f
    }
    // parado, o pato respira: o corpo sobe e desce de leve
    val respira = if (!anda && !sentado && truque == null && (t / 900) % 2 == 0L) 0.25f else 0f
    val ginga = (if (anda && passo) -0.5f else 0f) - respira
    val chao = size.height - u * 0.8f
    val topo = chao - 13 * u + (if (sentado) 2 * u else 0f) - (pulo + ginga) * u

    // sombra em pixels, na cor da conta: o pato pisa no proprio chao
    val encolhe = (pulo / 3f).coerceIn(0f, 0.5f)
    val sw = (10 - 4 * encolhe) * u
    val sx = x + (largura - sw) / 2 + (if (paraDireita) -u else u)
    drawRect(cor.copy(alpha = 0.32f), Offset(sx + u, chao + 0.15f * u), Size(sw - 2 * u, 0.6f * u))
    drawRect(cor.copy(alpha = 0.18f), Offset(sx, chao + 0.15f * u), Size(sw, 0.6f * u))

    // movimentos das partes
    val asaSobe = when {
        truque == "danca" || truque == "salto" -> (dt / 90) % 2 == 0L
        truque == "bravo" -> (dt / 50) % 2 == 0L
        estado == "festa" -> (t / 70) % 2 == 0L
        estado == "pede" -> (t / 100) % 2 == 0L
        truque == "bate" -> (dt / 65) % 2 == 0L
        else -> false
    }
    val bicoAbre = when {
        estado == "pede" -> (t / 200) % 2 == 0L
        truque == "grasna" || truque == "quaa" -> (dt / 110) % 2 == 0L
        truque == "amor" -> dt < 300
        truque == "bravo" -> (dt / 80) % 2 == 0L
        else -> false
    }
    val rabo = if (truque == "rabo") (if ((dt / 65) % 2 == 0L) 0.4f else -0.4f) else 0f
    val cisca = if (truque == "cisca") sin(dt / 650.0 * PI).toFloat().coerceAtLeast(0f) * 1.6f else 0f
    val olhoFechado = sentado && truque != "espia" || truque == "pisca"
    val pisa = anda || estado == "festa"

    val cansado = estado == "cansado"
    // contorno claro no tema escuro, para o pato nao sumir no fundo
    val contorno = tp.contorno?.let { if (c.escuro) Color(0xFFA08A7A) else it } ?: if (c.escuro) Color(0xFFA08A7A) else Tinta
    val penas = if (cansado) Cansado else tp.penas
    val asa = if (cansado) AsaCansada else tp.asa
    val bico = if (cansado) BicoCansado else tp.bico
    val cabeca = if (cansado) Cansado else tp.cabeca ?: penas
    val pes = tp.pes

    fun px(cx: Float) = if (paraDireita) x + cx * u else x + (16 - cx - 1) * u
    fun cel(cx: Float, cy: Float, cor: Color, w: Float = 1f, h: Float = 1f) {
        val lx = if (paraDireita) x + cx * u else x + (16 - cx - w) * u
        drawRect(cor, Offset(lx, topo + cy * u), Size(w * u + 0.6f, h * u + 0.6f))
    }

    val giro = when {
        cansado -> -8f
        truque == "danca" -> sin(dt / 350.0 * PI).toFloat() * 12f
        truque == "bravo" -> sin(dt / 60.0 * PI).toFloat() * 4f
        else -> 0f
    }
    rotate(giro, Offset(x + largura / 2, chao)) {
        for ((cx, cy, ch) in CELULAS) {
            var dx = 0f
            var dy = 0f
            val cor = when (ch) {
                'O', 'o', 'T' -> contorno
                'B' -> if (cy < 4) cabeca else penas
                'b', 't' -> penas
                'w' -> asa
                'k' -> bico
                'q' -> Tinta
                'e' -> if (olhoFechado) penas else Tinta
                else -> pes // f, g
            }
            when (ch) {
                'O', 'B', 'e', 'k' -> { dx = cisca * 0.4f; dy = cisca }
                'q' -> { dx = cisca * 0.4f; dy = cisca + if (bicoAbre) 0.6f else 0f }
                'w' -> dy = if (asaSobe) -0.7f else 0f
                'T', 't' -> dx = rabo
                'f' -> { if (sentado) continue; dy = if (pisa && passo) -0.5f else 0f }
                'g' -> { if (sentado) continue; dy = if (pisa && !passo) -0.5f else 0f }
            }
            cel(cx + dx, cy + dy, cor)
        }
        if (olhoFechado) cel(10f + cisca * 0.4f, 2.6f + cisca, Tinta, 2f, 0.45f)
        if (bicoAbre) for ((sx2, sy) in SOM) cel(sx2, sy + cisca, c.texto)
        // bravo: sobrancelha franzida em cima do olho
        if (truque == "bravo") { cel(9f, 1.4f, Tinta, 1f, 0.5f); cel(10f, 1.7f, Tinta, 1f, 0.5f) }
    }

    // coracoes sobem da cabeca e somem
    if (truque == "amor") {
        for (n in 0..2) {
            val f = ((dt - n * 280) / 1100f).coerceIn(0f, 1f)
            if (f <= 0f || f >= 1f) continue
            val hx = 11f + n * 1.6f - 1.5f
            val hy = -1.5f - f * 6f
            for ((yy, linha) in CORACAO.withIndex()) for ((xx, ch) in linha.withIndex()) {
                if (ch == '.') continue
                val lx = px(hx + xx * 0.42f)
                drawRect(Coracao.copy(alpha = 1f - f), Offset(lx, topo + (hy + yy * 0.42f) * u), Size(u * 0.42f + 0.6f, u * 0.42f + 0.6f))
            }
        }
    }
    // grasnado forte: tres ondas saindo do bico
    if (truque == "quaa") {
        val f = (dt % 500) / 500f
        for (n in 0..2) {
            val d = (n + f) * 1.4f
            cel(17f + d, 1.5f - d * 0.6f, c.texto.copy(alpha = (1f - (n + f) / 3f).coerceIn(0f, 1f)), 0.6f, 0.6f)
            cel(17f + d, 3.5f + d * 0.6f, c.texto.copy(alpha = (1f - (n + f) / 3f).coerceIn(0f, 1f)), 0.6f, 0.6f)
        }
    }
    if (truque == "bravo" && (dt / 160) % 2 == 0L) for ((ex, ey) in EXCLAMA) { cel(ex - 1.3f, ey, Coracao); cel(ex + 0.3f, ey, Coracao) }

    if (estado == "pede" && (t / 400) % 2 == 0L) for ((ex, ey) in EXCLAMA) cel(ex, ey, Laranja)
    if (estado == "dorme") {
        val fase = (t % 2600) / 2600f
        val a = (1f - fase).coerceIn(0f, 1f)
        for ((zx, zy) in SONO) {
            val lx = px(zx.toFloat()) + fase * u
            drawRect(c.apoio.copy(alpha = a), Offset(lx, topo + (zy - fase * 2.5f) * u), Size(u * 0.8f + 0.6f, u * 0.8f + 0.6f))
        }
    }
}
