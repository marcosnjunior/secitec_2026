import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  CATEGORIAS, DIAS, EIXOS, TIPOS,
  cpfValido, digitos, esc, horaCurta, htmlAviso, initNav, jaComecou, maskCpf, maskPhone, toast,
} from "./ui.js";

initNav();

const form = document.getElementById("form-inscricao");
const lista = document.getElementById("lista-atividades");
const aviso = document.getElementById("aviso");
const recibo = document.getElementById("recibo");
const destaque = new URLSearchParams(location.search).get("evento");
let eventos = [];

form.cpf.addEventListener("input", () => { form.cpf.value = maskCpf(form.cpf.value); });
form.telefone.addEventListener("input", () => { form.telefone.value = maskPhone(form.telefone.value); });
form.addEventListener("change", atualizarBotao);
form.addEventListener("submit", enviar);

if (!configured) {
  aviso.innerHTML = htmlAviso(configError);
  lista.innerHTML = `<p class="empty">As atividades com inscrição online aparecem aqui depois que o Supabase estiver conectado.</p>`;
} else {
  carregar();
}

async function carregar() {
  lista.innerHTML = `<p class="empty">Carregando atividades…</p>`;
  const { data, error } = await supabase.rpc("programacao_publica");
  if (error) {
    aviso.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    lista.innerHTML = "";
    return;
  }
  eventos = (data || []).filter((ev) => ev.forma_inscricao === "online");
  renderLista();
}

function renderLista() {
  if (eventos.length === 0) {
    lista.innerHTML = `<p class="empty">Nenhuma atividade com inscrição online no momento. Consulte a programação: parte da semana pode ser de entrada livre ou inscrição no local.</p>`;
    return;
  }
  lista.innerHTML = DIAS.map((dia) => {
    const doDia = eventos.filter((ev) => ev.data === dia.data);
    if (doDia.length === 0) return "";
    return `
      <section>
        <h3>${dia.num} de novembro, ${dia.semana}</h3>
        ${doDia.map((ev) => {
          const encerrada = jaComecou(ev);
          const espera = !encerrada && ev.vagas_restantes <= 0;
          const marcado = ev.id === destaque ? "checked" : "";
          return `
            <label class="check-item" id="escolha-${esc(ev.id)}">
              <input type="checkbox" name="eventos" value="${esc(ev.id)}" ${marcado} ${encerrada ? "disabled" : ""}>
              <span>
                <strong>${esc(horaCurta(ev.horario_inicio))}–${esc(horaCurta(ev.horario_fim))} · ${esc(ev.titulo)}</strong>
                <span class="hint">${esc(TIPOS[ev.tipo] || "")} · ${esc(EIXOS[ev.eixo] || "")} · ${esc(ev.localizacao)}</span>
                <span class="${espera ? "vaga-fim" : "hint"}">${encerrada
                  ? "Inscrições encerradas"
                  : espera
                    ? "Sem vagas. A inscrição entra na lista de espera."
                    : `${ev.vagas_restantes} de ${ev.capacidade} vagas`}</span>
              </span>
            </label>`;
        }).join("")}
      </section>`;
  }).join("");
  const alvo = destaque && document.getElementById(`escolha-${destaque}`);
  alvo?.scrollIntoView({ block: "center" });
  atualizarBotao();
}

function atualizarBotao() {
  const total = form.querySelectorAll("input[name=eventos]:checked").length;
  form.querySelector("[type=submit]").textContent = total
    ? `Confirmar inscrição (${total})`
    : "Confirmar inscrição";
}

async function enviar(evento) {
  evento.preventDefault();
  if (form.website.value) {
    toast("Não foi possível enviar.", "err");
    return;
  }
  const nome = form.nome.value.trim();
  const email = form.email.value.trim().toLowerCase();
  const cpf = digitos(form.cpf.value);
  if (nome.split(/\s+/).length < 2) {
    toast("Informe nome e sobrenome.", "err");
    return;
  }
  if (!cpfValido(cpf)) {
    toast("CPF inválido.", "err");
    return;
  }
  const escolhidos = [...form.querySelectorAll("input[name=eventos]:checked")].map((item) => item.value);
  if (escolhidos.length === 0) {
    toast("Selecione ao menos uma atividade.", "err");
    return;
  }
  if (!configured) {
    toast("Conecte o Supabase em js/config.js para concluir a inscrição.", "err");
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const { data, error } = await supabase.rpc("inscrever_participante", {
    p_nome: nome,
    p_email: email,
    p_cpf: cpf,
    p_telefone: form.telefone.value.trim(),
    p_instituicao: form.instituicao.value.trim(),
    p_categoria: form.categoria.value,
    p_eventos: escolhidos,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  const resultados = data?.resultados || [];
  form.hidden = true;
  recibo.hidden = false;
  recibo.innerHTML = `
    <h2>Inscrição registrada</h2>
    <p>Guarde este comprovante, ${esc(data?.nome || nome)}. O certificado fica disponível depois que a organização marcar a presença.</p>
    <ul>
      ${resultados.map((item) => `<li><strong>${esc(item.titulo || "Atividade")}</strong> — ${esc(item.mensagem || "")}</li>`).join("")}
    </ul>
    <p><a class="btn btn-dark" href="index.html#programacao">Ver programação</a></p>`;
  recibo.scrollIntoView({ block: "start" });
}

document.getElementById("categoria-opcoes").innerHTML = Object.entries(CATEGORIAS)
  .map(([valor, nome]) => `<option value="${valor}">${esc(nome)}</option>`)
  .join("");
