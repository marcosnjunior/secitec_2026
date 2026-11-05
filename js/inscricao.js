import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  CATEGORIAS, DIAS, EIXOS, STATUS, TIPOS,
  cpfValido, digitos, esc, formatCpf, formatDataCurta, horaCurta, htmlAviso, initNav, jaComecou, maskCpf, maskPhone, toast,
} from "./ui.js";

initNav();

const acesso = document.getElementById("acesso");
const conta = document.getElementById("conta");
const entrar = document.getElementById("form-entrar");
const criar = document.getElementById("form-criar");
const aviso = document.getElementById("aviso");
const lista = document.getElementById("lista-atividades");
const destaque = new URLSearchParams(location.search).get("evento");
let eventos = [];
let concluiCadastro = false;

document.getElementById("categoria-opcoes").innerHTML = Object.entries(CATEGORIAS)
  .map(([valor, nome]) => `<option value="${valor}">${esc(nome)}</option>`)
  .join("");

criar.cpf.addEventListener("input", () => { criar.cpf.value = maskCpf(criar.cpf.value); });
criar.telefone.addEventListener("input", () => { criar.telefone.value = maskPhone(criar.telefone.value); });
criar.addEventListener("change", () => atualizarBotao(criar));
entrar.addEventListener("submit", entrarConta);
criar.addEventListener("submit", criarConta);

if (!configured) {
  aviso.innerHTML = htmlAviso(configError);
  lista.innerHTML = `<p class="empty">As atividades com inscrição online aparecem aqui depois que o Supabase estiver conectado.</p>`;
} else {
  iniciar();
}

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await mostrarSessao();
  else await carregarAtividades();
}

async function carregarAtividades() {
  lista.innerHTML = `<p class="empty">Carregando atividades…</p>`;
  const { data, error } = await supabase.rpc("programacao_publica");
  if (error) {
    aviso.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    lista.innerHTML = "";
    return;
  }
  eventos = (data || []).filter((ev) => ev.forma_inscricao === "online");
  renderLista(lista, new Set());
}

function renderLista(alvo, jaInscritos) {
  if (eventos.length === 0) {
    alvo.innerHTML = `<p class="empty">Nenhuma atividade com inscrição online no momento. A coordenação precisa publicar uma atividade antes do cadastro.</p>`;
    return;
  }
  alvo.innerHTML = DIAS.map((dia) => {
    const doDia = eventos.filter((ev) => ev.data === dia.data);
    if (doDia.length === 0) return "";
    return `
      <section>
        <h3>${dia.num} de novembro, ${dia.semana}</h3>
        ${doDia.map((ev) => {
          const encerrada = jaComecou(ev);
          const espera = !encerrada && ev.vagas_restantes <= 0;
          const ja = jaInscritos.has(ev.id);
          const marcado = ja || ev.id === destaque ? "checked" : "";
          return `
            <label class="check-item" id="escolha-${esc(ev.id)}">
              <input type="checkbox" name="eventos" value="${esc(ev.id)}" ${marcado} ${encerrada || ja ? "disabled" : ""}>
              <span>
                <strong>${esc(horaCurta(ev.horario_inicio))}–${esc(horaCurta(ev.horario_fim))} · ${esc(ev.titulo)}</strong>
                <span class="hint">${esc(TIPOS[ev.tipo] || "")} · ${esc(EIXOS[ev.eixo] || "")} · ${esc(ev.localizacao)}</span>
                <span class="${espera ? "vaga-fim" : "hint"}">${ja
                  ? "Você já está inscrito nesta atividade"
                  : encerrada
                    ? "Inscrições encerradas"
                    : espera
                      ? "Sem vagas. A inscrição entra na lista de espera."
                      : `${ev.vagas_restantes} de ${ev.capacidade} vagas`}</span>
              </span>
            </label>`;
        }).join("")}
      </section>`;
  }).join("");
  const alvoDestaque = destaque && alvo.querySelector(`#escolha-${CSS.escape(destaque)}`);
  alvoDestaque?.scrollIntoView({ block: "center" });
  atualizarBotao(alvo.closest("form"));
}

