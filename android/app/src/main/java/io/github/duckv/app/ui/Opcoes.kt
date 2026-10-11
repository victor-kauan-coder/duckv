package io.github.duckv.app.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Conta
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Vigia
import org.json.JSONArray
import org.json.JSONObject

private val CORES = listOf(
    "#ffb22e" to "Âmbar", "#ff7a1a" to "Laranja", "#c4420a" to "Queimado", "#ff9e6d" to "Pêssego",
    "#e8a32c" to "Mel", "#f26b4e" to "Coral", "#b5651d" to "Caramelo", "#8a3b12" to "Tijolo",
    "#3d8bfd" to "Azul", "#2fb37a" to "Verde", "#9b6bff" to "Violeta", "#e0569a" to "Rosa",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TelaOpcoes(e: Estado?, aoVoltar: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val ctx = LocalContext.current
    val local by Hub.opcoes.collectAsState()
    val salvar = { o: JSONObject -> Hub.prefs(o) { erro, _ -> aviso(erro ?: "Salvo") } }

    Column(Modifier.fillMaxSize().background(c.fundo).imePadding()) {
        Topo("Opções", "Aparência, contas, avisos e mensagens rápidas.", aoVoltar)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(30.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                TituloSecao("Aparência neste celular")
                Text("Tema", style = Texto.rotulo, color = c.texto)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((v, t) in listOf("sistema" to "Igual ao do celular", "claro" to "Claro", "escuro" to "Escuro")) Escolha(t, local.tema == v, { Hub.guardar(local.copy(tema = v)) })
                }
                Text("Pato", style = Texto.rotulo, color = c.texto)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((v, t) in listOf("animado" to "Animado, com gracinhas", "calmo" to "Sem gracinhas", "parado" to "Parado")) Escolha(t, local.pato == v, { Hub.guardar(local.copy(pato = v)) })
                }
                Chave("Mostrar na conversa as ferramentas que o Claude usa", local.ferramentas) { Hub.guardar(local.copy(ferramentas = it)) }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TituloSecao("Avisos neste celular")
                Chave("Ficar atento com o app fechado", local.segundoPlano, "Mantém a ligação com o computador para os avisos chegarem na hora. Mostra uma notificação discreta fixa.") {
                    Hub.guardar(local.copy(segundoPlano = it))
                    Vigia.ajustar(ctx)
                }
                val pm = ctx.getSystemService(PowerManager::class.java)
                var livre by remember { mutableStateOf(pm.isIgnoringBatteryOptimizations(ctx.packageName)) }
                if (local.segundoPlano && !livre) {
                    Text("O Android pode pausar o claudeV para economizar bateria e atrasar os avisos.", style = Texto.apoio, color = c.apoio)
                    Botao("Liberar da economia de bateria", {
                        @SuppressLint("BatteryLife")
                        val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
                        runCatching { ctx.startActivity(i) }
                        livre = true
                    }, Modifier.fillMaxWidth(), Icons.Rounded.BatteryChargingFull, Peso.Quieto)
                }
            }

            if (e != null) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TituloSecao("Contas")
                    Text("Nome, cor e como cada conta começa uma sessão aberta pelo celular.", style = Texto.apoio, color = c.apoio)
                    for (conta in e.contas) androidx.compose.runtime.key(conta.id) { BlocoConta(e, conta, salvar, e.contas.size > 1) }
                }

                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val a = e.prefs.avisos
                    TituloSecao("Quais avisos chegam")
                    Text("Valem para todos os celulares pareados.", style = Texto.apoio, color = c.apoio)
                    Chave("Quando uma conta pedir permissão", a.perm) { salvar(JSONObject().put("op", "avisos").put("perm", it)) }
                    Chave("Quando uma sessão terminar a vez", a.fim) { salvar(JSONObject().put("op", "avisos").put("fim", it)) }
                    Chave("Quando um limite reiniciar", a.reset) { salvar(JSONObject().put("op", "avisos").put("reset", it)) }
                    Text("Avisar do reinício só se o uso tiver passado de", style = Texto.rotulo, color = c.texto)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (n in listOf(50, 80, 95)) Escolha("$n%", a.limiar == n, { salvar(JSONObject().put("op", "avisos").put("limiar", n)) })
                    }
                }

                Rapidas(e.prefs.rapidas, salvar)
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TituloSecao("Este celular")
                Text("Ligado a ${Hub.base ?: "nenhum computador"}. Desparear apaga o acesso deste celular; para voltar, escaneie de novo o código da janela do claudeV.", style = Texto.apoio, color = c.apoio)
                BotaoConfirma("Desparear este celular", Icons.AutoMirrored.Rounded.Logout, {
                    Hub.desparear()
                    Vigia.ajustar(ctx)
                }, Modifier.fillMaxWidth(), Peso.Perigo)
            }
        }
    }
}

