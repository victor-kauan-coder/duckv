package io.github.duckv.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * Atualizacao do app sem passar pelo GitHub: o computador baixa a versao nova das Releases
 * (o repositorio e privado) e o celular a pega dele, confere o SHA-256 e chama o instalador.
 * O Android so aceita por cima um APK assinado com a mesma chave.
 */
object Atualizacao {
    sealed interface Etapa {
        data object Parada : Etapa
        data class Baixando(val feito: Long, val total: Long) : Etapa
        data object Conferindo : Etapa
        data class Pronta(val arquivo: File) : Etapa
        data class Erro(val msg: String) : Etapa
    }

    val etapa = MutableStateFlow<Etapa>(Etapa.Parada)
    /** A folha da atualizacao aberta (fica na raiz do app: abre do inicio, das opcoes e da notificacao). */
    val folha = MutableStateFlow(false)
    @Volatile private var cancelar = false
    private val principal = Handler(Looper.getMainLooper())

    fun instalada(ctx: Context): String =
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "0"

    /** "2.10.0" e mais nova que "2.9.3": compara numero a numero. */
    fun maisNova(a: String, b: String): Boolean {
        val x = a.split('.').map { it.toIntOrNull() ?: 0 }
        val y = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }
            if (d != 0) return d > 0
        }
        return false
    }

    /** A versao do computador, se for mais nova que a instalada. */
    fun disponivel(ctx: Context, e: Estado?): VersaoApp? = e?.app?.takeIf { maisNova(it.versao, instalada(ctx)) }

    // "Depois" no cartao do inicio: some ate sair uma versao mais nova que essa.
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("claudev", Context.MODE_PRIVATE)
    fun adiada(ctx: Context, v: VersaoApp) = prefs(ctx).getString("atualizacaoDepois", null) == v.versao
    fun adiar(ctx: Context, v: VersaoApp) = prefs(ctx).edit().putString("atualizacaoDepois", v.versao).apply()
    /** Aviso de versao nova sai uma vez por versao. */
    fun avisarUmaVez(ctx: Context, v: VersaoApp): Boolean {
        if (prefs(ctx).getString("atualizacaoAvisada", null) == v.versao) return false
        prefs(ctx).edit().putString("atualizacaoAvisada", v.versao).apply()
        return true
    }

    private fun destino(ctx: Context, v: VersaoApp) = File(File(ctx.cacheDir, "atualizacao"), "duckV-${v.versao}.apk")

    private fun hash(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { ent ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = ent.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Ao abrir a folha: se o APK desta versao ja foi baixado e confere, pula direto para Instalar. */
    fun preparar(ctx: Context, v: VersaoApp) {
        if (etapa.value is Etapa.Baixando || etapa.value is Etapa.Conferindo) return
        val f = destino(ctx, v)
        etapa.value = if (f.exists() && f.length() == v.tamanho) Etapa.Pronta(f) else Etapa.Parada
    }

    fun baixar(ctx: Context, v: VersaoApp) {
        if (etapa.value is Etapa.Baixando || etapa.value is Etapa.Conferindo) return
        cancelar = false
        val f = destino(ctx, v)
        f.parentFile?.listFiles()?.filter { it.name != f.name }?.forEach { it.delete() }
        f.parentFile?.mkdirs()
        // continua de onde parou se a ligacao caiu no meio
        val jaTem = if (f.exists() && f.length() < v.tamanho) f.length() else 0L
        etapa.value = Etapa.Baixando(jaTem, v.tamanho)
        thread {
            var ultimo = 0L
            val r = FileOutputStream(f, jaTem > 0).use { saida ->
                Hub.baixarAtualizacao(jaTem, saida, { cancelar }) { feito, total ->
                    val agora = System.currentTimeMillis()
                    if (agora - ultimo > 80 || feito == total) {
                        ultimo = agora
                        principal.post { if (!cancelar) etapa.value = Etapa.Baixando(feito, total.takeIf { it > 0 } ?: v.tamanho) }
                    }
                }
            }
            if (cancelar) {
                principal.post { etapa.value = Etapa.Parada }
                return@thread
            }
            val erro = r.exceptionOrNull()?.message
            if (erro != null) {
                principal.post { etapa.value = Etapa.Erro(erro) }
                return@thread
            }
            principal.post { etapa.value = Etapa.Conferindo }
            // O mesmo SHA-256 publicado no GitHub: o arquivo chegou inteiro e e o da versao certa.
            val ok = runCatching { hash(f) }.getOrNull() == v.sha256.lowercase()
            if (!ok) f.delete()
            principal.post {
                etapa.value = if (ok) Etapa.Pronta(f) else Etapa.Erro("O arquivo chegou diferente do publicado. Tente de novo.")
            }
        }
    }

    fun parar() {
        cancelar = true
    }

    /** O Android 8+ pede que o dono libere o duckV para instalar apps, uma vez. */
    fun podeInstalar(ctx: Context) = Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    fun liberarInstalacao(ctx: Context) {
        val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { ctx.startActivity(i) }
    }

    /** Abre o instalador do Android com o APK. Devolve o erro, se houver. */
    fun instalar(ctx: Context, f: File): String? {
        if (!f.exists()) {
            etapa.value = Etapa.Parada
            return "O arquivo sumiu do celular. Baixe de novo."
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.arquivos", f)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { ctx.startActivity(i) }.exceptionOrNull()?.let { "O instalador do Android não abriu." }
    }

    /** "Procurar atualizacao": o computador consulta o GitHub agora. Devolve o erro ou a versao (null se nao ha nova). */
    fun procurar(ctx: Context, pronto: (erro: String?, nova: VersaoApp?) -> Unit) =
        Hub.mandar(JSONObject().put("t", "atualizacao")) { erro, r ->
            val v = lerVersaoApp(r?.optJSONObject("app"))
            val falha = erro ?: r?.optJSONObject("app")?.optString("erro")?.takeIf { it.isNotBlank() && v == null }
            pronto(falha, v?.takeIf { maisNova(it.versao, instalada(ctx)) })
        }
}
