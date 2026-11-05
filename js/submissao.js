import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  EIXOS, MOVIMENTOS, RECOMENDACOES, STATUS_TRABALHO,
  cpfValido, digitos, esc, formatarQuando, htmlAviso, initNav, maskCpf, matriculaNormalizada, optionsHtml, toast,
} from "./ui.js";

initNav();

const form = document.getElementById("form-trabalho");
const consulta = document.getElementById("form-consulta");
const aviso = document.getElementById("aviso");
const recibo = document.getElementById("recibo");
const resultado = document.getElementById("resultado");
const LIMITE_PDF = 20 * 1024 * 1024;

form.eixo.innerHTML = optionsHtml(EIXOS, "secitec");
if (!configured) aviso.innerHTML = htmlAviso(configError);

form.addEventListener("input", (evento) => {
  if (evento.target.dataset.mask === "cpf") evento.target.value = maskCpf(evento.target.value);
});
consulta.addEventListener("input", (evento) => {
  if (evento.target.dataset.mask === "cpf") evento.target.value = maskCpf(evento.target.value);
});
form.addEventListener("submit", enviar);
consulta.addEventListener("submit", acompanhar);

function documentoAutorValido() {
  const cpf = digitos(form.autor_cpf.value);
  const matricula = matriculaNormalizada(form.autor_matricula.value);
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
  if (!form.reportValidity()) return;
  if (form.autor_nome.value.trim().split(/\s+/).length < 2) {
    toast("Informe nome e sobrenome do autor.", "err");
    return;
  }
  if (!documentoAutorValido()) return;
  const pdf = pdfDoForm();
  if (pdf.erro) {
    toast(pdf.erro, "err");
    return;
  }
  if (!configured) {
    toast("Conecte o Supabase em js/config.js para enviar o trabalho.", "err");
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const cpf = digitos(form.autor_cpf.value);
  const matricula = matriculaNormalizada(form.autor_matricula.value);
  const email = form.autor_email.value.trim().toLowerCase();
  const identidade = {
    p_cpf: cpf || null,
    p_matricula: matricula || null,
    p_email: email,
  };
  const { data, error } = await supabase.rpc("submeter_trabalho", {
    p_dados: {
      website: "",
      titulo: form.titulo.value.trim(),
      eixo: form.eixo.value,
      autor_nome: form.autor_nome.value.trim(),
      autor_email: email,
      autor_cpf: cpf || null,
      autor_matricula: matricula || null,
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
    await supabase.rpc("descartar_submissao", { p_trabalho: data.id, ...identidade });
    botao.disabled = false;
    toast(mensagemErro(envio.error), "err");
    return;
  }
  const anexo = await supabase.rpc("anexar_pdf_trabalho", {
    p_trabalho: data.id,
    ...identidade,
    p_caminho: caminho,
  });
  if (anexo.error) {
    await supabase.rpc("descartar_submissao", { p_trabalho: data.id, ...identidade });
    botao.disabled = false;
    toast(mensagemErro(anexo.error), "err");
    return;
  }
  botao.disabled = false;
  form.reset();
  form.eixo.value = "secitec";
  recibo.innerHTML = reciboHtml(data.protocolo);
  consulta.email.value = email;
  if (cpf) consulta.cpf.value = maskCpf(cpf);
  if (matricula) consulta.matricula.value = matricula;
  toast("Trabalho enviado.");
}

function reciboHtml(protocolo) {
  return `<article class="painel-branco"><h2>Protocolo ${esc(protocolo)}</h2><p>O PDF foi enviado. A coordenação vai conferir antes de encaminhar para avaliação. Acompanhe o status abaixo com o mesmo e-mail e o CPF ou a matrícula. O nome do professor avaliador não é mostrado.</p></article>`;
}

async function acompanhar(evento) {
  evento.preventDefault();
  const cpf = digitos(consulta.cpf.value);
  const matricula = matriculaNormalizada(consulta.matricula.value);
  const email = consulta.email.value.trim().toLowerCase();
  if (!cpf && !matricula) {
    toast("Informe o CPF ou a matrícula.", "err");
    return;
  }
  if (cpf && !cpfValido(cpf)) {
    toast("CPF inválido.", "err");
    return;
  }
  if (matricula && (matricula.length < 3 || matricula.length > 30)) {
    toast("Matrícula inválida.", "err");
    return;
  }
  if (!email.includes("@")) {
    toast("Informe o e-mail usado na submissão.", "err");
    return;
  }
  if (!configured) {
    toast("Conecte o Supabase em js/config.js para consultar o trabalho.", "err");
    return;
  }
  const botao = consulta.querySelector("[type=submit]");
  botao.disabled = true;
  const { data, error } = await supabase.rpc("consultar_trabalhos_aluno", {
    p_cpf: cpf || null,
    p_matricula: matricula || null,
    p_email: email,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  const lista = data || [];
  if (!lista.length) {
    resultado.innerHTML = `<p class="empty">Nenhum trabalho encontrado com estes dados.</p>`;
    return;
  }
  resultado.innerHTML = lista.map((trabalho) => `
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
    </article>`).join("");
}
