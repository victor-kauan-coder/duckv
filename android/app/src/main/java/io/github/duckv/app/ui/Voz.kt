package io.github.duckv.app.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** Fim que marca a mensagem como ditada: o agente sabe que pode haver erro de transcricao, e a bolha mostra o selo de voz. */
const val MARCA_VOZ = "\n\n(mensagem de voz, transcrita no celular)"

fun ehVoz(t: String) = t.trimEnd().endsWith(MARCA_VOZ.trim())
fun semMarcaVoz(t: String) = if (ehVoz(t)) t.trimEnd().removeSuffix(MARCA_VOZ.trim()).trimEnd() else t

/**
 * Ditado continuo com o reconhecedor de fala do Android, em portugues.
 * O reconhecedor para sozinho a cada pausa; enquanto voce nao toca em parar, ele recomeca e o texto vai se somando.
 * O nivel do microfone alimenta a onda na tela.
 */
/** [aoSobrar] recebe o que ja tinha sido entendido quando um erro interrompe a gravacao, para nao se perder. */
class Ditado(private val ctx: Context, private val aoErro: (String) -> Unit, private val aoSobrar: (String) -> Unit) {
    var gravando by mutableStateOf(false)
        private set
    var fechando by mutableStateOf(false)
        private set
    var texto by mutableStateOf("")
        private set
    var parcial by mutableStateOf("")
        private set
    val niveis = mutableStateListOf<Float>()
    var inicio = 0L
        private set

    private var rec: SpeechRecognizer? = null
    private var aoFim: ((String) -> Unit)? = null
    private var ultimoNivel = 0L
    private val main = Handler(Looper.getMainLooper())

    val ativo get() = gravando || fechando
    val completo get() = listOf(texto, parcial).filter { it.isNotBlank() }.joinToString(" ").trim()

    fun iniciar() {
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
            aoErro("Este celular não tem reconhecimento de voz. Instale ou ative o app Google e tente de novo.")
            return
        }
        texto = ""
        parcial = ""
        falhas = 0
        niveis.clear()
        inicio = SystemClock.elapsedRealtime()
        gravando = true
        fechando = false
        ouvir()
    }

    /** Para de ouvir e entrega o texto final (espera o reconhecedor fechar a ultima frase, no maximo 2 s). */
    fun parar(entregar: (String) -> Unit) {
        if (!gravando) return
        gravando = false
        fechando = true
        aoFim = entregar
        runCatching { rec?.stopListening() }
        main.postDelayed({ finalizar() }, 2000)
    }

    fun cancelar() {
        gravando = false
        fechando = false
        aoFim = null
        main.removeCallbacksAndMessages(null)
        runCatching { rec?.cancel(); rec?.destroy() }
        rec = null
        texto = ""
        parcial = ""
        niveis.clear()
    }

    // Erros passageiros seguidos (servico ocupado, rede piscando). Zera a cada palavra entendida.
    private var falhas = 0

    private val pedido by lazy {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
        }
    }

    // O mesmo reconhecedor serve a gravacao inteira; recriar a cada pausa faz o servico do Google responder "ocupado".
    private fun ouvir() {
        val r = rec ?: SpeechRecognizer.createSpeechRecognizer(ctx).also {
            it.setRecognitionListener(ouvinte)
            rec = it
        }
        runCatching { r.startListening(pedido) }.onFailure { falhou(SpeechRecognizer.ERROR_CLIENT) }
    }

    /** Volta a ouvir depois de uma pausa ou de um erro passageiro; [novo] troca o reconhecedor por um limpo. */
    private fun recomecar(espera: Long = 250, novo: Boolean = false) {
        if (!gravando) return finalizar()
        main.postDelayed({
            if (!gravando) return@postDelayed
            if (novo) {
                runCatching { rec?.destroy() }
                rec = null
            } else runCatching { rec?.cancel() }
            ouvir()
        }, espera)
    }

    private fun falhou(error: Int) {
        if (!gravando) return finalizar()
        val fatal = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS || error == 12 || error == 13 // sem permissao, idioma sem suporte, idioma indisponivel
        if (!fatal && ++falhas <= 5) return recomecar(espera = 300L * falhas, novo = falhas >= 2)
        val msg = when (error) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "O duckV não tem acesso ao microfone. Libere em Configurações > Apps > duckV > Permissões."
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER, 11 ->
                "O reconhecimento de voz perdeu a internet. O que eu já tinha entendido está no campo."
            SpeechRecognizer.ERROR_AUDIO -> "O microfone parou de responder. Feche outro app que esteja usando ele e tente de novo."
            12, 13 -> "O reconhecimento de voz deste celular não tem português instalado."
            else -> "O reconhecimento de voz parou. O que eu já tinha entendido está no campo."
        }
        val tinha = completo
        cancelar()
        // o que ja foi entendido nao se perde: vai para o campo, para revisar antes de mandar
        if (tinha.isNotEmpty()) aoSobrar(tinha)
        aoErro(msg)
    }

    private fun primeiro(b: Bundle?) = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()

    private fun finalizar() {
        main.removeCallbacksAndMessages(null)
        val cb = aoFim ?: return
        aoFim = null
        val t = completo
        runCatching { rec?.destroy() }
        rec = null
        fechando = false
        cb(t)
    }

    private val ouvinte = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onRmsChanged(rmsdB: Float) {
            val agora = SystemClock.elapsedRealtime()
            if (agora - ultimoNivel < 70) return
            ultimoNivel = agora
            niveis.add(((rmsdB + 2f) / 12f).coerceIn(0.04f, 1f))
            while (niveis.size > 64) niveis.removeAt(0)
        }

        override fun onPartialResults(partialResults: Bundle?) {
            primeiro(partialResults).takeIf { it.isNotEmpty() }?.let {
                parcial = it
                falhas = 0
            }
        }

        override fun onResults(results: Bundle?) {
            val t = primeiro(results).ifEmpty { parcial }
            if (t.isNotEmpty()) {
                texto = listOf(texto, t).filter { it.isNotBlank() }.joinToString(" ")
                falhas = 0
            }
            parcial = ""
            if (gravando) recomecar() else finalizar()
        }

        override fun onError(error: Int) {
            when (error) {
                // pausa longa ou nada entendido: continua ouvindo enquanto voce nao parar
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                    // o trecho em analise vira texto firme antes de recomecar
                    if (parcial.isNotBlank()) {
                        texto = listOf(texto, parcial).filter { it.isNotBlank() }.joinToString(" ")
                        parcial = ""
                    }
                    if (gravando) recomecar() else finalizar()
                }
                else -> falhou(error)
            }
        }
    }
}

