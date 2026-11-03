import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  DIAS, EIXOS, FORMAS, TIPOS,
  esc, horaCurta, htmlAviso, initNav, jaComecou, safeUrl,
} from "./ui.js";

initNav();

const estado = { eventos: [], dia: new URLSearchParams(location.search).get("dia") || "todos" };
const aviso = document.getElementById("aviso");
const grade = document.getElementById("grade");

document.getElementById("imprimir")?.addEventListener("click", () => window.print());

if (!configured) {
  aviso.innerHTML = htmlAviso(configError);
  montarFiltros();
  render();
} else {
  carregar();
}

async function carregar() {
  grade.innerHTML = `<p class="empty">Carregando a programação…</p>`;
  const { data, error } = await supabase.rpc("programacao_publica");
  if (error) {
    aviso.innerHTML = `<div class="banner"><strong>Não foi possível ler a programação.</strong><p>${esc(mensagemErro(error))}</p></div>`;
    grade.innerHTML = "";
    return;
  }
  estado.eventos = data || [];
  montarFiltros();
  render();
}

function montarFiltros() {
  const tabs = document.getElementById("dia-tabs");
  const filtros = document.getElementById("filtros");
  tabs.innerHTML = `
    <button type="button" class="dia-tab" data-dia="todos" aria-pressed="${estado.dia === "todos"}">
      <b>Todos</b><small>5 dias</small>
    </button>
    ${DIAS.map((dia) => `
      <button type="button" class="dia-tab" data-dia="${dia.data}" aria-pressed="${estado.dia === dia.data}">
        <b>${dia.num}</b><small>${dia.curta}</small>
      </button>`).join("")}`;
  tabs.onclick = (evento) => {
    const botao = evento.target.closest("[data-dia]");
    if (!botao) return;
    estado.dia = botao.dataset.dia;
    const url = new URL(location.href);
    if (estado.dia === "todos") url.searchParams.delete("dia");
    else url.searchParams.set("dia", estado.dia);
    history.replaceState(null, "", `${url.pathname}${url.search}#programacao`);
    tabs.querySelectorAll("[data-dia]").forEach((item) => {
      item.setAttribute("aria-pressed", item.dataset.dia === estado.dia ? "true" : "false");
    });
    render();
  };

  filtros.innerHTML = `
    <label class="field">Eixo
      <select id="f-eixo">
        <option value="">Todos</option>
        ${Object.entries(EIXOS).map(([valor, nome]) => `<option value="${valor}">${esc(nome)}</option>`).join("")}
      </select>
    </label>
    <label class="field">Tipo
      <select id="f-tipo">
        <option value="">Todos</option>
        ${Object.entries(TIPOS).map(([valor, nome]) => `<option value="${valor}">${esc(nome)}</option>`).join("")}
      </select>
    </label>
    <label class="field">Busca
      <input id="f-q" type="search" placeholder="Título, local ou responsável">
    </label>`;
  filtros.onchange = render;
  filtros.oninput = render;
}

function filtrados() {
  const eixo = document.getElementById("f-eixo")?.value || "";
  const tipo = document.getElementById("f-tipo")?.value || "";
  const q = (document.getElementById("f-q")?.value || "").trim().toLowerCase();
  return estado.eventos.filter((ev) => {
    if (estado.dia !== "todos" && ev.data !== estado.dia) return false;
    if (eixo && ev.eixo !== eixo) return false;
    if (tipo && ev.tipo !== tipo) return false;
    if (!q) return true;
    const texto = `${ev.titulo} ${ev.descricao || ""} ${ev.localizacao} ${ev.responsavel_nome} ${ev.observacao || ""}`.toLowerCase();
    return texto.includes(q);
  });
}

