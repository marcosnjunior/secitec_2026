import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  CATEGORIAS, DIAS, EIXOS, FORMAS, FUNCOES, RECOMENDACOES, STATUS, STATUS_TRABALHO, TIPOS,
  cpfValido, digitos, esc, formatCarga, formatCpf, formatarQuando, horaCurta, horasParaInput,
  htmlAviso, initNav, maskCpf, maskPhone, matriculaNormalizada, optionsHtml, safeUrl, somarMinutos, toast,
} from "./ui.js";

initNav();

const root = document.getElementById("admin-root");
const state = {
  perfil: null,
  secao: "painel",
  eventos: [],
  inscricoes: [],
  organizadores: [],
  certificados: [],
  trabalhos: [],
  trabalhosErro: "",
  trabalhoAberto: null,
  filtro: { evento: "", status: "", q: "" },
  buscaCheckin: "",
};
let ouvintes = false;

boot();

async function boot() {
  if (!configured || !supabase) {
    root.innerHTML = htmlAviso(configError);
    return;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    root.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    return;
  }
  if (data.session) await entrar();
  else await mostrarAcesso();
}

async function mostrarAcesso(mensagem = "") {
  let primeiro = false;
  let erroEstado = "";
  const { data, error } = await supabase.rpc("estado_acesso");
  if (error) erroEstado = mensagemErro(error);
  else primeiro = data?.tem_organizador === false;

  root.innerHTML = `
    ${erroEstado ? `<div class="banner"><strong>O banco ainda não respondeu.</strong><p>${esc(erroEstado)}</p></div>` : ""}
    ${mensagem ? `<p class="erro">${esc(mensagem)}</p>` : ""}
    <div class="grid-2">
      <form id="form-login" class="painel-branco">
        <h2>${primeiro ? "Já criei a senha" : "Entrar"}</h2>
        <label class="field">E-mail <input name="email" type="email" autocomplete="username" required></label>
        <label class="field">Senha <input name="senha" type="password" autocomplete="current-password" required minlength="8"></label>
        <button class="btn btn-dark" type="submit">Entrar</button>
        <p class="hint">Senha esquecida: a coordenação redefine em Authentication → Users, no painel do Supabase.</p>
      </form>
      <form id="form-criar" class="painel-branco">
        <h2>${primeiro ? "Criar a coordenação" : "Criar acesso"}</h2>
        <p class="hint">${primeiro
          ? "Este é o primeiro acesso. O e-mail e a senha de agora viram a conta da coordenação."
          : "Use o e-mail que a coordenação já cadastrou. A senha é definida aqui."}</p>
        <div class="grid-2" ${primeiro ? "" : "hidden"}>
          <label class="field">Nome completo <input name="nome" autocomplete="name" ${primeiro ? "required" : ""}></label>
          <label class="field">CPF <input name="cpf" inputmode="numeric" data-mask="cpf"></label>
          <label class="field">Matrícula <input name="matricula" maxlength="30" autocomplete="off"></label>
          <label class="field">Telefone <input name="telefone" inputmode="tel" data-mask="tel"></label>
          <label class="field">Instituição <input name="instituicao" value="IFPB"></label>
          <label class="field span-2">Carga horária da organização (horas)
            <input name="carga" type="number" min="1" max="100" step="0.5" value="20">
          </label>
          <p class="hint span-2">Informe o CPF, a matrícula ou os dois.</p>
        </div>
        <label class="field">E-mail <input name="email" type="email" autocomplete="username" required></label>
        <label class="field">Senha <input name="senha" type="password" autocomplete="new-password" required minlength="8"></label>
        <button class="btn btn-primary" type="submit">${primeiro ? "Criar coordenação" : "Criar senha e entrar"}</button>
      </form>
    </div>`;

  const formLogin = document.getElementById("form-login");
  const formCriar = document.getElementById("form-criar");
  formCriar.addEventListener("input", mascarar);
  formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const botao = formLogin.querySelector("[type=submit]");
    botao.disabled = true;
    const { error: erroLogin } = await supabase.auth.signInWithPassword({
      email: formLogin.email.value.trim(),
      password: formLogin.senha.value,
    });
    botao.disabled = false;
    if (erroLogin) {
      toast(mensagemErro(erroLogin), "err");
      return;
    }
    await entrar();
  });
  formCriar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    await criarAcesso(formCriar, primeiro);
  });
}

function documentoOrganizadorValido(form) {
  const cpf = digitos(form.cpf.value);
  const matricula = matriculaNormalizada(form.matricula.value);
  if (!cpf && !matricula) {
    toast("Informe o CPF ou a matrícula.", "err");
    return false;
  }
  if (cpf && !cpfValido(cpf)) {
    toast("CPF inválido.", "err");
    return false;
  }
  if (matricula && (matricula.length < 3 || matricula.length > 30)) {
    toast("Matrícula inválida.", "err");
    return false;
  }
  return true;
}

function textoDocumentoOrganizador(org) {
  const partes = [];
  if (org.cpf) partes.push(formatCpf(org.cpf));
  if (org.matricula) partes.push(`matrícula ${org.matricula}`);
  return partes.join(" · ");
}

async function criarAcesso(form, primeiro) {
  const email = form.email.value.trim().toLowerCase();
  const senha = form.senha.value;
  if (senha.length < 8) {
    toast("A senha precisa ter pelo menos 8 caracteres.", "err");
    return;
  }
  if (primeiro && !documentoOrganizadorValido(form)) return;
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  let sessao = null;
  const cadastro = await supabase.auth.signUp({ email, password: senha });
  if (cadastro.error && /already registered|already been registered/i.test(cadastro.error.message)) {
    const login = await supabase.auth.signInWithPassword({ email, password: senha });
    if (login.error) {
      botao.disabled = false;
      toast(mensagemErro(login.error), "err");
      return;
    }
    sessao = login.data.session;
  } else if (cadastro.error) {
    botao.disabled = false;
    toast(mensagemErro(cadastro.error), "err");
    return;
  } else {
    sessao = cadastro.data.session;
  }
  if (!sessao) {
    botao.disabled = false;
    toast("O Supabase pediu confirmação de e-mail. Desative “Confirm email” e tente de novo.", "err");
    return;
  }
  if (primeiro) {
    const carga = Math.round(Number(form.carga.value || 20) * 60);
    const { error } = await supabase.rpc("criar_primeiro_organizador", {
      p_nome: form.nome.value.trim(),
      p_cpf: digitos(form.cpf.value) || null,
      p_matricula: matriculaNormalizada(form.matricula.value) || null,
      p_telefone: form.telefone.value.trim(),
      p_instituicao: form.instituicao.value.trim() || "IFPB",
      p_carga_horaria_minutos: carga,
    });
    if (error) {
      botao.disabled = false;
      toast(mensagemErro(error), "err");
      return;
    }
  } else {
    const { data, error } = await supabase.rpc("vincular_organizador");
    if (error || !data?.id) {
      await supabase.auth.signOut();
      botao.disabled = false;
      toast(error ? mensagemErro(error) : "Este e-mail não foi cadastrado pela coordenação.", "err");
      return;
    }
  }
  await entrar();
}

async function entrar() {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) {
    await mostrarAcesso();
    return;
  }
  let { data: perfil, error } = await supabase
    .from("organizadores")
    .select("*")
    .eq("user_id", sessao.session.user.id)
    .maybeSingle();
  if (error) {
    root.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    return;
  }
  if (!perfil) {
    const vinculo = await supabase.rpc("vincular_organizador");
    if (vinculo.data?.id) {
      const deNovo = await supabase.from("organizadores").select("*").eq("user_id", sessao.session.user.id).maybeSingle();
      perfil = deNovo.data;
    }
  }
  if (!perfil) {
    await supabase.auth.signOut();
    await mostrarAcesso("Este e-mail não está na lista da organização.");
    return;
  }
  state.perfil = perfil;
  montarApp();
  await recarregar();
}