/** Duracao da gravacao, em m:ss. */
@Composable
private fun cronometro(inicio: Long, ativo: Boolean): String {
    val ms by produceState(0L, inicio, ativo) {
        while (ativo) {
            value = SystemClock.elapsedRealtime() - inicio
            delay(250)
        }
    }
    val s = ms / 1000
    return "%d:%02d".format(s / 60, s % 60)
}

/** A onda do microfone: barras finas que entram pela direita, como o nivel da sua voz. */
@Composable
fun Onda(niveis: List<Float>, cor: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val barra = 3.dp.toPx()
        val vao = 2.5.dp.toPx()
        val cabe = ((size.width + vao) / (barra + vao)).toInt().coerceAtLeast(1)
        val ultimos = niveis.takeLast(cabe)
        val sobra = cabe - ultimos.size
        val minimo = 3.dp.toPx()
        for (i in 0 until cabe) {
            val n = if (i < sobra) 0f else ultimos[i - sobra]
            val h = (minimo + (size.height - minimo) * n)
            val x = i * (barra + vao)
            drawRoundRect(
                if (i < sobra) cor.copy(alpha = 0.25f) else cor,
                Offset(x, (size.height - h) / 2), Size(barra, h), CornerRadius(barra / 2, barra / 2),
            )
        }
    }
}

/** O que ja foi entendido: firme em Tinta, o trecho ainda em analise em Tinta Variante. */
@Composable
fun Transcricao(d: Ditado) {
    val c = cores
    Text(
        buildAnnotatedString {
            if (d.texto.isBlank() && d.parcial.isBlank()) {
                withStyle(SpanStyle(color = c.apoio)) { append(if (d.fechando) "Fechando a última frase…" else "Pode falar. O que eu entender aparece aqui.") }
            } else {
                withStyle(SpanStyle(color = c.texto)) { append(d.texto) }
                if (d.parcial.isNotBlank()) withStyle(SpanStyle(color = c.apoio)) { append(if (d.texto.isBlank()) d.parcial else " ${d.parcial}") }
            }
        },
        style = Texto.corpo, maxLines = 5,
        modifier = Modifier.fillMaxWidth().heightIn(min = 24.dp).padding(start = 16.dp, end = 12.dp, top = 10.dp, bottom = 8.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/**
 * O compositor enquanto voce fala: descartar a esquerda, a faixa com o ponto vermelho, o tempo e a onda,
 * e a direita "revisar" (o texto vai para o campo) e enviar direto. O texto entendido aparece em cima, ao vivo.
 */
@Composable
fun Gravando(d: Ditado, aoDescartar: () -> Unit, aoRevisar: () -> Unit, aoEnviar: () -> Unit) {
    val c = cores
    val tempo = cronometro(d.inicio, d.gravando)
    val pulso = rememberInfiniteTransition(label = "gravando")
    val brilho by pulso.animateFloat(1f, 0.35f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "ponto")
    Column(Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, bottom = 8.dp)) {
        Transcricao(d)
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(aoDescartar) { Icon(Icons.Rounded.DeleteOutline, "Descartar áudio", tint = c.perigo) }
            Row(
                Modifier.weight(1f).height(52.dp).clip(RoundedCornerShape(28.dp)).background(c.elevada).padding(start = 16.dp, end = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(10.dp).alpha(if (d.gravando) brilho else 0.35f).clip(CircleShape).background(c.perigo))
                Text(
                    tempo, style = Texto.rotulo.copy(fontFeatureSettings = "tnum"), color = c.texto,
                    modifier = Modifier.padding(start = 10.dp).semantics { contentDescription = "Gravando há $tempo" },
                )
                Onda(d.niveis, c.texto, Modifier.weight(1f).height(26.dp).padding(start = 14.dp))
            }
            IconButton(aoRevisar, enabled = d.gravando) { Icon(Icons.Rounded.EditNote, "Parar e revisar o texto", tint = c.apoio) }
            Box(
                Modifier.size(48.dp).clip(CircleShape).background(c.primario).clickable(enabled = d.gravando, role = Role.Button, onClick = aoEnviar),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.Send, "Enviar áudio", tint = c.noPrimario, modifier = Modifier.size(22.dp)) }
        }
    }
}