@Composable
private fun Chave(texto: String, marcado: Boolean, ajuda: String? = null, aoMudar: (Boolean) -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Switch) { aoMudar(!marcado) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(texto, style = Texto.rotulo, color = c.texto)
            if (ajuda != null) Text(ajuda, style = Texto.apoio, color = c.apoio)
        }
        EspacoLargo(12.dp)
        Switch(
            marcado, null,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Tinta, checkedTrackColor = Laranja, checkedBorderColor = Laranja,
                uncheckedThumbColor = c.apoio, uncheckedTrackColor = c.superficie, uncheckedBorderColor = c.vazio,
            ),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BlocoConta(e: Estado, conta: Conta, salvar: (JSONObject) -> Unit, podeRemover: Boolean) {
    val c = cores
    val aviso = LocalAviso.current
    var aberto by rememberSaveable { mutableStateOf(false) }
    var nome by rememberSaveable(conta.id) { mutableStateOf(conta.nome) }
    var pasta by rememberSaveable(conta.id) { mutableStateOf(conta.padroes.cwd.orEmpty()) }
    val forma = RoundedCornerShape(14.dp)
    val padrao = { p: JSONObject -> salvar(JSONObject().put("op", "conta").put("id", conta.id).put("padroes", p)) }
    Column(Modifier.fillMaxWidth().clip(forma).border(1.dp, c.linha, forma).background(c.superficie)) {
        Row(Modifier.fillMaxWidth().clickable { aberto = !aberto }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Marca(Color(conta.cor), tamanho = 14.dp)
            EspacoLargo(12.dp)
            Text(conta.nome, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, modifier = Modifier.weight(1f))
            Icon(if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, null, tint = c.apoio)
        }
        AnimatedVisibility(aberto) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        nome, { nome = it.take(30) }, Modifier.weight(1f), label = { Text("Nome") }, singleLine = true,
                        shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                    )
                    if (nome.trim() != conta.nome && nome.isNotBlank()) {
                        IconButton({ salvar(JSONObject().put("op", "conta").put("id", conta.id).put("nome", nome.trim())) }) { Icon(Icons.Rounded.Check, "Salvar nome", tint = c.ok) }
                    }
                }
                CabecalhoAjuste("Cor", CORES.firstOrNull { io.github.duckv.app.corDe(it.first) == conta.cor }?.second, Modifier.padding(bottom = 0.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    for ((hex, rotulo) in CORES) {
                        val cor = Color(io.github.duckv.app.corDe(hex))
                        val marcada = io.github.duckv.app.corDe(hex) == conta.cor
                        Box(
                            Modifier.size(40.dp).clip(CircleShape).background(cor)
                                .border(if (marcada) 3.dp else 0.dp, c.texto, CircleShape)
                                .clickable(role = Role.RadioButton, onClickLabel = rotulo) { salvar(JSONObject().put("op", "conta").put("id", conta.id).put("cor", hex)) },
                            contentAlignment = Alignment.Center,
                        ) { if (marcada) Icon(Icons.Rounded.Check, rotulo, tint = sobre(cor), modifier = Modifier.size(20.dp)) }
                    }
                }
                Divisoria()
                Text("Ao abrir uma sessão desta conta pelo celular", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                Column {
                    CabecalhoAjuste("Modelo", null)
                    ListaEscolha(opcoesModelo(e.host.modelos), conta.padroes.model ?: "default", { padrao(JSONObject().put("model", it)) }, cor = Color(conta.cor))
                }
                Column {
                    CabecalhoAjuste("Esforço de raciocínio", null)
                    EscalaEsforco(e.host.esforcos, conta.padroes.effort.orEmpty(), { padrao(JSONObject().put("effort", it.ifEmpty { JSONObject.NULL })) }, cor = Color(conta.cor))
                }
                Column {
                    CabecalhoAjuste("Permissões", null)
                    ListaEscolha(opcoesModo(e.host.modos), conta.padroes.mode ?: "manual", { padrao(JSONObject().put("mode", it)) }, cor = Color(conta.cor))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        pasta, { pasta = it }, Modifier.weight(1f), label = { Text("Pasta do projeto") }, singleLine = true,
                        shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.codigo.copy(color = c.texto),
                    )
                    if (pasta != conta.padroes.cwd.orEmpty()) IconButton({ padrao(JSONObject().put("cwd", pasta.trim())) }) { Icon(Icons.Rounded.Check, "Salvar pasta", tint = c.ok) }
                }
                if (podeRemover) {
                    Text("Remover tira a conta do claudeV. O login e o histórico continuam guardados no computador.", style = Texto.apoio, color = c.apoio)
                    BotaoConfirma("Remover ${conta.nome}", Icons.Rounded.DeleteOutline, {
                        Hub.mandar(JSONObject().put("t", "conta").put("op", "remover").put("id", conta.id)) { erro, _ -> aviso(erro ?: "Conta removida") }
                    }, Modifier.fillMaxWidth(), Peso.Perigo)
                }
            }
        }
    }
}

