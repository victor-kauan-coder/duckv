package io.github.duckv.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlin.concurrent.thread

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Hub.iniciar(this)
        Avisos.iniciar(this)
        Hub.aoMudarEstado = Avisos::observar
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                Avisos.appVisivel = true
                Hub.visibilidade(true)
                Hub.ligar()
                Vigia.ajustar(this@App)
            }

            override fun onStop(owner: LifecycleOwner) {
                Avisos.appVisivel = false
                Hub.visibilidade(false)
                if (!Hub.opcoes.value.segundoPlano) Hub.desligar()
            }
        })
    }
}

// Avisos nativos: pedido de permissao (com Aceitar e Recusar na propria
// notificacao), fim de vez e reinicio de limite. Saem daqui, comparando um
// estado com o anterior, enquanto o app esta fora da tela.
object Avisos {
    private const val PEDIDOS = "pedidos"
    private const val FIM = "fim"
    private const val LIMITE = "limite"
    const val LIGACAO = "ligacao"

    @Volatile var appVisivel = false
    private lateinit var ctx: Context
    private var anterior: Estado? = null
    private val vistos = HashSet<String>()

    fun iniciar(c: Context) {
        ctx = c
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannels(
            listOf(
                NotificationChannel(PEDIDOS, "Pedidos de permissão", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Quando uma conta pede para rodar um comando ou editar um arquivo."
                },
                NotificationChannel(FIM, "Fim de tarefa", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Quando uma sessão termina a vez e espera você."
                },
                NotificationChannel(LIMITE, "Limite reiniciado", NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(LIGACAO, "Ligação com o computador", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Mantém o duckV atento enquanto o app está fechado."
                    setShowBadge(false)
                },
            ),
        )
    }

    private fun abrirApp(sessao: String?, codigo: Int): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .apply { if (sessao != null) putExtra("sessao", sessao) }
        return PendingIntent.getActivity(ctx, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun responder(s: Sessao, p: Perm, aceitar: Boolean): PendingIntent {
        val i = Intent(ctx, Resposta::class.java)
            .putExtra("sessao", s.id).putExtra("pedido", p.id).putExtra("aceitar", aceitar)
        return PendingIntent.getBroadcast(ctx, (s.id + p.id + aceitar).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun mostrar(id: Int, n: NotificationCompat.Builder) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        try {
            NotificationManagerCompat.from(ctx).notify(id, n.build())
        } catch (_: SecurityException) {
            // permissao de notificacao recusada
        }
    }

    fun cancelarPedido(pedido: String) = NotificationManagerCompat.from(ctx).cancel(pedido.hashCode())

    fun observar(e: Estado) {
        val antes = anterior
        anterior = e
        val av = e.prefs.avisos

        // Pedidos de permissao
        val atuais = e.sessoes.filter { it.viva }.flatMap { s -> s.perms.map { s to it } }
        val ids = atuais.map { it.second.id }.toSet()
        for (velho in vistos - ids) cancelarPedido(velho)
        vistos.retainAll(ids)
        for ((s, p) in atuais) {
            if (!vistos.add(p.id) || appVisivel || !av.perm) continue
            val conta = e.conta(s.conta)
            // O comando real vem primeiro: a descricao e escrita pelo proprio modelo e pode enganar.
            val corpo = listOf(p.preview, p.desc).filter { it.isNotBlank() }.distinct().joinToString("\n")
            // Comando cortado ou de varias linhas so se aceita dentro do app, vendo tudo.
            val daPraVer = p.preview.isNotBlank() && !p.preview.endsWith("…") && !p.preview.contains('\n')
            val titulo = "${conta.nome} pede permissão: ${p.tool}"
            val b = NotificationCompat.Builder(ctx, PEDIDOS)
                .setSmallIcon(R.drawable.ic_aviso)
                    .setColor(conta.cor.toInt())
                    .setContentTitle(titulo)
                    .setContentText(p.preview.ifBlank { p.desc })
                    .setStyle(NotificationCompat.BigTextStyle().bigText(corpo).setSummaryText(s.titulo))
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(abrirApp(s.id, s.id.hashCode()))
                    // Na tela bloqueada aparece so quem pede; responder exige desbloquear.
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setPublicVersion(
                        NotificationCompat.Builder(ctx, PEDIDOS).setSmallIcon(R.drawable.ic_aviso).setColor(conta.cor.toInt())
                            .setContentTitle("${conta.nome} pede permissão").setContentText("Desbloqueie para ver o comando.").build(),
                    )
                    .addAction(acao("Recusar", responder(s, p, false)))
            if (daPraVer) b.addAction(acao("Aceitar", responder(s, p, true)))
            mostrar(p.id.hashCode(), b.setAutoCancel(true))
        }
        if (antes == null) return

        // Fim de vez: a sessao estava trabalhando e agora espera.
        if (!appVisivel && av.fim) {
            for (s in e.sessoes) {
                val velha = antes.sessoes.find { it.id == s.id } ?: continue
                if (velha.status == "working" && s.status == "idle") {
                    val conta = e.conta(s.conta)
                    mostrar(
                        ("fim" + s.id).hashCode(),
                        NotificationCompat.Builder(ctx, FIM)
                            .setSmallIcon(R.drawable.ic_aviso)
                            .setColor(conta.cor.toInt())
                            .setContentTitle("${conta.nome} terminou em ${s.titulo}")
                            .setContentText(s.ultimoTexto.ifBlank { "A sessão está esperando você." })
                            .setStyle(NotificationCompat.BigTextStyle().bigText(s.ultimoTexto.ifBlank { "A sessão está esperando você." }))
                            .setContentIntent(abrirApp(s.id, s.id.hashCode()))
                            .setAutoCancel(true),
                    )
                }
            }
        }

        // Limite reiniciado
        if (av.reset) {
            for (c in e.contas) {
                val r = c.reinicio ?: continue
                val velho = antes.contas.find { it.id == c.id }?.reinicio
                if (velho?.em == r.em || r.era < av.limiar) continue
                mostrar(
                    ("reset" + c.id).hashCode(),
                    NotificationCompat.Builder(ctx, LIMITE)
                        .setSmallIcon(R.drawable.ic_aviso)
                        .setColor(c.cor.toInt())
                        .setContentTitle("${c.nome}: limite reiniciado")
                        .setContentText(if (r.janela == "five_hour") "O limite de 5 horas voltou a zero." else "O limite semanal voltou a zero.")
                        .setContentIntent(abrirApp(null, 1))
                        .setAutoCancel(true),
                )
            }
        }
    }

    fun ligacao(ctx: Context) = NotificationCompat.Builder(ctx, LIGACAO)
        .setSmallIcon(R.drawable.ic_aviso)
        .setContentTitle("duckV atento às suas contas")
        .setContentText("Avisa quando uma conta pedir permissão ou terminar.")
        .setOngoing(true)
        .setSilent(true)
        .setContentIntent(abrirApp(null, 2))
        .build()
}

// Mantem a ligacao viva com o app fechado, para os avisos chegarem na hora.
class Vigia : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Hub.pareado.value || !Hub.opcoes.value.segundoPlano) {
            stopSelf()
            return START_NOT_STICKY
        }
        val tipo = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
        ServiceCompat.startForeground(this, 7, Avisos.ligacao(this), tipo)
        Hub.ligar()
        return START_STICKY
    }

