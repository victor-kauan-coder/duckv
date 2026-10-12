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
import androidx.core.app.Person
import androidx.core.app.RemoteInput
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
        Sons.iniciar(this)
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
    private const val VERSAO = "versao"
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
                NotificationChannel(VERSAO, "Versão nova do app", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Quando o computador trouxer uma versão nova do duckV para instalar."
                },
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

    // ------------------------------------------------------------ conversa na notificacao

    const val TEXTO = "texto"
    private val VOCE = Person.Builder().setName("Você").build()

    // A notificacao de fim de vez funciona como a de um app de mensagens: mostra a fala da conta,
    // aceita resposta escrita ali mesmo e guarda as ultimas falas enquanto a notificacao existe.
    private class Papo(val titulo: String, val conta: String, val cor: Int, val falas: MutableList<NotificationCompat.MessagingStyle.Message>)
    private val papos = HashMap<String, Papo>()

    private fun idPapo(sessao: String) = ("fim" + sessao).hashCode()

    private fun acaoResponder(sessao: String, conta: String): NotificationCompat.Action {
        val i = Intent(ctx, RespostaTexto::class.java).putExtra("sessao", sessao)
        // O campo de texto precisa de PendingIntent mutavel: o Android escreve a resposta dentro dele.
        val pi = PendingIntent.getBroadcast(ctx, idPapo(sessao), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
        return NotificationCompat.Action.Builder(0, "Responder", pi)
            .addRemoteInput(RemoteInput.Builder(TEXTO).setLabel("Escreva para ${conta}").build())
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            // mandar mensagem para um agente exige desbloquear, como Aceitar
            .setAuthenticationRequired(true)
            .build()
    }

    private fun mostrarPapo(sessao: String, alertar: Boolean, podeResponder: Boolean = true) {
        val p = papos[sessao] ?: return
        val estilo = NotificationCompat.MessagingStyle(VOCE).setConversationTitle(p.titulo).setGroupConversation(false)
        p.falas.forEach { estilo.addMessage(it) }
        val ultima = p.falas.lastOrNull()
        val b = NotificationCompat.Builder(ctx, FIM)
            .setSmallIcon(R.drawable.ic_aviso)
            .setColor(p.cor)
            .setContentTitle("${p.conta} terminou em ${p.titulo}")
            .setContentText(ultima?.text ?: "A sessão está esperando você.")
            .setStyle(estilo)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(abrirApp(sessao, sessao.hashCode()))
            .setOnlyAlertOnce(!alertar)
            .setAutoCancel(true)
        if (podeResponder) b.addAction(acaoResponder(sessao, p.conta))
        mostrar(idPapo(sessao), b)
    }

    /** A resposta escrita na notificacao saiu (ou nao): entra na conversa da notificacao, sem tocar de novo. */
    fun respondido(sessao: String, texto: String, erro: String?) {
        val p = papos[sessao] ?: return
        val agora = System.currentTimeMillis()
        p.falas += NotificationCompat.MessagingStyle.Message(texto, agora, null as Person?)
        if (erro != null) p.falas += NotificationCompat.MessagingStyle.Message("Não foi: $erro", agora, Person.Builder().setName("duckV").build())
        while (p.falas.size > 8) p.falas.removeAt(0)
        mostrarPapo(sessao, alertar = false)
    }

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
        // Versao nova do app: um aviso por versao, so com o app fora da tela (dentro dele, o cartao do inicio avisa).
        Atualizacao.disponivel(ctx, e)?.let { v ->
            if (!appVisivel && Atualizacao.avisarUmaVez(ctx, v)) {
                val abrir = PendingIntent.getActivity(
                    ctx, 3,
                    Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("atualizar", true),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                mostrar(
                    "versao".hashCode(),
                    NotificationCompat.Builder(ctx, VERSAO)
                        .setSmallIcon(R.drawable.ic_aviso)
                        .setColor(0xFFFF7A1A.toInt())
                        .setContentTitle("duckV ${v.versao} chegou")
                        .setContentText("Toque para ver o que mudou e instalar.")
                        .setContentIntent(abrir)
                        .setAutoCancel(true),
                )
            }
        }
        if (antes == null) return

        // Fim de vez: a sessao estava trabalhando e agora espera.
        if (!appVisivel && av.fim) {
            for (s in e.sessoes) {
                val velha = antes.sessoes.find { it.id == s.id } ?: continue
                if (velha.status == "working" && s.status == "idle") {
                    val conta = e.conta(s.conta)
                    // Notificacao que ja sumiu da barra comeca uma conversa nova.
                    val aberta = ctx.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == idPapo(s.id) }
                    val p = papos[s.id]?.takeIf { aberta } ?: Papo(s.titulo, conta.nome, conta.cor.toInt(), mutableListOf()).also { papos[s.id] = it }
                    p.falas += NotificationCompat.MessagingStyle.Message(
                        s.ultimoTexto.ifBlank { "A sessão está esperando você." }, System.currentTimeMillis(), Person.Builder().setName(conta.nome).build(),
                    )
                    while (p.falas.size > 8) p.falas.removeAt(0)
                    mostrarPapo(s.id, alertar = true, podeResponder = s.podeEnviar && !s.desktop)
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

// "Responder" da notificacao de fim de vez: manda o texto por HTTP e poe a resposta na conversa da notificacao.
class RespostaTexto : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val sessao = intent.getStringExtra("sessao") ?: return
        val texto = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(Avisos.TEXTO)?.toString()?.trim().orEmpty()
        if (texto.isEmpty()) return
        val pendente = goAsync()
        thread {
            val erro = Hub.enviarDireto(sessao, texto)
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                Avisos.respondido(sessao, texto, erro)
                if (erro == null) Hub.aCaminho.value = Hub.aCaminho.value + (sessao to texto)
                pendente.finish()
            }
        }
    }
}

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