/** Como o dedo saiu do microfone: soltou (envia), arrastou para a esquerda (descarta), para cima (trava) ou so tocou. */
enum class Gesto { Soltou, Cancelou, Travou, Toque }

/**
 * O botao redondo do compositor quando o campo esta vazio: o microfone, como no WhatsApp.
 * Segure para gravar e solte para enviar; arraste para a esquerda para descartar ou para cima para travar e falar sem segurar.
 */
@Composable
fun BotaoMicrofone(aoApertar: () -> Unit, aoSoltar: (Gesto) -> Unit, modifier: Modifier = Modifier) {
    val c = cores
    val apertar by rememberUpdatedState(aoApertar)
    val soltar by rememberUpdatedState(aoSoltar)
    var preso by remember { mutableStateOf(false) }
    var arrasto by remember { mutableStateOf(0f) }
    val escala by animateFloatAsState(if (preso) 1.5f else 1f, label = "mic")
    val (limiteCancelar, limiteTravar) = with(LocalDensity.current) { 110.dp.toPx() to 80.dp.toPx() }
    Box(
        modifier.size(48.dp)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    preso = true
                    arrasto = 0f
                    apertar()
                    var fim: Gesto? = null
                    try {
                        while (fim == null) {
                            val p = awaitPointerEvent().changes.firstOrNull { it.id == down.id }
                            if (p == null) fim = Gesto.Cancelou
                            else if (!p.pressed) fim = if (p.uptimeMillis - down.uptimeMillis < 400) Gesto.Toque else Gesto.Soltou
                            else {
                                p.consume()
                                val d = p.position - down.position
                                arrasto = d.x.coerceIn(-limiteCancelar, 0f)
                                fim = when {
                                    d.x < -limiteCancelar -> Gesto.Cancelou
                                    d.y < -limiteTravar -> Gesto.Travou
                                    else -> null
                                }
                            }
                        }
                    } finally {
                        preso = false
                        arrasto = 0f
                        // saiu da tela no meio do gesto: descarta
                        soltar(fim ?: Gesto.Cancelou)
                    }
                }
            }
            // leitor de tela: um toque abre a gravacao travada, sem precisar segurar
            .semantics {
                role = Role.Button
                contentDescription = "Gravar mensagem de voz. Segure para gravar e solte para enviar."
                onClick("Gravar sem segurar") { apertar(); soltar(Gesto.Travou); true }
            }
            .graphicsLayer { translationX = arrasto; scaleX = escala; scaleY = escala }
            .clip(CircleShape).background(if (preso) c.primario else c.elevada),
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Rounded.Mic, null, tint = if (preso) c.noPrimario else c.texto, modifier = Modifier.size(24.dp)) }
}

/** No lugar do campo enquanto voce segura o microfone: ponto vermelho, tempo, onda e a dica dos gestos. */
@Composable
fun FaixaSegurando(d: Ditado, modifier: Modifier = Modifier) {
    val c = cores
    val tempo = cronometro(d.inicio, d.gravando)
    val pulso = rememberInfiniteTransition(label = "segurando")
    val brilho by pulso.animateFloat(1f, 0.35f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "ponto")
    Row(
        modifier.height(52.dp).clip(RoundedCornerShape(28.dp)).background(c.elevada).padding(start = 16.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).alpha(brilho).clip(CircleShape).background(c.perigo))
        Text(
            tempo, style = Texto.rotulo.copy(fontFeatureSettings = "tnum"), color = c.texto,
            modifier = Modifier.padding(start = 10.dp).semantics { contentDescription = "Gravando há $tempo" },
        )
        Onda(d.niveis, c.texto, Modifier.weight(1f).height(26.dp).padding(start = 12.dp, end = 12.dp))
        Text("‹ cancela  ↑ trava", style = Texto.pequeno, color = c.apoio, maxLines = 1)
    }
}

/** Cabecalho da bolha de uma mensagem ditada. */
@Composable
fun SeloVoz(cor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 4.dp)) {
        Icon(Icons.Rounded.Mic, null, tint = cor, modifier = Modifier.size(16.dp))
        Text("Mensagem de voz", style = Texto.pequeno, color = cor)
    }
}