    companion object {
        fun ajustar(ctx: Context) {
            val i = Intent(ctx, Vigia::class.java)
            if (Hub.pareado.value && Hub.opcoes.value.segundoPlano) {
                runCatching { ContextCompat.startForegroundService(ctx, i) }
            } else ctx.stopService(i)
        }
    }
}

// Botoes Aceitar e Recusar da notificacao. Responde por HTTP, que funciona
// mesmo se a ligacao do app ainda estiver voltando.
private fun acao(rotulo: String, intent: android.app.PendingIntent) =
    NotificationCompat.Action.Builder(0, rotulo, intent).setAuthenticationRequired(true).build()

class Resposta : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val sessao = intent.getStringExtra("sessao") ?: return
        val pedido = intent.getStringExtra("pedido") ?: return
        val aceitar = intent.getBooleanExtra("aceitar", false)
        val base = Hub.base ?: return
        val token = context.getSharedPreferences("claudev", Context.MODE_PRIVATE).getString("token", null) ?: return
        val pendente = goAsync()
        thread {
            val corpo = JSONObject().put("instance", sessao).put("request_id", pedido).put("behavior", if (aceitar) "allow" else "deny")
            val erro = try {
                OkHttpClient().newCall(
                    Request.Builder().url("$base/api/verdict").header("Cookie", "painel=$token")
                        .post(corpo.toString().toRequestBody("application/json".toMediaType())).build(),
                ).execute().use { r ->
                    if (r.isSuccessful) null else runCatching { JSONObject(r.body!!.string()).optString("erro") }.getOrNull() ?: "Erro ${r.code}"
                }
            } catch (_: Exception) {
                "Sem conexão com o computador."
            }
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                Avisos.cancelarPedido(pedido)
                Toast.makeText(context, erro ?: if (aceitar) "Aceito" else "Recusado", Toast.LENGTH_SHORT).show()
                pendente.finish()
            }
        }
    }
}
