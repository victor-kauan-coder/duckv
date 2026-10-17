package io.github.duckv.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import io.github.duckv.app.ui.Inicio
import io.github.duckv.app.ui.TelaAutomacao
import io.github.duckv.app.ui.TelaAutomacoes
import io.github.duckv.app.ui.TelaHistorico
import io.github.duckv.app.ui.LocalAviso
import io.github.duckv.app.ui.TelaNova
import io.github.duckv.app.ui.TelaOpcoes
import io.github.duckv.app.ui.TelaParear
import io.github.duckv.app.ui.TelaSessao
import io.github.duckv.app.ui.TemaClaudeV
import io.github.duckv.app.ui.Texto
import io.github.duckv.app.ui.cores
import kotlinx.coroutines.launch

// Telas do app. A pilha cresce para a direita; voltar tira a ultima.
sealed interface Rota {
    data object Inicio : Rota
    data class Sessao(val id: String) : Rota
    data class Nova(val conta: String?, val cwd: String = "", val texto: String = "") : Rota
    data object Opcoes : Rota
    data class Historico(val conta: String) : Rota
    data object Automacoes : Rota
    /** Uma automacao: [id] nulo e uma automacao nova. */
    data class UmaAutomacao(val id: String?) : Rota

    companion object {
        // A pilha vai para o estado salvo da Activity como lista de textos: trocar o tema do sistema (ou
        // girar a tela) recria a Activity, e quem estava na tela Nova ou numa conversa volta para ela.
        private const val SEP = '\u0000'
        fun guardar(pilha: List<Rota>): ArrayList<String> = ArrayList(pilha.map {
            when (it) {
                Inicio -> "i"
                is Sessao -> "s$SEP${it.id}"
                is Nova -> "n$SEP${it.conta.orEmpty()}$SEP${it.cwd}$SEP${it.texto}"
                Opcoes -> "o"
                is Historico -> "h$SEP${it.conta}"
                Automacoes -> "a"
                is UmaAutomacao -> "u$SEP${it.id.orEmpty()}"
            }
        })
        fun ler(lista: List<String>?): List<Rota> = lista.orEmpty().mapNotNull {
            val p = it.split(SEP)
            when (p[0]) {
                "i" -> Inicio
                "s" -> p.getOrNull(1)?.let(::Sessao)
                "n" -> Nova(p.getOrNull(1)?.ifEmpty { null }, p.getOrNull(2).orEmpty(), p.getOrNull(3).orEmpty())
                "o" -> Opcoes
                "h" -> p.getOrNull(1)?.let(::Historico)
                "a" -> Automacoes
                "u" -> UmaAutomacao(p.getOrNull(1)?.ifEmpty { null })
                else -> null
            }
        }.takeIf { it.firstOrNull() == Inicio } ?: listOf(Inicio)
    }
}

