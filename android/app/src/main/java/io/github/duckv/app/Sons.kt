package io.github.duckv.app

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Sonzinhos do app, sintetizados aqui mesmo (nada de arquivos de audio no APK):
 * um "tic" para os botoes e a voz dos patinhos (qua, piu e o qua bravo).
 * Cada grupo pode ser silenciado nas Opcoes.
 */
object Sons {
    private const val TAXA = 44100
    private var pool: SoundPool? = null
    private val ids = java.util.concurrent.ConcurrentHashMap<String, Int>()

    fun iniciar(ctx: Context) {
        if (pool != null) return
        val p = SoundPool.Builder().setMaxStreams(4)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .build()
        pool = p
        // gera os arquivos uma vez (fora da thread principal) e carrega no SoundPool
        thread(name = "sons") {
            val pasta = File(ctx.cacheDir, "sons").apply { mkdirs() }
            for ((nome, gerar) in listOf("tic" to ::tic, "qua" to ::qua, "piu" to ::piu)) {
                val f = File(pasta, "$nome-v1.wav")
                if (!f.exists()) f.writeBytes(wav(gerar()))
                ids[nome] = p.load(f.path, 1)
            }
        }
    }

    private fun tocar(nome: String, volume: Float, tom: Float = 1f) {
        val id = ids[nome] ?: return
        pool?.play(id, volume, volume, 1, 0, tom.coerceIn(0.5f, 2f))
    }

    /** Toque em botao. */
    fun clique() {
        if (Hub.opcoes.value.somBotoes) tocar("tic", 0.35f, 0.95f + Math.random().toFloat() * 0.1f)
    }

    /** A voz do pato para cada reacao ao toque. */
    fun pato(reacao: String) {
        if (!Hub.opcoes.value.somPato) return
        when (reacao) {
            "amor" -> tocar("piu", 0.5f, 1.0f)
            "salto" -> tocar("piu", 0.5f, 1.35f)
            "danca" -> tocar("qua", 0.55f, 1.18f)
            "bravo" -> tocar("qua", 0.7f, 0.78f)
            else -> tocar("qua", 0.55f, 1.0f)
        }
    }

    // ------------------------------------------------------------ sintese

    /** Tic curtinho: um seno agudo que some em poucos milissegundos. */
    private fun tic(): FloatArray {
        val n = TAXA * 35 / 1000
        return FloatArray(n) { i ->
            val t = i.toFloat() / TAXA
            (sin(2 * PI * 1500 * t) * exp(-t / 0.006) * 0.6).toFloat()
        }
    }

    /** Qua: onda dente de serra com o tom caindo, um vibrato leve e um filtro para ficar fofo. */
    private fun qua(): FloatArray {
        val n = TAXA * 190 / 1000
        val out = FloatArray(n)
        var fase = 0.0
        var filtro = 0f
        for (i in 0 until n) {
            val t = i.toDouble() / TAXA
            val f = 340 - 90 * (t / 0.19) + 12 * sin(2 * PI * 28 * t)
            fase += f / TAXA
            val serra = (2 * (fase - Math.floor(fase + 0.5))).toFloat()
            val quadrada = if ((fase % 1.0) < 0.5) 0.6f else -0.6f
            val bruto = serra * 0.7f + quadrada * 0.3f
            filtro += 0.32f * (bruto - filtro)
            val env = (minOf(1.0, t / 0.012) * exp(-maxOf(0.0, t - 0.05) / 0.06)).toFloat()
            out[i] = filtro * env * 0.75f
        }
        return out
    }

    /** Piu: assobio subindo, para carinho e pulinho. */
    private fun piu(): FloatArray {
        val n = TAXA * 120 / 1000
        var fase = 0.0
        return FloatArray(n) { i ->
            val t = i.toDouble() / TAXA
            fase += (700 + 700 * (t / 0.12)) / TAXA
            val env = minOf(1.0, t / 0.01) * exp(-maxOf(0.0, t - 0.04) / 0.035)
            (sin(2 * PI * fase) * env * 0.5).toFloat()
        }
    }

    /** WAV 16 bits mono. */
    private fun wav(s: FloatArray): ByteArray {
        val dados = s.size * 2
        val b = ByteBuffer.allocate(44 + dados).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()).putInt(36 + dados).put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(TAXA).putInt(TAXA * 2).putShort(2).putShort(16)
        b.put("data".toByteArray()).putInt(dados)
        for (v in s) b.putShort((v.coerceIn(-1f, 1f) * 32767).toInt().toShort())
        return b.array()
    }
}