function render() {
  const lista = filtrados();
  const contagem = document.getElementById("contagem");
  if (contagem) {
    const total = estado.eventos.length;
    contagem.textContent = total
      ? `${total} ${total === 1 ? "atividade publicada" : "atividades publicadas"}`
      : "Nenhuma atividade publicada ainda";
  }
  const dias = estado.dia === "todos" ? DIAS : DIAS.filter((dia) => dia.data === estado.dia);
  const filtroAtivo = Boolean(
    document.getElementById("f-eixo")?.value
    || document.getElementById("f-tipo")?.value
    || document.getElementById("f-q")?.value.trim()
  );
  if (lista.length === 0 && filtroAtivo) {
    grade.innerHTML = `<p class="empty">Nenhuma atividade encontrada com esses filtros.</p>`;
    return;
  }
  grade.innerHTML = dias.map((dia) => {
    const doDia = lista.filter((ev) => ev.data === dia.data)
      .sort((a, b) => horaCurta(a.horario_inicio).localeCompare(horaCurta(b.horario_inicio)) || a.titulo.localeCompare(b.titulo, "pt"));
    if (doDia.length === 0 && filtroAtivo) return "";
    return `
      <section class="dia-bloco">
        <h3><b>${dia.num}</b> ${dia.semana}</h3>
        ${doDia.length === 0
          ? `<p class="empty">Nenhuma atividade neste dia.</p>`
          : `<div class="itens">${doDia.map(htmlEvento).join("")}</div>`}
      </section>`;
  }).join("");
}

function htmlEvento(ev) {
  const avaliadores = Array.isArray(ev.avaliadores) ? ev.avaliadores : [];
  const nomes = avaliadores.map((pessoa) => pessoa.titulacao ? `${pessoa.nome} (${pessoa.titulacao})` : pessoa.nome);
  const link = safeUrl(ev.link_externo);
  let acao = "";
  if (ev.forma_inscricao === "online") {
    if (jaComecou(ev)) acao = `<span class="badge">Inscrições encerradas</span>`;
    else if (ev.vagas_restantes > 0) acao = `<a class="btn btn-small btn-primary" href="inscricao.html?evento=${esc(ev.id)}">Inscrever-se</a><div class="hint">${ev.vagas_restantes} de ${ev.capacidade} vagas</div>`;
    else acao = `<a class="btn btn-small btn-ghost" href="inscricao.html?evento=${esc(ev.id)}">Lista de espera</a><div class="hint">Vagas esgotadas</div>`;
  } else if (ev.forma_inscricao === "link_externo" && link) {
    acao = `<a class="btn btn-small btn-dark" href="${esc(link)}" target="_blank" rel="noopener">Inscrição externa</a>`;
  } else {
    acao = `<span class="badge">${esc(FORMAS[ev.forma_inscricao] || "")}</span>`;
  }
  const descricao = ev.descricao
    ? (ev.descricao.length > 420
      ? `<details><summary>Descrição</summary><p class="desc">${esc(ev.descricao).replaceAll("\n", "<br>")}</p></details>`
      : `<p class="desc">${esc(ev.descricao).replaceAll("\n", "<br>")}</p>`)
    : "";
  return `
    <article class="item-prog ${esc(ev.eixo)}" id="ev-${esc(ev.id)}">
      <div class="item-hora">
        <strong>${esc(horaCurta(ev.horario_inicio))}</strong>
        <span>${esc(horaCurta(ev.horario_fim))}</span>
      </div>
      <div class="item-corpo">
        <div class="selos">
          <span class="badge ${esc(ev.eixo)}">${esc(TIPOS[ev.tipo] || "Atividade")}</span>
          <span class="badge">${esc(EIXOS[ev.eixo] || "")}</span>
        </div>
        <h3>${esc(ev.titulo)}</h3>
        ${descricao}
        <p class="meta">Responsável: ${esc(ev.responsavel_nome)} · ${esc(ev.localizacao)}</p>
        ${nomes.length ? `<p class="avaliadores">Avaliadores: ${esc(nomes.join(", "))}</p>` : ""}
        ${ev.requer_avaliacao && nomes.length === 0 ? `<p class="avaliadores">Avaliadores serão informados pela organização.</p>` : ""}
        ${ev.observacao ? `<p class="obs">${esc(ev.observacao)}</p>` : ""}
      </div>
      <div class="item-acao">${acao}</div>
    </article>`;
}