class MainActivity : ComponentActivity() {
    private val pilha = mutableStateListOf<Rota>(Rota.Inicio)
    /** Contas que nao entraram na equipe aberta pela folha rapida: o app avisa ao abrir. */
    private var falhasDaEquipe by androidx.compose.runtime.mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) {
            pilha.clear()
            pilha.addAll(Rota.ler(savedInstanceState.getStringArrayList("pilha")))
        } else abrirDoAviso(intent)
        setContent {
            val opcoes by Hub.opcoes.collectAsState()
            TemaClaudeV(opcoes.tema) {
                val c = cores
                val claro = !c.escuro
                androidx.compose.runtime.LaunchedEffect(claro) {
                    val barra = if (claro) SystemBarStyle.light(0, 0) else SystemBarStyle.dark(0)
                    enableEdgeToEdge(barra, barra)
                }
                val e by Hub.estado.collectAsState()
                val ligado by Hub.ligado.collectAsState()
                val pareado by Hub.pareado.collectAsState()
                val snack = remember { SnackbarHostState() }
                val escopo = rememberCoroutineScope()
                val aviso: (String) -> Unit = { t -> escopo.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(t) } }

                falhasDaEquipe?.let { f ->
                    androidx.compose.runtime.LaunchedEffect(f) {
                        aviso("Não entraram na equipe: $f")
                        falhasDaEquipe = null
                    }
                }
                CompositionLocalProvider(LocalAviso provides aviso) {
                    Box(Modifier.fillMaxSize()) {
                        if (!pareado) TelaParear(opcoes.pato)
                        else {
                            val topo = pilha.last()
                            BackHandler(pilha.size > 1) { pilha.removeAt(pilha.lastIndex) }
                            val voltar = { if (pilha.size > 1) pilha.removeAt(pilha.lastIndex) }
                            AnimatedContent(
                                topo,
                                transitionSpec = {
                                    val frente = pilha.size > 1 && targetState == pilha.last() && initialState != targetState && pilha.indexOf(initialState) < pilha.indexOf(targetState)
                                    if (frente) (slideInHorizontally { it / 4 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 8 } + fadeOut())
                                    else (slideInHorizontally { -it / 8 } + fadeIn()) togetherWith (slideOutHorizontally { it / 4 } + fadeOut())
                                },
                                label = "telas",
                            ) { rota ->
                                when (rota) {
                                    Rota.Inicio -> Inicio(
                                        e, ligado, opcoes.pato,
                                        aoAbrirSessao = { pilha.add(Rota.Sessao(it)) },
                                        aoNova = { pilha.add(Rota.Nova(it)) },
                                        aoOpcoes = { pilha.add(Rota.Opcoes) },
                                        aoHistorico = { pilha.add(Rota.Historico(it)) },
                                        aoVerTela = { pilha.add(Rota.Sessao(it.id)) },
                                    )
                                    is Rota.Sessao -> TelaSessao(e, rota.id, opcoes.pato, opcoes.ferramentas, { voltar() }, { id ->
                                        pilha.removeAt(pilha.lastIndex)
                                        pilha.add(Rota.Sessao(id))
                                    }) { pilha.add(Rota.Nova(it)) }
                                    is Rota.Nova -> TelaNova(e, rota.conta, rota.cwd, rota.texto, { voltar() }, aoAbriuEquipe = { id ->
                                        // a equipe aparece no inicio, no cartao com os patos de todas as contas
                                        pilha.clear()
                                        pilha.add(Rota.Inicio)
                                        Hub.equipeFoco.value = id
                                    }) { id ->
                                        pilha.removeAt(pilha.lastIndex)
                                        pilha.add(Rota.Sessao(id))
                                    }
                                    Rota.Opcoes -> TelaOpcoes(e, { pilha.add(Rota.Automacoes) }) { voltar() }
                                    Rota.Automacoes -> TelaAutomacoes(e, { voltar() }) { id -> pilha.add(Rota.UmaAutomacao(id)) }
                                    is Rota.UmaAutomacao -> TelaAutomacao(e, rota.id, { voltar() }) { id -> pilha.add(Rota.Sessao(id)) }
                                    is Rota.Historico -> TelaHistorico(e, rota.conta, { voltar() }) { id -> pilha.add(Rota.Sessao(id)) }
                                }
                            }
                        }
                        // versao nova: a folha fica na raiz para abrir do inicio, das opcoes e da notificacao
                        val folha by Atualizacao.folha.collectAsState()
                        val nova = Atualizacao.disponivel(this@MainActivity, e)
                        if (pareado && folha && nova != null) io.github.duckv.app.ui.FolhaAtualizacao(nova, opcoes.pato) { Atualizacao.folha.value = false }
                        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp)) {
                            Snackbar(containerColor = c.invFundo, contentColor = c.invTexto) { Text(it.visuals.message, style = Texto.rotulo) }
                        }
                    }
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putStringArrayList("pilha", Rota.guardar(pilha))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        abrirDoAviso(intent)
    }

    // Toque numa notificacao ou na folha rapida: abre a sessao, a equipe, a tela Nova (ou a folha da versao nova).
    private fun abrirDoAviso(i: Intent?) {
        if (i?.getBooleanExtra("atualizar", false) == true) {
            i.removeExtra("atualizar")
            Atualizacao.folha.value = true
        }
        i?.getStringExtra("equipe")?.let { eq ->
            i.removeExtra("equipe")
            pilha.clear()
            pilha.add(Rota.Inicio)
            Hub.equipeFoco.value = eq
            i.getStringArrayExtra("falhas")?.takeIf { it.isNotEmpty() }?.let { falhasDaEquipe = it.joinToString("; ") }
            i.removeExtra("falhas")
            return
        }
        i?.getStringExtra("nova")?.let { conta ->
            // pasta e texto so valem vindos da folha rapida deste app (a senha desta execucao)
            val daFolha = i.getStringExtra("nova_chave") == Atalhos.chave
            val cwd = if (daFolha) i.getStringExtra("nova_pasta").orEmpty().take(Atalhos.MAX_PASTA) else ""
            val texto = if (daFolha) i.getStringExtra("nova_texto").orEmpty().take(Atalhos.MAX_TEXTO) else ""
            listOf("nova", "nova_pasta", "nova_texto", "nova_chave").forEach(i::removeExtra)
            pilha.clear()
            pilha.add(Rota.Inicio)
            pilha.add(Rota.Nova(conta.take(60).ifEmpty { null }, cwd, texto))
            return
        }
        val id = i?.getStringExtra("sessao") ?: return
        i.removeExtra("sessao")
        pilha.clear()
        pilha.add(Rota.Inicio)
        pilha.add(Rota.Sessao(id))
    }
}