@Composable
private fun Rapidas(rapidas: List<String>, salvar: (JSONObject) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    var nova by rememberSaveable { mutableStateOf("") }
    val gravar = { l: List<String> -> salvar(JSONObject().put("op", "rapidas").put("lista", JSONArray(l))) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TituloSecao("Mensagens rápidas")
        Text("Aparecem como botões acima da caixa de mensagem de cada sessão. Até 12.", style = Texto.apoio, color = c.apoio)
        val forma = RoundedCornerShape(14.dp)
        Column(Modifier.fillMaxWidth().clip(forma).border(1.dp, c.linha, forma).background(c.superficie)) {
            if (rapidas.isEmpty()) Text("Nenhuma mensagem rápida. Adicione uma abaixo.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(14.dp))
            rapidas.forEachIndexed { i, r ->
                if (i > 0) Divisoria()
                Row(Modifier.padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(r, style = Texto.corpo, color = c.texto, modifier = Modifier.weight(1f).padding(vertical = 10.dp))
                    IconButton({ gravar(rapidas.filterIndexed { n, _ -> n != i }) }) { Icon(Icons.Rounded.Delete, "Remover: $r", tint = c.apoio) }
                }
            }
        }
        OutlinedTextField(
            nova, { nova = it.take(200) }, Modifier.fillMaxWidth(), label = { Text("Nova mensagem rápida") },
            placeholder = { Text("Rode o lint e corrija o que aparecer.", color = c.apoio) },
            shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
        )
        Botao("Adicionar", {
            when {
                nova.isBlank() -> {}
                rapidas.size >= 12 -> aviso("O limite é de 12 mensagens rápidas.")
                else -> {
                    gravar(rapidas + nova.trim())
                    nova = ""
                }
            }
        }, Modifier.fillMaxWidth(), Icons.Rounded.Add, habilitado = nova.isNotBlank())
    }
}