function montarApp() {
  root.innerHTML = `
    <div class="admin">
      <aside class="admin-side">
        <p><strong>${esc(state.perfil.nome)}</strong><br><small>${esc(FUNCOES[state.perfil.funcao] || "")}</small></p>
        <nav class="admin-menu" aria-label="Organização">
          <button type="button" data-action="secao" data-secao="painel">Painel</button>
          <button type="button" data-action="secao" data-secao="atividades">Atividades</button>
          <button type="button" data-action="secao" data-secao="inscricoes">Inscrições</button>
          <button type="button" data-action="secao" data-secao="organizadores">Organizadores</button>
          ${state.perfil.funcao === "coordenacao" ? `<button type="button" data-action="secao" data-secao="checkin">Check-in</button>` : ""}
          ${state.perfil.funcao === "coordenacao" ? `<button type="button" data-action="secao" data-secao="trabalhos">Trabalhos</button>` : ""}
          ${state.perfil.pode_avaliar_trabalhos ? `<button type="button" data-action="secao" data-secao="avaliacoes">Avaliações</button>` : ""}
          <button type="button" data-action="secao" data-secao="certificados">Certificados</button>
        </nav>
        <button type="button" class="sair" data-action="sair">Sair</button>
      </aside>
      <div id="conteudo"></div>
    </div>
    <dialog id="dialogo"></dialog>`;
  if (!ouvintes) {
    ouvintes = true;
    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
  }
}

async function recarregar() {
  const box = document.getElementById("conteudo");
  if (box && !box.childElementCount) box.innerHTML = `<p class="empty">Carregando dados…</p>`;
  try {
    const [ev, ins, org, cert] = await Promise.all([
      supabase.from("eventos").select("*, evento_avaliadores(*)").order("data").order("horario_inicio"),
      supabase.from("inscricoes").select("*, participantes(*), eventos(id, titulo, data, horario_inicio, localizacao, capacidade)").order("created_at", { ascending: false }),
      supabase.from("organizadores").select("*").order("nome"),
      supabase.from("certificados").select("*").order("emitido_em", { ascending: false }),
    ]);
    for (const resposta of [ev, ins, org, cert]) {
      if (resposta.error) throw resposta.error;
    }
    state.eventos = ev.data || [];
    state.inscricoes = ins.data || [];
    state.organizadores = org.data || [];
    state.certificados = cert.data || [];
    const trab = await supabase.from("trabalhos")
      .select("*, avaliador:organizadores!avaliador_id(id, nome)")
      .order("created_at", { ascending: false });
    if (trab.error) {
      state.trabalhos = [];
      state.trabalhosErro = mensagemErro(trab.error);
    } else {
      state.trabalhos = trab.data || [];
      state.trabalhosErro = "";
    }
    if (state.trabalhoAberto && !state.trabalhos.some((item) => item.id === state.trabalhoAberto)) {
      state.trabalhoAberto = null;
    }
    render();
  } catch (error) {
    if (box) box.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    else toast(mensagemErro(error), "err");
  }
}

function render() {
  document.querySelectorAll(".admin-menu button").forEach((botao) => {
    botao.setAttribute("aria-current", botao.dataset.secao === state.secao ? "true" : "false");
  });
  const box = document.getElementById("conteudo");
  if (!box) return;
  if (state.secao === "painel") box.innerHTML = htmlPainel();
  else if (state.secao === "atividades") box.innerHTML = htmlAtividades();
  else if (state.secao === "inscricoes") renderInscricoes(true);
  else if (state.secao === "checkin") box.innerHTML = htmlCheckin();
  else if (state.secao === "organizadores") box.innerHTML = htmlOrganizadores();
  else if (state.secao === "trabalhos") box.innerHTML = htmlTrabalhos();
  else if (state.secao === "avaliacoes") box.innerHTML = htmlAvaliacoes();
  else if (state.secao === "certificados") box.innerHTML = htmlCertificados();
  if (state.secao === "trabalhos" || state.secao === "avaliacoes") preencherPdfs();
}

function htmlCheckin() {
  return `
    <h1>Check-in</h1>
    <p>No dia de início do evento, 23 de novembro, busque a pessoa inscrita e confirme a presença. As inscrições confirmadas passam a presente e o certificado fica disponível na conta dela. Quem está só na lista de espera não entra neste check-in.</p>
    <label class="field">Nome, e-mail ou CPF
      <input id="checkin-q" value="${esc(state.buscaCheckin)}" placeholder="Buscar participante inscrito" autocomplete="off">
    </label>
    <div id="checkin-lista">${htmlListaCheckin()}</div>`;
}

function pessoasCheckin() {
  const q = state.buscaCheckin.trim().toLowerCase();
  const dig = digitos(q);
  const mapa = new Map();
  for (const item of state.inscricoes) {
    const pessoa = item.participantes;
    if (!pessoa) continue;
    if (!mapa.has(pessoa.id)) mapa.set(pessoa.id, { pessoa, itens: [] });
    mapa.get(pessoa.id).itens.push(item);
  }
  let lista = [...mapa.values()];
  if (q) {
    lista = lista.filter(({ pessoa }) => {
      const nome = (pessoa.nome || "").toLowerCase();
      const email = (pessoa.email || "").toLowerCase();
      return nome.includes(q) || email.includes(q) || (dig.length >= 3 && (pessoa.cpf || "").includes(dig));
    });
  }
  lista.sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR"));
  return lista;
}

