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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import io.github.duckv.app.ui.Inicio
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
    data class Nova(val conta: String?) : Rota
    data object Opcoes : Rota
}

class MainActivity : ComponentActivity() {
    private val pilha = mutableStateListOf<Rota>(Rota.Inicio)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        abrirDoAviso(intent)
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
                                        aoVerTela = { pilha.add(Rota.Sessao(it.id)) },
                                    )
                                    is Rota.Sessao -> TelaSessao(e, rota.id, opcoes.pato, opcoes.ferramentas, { voltar() }) { pilha.add(Rota.Nova(it)) }
                                    is Rota.Nova -> TelaNova(e, rota.conta, { voltar() }) { id ->
                                        pilha.removeAt(pilha.lastIndex)
                                        pilha.add(Rota.Sessao(id))
                                    }
                                    Rota.Opcoes -> TelaOpcoes(e) { voltar() }
                                }
                            }
                        }
                        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp)) {
                            Snackbar(containerColor = c.invFundo, contentColor = c.invTexto) { Text(it.visuals.message, style = Texto.rotulo) }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        abrirDoAviso(intent)
    }

    // Toque numa notificacao: abre a sessao dela.
    private fun abrirDoAviso(i: Intent?) {
        val id = i?.getStringExtra("sessao") ?: return
        i.removeExtra("sessao")
        pilha.clear()
        pilha.add(Rota.Inicio)
        pilha.add(Rota.Sessao(id))
    }
}