function atualizarBotao(form) {
  const alvo = form || criar;
  const botao = alvo.querySelector("[type=submit]");
  if (!botao) return;
  const total = alvo.querySelectorAll("input[name=eventos]:checked:not(:disabled)").length;
  if (alvo === criar) {
    const verbo = concluiCadastro ? "Concluir cadastro" : "Criar conta e inscrever";
    botao.textContent = total ? `${verbo} (${total})` : verbo;
    return;
  }
  botao.textContent = total ? `Confirmar inscrição (${total})` : "Confirmar inscrição";
}

function escolhidosDo(form) {
  return [...form.querySelectorAll("input[name=eventos]:checked:not(:disabled)")].map((item) => item.value);
}

async function entrarConta(evento) {
  evento.preventDefault();
  const botao = entrar.querySelector("[type=submit]");
  botao.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: entrar.email.value.trim().toLowerCase(),
    password: entrar.senha.value,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  entrar.reset();
  await mostrarSessao();
}

async function criarConta(evento) {
  evento.preventDefault();
  if (criar.website.value) {
    toast("Não foi possível enviar.", "err");
    return;
  }
  const nome = criar.nome.value.trim();
  const email = criar.email.value.trim().toLowerCase();
  const cpf = digitos(criar.cpf.value);
  if (nome.split(/\s+/).length < 2) {
    toast("Informe nome e sobrenome.", "err");
    return;
  }
  if (!cpfValido(cpf)) {
    toast("CPF inválido.", "err");
    return;
  }
  const ids = escolhidosDo(criar);
  if (ids.length === 0) {
    toast("Selecione ao menos uma atividade para concluir o cadastro.", "err");
    return;
  }
  if (!configured) {
    toast("Conecte o Supabase em js/config.js para concluir a inscrição.", "err");
    return;
  }
  const botao = criar.querySelector("[type=submit]");
  botao.disabled = true;
  if (!concluiCadastro) {
    if (criar.senha.value.length < 8) {
      botao.disabled = false;
      toast("A senha precisa ter pelo menos 8 caracteres.", "err");
      return;
    }
    const cadastro = await supabase.auth.signUp({ email, password: criar.senha.value });
    if (cadastro.error) {
      botao.disabled = false;
      toast(mensagemErro(cadastro.error), "err");
      return;
    }
    if (!cadastro.data.session) {
      botao.disabled = false;
      toast("O Supabase pediu confirmação de e-mail. Desative “Confirm email” e tente de novo.", "err");
      return;
    }
  }
  const { error } = await supabase.rpc("inscrever_participante", {
    p_nome: nome,
    p_email: email,
    p_cpf: cpf,
    p_telefone: criar.telefone.value.trim(),
    p_instituicao: criar.instituicao.value.trim(),
    p_categoria: criar.categoria.value,
    p_eventos: ids,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    concluiCadastro = true;
    prepararConclusao(email);
    return;
  }
  toast("Conta criada e inscrição registrada.");
  await mostrarSessao();
}

function prepararConclusao(email) {
  concluiCadastro = true;
  entrar.hidden = true;
  criar.hidden = false;
  criar.email.value = email;
  criar.email.readOnly = true;
  document.getElementById("campo-senha").hidden = true;
  criar.senha.required = false;
  criar.querySelector("h2").textContent = "Concluir cadastro";
  atualizarBotao();
}

async function mostrarSessao() {
  const { data: sessao } = await supabase.auth.getSession();
  const user = sessao.session?.user;
  if (!user) return;
  const org = await supabase.from("organizadores").select("id, funcao").eq("user_id", user.id).maybeSingle();
  if (org.data) {
    acesso.hidden = true;
    conta.hidden = false;
    conta.innerHTML = `
      <article class="painel-branco">
        <h2>Conta da organização</h2>
        <p>Esta entrada é da coordenação ou da comissão. A inscrição de participante usa outro e-mail.</p>
        <p><a class="btn btn-dark" href="admin.html">Abrir a organização</a></p>
        <button type="button" class="btn btn-ghost" id="sair">Sair</button>
      </article>`;
    document.getElementById("sair").onclick = sair;
    return;
  }
  const area = await supabase.rpc("minha_area");
  if (area.error) {
    acesso.hidden = true;
    conta.hidden = false;
    conta.innerHTML = `<article class="painel-branco"><p class="erro">${esc(mensagemErro(area.error))}</p><button type="button" class="btn btn-ghost" id="sair">Sair</button></article>`;
    document.getElementById("sair").onclick = sair;
    return;
  }
  if (!area.data?.participante) {
    acesso.hidden = false;
    conta.hidden = true;
    prepararConclusao(user.email || "");
    await carregarAtividades();
    return;
  }
  acesso.hidden = true;
  conta.hidden = false;
  await pintarConta(area.data);
}

async function pintarConta(area) {
  const pessoa = area.participante;
  const inscricoes = area.inscricoes || [];
  const presenca = pessoa.checkin_em
    ? `Presença confirmada em ${new Date(pessoa.checkin_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
    : "A presença é confirmada pela coordenação no dia 23 de novembro. O certificado aparece depois disso.";
  conta.innerHTML = `
    <article class="painel-branco">
      <h2>${esc(pessoa.nome)}</h2>
      <p>${esc(pessoa.email)} · CPF ${esc(formatCpf(pessoa.cpf))}</p>
      <p>${esc(presenca)}</p>
      <p>
        <a class="btn btn-dark" href="submissao.html">Enviar artigo</a>
        <a class="btn btn-ghost" href="certificado.html">Meus certificados</a>
        <button type="button" class="btn btn-ghost" id="sair">Sair</button>
      </p>
      <h2>Inscrições</h2>
      ${inscricoes.length === 0
        ? `<p class="empty">Nenhuma atividade ainda.</p>`
        : `<ul>${inscricoes.map((item) => `<li><strong>${esc(formatDataCurta(item.data))} ${esc(horaCurta(item.horario_inicio))}</strong> — ${esc(item.titulo)} <span class="status ${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span></li>`).join("")}</ul>`}
    </article>
    <form id="form-mais" class="painel-branco">
      <h2>Inscrever em outras atividades</h2>
      <div id="lista-mais"></div>
      <button class="btn btn-primary" type="submit">Confirmar inscrição</button>
    </form>`;
  document.getElementById("sair").onclick = sair;
  const formMais = document.getElementById("form-mais");
  formMais.addEventListener("submit", inscreverMais);
  formMais.addEventListener("change", () => atualizarBotao(formMais));
  if (eventos.length === 0) {
    const { data, error } = await supabase.rpc("programacao_publica");
    if (error) {
      document.getElementById("lista-mais").innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
      return;
    }
    eventos = (data || []).filter((ev) => ev.forma_inscricao === "online");
  }
  if (lista) lista.innerHTML = "";
  renderLista(document.getElementById("lista-mais"), new Set(inscricoes.map((item) => item.evento_id)));
}

async function inscreverMais(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const ids = escolhidosDo(form);
  if (ids.length === 0) {
    toast("Selecione ao menos uma atividade.", "err");
    return;
  }
  const areaAtual = await supabase.rpc("minha_area");
  const pessoa = areaAtual.data?.participante;
  if (!pessoa) {
    toast("Entre novamente para inscrever.", "err");
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const { error } = await supabase.rpc("inscrever_participante", {
    p_nome: pessoa.nome,
    p_email: pessoa.email,
    p_cpf: pessoa.cpf,
    p_telefone: pessoa.telefone || "",
    p_instituicao: pessoa.instituicao || "",
    p_categoria: pessoa.categoria,
    p_eventos: ids,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  toast("Inscrição registrada.");
  await mostrarSessao();
}

async function sair() {
  await supabase.auth.signOut();
  location.reload();
}