function htmlListaCheckin() {
  const lista = pessoasCheckin();
  if (!state.buscaCheckin.trim()) {
    return `<p class="empty">${lista.length} pessoa(s) inscrita(s). Digite o nome, o e-mail ou o CPF para localizar.</p>`;
  }
  if (lista.length === 0) return `<p class="empty">Nenhuma pessoa inscrita encontrada.</p>`;
  return lista.map(({ pessoa, itens }) => {
    const confirmadas = itens.filter((item) => item.status === "confirmada").length;
    const presentes = itens.filter((item) => item.status === "presente").length;
    const encerrado = confirmadas === 0 && pessoa.checkin_em;
    return `
      <article class="painel-branco">
        <h2>${esc(pessoa.nome)}</h2>
        <p>${esc(pessoa.email)} · CPF ${esc(formatCpf(pessoa.cpf))}</p>
        <p>${pessoa.checkin_em ? `Check-in em ${esc(formatarQuando(pessoa.checkin_em))}.` : "Ainda sem check-in."} ${presentes} presença(s), ${confirmadas} confirmação(ões) em aberto.</p>
        <ul>${itens.map((item) => `<li>${esc(item.eventos?.titulo || "Atividade")} — <span class="status ${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span></li>`).join("")}</ul>
        <button type="button" class="btn btn-primary" data-action="checkin" data-id="${esc(pessoa.id)}" ${encerrado ? "disabled" : ""}>Confirmar presença</button>
      </article>`;
  }).join("");
}

function htmlPainel() {
  const ativas = state.inscricoes.filter((item) => item.status === "confirmada" || item.status === "presente").length;
  const presentes = state.inscricoes.filter((item) => item.status === "presente").length;
  const proximas = [...state.eventos].filter((ev) => ev.publicado).sort(comparar).slice(0, 6);
  return `
    <div class="stat-grid">
      <article class="stat"><b>${state.eventos.length}</b> atividades</article>
      <article class="stat"><b>${ativas}</b> inscrições ativas</article>
      <article class="stat"><b>${presentes}</b> presenças</article>
      <article class="stat"><b>${state.certificados.length}</b> certificados</article>
    </div>
    ${state.perfil.funcao === "coordenacao" ? `<p><button type="button" class="btn btn-small btn-dark" data-action="secao" data-secao="checkin">Check-in do dia 23</button> ${state.trabalhos.filter((item) => item.status === "submetido" || item.status === "com_coordenacao").length} trabalho(s) aguardando encaminhamento.</p>${state.trabalhosErro ? `<p class="erro">${esc(state.trabalhosErro)}</p>` : ""}` : ""}
    <h2>Publicadas</h2>
    ${proximas.length === 0
      ? `<p class="empty">Nenhuma atividade publicada. Cadastre a primeira em Atividades.</p>`
      : `<div class="itens">${proximas.map((ev) => `<article class="item-prog ${esc(ev.eixo)}"><div class="item-hora"><strong>${esc(horaCurta(ev.horario_inicio))}</strong><span>${esc(String(ev.data).slice(8, 10))}/11</span></div><div><strong>${esc(ev.titulo)}</strong><p class="meta">${esc(ev.localizacao)} · ${esc(ev.responsavel_nome)}</p></div></article>`).join("")}</div>`}`;
}

function htmlAtividades() {
  const conflitos = idsEmConflito(state.eventos);
  const linhas = [...state.eventos].sort(comparar).map((ev) => {
    const ocupadas = ocupacao(ev.id);
    const aval = (ev.evento_avaliadores || []).map((pessoa) => pessoa.nome).join(", ");
    return `
      <tr>
        <td>
          <span class="badge ${esc(ev.eixo)}">${esc(EIXOS[ev.eixo] || "")}</span>
          <br><strong>${esc(ev.titulo)}</strong>
          <div class="hint">${esc(TIPOS[ev.tipo] || "")} · ${esc(FORMAS[ev.forma_inscricao] || "")}</div>
          ${aval ? `<div class="hint">Avaliadores: ${esc(aval)}</div>` : ""}
          ${conflitos.has(ev.id) ? `<div class="conflito">Horário cruzado com outra atividade no mesmo local.</div>` : ""}
        </td>
        <td>${esc(rotuloQuando(ev))}<br>${esc(ev.localizacao)}<br><span class="hint">${esc(ev.responsavel_nome)}</span></td>
        <td>${ocupadas}/${ev.capacidade}</td>
        <td>${ev.publicado ? "Publicada" : "Oculta"}</td>
        <td>
          <button type="button" class="btn btn-small btn-ghost" data-action="editar" data-id="${esc(ev.id)}">Editar</button>
          <button type="button" class="btn btn-small btn-ghost" data-action="publicar" data-id="${esc(ev.id)}">${ev.publicado ? "Ocultar" : "Publicar"}</button>
          <button type="button" class="btn btn-small btn-danger" data-action="excluir" data-id="${esc(ev.id)}">Excluir</button>
        </td>
      </tr>`;
  }).join("");
  return `
    <div class="admin-top">
      <h2>Atividades</h2>
      <button type="button" class="btn btn-primary" data-action="nova">Nova atividade</button>
    </div>
    ${linhas ? `<div class="table-wrap"><table><thead><tr><th>Atividade</th><th>Quando</th><th>Vagas</th><th>Grade</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<p class="empty">Nenhuma atividade cadastrada.</p>`}`;
}

function renderInscricoes(rebuild) {
  const box = document.getElementById("conteudo");
  if (rebuild || !document.getElementById("corpo-insc")) {
    const opcoes = [...state.eventos].sort(comparar).map((ev) => `<option value="${esc(ev.id)}">${esc(rotuloQuando(ev))} · ${esc(ev.titulo)}</option>`).join("");
    box.innerHTML = `
      <div class="admin-top">
        <h2>Inscrições</h2>
        <button type="button" class="btn btn-ghost" data-action="exportar">Exportar CSV</button>
      </div>
      <div class="filtros">
        <label class="field">Atividade
          <select id="filtro-evento"><option value="">Todas</option>${opcoes}</select>
        </label>
        <label class="field">Situação
          <select id="filtro-status"><option value="">Todas</option>${optionsHtml(STATUS)}</select>
        </label>
        <label class="field">Busca
          <input id="filtro-q" type="search" placeholder="Nome, e-mail ou CPF">
        </label>
      </div>
      <div class="linha-acoes" id="acoes-evento"></div>
      <p id="resumo-insc"></p>
      <div class="table-wrap"><table>
        <thead><tr><th>Participante</th><th>Atividade</th><th>Situação</th><th></th></tr></thead>
        <tbody id="corpo-insc"></tbody>
      </table></div>
      <details class="painel-branco">
        <summary>Registrar participante manualmente</summary>
        <form id="form-manual">
          <div class="grid-2">
            <label class="field">Nome completo <input name="nome" required></label>
            <label class="field">E-mail <input name="email" type="email" required></label>
            <label class="field">CPF <input name="cpf" data-mask="cpf" required></label>
            <label class="field">Telefone <input name="telefone" data-mask="tel"></label>
            <label class="field">Instituição <input name="instituicao"></label>
            <label class="field">Categoria <select name="categoria" required>${optionsHtml(CATEGORIAS)}</select></label>
            <label class="field">Atividade <select name="evento_id" required><option value="">Escolha</option>${opcoes}</select></label>
            <label class="field">Situação <select name="status">${optionsHtml({ confirmada: "Confirmada", lista_espera: "Lista de espera", presente: "Presente" }, "confirmada")}</select></label>
          </div>
          <button class="btn btn-dark" type="submit">Registrar</button>
        </form>
      </details>`;
    document.getElementById("filtro-evento").value = state.filtro.evento;
    document.getElementById("filtro-status").value = state.filtro.status;
    document.getElementById("filtro-q").value = state.filtro.q;
  }
  pintarInscricoes();
}

function inscricoesFiltradas() {
  const q = state.filtro.q.trim().toLowerCase();
  const qDigitos = digitos(q);
  return state.inscricoes.filter((item) => {
    if (state.filtro.evento && item.evento_id !== state.filtro.evento) return false;
    if (state.filtro.status && item.status !== state.filtro.status) return false;
    if (!q) return true;
    const pessoa = item.participantes || {};
    const texto = `${pessoa.nome || ""} ${pessoa.email || ""}`.toLowerCase();
    return texto.includes(q) || (qDigitos && digitos(pessoa.cpf).includes(qDigitos));
  });
}

function pintarInscricoes() {
  const lista = inscricoesFiltradas();
  const certPorInscricao = new Map(state.certificados.filter((cert) => cert.inscricao_id).map((cert) => [cert.inscricao_id, cert]));
  const corpo = document.getElementById("corpo-insc");
  const resumo = document.getElementById("resumo-insc");
  const acoes = document.getElementById("acoes-evento");
  if (!corpo) return;
  resumo.textContent = `${lista.length} ${lista.length === 1 ? "inscrição" : "inscrições"} nesta lista.`;
  const eventoId = state.filtro.evento;
  acoes.innerHTML = eventoId ? `
    <button type="button" class="btn btn-small btn-dark" data-action="marcar-presentes" data-id="${esc(eventoId)}">Marcar presentes confirmados</button>
    <button type="button" class="btn btn-small btn-ghost" data-action="promover" data-id="${esc(eventoId)}">Promover lista de espera</button>` : "";
  corpo.innerHTML = lista.map((item) => {
    const pessoa = item.participantes || {};
    const atividade = item.eventos || {};
    const cert = certPorInscricao.get(item.id);
    return `
      <tr>
        <td><strong>${esc(pessoa.nome || "")}</strong><br><span class="hint">${esc(pessoa.email || "")} · ${esc(formatCpf(pessoa.cpf || ""))}</span></td>
        <td>${esc(atividade.titulo || "")}</td>
        <td><span class="status ${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span></td>
        <td>
          ${item.status !== "confirmada" ? `<button type="button" class="btn btn-small btn-ghost" data-action="status" data-status="confirmada" data-id="${esc(item.id)}">Confirmar</button>` : ""}
          ${item.status !== "presente" ? `<button type="button" class="btn btn-small btn-ghost" data-action="status" data-status="presente" data-id="${esc(item.id)}">Presença</button>` : ""}
          ${item.status !== "lista_espera" ? `<button type="button" class="btn btn-small btn-ghost" data-action="status" data-status="lista_espera" data-id="${esc(item.id)}">Espera</button>` : ""}
          ${item.status !== "cancelada" ? `<button type="button" class="btn btn-small btn-danger" data-action="status" data-status="cancelada" data-id="${esc(item.id)}">Cancelar</button>` : ""}
          ${cert ? `<a class="btn btn-small btn-dark" href="certificado.html?codigo=${esc(cert.codigo)}">Certificado</a>` : ""}
          ${item.status === "presente" && !cert ? `<button type="button" class="btn btn-small btn-dark" data-action="emitir-part" data-id="${esc(item.id)}">Emitir</button>` : ""}
        </td>
      </tr>`;
  }).join("") || `<tr><td colspan="4">Nenhuma inscrição encontrada.</td></tr>`;
}

function htmlOrganizadores() {
  return `
    <h2>Organizadores</h2>
    <form id="form-org" class="painel-branco">
      <input type="hidden" name="registro">
      <div class="grid-2">
        <label class="field">Nome completo <input name="nome" required></label>
        <label class="field">E-mail de acesso <input name="email" type="email" required></label>
        <label class="field">CPF <input name="cpf" data-mask="cpf"></label>
        <label class="field">Matrícula <input name="matricula" maxlength="30" autocomplete="off"></label>
        <label class="field">Telefone <input name="telefone" data-mask="tel"></label>
        <label class="field">Função <select name="funcao">${optionsHtml(FUNCOES, "comissao")}</select></label>
        <label class="field">Eixo <select name="eixo">${optionsHtml(EIXOS, "geral")}</select></label>
        <label class="field">Instituição <input name="instituicao" value="IFPB"></label>
        <label class="field">Carga horária do certificado (horas)
          <input name="carga" type="number" min="1" max="100" step="0.5" value="20" required>
        </label>
      </div>
      <label class="field"><span><input type="checkbox" name="pode_avaliar"> Pode avaliar trabalhos científicos</span></label>
      <p class="hint">Informe o CPF, a matrícula ou os dois. Quem ainda não tem senha entra em Organização → Criar acesso, com este e-mail. Só entra na lista de encaminhamento quem estiver marcado e já tiver senha.</p>
      <div class="linha-acoes">
        <button class="btn btn-dark" type="submit">Salvar organizador</button>
        <button class="btn btn-ghost" type="button" data-action="limpar-org">Limpar</button>
      </div>
    </form>
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Função</th><th>Acesso</th><th>Certificado</th><th></th></tr></thead>
      <tbody>
        ${state.organizadores.map((org) => {
          const cert = state.certificados.find((item) => item.organizador_id === org.id && item.tipo === "organizador");
          return `<tr>
            <td><strong>${esc(org.nome)}</strong><br><span class="hint">${esc(org.email)} · ${esc(textoDocumentoOrganizador(org))}${org.pode_avaliar_trabalhos ? " · avalia trabalhos" : ""}</span></td>
            <td>${esc(FUNCOES[org.funcao] || "")}<br><span class="hint">${esc(EIXOS[org.eixo] || "")} · ${esc(formatCarga(org.carga_horaria_minutos))}</span></td>
            <td>${org.user_id ? "Com senha" : "Aguardando senha"}</td>
            <td>${cert ? `<a href="certificado.html?codigo=${esc(cert.codigo)}">${esc(cert.codigo)}</a>` : "Não emitido"}</td>
            <td>
              <button type="button" class="btn btn-small btn-ghost" data-action="editar-org" data-id="${esc(org.id)}">Editar</button>
              <button type="button" class="btn btn-small btn-danger" data-action="excluir-org" data-id="${esc(org.id)}">Excluir</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

function htmlCertificados() {
  const orgsPendentes = state.organizadores.filter((org) => !state.certificados.some((cert) => cert.organizador_id === org.id && cert.tipo === "organizador"));
  const avals = state.eventos.flatMap((ev) => (ev.evento_avaliadores || []).map((pessoa) => ({ ...pessoa, evento: ev.titulo })));
  const avalsPendentes = avals.filter((pessoa) => !state.certificados.some((cert) => cert.avaliador_id === pessoa.id && cert.tipo === "avaliador"));
  return `
    <div class="admin-top">
      <h2>Certificados</h2>
      <button type="button" class="btn btn-primary" data-action="emitir-pendentes">Emitir pendentes da organização e dos avaliadores</button>
    </div>
    <p class="hint">O certificado do participante sai sozinho quando a presença é marcada. Organizadores e avaliadores são emitidos aqui. O organizador retira com o e-mail e o CPF ou a matrícula. Para o avaliador retirar pelo CPF, cadastre CPF e e-mail dele na atividade.</p>
    ${orgsPendentes.length || avalsPendentes.length ? `<p>${orgsPendentes.length} organizador(es) e ${avalsPendentes.length} avaliador(es) sem certificado.</p>` : `<p>Não há certificados pendentes da organização nem dos avaliadores.</p>`}
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th>Pessoa</th><th>Tipo</th><th>Referência</th><th></th></tr></thead>
      <tbody>
        ${state.certificados.map((cert) => `<tr>
          <td>${esc(cert.codigo)}</td>
          <td>${esc(cert.nome_snapshot)}</td>
          <td>${esc(cert.tipo)}</td>
          <td>${esc(cert.descricao_snapshot)}<br><span class="hint">${esc(formatCarga(cert.carga_horaria_minutos))}</span></td>
          <td>
            <a class="btn btn-small btn-dark" href="certificado.html?codigo=${esc(cert.codigo)}">Abrir</a>
            <button type="button" class="btn btn-small btn-danger" data-action="excluir-cert" data-id="${esc(cert.id)}">Cancelar</button>
          </td>
        </tr>`).join("") || `<tr><td colspan="5">Nenhum certificado emitido.</td></tr>`}
      </tbody>
    </table></div>`;
}

function professoresAvaliadores() {
  return state.organizadores.filter((org) => org.pode_avaliar_trabalhos && org.user_id);
}

function htmlTrabalhos() {
  if (state.perfil.funcao !== "coordenacao") return `<p class="empty">A coordenação acompanha os trabalhos submetidos.</p>`;
  const aberto = state.trabalhos.find((item) => item.id === state.trabalhoAberto);
  return `
    <h2>Trabalhos submetidos</h2>
    ${state.trabalhosErro ? `<p class="erro">${esc(state.trabalhosErro)}</p>` : ""}
    <p class="hint">Aceite o trabalho escolhendo um professor com acesso. Cancelar o envio devolve o arquivo para a coordenação, que pode encaminhar de novo.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Trabalho</th><th>Autor</th><th>Status</th><th>Professor</th><th></th></tr></thead>
      <tbody>
        ${state.trabalhos.map((trabalho) => `<tr>
          <td><strong>${esc(trabalho.protocolo)}</strong><br>${esc(trabalho.titulo)}</td>
          <td>${esc(trabalho.autor_nome)}<br><span class="hint">${esc(trabalho.autor_email)}</span></td>
          <td><span class="status ${esc(trabalho.status)}">${esc(STATUS_TRABALHO[trabalho.status] || trabalho.status)}</span></td>
          <td>${esc(trabalho.avaliador?.nome || "—")}</td>
          <td><button type="button" class="btn btn-small btn-ghost" data-action="abrir-trabalho" data-id="${esc(trabalho.id)}">${state.trabalhoAberto === trabalho.id ? "Fechar" : "Abrir"}</button></td>
        </tr>`).join("") || `<tr><td colspan="5">Nenhum trabalho submetido.</td></tr>`}
      </tbody>
    </table></div>
    ${aberto ? htmlDetalheTrabalho(aberto, "coordenacao") : ""}`;
}

function htmlAvaliacoes() {
  const lista = state.trabalhos.filter((item) => item.avaliador_id === state.perfil.id);
  const aberto = lista.find((item) => item.id === state.trabalhoAberto);
  return `
    <h2>Avaliações</h2>
    ${state.trabalhosErro ? `<p class="erro">${esc(state.trabalhosErro)}</p>` : ""}
    <p class="hint">Abra o PDF, escreva o parecer e devolva para a coordenação. O aluno vê a recomendação e o texto, sem o seu nome.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Trabalho</th><th>Autor</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${lista.map((trabalho) => `<tr>
          <td><strong>${esc(trabalho.protocolo)}</strong><br>${esc(trabalho.titulo)}</td>
          <td>${esc(trabalho.autor_nome)}</td>
          <td><span class="status ${esc(trabalho.status)}">${esc(STATUS_TRABALHO[trabalho.status] || trabalho.status)}</span></td>
          <td><button type="button" class="btn btn-small btn-ghost" data-action="abrir-trabalho" data-id="${esc(trabalho.id)}">${state.trabalhoAberto === trabalho.id ? "Fechar" : "Abrir"}</button></td>
        </tr>`).join("") || `<tr><td colspan="4">Nenhum trabalho encaminhado para você.</td></tr>`}
      </tbody>
    </table></div>
    ${aberto ? htmlDetalheTrabalho(aberto, "professor") : ""}`;
}

function htmlDetalheTrabalho(trabalho, modo) {
  const professores = professoresAvaliadores();
  return `
    <article class="painel-branco" id="detalhe-trabalho">
      <p><span class="status ${esc(trabalho.status)}">${esc(STATUS_TRABALHO[trabalho.status] || trabalho.status)}</span> · ${esc(trabalho.protocolo)}</p>
      <h3>${esc(trabalho.titulo)}</h3>
      <p>${esc(EIXOS[trabalho.eixo] || "")}</p>
      <p><strong>${esc(trabalho.autor_nome)}</strong> · ${esc(trabalho.autor_email)}</p>
      ${modo === "coordenacao" && trabalho.avaliador?.nome ? `<p>Professor avaliador: <strong>${esc(trabalho.avaliador.nome)}</strong></p>` : ""}
      ${trabalho.recomendacao ? `<p>Recomendação: <strong>${esc(RECOMENDACOES[trabalho.recomendacao] || "")}</strong></p>` : ""}
      ${trabalho.parecer ? `<div class="trabalho-secoes"><p>${esc(trabalho.parecer)}</p></div>` : ""}
      ${trabalho.arquivo
        ? `<p><a class="btn btn-dark" data-caminho="${esc(trabalho.arquivo)}" href="#" target="_blank" rel="noopener">Abrir PDF</a></p>`
        : `<p class="hint">PDF ainda não anexado.</p>`}
      ${modo === "coordenacao" && trabalho.status !== "em_avaliacao" ? `
        <form id="form-encaminhar">
          <input type="hidden" name="trabalho" value="${esc(trabalho.id)}">
          <label class="field">Professor
            <select name="professor" required>
              <option value="">Escolha</option>
              ${professores.map((org) => `<option value="${esc(org.id)}">${esc(org.nome)}</option>`).join("")}
            </select>
          </label>
          ${professores.length ? "" : `<p class="hint">Marque “Pode avaliar trabalhos” em um organizador que já criou senha.</p>`}
          <button class="btn btn-dark" type="submit" ${professores.length && trabalho.arquivo ? "" : "disabled"}>Aceitar e encaminhar</button>
        </form>` : ""}
      ${modo === "coordenacao" && trabalho.status === "em_avaliacao" ? `<button type="button" class="btn btn-danger" data-action="cancelar-envio" data-id="${esc(trabalho.id)}">Cancelar envio</button>` : ""}
      ${modo === "professor" && trabalho.status === "em_avaliacao" ? `
        <form id="form-parecer">
          <input type="hidden" name="trabalho" value="${esc(trabalho.id)}">
          <label class="field">Recomendação
            <select name="recomendacao">
              ${Object.entries(RECOMENDACOES).map(([valor, rotulo]) => `<option value="${esc(valor)}">${esc(rotulo)}</option>`).join("")}
            </select>
          </label>
          <label class="field">Parecer
            <textarea name="parecer" required minlength="20" maxlength="8000"></textarea>
          </label>
          <button class="btn btn-dark" type="submit">Devolver à coordenação</button>
        </form>` : ""}
    </article>`;
}

async function preencherPdfs() {
  const links = [...document.querySelectorAll("a[data-caminho]")];
  await Promise.all(links.map(async (link) => {
    const { data } = await supabase.storage.from("trabalhos").createSignedUrl(link.dataset.caminho, 60 * 30);
    if (data?.signedUrl && link.isConnected) link.href = data.signedUrl;
  }));
}

async function encaminharTrabalho(form) {
  const { error } = await supabase.rpc("encaminhar_trabalho", {
    p_id: form.trabalho.value,
    p_professor: form.professor.value,
  });
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  toast("Trabalho encaminhado para avaliação.");
  await recarregar();
}

async function cancelarEnvio(id) {
  const { error } = await supabase.rpc("cancelar_encaminhamento", { p_id: id });
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  toast("Envio cancelado. O trabalho voltou para a coordenação.");
  await recarregar();
}

async function devolverParecer(form) {
  if (!form.reportValidity()) return;
  const { error } = await supabase.rpc("devolver_parecer", {
    p_id: form.trabalho.value,
    p_recomendacao: form.recomendacao.value,
    p_parecer: form.parecer.value.trim(),
  });
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  toast("Parecer devolvido à coordenação.");
  await recarregar();
}

function abrirEditor(ev) {
  const dialogo = document.getElementById("dialogo");
  const avaliadores = ev?.evento_avaliadores?.length ? ev.evento_avaliadores : [{}];
  const locais = [...new Set(state.eventos.map((item) => item.localizacao).filter(Boolean))];
  dialogo.innerHTML = `
    <div class="dialog-head">
      <h3>${ev ? "Editar atividade" : "Nova atividade"}</h3>
      <button type="button" class="btn btn-small btn-ghost" data-action="fechar">Fechar</button>
    </div>
    <div class="dialog-body">
      <form id="form-evento">
        <input type="hidden" name="registro" value="${esc(ev?.id || "")}">
        <label class="field">Título <input name="titulo" required maxlength="180" value="${esc(ev?.titulo || "")}"></label>
        <div class="grid-2">
          <label class="field">Tipo <select name="tipo">${optionsHtml(TIPOS, ev?.tipo || "palestra")}</select></label>
          <label class="field">Eixo <select name="eixo">${optionsHtml(EIXOS, ev?.eixo || "secitec")}</select></label>
          <label class="field">Responsável <input name="responsavel_nome" required maxlength="160" value="${esc(ev?.responsavel_nome || "")}"></label>
          <label class="field">E-mail do responsável <input name="responsavel_email" type="email" value="${esc(ev?.responsavel_email || "")}"></label>
          <label class="field">Dia <select name="data" required>${DIAS.map((dia) => `<option value="${dia.data}"${String(ev?.data || "").slice(0, 10) === dia.data ? " selected" : ""}>${dia.num} de novembro, ${dia.semana}</option>`).join("")}</select></label>
          <label class="field">Início <input name="horario_inicio" type="time" required value="${esc(horaCurta(ev?.horario_inicio || "08:00"))}"></label>
          <label class="field">Duração (minutos)
            <input name="duracao_minutos" type="number" min="10" max="600" required value="${esc(ev?.duracao_minutos || 60)}">
          </label>
          <label class="field">Capacidade <input name="capacidade" type="number" min="1" max="5000" required value="${esc(ev?.capacidade || 30)}"></label>
        </div>
        <div class="presets">
          ${[30, 45, 60, 90, 120, 180, 240].map((minutos) => `<button type="button" class="btn-small" data-action="duracao" data-minutos="${minutos}">${minutos} min</button>`).join("")}
        </div>
        <p class="hint" data-fim></p>
        <label class="field">Local
          <input name="localizacao" required maxlength="160" list="locais" value="${esc(ev?.localizacao || "")}">
        </label>
        <datalist id="locais">${locais.map((local) => `<option value="${esc(local)}"></option>`).join("")}</datalist>
        <div class="grid-2">
          <label class="field">Forma de inscrição <select name="forma_inscricao">${optionsHtml(FORMAS, ev?.forma_inscricao || "online")}</select></label>
          <label class="field" data-link>Link externo <input name="link_externo" type="url" value="${esc(ev?.link_externo || "")}" placeholder="https://"></label>
          <label class="field span-2">Carga horária no certificado (horas)
            <input name="carga" type="number" min="0.25" max="100" step="0.25" value="${esc(horasParaInput(ev?.carga_horaria_minutos || ev?.duracao_minutos || 60))}">
            <span class="hint">Pode ser diferente da duração deste horário, quando a atividade continua em outro dia.</span>
          </label>
        </div>
        <label class="field">Descrição <textarea name="descricao" maxlength="4000">${esc(ev?.descricao || "")}</textarea></label>
        <label class="field">Observação para a programação <input name="observacao" maxlength="400" value="${esc(ev?.observacao || "")}"></label>
        <label class="field"><span><input type="checkbox" name="requer_avaliacao" ${ev?.requer_avaliacao ? "checked" : ""}> Esta atividade tem professores avaliadores</span></label>
        <label class="field"><span><input type="checkbox" name="publicado" ${ev ? (ev.publicado ? "checked" : "") : "checked"}> Publicar na programação</span></label>
        <h3>Professores avaliadores</h3>
        <div id="avaliadores">${avaliadores.map(htmlAval).join("")}</div>
        <button type="button" class="btn btn-small btn-ghost" data-action="add-avaliador">Adicionar avaliador</button>
        <p class="erro" id="erro-evento"></p>
        <button class="btn btn-primary" type="submit">Salvar atividade</button>
      </form>
    </div>`;
  toggleLink();
  atualizarFim();
  dialogo.showModal();
}

function htmlAval(pessoa = {}) {
  return `
    <div class="aval-row">
      <input type="hidden" name="aval_id" value="${esc(pessoa.id || "")}">
      <label class="field">Nome <input name="aval_nome" value="${esc(pessoa.nome || "")}" maxlength="160"></label>
      <label class="field">E-mail <input name="aval_email" type="email" value="${esc(pessoa.email || "")}"></label>
      <label class="field">CPF <input name="aval_cpf" data-mask="cpf" value="${esc(pessoa.cpf ? formatCpf(pessoa.cpf) : "")}"></label>
      <label class="field">Titulação <input name="aval_titulacao" value="${esc(pessoa.titulacao || "")}" maxlength="80" placeholder="Doutor(a)"></label>
      <button type="button" class="btn btn-small btn-ghost" data-action="remover-avaliador">Remover</button>
    </div>`;
}

async function salvarEvento(form) {
  const erro = document.getElementById("erro-evento");
  erro.textContent = "";
  if (!form.reportValidity()) return;
  const forma = form.forma_inscricao.value;
  if (forma === "link_externo" && !safeUrl(form.link_externo.value)) {
    erro.textContent = "Informe um link http ou https.";
    return;
  }
  const linhas = [...form.querySelectorAll(".aval-row")].map((linha) => ({
    id: linha.querySelector("[name=aval_id]").value,
    nome: linha.querySelector("[name=aval_nome]").value.trim(),
    email: linha.querySelector("[name=aval_email]").value.trim().toLowerCase(),
    cpf: digitos(linha.querySelector("[name=aval_cpf]").value),
    titulacao: linha.querySelector("[name=aval_titulacao]").value.trim(),
  })).filter((linha) => linha.nome || linha.email || linha.cpf || linha.titulacao);
  for (const linha of linhas) {
    if (linha.nome.split(/\s+/).length < 2) {
      erro.textContent = "Informe nome e sobrenome de cada avaliador.";
      return;
    }
    if (linha.cpf && !cpfValido(linha.cpf)) {
      erro.textContent = `CPF inválido para ${linha.nome}.`;
      return;
    }
  }
  if (form.requer_avaliacao.checked && linhas.length === 0) {
    const segue = confirm("Você marcou professores avaliadores, mas nenhum nome foi informado. Salvar mesmo assim?");
    if (!segue) return;
  }
  const cargaHoras = form.carga.value === "" ? null : Math.round(Number(form.carga.value) * 60);
  const payload = {
    titulo: form.titulo.value.trim(),
    descricao: form.descricao.value.trim() || null,
    observacao: form.observacao.value.trim() || null,
    tipo: form.tipo.value,
    eixo: form.eixo.value,
    responsavel_nome: form.responsavel_nome.value.trim(),
    responsavel_email: form.responsavel_email.value.trim() || null,
    data: form.data.value,
    horario_inicio: form.horario_inicio.value,
    duracao_minutos: Number(form.duracao_minutos.value),
    localizacao: form.localizacao.value.trim(),
    capacidade: Number(form.capacidade.value),
    forma_inscricao: forma,
    link_externo: forma === "link_externo" ? form.link_externo.value.trim() : null,
    carga_horaria_minutos: cargaHoras,
    requer_avaliacao: form.requer_avaliacao.checked,
    publicado: form.publicado.checked,
  };
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const idExistente = form.registro.value;
  let id = idExistente;
  if (idExistente) {
    const { error } = await supabase.from("eventos").update(payload).eq("id", idExistente);
    if (error) {
      botao.disabled = false;
      erro.textContent = mensagemErro(error);
      return;
    }
  } else {
    const { data, error } = await supabase.from("eventos").insert(payload).select("id").single();
    if (error) {
      botao.disabled = false;
      erro.textContent = mensagemErro(error);
      return;
    }
    id = data.id;
  }
  const atuais = new Set((state.eventos.find((ev) => ev.id === id)?.evento_avaliadores || []).map((pessoa) => pessoa.id));
  const mantidos = [];
  for (const linha of linhas) {
    const corpo = {
      evento_id: id,
      nome: linha.nome,
      email: linha.email || null,
      cpf: linha.cpf || null,
      titulacao: linha.titulacao || null,
    };
    if (linha.id) {
      const { error } = await supabase.from("evento_avaliadores").update(corpo).eq("id", linha.id);
      if (error) {
        botao.disabled = false;
        erro.textContent = mensagemErro(error);
        return;
      }
      mantidos.push(linha.id);
    } else {
      const { error } = await supabase.from("evento_avaliadores").insert(corpo);
      if (error) {
        botao.disabled = false;
        erro.textContent = mensagemErro(error);
        return;
      }
    }
  }
  const remover = [...atuais].filter((avalId) => !mantidos.includes(avalId));
  if (remover.length) {
    const { error } = await supabase.from("evento_avaliadores").delete().in("id", remover);
    if (error) {
      botao.disabled = false;
      erro.textContent = mensagemErro(error);
      return;
    }
  }
  document.getElementById("dialogo").close();
  toast("Atividade salva. A programação pública acompanha o que estiver publicado.");
  await recarregar();
}

async function salvarOrganizador(form) {
  if (!form.reportValidity()) return;
  if (!documentoOrganizadorValido(form)) return;
  if (form.nome.value.trim().split(/\s+/).length < 2) {
    toast("Informe nome e sobrenome.", "err");
    return;
  }
  const payload = {
    nome: form.nome.value.trim(),
    email: form.email.value.trim().toLowerCase(),
    cpf: digitos(form.cpf.value) || null,
    matricula: matriculaNormalizada(form.matricula.value) || null,
    telefone: form.telefone.value.trim() || null,
    funcao: form.funcao.value,
    eixo: form.eixo.value,
    instituicao: form.instituicao.value.trim() || "IFPB",
    carga_horaria_minutos: Math.round(Number(form.carga.value) * 60),
    pode_avaliar_trabalhos: form.pode_avaliar.checked,
  };
  const id = form.registro.value;
  const consulta = id
    ? supabase.from("organizadores").update(payload).eq("id", id)
    : supabase.from("organizadores").insert(payload);
  const { error } = await consulta;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  toast(id ? "Organizador atualizado." : "Organizador cadastrado. A pessoa cria a senha em Criar acesso.");
  await recarregar();
}

async function salvarManual(form) {
  if (!form.reportValidity()) return;
  if (!cpfValido(form.cpf.value)) {
    toast("CPF inválido.", "err");
    return;
  }
  const cpf = digitos(form.cpf.value);
  const email = form.email.value.trim().toLowerCase();
  const eventoId = form.evento_id.value;
  const status = form.status.value;
  const ev = state.eventos.find((item) => item.id === eventoId);
  if (ev && ocupacao(eventoId) >= ev.capacidade && status !== "lista_espera") {
    const segue = confirm("A capacidade desta atividade já foi atingida. Registrar mesmo assim?");
    if (!segue) return;
  }
  const corpo = {
    nome: form.nome.value.trim(),
    email,
    cpf,
    telefone: form.telefone.value.trim() || null,
    instituicao: form.instituicao.value.trim() || null,
    categoria: form.categoria.value,
  };
  const existente = await supabase.from("participantes").select("id").eq("cpf", cpf).maybeSingle();
  if (existente.error) throw existente.error;
  let participanteId = existente.data?.id;
  if (participanteId) {
    const atualizado = await supabase.from("participantes").update(corpo).eq("id", participanteId);
    if (atualizado.error) throw atualizado.error;
  } else {
    const criado = await supabase.from("participantes").insert(corpo).select("id").single();
    if (criado.error) throw criado.error;
    participanteId = criado.data.id;
  }
  const inscricao = await supabase.from("inscricoes").insert({
    participante_id: participanteId,
    evento_id: eventoId,
    status,
  });
  if (inscricao.error) {
    if (/duplicate|unique/i.test(inscricao.error.message)) {
      toast("Esta pessoa já está inscrita nesta atividade.", "err");
      return;
    }
    throw inscricao.error;
  }
  toast(status === "presente" ? "Presença registrada e certificado emitido." : "Participante registrado.");
  await recarregar();
}

async function onClick(evento) {
  const botao = evento.target.closest("[data-action]");
  if (!botao) return;
  const { action, id } = botao.dataset;
  try {
    if (action === "secao") {
      state.secao = botao.dataset.secao;
      render();
    } else if (action === "sair") {
      await supabase.auth.signOut();
      location.reload();
    } else if (action === "nova") abrirEditor(null);
    else if (action === "editar") abrirEditor(state.eventos.find((ev) => ev.id === id));
    else if (action === "fechar") document.getElementById("dialogo").close();
    else if (action === "duracao") {
      const form = document.getElementById("form-evento");
      form.duracao_minutos.value = botao.dataset.minutos;
      atualizarFim();
    } else if (action === "add-avaliador") {
      document.getElementById("avaliadores").insertAdjacentHTML("beforeend", htmlAval({}));
    } else if (action === "remover-avaliador") {
      const linhas = document.querySelectorAll("#avaliadores .aval-row");
      if (linhas.length === 1) {
        linhas[0].querySelectorAll("input").forEach((campo) => { campo.value = ""; });
      } else botao.closest(".aval-row").remove();
    } else if (action === "publicar") await alternarPublicacao(id);
    else if (action === "excluir") await excluirEvento(id);
    else if (action === "status") await mudarStatus(id, botao.dataset.status);
    else if (action === "checkin") await fazerCheckin(id);
    else if (action === "marcar-presentes") await marcarPresentes(id);
    else if (action === "promover") await promoverEspera(id);
    else if (action === "emitir-part") await emitirParticipante(id);
    else if (action === "exportar") exportarCsv();
    else if (action === "editar-org") preencherOrganizador(id);
    else if (action === "limpar-org") {
      document.getElementById("form-org").reset();
      document.getElementById("form-org").registro.value = "";
      document.getElementById("form-org").email.readOnly = false;
    } else if (action === "excluir-org") await excluirOrganizador(id);
    else if (action === "emitir-pendentes") await emitirPendentes();
    else if (action === "excluir-cert") await excluirCertificado(id);
    else if (action === "abrir-trabalho") {
      state.trabalhoAberto = state.trabalhoAberto === id ? null : id;
      render();
    } else if (action === "cancelar-envio") await cancelarEnvio(id);
  } catch (error) {
    toast(mensagemErro(error), "err");
  }
}

async function onSubmit(evento) {
  const form = evento.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!["form-evento", "form-org", "form-manual", "form-encaminhar", "form-parecer"].includes(form.id)) return;
  evento.preventDefault();
  try {
    if (form.id === "form-evento") await salvarEvento(form);
    else if (form.id === "form-org") await salvarOrganizador(form);
    else if (form.id === "form-encaminhar") await encaminharTrabalho(form);
    else if (form.id === "form-parecer") await devolverParecer(form);
    else await salvarManual(form);
  } catch (error) {
    toast(mensagemErro(error), "err");
  }
}

function onInput(evento) {
  mascarar(evento);
  if (evento.target?.closest?.("#form-evento")) atualizarFim();
  if (evento.target?.id === "filtro-q") {
    state.filtro.q = evento.target.value;
    pintarInscricoes();
  }
  if (evento.target?.id === "checkin-q") {
    state.buscaCheckin = evento.target.value;
    const lista = document.getElementById("checkin-lista");
    if (lista) lista.innerHTML = htmlListaCheckin();
  }
}

function onChange(evento) {
  if (evento.target?.name === "forma_inscricao") toggleLink();
  if (evento.target?.id === "filtro-evento" || evento.target?.id === "filtro-status") {
    state.filtro.evento = document.getElementById("filtro-evento").value;
    state.filtro.status = document.getElementById("filtro-status").value;
    pintarInscricoes();
  }
}

function mascarar(evento) {
  const campo = evento.target;
  if (!(campo instanceof HTMLInputElement)) return;
  if (campo.dataset.mask === "cpf") campo.value = maskCpf(campo.value);
  if (campo.dataset.mask === "tel") campo.value = maskPhone(campo.value);
}

function toggleLink() {
  const form = document.getElementById("form-evento");
  if (!form) return;
  const externo = form.forma_inscricao.value === "link_externo";
  form.querySelector("[data-link]").hidden = !externo;
  form.link_externo.required = externo;
}

function atualizarFim() {
  const form = document.getElementById("form-evento");
  if (!form) return;
  const fim = somarMinutos(form.horario_inicio.value, Number(form.duracao_minutos.value));
  const alvo = form.querySelector("[data-fim]");
  if (alvo) alvo.textContent = fim ? `Termina às ${fim}.` : "";
}

async function alternarPublicacao(id) {
  const ev = state.eventos.find((item) => item.id === id);
  const { error } = await supabase.from("eventos").update({ publicado: !ev.publicado }).eq("id", id);
  if (error) throw error;
  toast(ev.publicado ? "Atividade oculta na programação." : "Atividade publicada na programação.");
  await recarregar();
}

async function excluirEvento(id) {
  const ev = state.eventos.find((item) => item.id === id);
  const segue = confirm(`Excluir “${ev?.titulo || "atividade"}”? Se já houver inscrição ou certificado, a exclusão é bloqueada: use Ocultar.`);
  if (!segue) return;
  const { error } = await supabase.from("eventos").delete().eq("id", id);
  if (error) {
    if (/foreign key|violates|restrict/i.test(error.message)) {
      toast("Esta atividade já tem inscrições ou certificados. Oculte a publicação.", "err");
      return;
    }
    throw error;
  }
  toast("Atividade excluída.");
  await recarregar();
}

async function fazerCheckin(id) {
  const pessoa = state.inscricoes.find((item) => item.participantes?.id === id)?.participantes;
  const nome = pessoa?.nome || "esta pessoa";
  if (!confirm(`Confirmar a presença de ${nome}? As inscrições confirmadas recebem o certificado.`)) return;
  const { data, error } = await supabase.rpc("registrar_checkin", { p_participante: id });
  if (error) throw error;
  toast(data?.presencas
    ? `Presença confirmada. ${data.presencas} certificado(s) liberado(s).`
    : "Check-in registrado. Não havia inscrição confirmada em aberto.");
  await recarregar();
}

async function mudarStatus(id, status) {
  if (status === "presente" && !confirm("Marcar presença e emitir o certificado?")) return;
  const { error } = await supabase.from("inscricoes").update({ status }).eq("id", id);
  if (error) throw error;
  toast(status === "presente" ? "Presença registrada." : "Inscrição atualizada.");
  await recarregar();
}

async function marcarPresentes(eventoId) {
  const total = state.inscricoes.filter((item) => item.evento_id === eventoId && item.status === "confirmada").length;
  if (total === 0) {
    toast("Não há inscrições confirmadas nesta atividade.");
    return;
  }
  if (!confirm(`Marcar presença de ${total} inscrição(ões) confirmada(s)? Os certificados serão emitidos.`)) return;
  const { error } = await supabase.from("inscricoes").update({ status: "presente" }).eq("evento_id", eventoId).eq("status", "confirmada");
  if (error) throw error;
  toast("Presenças registradas.");
  await recarregar();
}

async function promoverEspera(eventoId) {
  const ev = state.eventos.find((item) => item.id === eventoId);
  let vagas = (ev?.capacidade || 0) - ocupacao(eventoId);
  const espera = state.inscricoes
    .filter((item) => item.evento_id === eventoId && item.status === "lista_espera")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (vagas <= 0 || espera.length === 0) {
    toast("Não há vaga livre ou ninguém na lista de espera.");
    return;
  }
  for (const item of espera) {
    if (vagas <= 0) break;
    const { error } = await supabase.from("inscricoes").update({ status: "confirmada" }).eq("id", item.id);
    if (error) throw error;
    vagas -= 1;
  }
  toast("Lista de espera promovida até o limite de vagas.");
  await recarregar();
}

async function emitirParticipante(inscricaoId) {
  const { error } = await supabase.rpc("emitir_certificado_participante", { p_inscricao: inscricaoId });
  if (error) throw error;
  toast("Certificado emitido.");
  await recarregar();
}

async function emitirPendentes() {
  const orgs = state.organizadores.filter((org) => !state.certificados.some((cert) => cert.organizador_id === org.id && cert.tipo === "organizador"));
  const avals = state.eventos.flatMap((ev) => ev.evento_avaliadores || []).filter((pessoa) => !state.certificados.some((cert) => cert.avaliador_id === pessoa.id && cert.tipo === "avaliador"));
  if (orgs.length + avals.length === 0) {
    toast("Nada pendente para emitir.");
    return;
  }
  for (const org of orgs) {
    const { error } = await supabase.rpc("emitir_certificado_organizador", { p_id: org.id });
    if (error) throw error;
  }
  for (const pessoa of avals) {
    const { error } = await supabase.rpc("emitir_certificado_avaliador", { p_id: pessoa.id });
    if (error) throw error;
  }
  toast("Certificados pendentes emitidos.");
  await recarregar();
}

async function excluirCertificado(id) {
  if (!confirm("Cancelar este certificado? O código deixa de valer.")) return;
  const { error } = await supabase.from("certificados").delete().eq("id", id);
  if (error) throw error;
  toast("Certificado cancelado.");
  await recarregar();
}

async function excluirOrganizador(id) {
  if (state.organizadores.length <= 1) {
    toast("Mantenha ao menos um organizador.", "err");
    return;
  }
  const org = state.organizadores.find((item) => item.id === id);
  if (!confirm(`Remover ${org?.nome || "esta pessoa"} da organização? Se for o seu usuário, você perde o acesso.`)) return;
  const { error } = await supabase.from("organizadores").delete().eq("id", id);
  if (error) throw error;
  if (id === state.perfil.id) {
    await supabase.auth.signOut();
    location.reload();
    return;
  }
  toast("Organizador removido.");
  await recarregar();
}

function preencherOrganizador(id) {
  const org = state.organizadores.find((item) => item.id === id);
  const form = document.getElementById("form-org");
  if (!org || !form) return;
  form.registro.value = org.id;
  form.nome.value = org.nome;
  form.email.value = org.email;
  form.email.readOnly = Boolean(org.user_id);
  form.cpf.value = org.cpf ? formatCpf(org.cpf) : "";
  form.matricula.value = org.matricula || "";
  form.telefone.value = org.telefone || "";
  form.funcao.value = org.funcao;
  form.eixo.value = org.eixo;
  form.instituicao.value = org.instituicao || "IFPB";
  form.carga.value = horasParaInput(org.carga_horaria_minutos);
  form.pode_avaliar.checked = Boolean(org.pode_avaliar_trabalhos);
  form.scrollIntoView({ block: "start" });
}

function exportarCsv() {
  const lista = inscricoesFiltradas();
  const cabecalho = ["nome", "cpf", "email", "telefone", "instituicao", "categoria", "atividade", "data", "horario", "local", "situacao"];
  const linhas = [cabecalho.join(";")];
  for (const item of lista) {
    const pessoa = item.participantes || {};
    const atividade = item.eventos || {};
    linhas.push([
      pessoa.nome, formatCpf(pessoa.cpf), pessoa.email, pessoa.telefone, pessoa.instituicao,
      CATEGORIAS[pessoa.categoria] || pessoa.categoria, atividade.titulo, atividade.data,
      horaCurta(atividade.horario_inicio), atividade.localizacao, STATUS[item.status] || item.status,
    ].map(csv).join(";"));
  }
  const blob = new Blob([`\uFEFF${linhas.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "inscricoes-ifpb-conecta.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function csv(valor) {
  const texto = String(valor ?? "");
  if (/[;"\n]/.test(texto)) return `"${texto.replaceAll('"', '""')}"`;
  return texto;
}

function ocupacao(eventoId) {
  return state.inscricoes.filter((item) => item.evento_id === eventoId && (item.status === "confirmada" || item.status === "presente")).length;
}

function comparar(a, b) {
  return String(a.data).localeCompare(String(b.data))
    || horaCurta(a.horario_inicio).localeCompare(horaCurta(b.horario_inicio))
    || String(a.titulo).localeCompare(String(b.titulo), "pt");
}

function rotuloQuando(ev) {
  const dia = DIAS.find((item) => item.data === String(ev.data).slice(0, 10));
  const data = dia ? `${dia.num}/11 ${dia.curta}` : String(ev.data).slice(0, 10);
  const fim = somarMinutos(horaCurta(ev.horario_inicio), ev.duracao_minutos);
  return `${data} ${horaCurta(ev.horario_inicio)}–${fim}`;
}

function idsEmConflito(eventos) {
  const ids = new Set();
  const inicio = (ev) => {
    const [hora, minuto] = horaCurta(ev.horario_inicio).split(":").map(Number);
    return hora * 60 + minuto;
  };
  const publicados = eventos.filter((ev) => ev.publicado);
  for (let i = 0; i < publicados.length; i += 1) {
    for (let j = i + 1; j < publicados.length; j += 1) {
      const a = publicados[i];
      const b = publicados[j];
      if (String(a.data).slice(0, 10) !== String(b.data).slice(0, 10)) continue;
      if (a.localizacao.trim().toLowerCase() !== b.localizacao.trim().toLowerCase()) continue;
      const a1 = inicio(a);
      const b1 = inicio(b);
      if (a1 < b1 + Number(b.duracao_minutos) && b1 < a1 + Number(a.duracao_minutos)) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}
