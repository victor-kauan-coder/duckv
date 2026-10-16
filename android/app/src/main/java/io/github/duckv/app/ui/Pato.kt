package io.github.duckv.app.ui

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.layout.onSizeChanged
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
    // gracinhas do roteiro
    "bica" to 1500L, "gira" to 700L, "alonga" to 1500L,
)

// ------------------------------------------------------------ o roteiro
// O pato que mora numa pista larga (caixa de mensagem, cartao da conta) nao fica so indo e voltando:
// ele escolhe o que fazer conforme o estado. Trabalhando, caminha ate um ponto, para, bica como quem
// digita, olha em volta, bate as asas; esperando, quase nao sai do lugar e faz uma gracinha de vez em
// quando; pedindo, corre para perto do botao de enviar e pula; dormindo, senta e cochila. Trocar de
// estado interrompe o passo, e ele segue de onde parou, sem saltos. (O mesmo roteiro do computador.)
private val ROTEIROS = mapOf(
    "trabalha" to listOf("anda" to 34, "bica" to 18, "olha" to 12, "bate" to 8, "pulinho" to 8, "grasna" to 7, "pisca" to 7, "gira" to 4, "alonga" to 2),
    "festa" to listOf("corre" to 50, "pulinho" to 20, "bate" to 15, "gira" to 15),
    "parado" to listOf("respira" to 14, "pisca" to 14, "olha" to 14, "rabo" to 10, "passeio" to 16, "alonga" to 10, "senta" to 8, "cisca" to 8, "grasna" to 6),
    "pede" to listOf("chama" to 70, "bate" to 20, "olha" to 10),
    "dorme" to listOf("cochila" to 80, "espia" to 20),
    "cansado" to listOf("cochila" to 100),
)
private fun sortear(opcoes: List<Pair<String, Int>>): String {
    var r = Random.nextInt(opcoes.sumOf { it.second })
    for ((o, peso) in opcoes) { r -= peso; if (r < 0) return o }
    return opcoes.first().first
}
private fun entre(a: Float, b: Float) = a + Random.nextFloat() * (b - a)
private fun entre(a: Long, b: Long) = a + Random.nextLong(b - a)
private val Passada = androidx.compose.animation.core.CubicBezierEasing(0.45f, 0.05f, 0.4f, 1f)

/** Onde o pato esta na pista (0 a 1), para que lado olha, se anda ou corre e se esta sentado. */
private class Roteiro {
    val x = androidx.compose.animation.core.Animatable(-1f)
    var direita by mutableStateOf(true)
    var anda by mutableStateOf<String?>(null)
    var senta by mutableStateOf(false)
}
private data class Pose(val x: Float, val direita: Boolean, val anda: String?, val senta: Boolean)
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
    // pista larga: o roteiro decide; pato pequeno e parado: so as gracinhas de sempre
    val rot = remember { Roteiro() }
    var livrePx by remember { mutableFloatStateOf(0f) }
    val densidade = androidx.compose.ui.platform.LocalDensity.current.density
    val usaRoteiro = andar && anima
    LaunchedEffect(estado, usaRoteiro, modo) {
        truque = null
        rot.anda = null
        rot.senta = false
        if (!usaRoteiro) return@LaunchedEffect
        while (livrePx <= 0f) delay(200)
        if (rot.x.value < 0f) rot.x.snapTo(if (repouso <= 0f) entre(0.05f, 0.3f) else repouso)
        suspend fun fazer(nome: String, ms: Long = DURACAO[nome] ?: 900L) {
            truque = nome
            truqueDesde = System.nanoTime() / 1_000_000
            delay(ms)
            if (truque == nome) truque = null
        }
        suspend fun andarAte(destino: Float, dpPorSegundo: Float) {
            val d = destino.coerceIn(0f, 1f)
            val dist = kotlin.math.abs(d - rot.x.value) * livrePx
            if (dist < 4f) return
            rot.direita = d > rot.x.value
            rot.anda = if (dpPorSegundo > 90f) "corre" else "sim"
            try {
                rot.x.animateTo(d, androidx.compose.animation.core.tween((dist / (dpPorSegundo * densidade) * 1000).toInt().coerceAtLeast(120), easing = Passada))
            } finally {
                rot.anda = null
            }
        }
        while (true) {
            val acao = sortear(ROTEIROS[estado] ?: ROTEIROS.getValue("parado"))
            // "Sem gracinhas": so anda quando trabalha
            if (modo != "animado" && acao !in setOf("anda", "corre", "chama", "cochila", "respira")) {
                delay(1500)
                continue
            }
            val x = rot.x.value
            when (acao) {
                "anda" -> {
                    // um trecho de um quarto a dois tercos da pista, sem ir sempre para o mesmo lado
                    var alvo = x + (if (Random.nextBoolean()) -1 else 1) * entre(0.25f, 0.65f)
                    if (alvo !in 0f..1f) alvo = x - (alvo - x)
                    andarAte(alvo, entre(45f, 80f))
                    delay(entre(200L, 700L))
                }
                "corre" -> {
                    andarAte(if (x < 0.5f) entre(0.7f, 1f) else entre(0f, 0.3f), entre(120f, 170f))
                    fazer("pulinho")
                }
                "passeio" -> {
                    andarAte(x + (if (Random.nextBoolean()) -1 else 1) * entre(24f, 70f) * densidade / livrePx.coerceAtLeast(1f), entre(25f, 38f))
                    delay(entre(800L, 1800L))
                }
                "chama" -> {
                    // perto do botao de enviar (a direita) e virado para a pessoa
                    if (x < 0.75f) andarAte(entre(0.8f, 1f), 110f)
                    rot.direita = false
                    delay(entre(1400L, 2600L))
                }
                "senta" -> {
                    rot.senta = true
                    delay(entre(3000L, 6000L))
                    rot.senta = false
                    fazer("alonga")
                }
                "respira" -> delay(entre(1200L, 2400L))
                "cochila" -> delay(entre(4000L, 8000L))
                "olha" -> {
                    fazer("olha", 700)
                    rot.direita = !rot.direita
                    delay(entre(500L, 1100L))
                }
                else -> fazer(acao)
            }
            delay(entre(250L, 900L))
        }
    }
    LaunchedEffect(estado, anima, modo, usaRoteiro) {
        if (usaRoteiro) return@LaunchedEffect
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
    val medir = Modifier.onSizeChanged { val u = it.height / 19.5f; livrePx = (it.width - 18 * u).coerceAtLeast(0f) }
    Canvas(modifier.then(medir).then(if (tocavel) tocar else Modifier)) {
        val dt = System.nanoTime() / 1_000_000 - truqueDesde
        val pose = if (usaRoteiro && rot.x.value >= 0f) Pose(rot.x.value, rot.direita, rot.anda, rot.senta) else null
        desenhar(estado, if (anima) t else 0L, truque, dt, andar && anima, cor, c, tipoPato(tipo), repouso, pose)
    }
}

