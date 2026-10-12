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
import androidx.compose.material.icons.rounded.SystemUpdate
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
                Chave("Mostrar na conversa as ferramentas que o agente usa", local.ferramentas) { Hub.guardar(local.copy(ferramentas = it)) }
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
                    Text("O Android pode pausar o duckV para economizar bateria e atrasar os avisos.", style = Texto.apoio, color = c.apoio)
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
                TituloSecao("Versão do app")
                val nova = io.github.duckv.app.Atualizacao.disponivel(ctx, e)
                var procurando by remember { mutableStateOf(false) }
                Text(
                    if (nova != null) "Você está na ${io.github.duckv.app.Atualizacao.instalada(ctx)}. A ${nova.versao} já está no computador, pronta para instalar."
                    else "Você está na ${io.github.duckv.app.Atualizacao.instalada(ctx)}. O computador olha as versões novas no GitHub a cada 6 horas.",
                    style = Texto.apoio, color = c.apoio,
                )
                if (nova != null) Botao("Ver a versão ${nova.versao}", { io.github.duckv.app.Atualizacao.folha.value = true }, Modifier.fillMaxWidth(), Icons.Rounded.SystemUpdate, Peso.Principal)
                else Botao(if (procurando) "Procurando…" else "Procurar atualização", {
                    procurando = true
                    io.github.duckv.app.Atualizacao.procurar(ctx) { erro, v ->
                        procurando = false
                        when {
                            erro != null -> aviso(erro)
                            v != null -> io.github.duckv.app.Atualizacao.folha.value = true
                            else -> aviso("Você já está na versão mais nova.")
                        }
                    }
                }, Modifier.fillMaxWidth(), Icons.Rounded.SystemUpdate, Peso.Quieto, habilitado = !procurando)
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TituloSecao("Este celular")
                Text("Ligado a ${Hub.base ?: "nenhum computador"}. Desparear apaga o acesso deste celular; para voltar, escaneie de novo o código da janela do duckV.", style = Texto.apoio, color = c.apoio)
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
    var nome by rememberSaveable(conta.id, conta.nome) { mutableStateOf(conta.nome) }
    var pasta by rememberSaveable(conta.id) { mutableStateOf(conta.padroes.cwd.orEmpty()) }
    val forma = RoundedCornerShape(16.dp)
    val padrao = { p: JSONObject -> salvar(JSONObject().put("op", "conta").put("id", conta.id).put("padroes", p)) }
    Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
        Row(Modifier.fillMaxWidth().clickable { aberto = !aberto }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Pato("parado", "parado", Color(conta.cor), Modifier.size(width = 40.dp, height = 32.dp), andar = false, tocavel = false, tipo = conta.pato)
            EspacoLargo(12.dp)
            Column(Modifier.weight(1f)) {
                Text(conta.nome, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                if (conta.email != null) Text(conta.email, style = Texto.pequeno, color = c.apoio)
            }
            Icon(if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, null, tint = c.apoio)
        }
        AnimatedVisibility(aberto) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                val mudou = nome.trim() != conta.nome && nome.isNotBlank()
                val salvarNome = { if (mudou) salvar(JSONObject().put("op", "conta").put("id", conta.id).put("nome", nome.trim())) }
                OutlinedTextField(
                    nome, { nome = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Nome da conta") }, singleLine = true,
                    supportingText = { Text("Aparece no topo do app e nos avisos.") },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { salvarNome() }),
                    shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                if (mudou) Botao("Salvar nome", salvarNome, Modifier.fillMaxWidth(), Icons.Rounded.Check, Peso.Principal)
                // O patinho escolhe a cara do pato e a cor da conta de uma vez so.
                EscolhaPatinho(conta) { tp -> salvar(JSONObject().put("op", "conta").put("id", conta.id).put("pato", tp.id).put("cor", tp.cor)) }
                Divisoria()
                val ag = e.agente(conta.agente)
                SeloAgente(ag, completo = true)
                Column {
                    CabecalhoAjuste("Modelo inicial", null)
                    ListaEscolha(opcoesModelo(ag), conta.padroes.model ?: "default", { padrao(JSONObject().put("model", it)) }, cor = Color(conta.cor))
                }
                if (ag.esforcos.isNotEmpty()) Column {
                    CabecalhoAjuste("Esforço inicial", null)
                    EscalaEsforco(ag, conta.padroes.effort.orEmpty(), { padrao(JSONObject().put("effort", it.ifEmpty { JSONObject.NULL })) }, cor = Color(conta.cor))
                }
                Column {
                    CabecalhoAjuste("Permissões iniciais", null)
                    ListaEscolha(opcoesModo(ag), conta.padroes.mode ?: ag.modos.firstOrNull()?.id ?: "manual", { padrao(JSONObject().put("mode", it)) }, cor = Color(conta.cor))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        pasta, { pasta = it }, Modifier.weight(1f), label = { Text("Pasta do projeto") }, singleLine = true,
                        shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.codigo.copy(color = c.texto),
                    )
                    if (pasta != conta.padroes.cwd.orEmpty()) IconButton({ padrao(JSONObject().put("cwd", pasta.trim())) }) { Icon(Icons.Rounded.Check, "Salvar pasta", tint = c.ok) }
                }
                if (podeRemover) {
                    Text("Remover tira a conta do duckV. O login e o histórico continuam guardados no computador.", style = Texto.apoio, color = c.apoio)
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
        val forma = RoundedCornerShape(16.dp)
        Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
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


/** Menu suspenso com os tipos de patinho: cada um desenhado, com nome, jeito e a cor que da a conta. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun EscolhaPatinho(conta: Conta, aoEscolher: (TipoPato) -> Unit) {
    val c = cores
    val atual = tipoPato(conta.pato)
    var aberto by remember { mutableStateOf(false) }
    androidx.compose.material3.ExposedDropdownMenuBox(aberto, { aberto = it }) {
        OutlinedTextField(
            atual.nome, {}, Modifier.fillMaxWidth().menuAnchor(androidx.compose.material3.MenuAnchorType.PrimaryNotEditable),
            readOnly = true, singleLine = true, label = { Text("Patinho e cor da conta") },
            leadingIcon = { Pato("parado", "parado", Color(conta.cor), Modifier.size(width = 36.dp, height = 28.dp), andar = false, tocavel = false, tipo = atual.id) },
            trailingIcon = { androidx.compose.material3.ExposedDropdownMenuDefaults.TrailingIcon(aberto) },
            supportingText = { Text(atual.sobre) },
            textStyle = Texto.corpo.copy(color = c.texto), colors = campoCores(),
        )
        ExposedDropdownMenu(aberto, { aberto = false }, containerColor = c.elevada) {
            for (tp in TIPOS_PATO) {
                val cor = Color(io.github.duckv.app.corDe(tp.cor))
                androidx.compose.material3.DropdownMenuItem(
                    text = {
                        Column(Modifier.padding(vertical = 4.dp)) {
                            Text(tp.nome, style = Texto.corpo, color = c.texto)
                            Text(tp.sobre, style = Texto.pequeno, color = c.apoio)
                        }
                    },
                    onClick = {
                        aberto = false
                        aoEscolher(tp)
                    },
                    leadingIcon = { Pato("parado", "parado", cor, Modifier.size(width = 48.dp, height = 38.dp), andar = false, tocavel = false, tipo = tp.id) },
                    trailingIcon = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (tp.id == atual.id) Icon(Icons.Rounded.Check, "Escolhido", tint = c.realce, modifier = Modifier.padding(end = 8.dp).size(20.dp))
                            Marca(cor, tamanho = 14.dp)
                        }
                    },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                )
            }
        }
    }
}
