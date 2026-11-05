import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  EIXOS, MOVIMENTOS, RECOMENDACOES, STATUS_TRABALHO,
  esc, formatarQuando, htmlAviso, initNav, optionsHtml, toast,
} from "./ui.js";

initNav();

const form = document.getElementById("form-trabalho");
const bloqueio = document.getElementById("bloqueio");
const aviso = document.getElementById("aviso");
const recibo = document.getElementById("recibo");
const resultado = document.getElementById("resultado");
const LIMITE_PDF = 20 * 1024 * 1024;
let participante = null;

form.eixo.innerHTML = optionsHtml(EIXOS, "secitec");
form.addEventListener("submit", enviar);

if (!configured) aviso.innerHTML = htmlAviso(configError);
else iniciar();

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    mostrarBloqueio();
    return;
  }
  const area = await supabase.rpc("minha_area");
  if (area.error) {
    aviso.innerHTML = `<p class="erro">${esc(mensagemErro(area.error))}</p>`;
    mostrarBloqueio();
    return;
  }
  if (!area.data?.participante) {
    mostrarBloqueio();
    return;
  }
  participante = area.data.participante;
  bloqueio.hidden = true;
  form.hidden = false;
  document.getElementById("autor-conta").textContent = `Autor: ${participante.nome} · ${participante.email}`;
  pintarTrabalhos(area.data.trabalhos || []);
}

function mostrarBloqueio() {
  bloqueio.hidden = false;
  form.hidden = true;
}

function pdfDoForm() {
  const arquivo = form.pdf.files[0];
  if (!arquivo) return { erro: "Selecione o PDF do artigo." };
  const nome = arquivo.name.toLowerCase();
  if (arquivo.type !== "application/pdf" && !nome.endsWith(".pdf")) {
    return { erro: "O artigo precisa ser um arquivo PDF." };
  }
  if (arquivo.size > LIMITE_PDF) return { erro: "O PDF pode ter no máximo 20 MB." };
  return { arquivo };
}

async function enviar(evento) {
  evento.preventDefault();
  if (form.website.value) {
    toast("Não foi possível enviar.", "err");
    return;
  }
  if (!participante) {
    toast("Entre com a conta da inscrição para enviar o artigo.", "err");
    return;
  }
  if (!form.reportValidity()) return;
  const pdf = pdfDoForm();
  if (pdf.erro) {
    toast(pdf.erro, "err");
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const { data, error } = await supabase.rpc("submeter_trabalho", {
    p_dados: {
      website: "",
      titulo: form.titulo.value.trim(),
      eixo: form.eixo.value,
    },
  });
  if (error || !data?.id) {
    botao.disabled = false;
    toast(error ? mensagemErro(error) : "Não foi possível enviar o trabalho.", "err");
    return;
  }
  const caminho = `${data.id}/${crypto.randomUUID()}.pdf`;
  const envio = await supabase.storage.from("trabalhos").upload(caminho, pdf.arquivo, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (envio.error) {
    await supabase.rpc("descartar_submissao", {
      p_trabalho: data.id,
      p_cpf: participante.cpf,
      p_matricula: null,
      p_email: participante.email,
    });
    botao.disabled = false;
    toast(mensagemErro(envio.error), "err");
    return;
  }
  const anexo = await supabase.rpc("anexar_pdf_trabalho", {
    p_trabalho: data.id,
    p_cpf: participante.cpf,
    p_matricula: null,
    p_email: participante.email,
    p_caminho: caminho,
  });
  if (anexo.error) {
    await supabase.rpc("descartar_submissao", {
      p_trabalho: data.id,
      p_cpf: participante.cpf,
      p_matricula: null,
      p_email: participante.email,
    });
    botao.disabled = false;
    toast(mensagemErro(anexo.error), "err");
    return;
  }
  botao.disabled = false;
  form.reset();
  form.eixo.value = "secitec";
  recibo.innerHTML = `<article class="painel-branco"><h2>Protocolo ${esc(data.protocolo)}</h2><p>O PDF foi enviado. A coordenação vai conferir antes de encaminhar para avaliação. O andamento aparece abaixo, nesta mesma conta. O nome do professor avaliador não é mostrado.</p></article>`;
  toast("Trabalho enviado.");
  const area = await supabase.rpc("minha_area");
  if (!area.error) pintarTrabalhos(area.data?.trabalhos || []);
}

function pintarTrabalhos(lista) {
  if (!lista.length) {
    resultado.innerHTML = `<p class="empty">Nenhum artigo enviado com esta conta.</p>`;
    return;
  }
  resultado.innerHTML = `<h2>Seus trabalhos</h2>${lista.map((trabalho) => `
    <article class="painel-branco">
      <p><span class="status ${esc(trabalho.status)}">${esc(STATUS_TRABALHO[trabalho.status] || trabalho.status)}</span></p>
      <h2>${esc(trabalho.protocolo)}</h2>
      <p><strong>${esc(trabalho.titulo)}</strong><br><span class="hint">${esc(EIXOS[trabalho.eixo] || "")} · ${esc(formatarQuando(trabalho.criado_em))}</span></p>
      <p>${trabalho.tem_pdf ? "PDF enviado." : "PDF não anexado."}</p>
      <ol>${(trabalho.historico || []).map((item) => `
        <li>
          <strong>${esc(formatarQuando(item.quando))}</strong> — ${esc(MOVIMENTOS[item.tipo] || item.tipo)}
          ${item.recomendacao ? `<br>${esc(RECOMENDACOES[item.recomendacao] || "")}` : ""}
          ${item.parecer ? `<br>${esc(item.parecer)}` : ""}
        </li>`).join("")}
      </ol>
    </article>`).join("")}`;
}