private fun DrawScope.desenhar(estado: String, t: Long, truque: String?, dt: Long, andar: Boolean, cor: Color, c: Cores, tp: TipoPato, repouso: Float = 0.5f, pose: Pose? = null) {
    val u = size.height / 19.5f
    val largura = 16 * u
    val anda = if (pose != null) pose.anda != null else andar && (estado == "trabalha" || estado == "festa")
    val dormindo = estado == "dorme" || estado == "cansado"
    val sentado = dormindo || pose?.senta == true
    val passo = (t / (if (pose?.anda == "corre") 110 else 220)) % 2 == 0L

    // posicao na pista
    var x: Float
    var paraDireita = true
    val livre = (size.width - largura - u * 2).coerceAtLeast(0f)
    if (pose != null) {
        x = u + livre * pose.x
        paraDireita = pose.direita
    } else if (anda) {
        val periodo = if (estado == "festa") 3400L else 10000L
        val fase = (t % periodo) / periodo.toFloat()
        val ida = fase < 0.5f
        x = u + livre * (if (ida) fase * 2 else 2 - fase * 2)
        paraDireita = ida
    } else x = u + livre * repouso
    if (truque == "olha") paraDireita = !paraDireita
    // giro: vira de um lado para o outro duas vezes
    if (truque == "gira" && (dt / 175) % 2 == 1L) paraDireita = !paraDireita
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
        truque == "alonga" -> (dt / 90) % 2 == 0L
        pose?.anda == "corre" -> (t / 60) % 2 == 0L
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
    val cisca = when (truque) {
        "cisca" -> sin(dt / 650.0 * PI).toFloat().coerceAtLeast(0f) * 1.6f
        "bica" -> abs(sin(dt / 170.0 * PI)).toFloat() * 1.1f // bicadas rapidas, como quem digita
        else -> 0f
    }
    // cabeca: estica no alongamento; balanca devagar cochilando
    val pescoco = when {
        truque == "alonga" -> -sin(dt / 1500.0 * PI).toFloat() * 1.1f
        estado == "dorme" && pose != null -> sin(t / 1600.0 * PI).toFloat() * 0.35f
        else -> 0f
    }
    val olhoFechado = dormindo && truque != "espia" || truque == "pisca"
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
                'O', 'B', 'e', 'k' -> { dx = cisca * 0.4f; dy = cisca + pescoco }
                'q' -> { dx = cisca * 0.4f; dy = cisca + pescoco + if (bicoAbre) 0.6f else 0f }
                'w' -> dy = if (asaSobe) -0.7f else 0f
                'T', 't' -> dx = rabo
                'f' -> { if (sentado) continue; dy = if (pisa && passo) -0.5f else 0f }
                'g' -> { if (sentado) continue; dy = if (pisa && !passo) -0.5f else 0f }
            }
            cel(cx + dx, cy + dy, cor)
        }
        if (olhoFechado) cel(10f + cisca * 0.4f, 2.6f + cisca + pescoco, Tinta, 2f, 0.45f)
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
