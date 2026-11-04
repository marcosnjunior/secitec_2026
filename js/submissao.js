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
const coautores = document.getElementById("coautores");
const addCoautor = document.getElementById("add-coautor");

form.eixo.innerHTML = optionsHtml(EIXOS, "secitec");
if (!configured) aviso.innerHTML = htmlAviso(configError);

form.addEventListener("input", (evento) => {
  if (evento.target.dataset.mask === "cpf") evento.target.value = maskCpf(evento.target.value);
});
consulta.addEventListener("input", (evento) => {
  if (evento.target.dataset.mask === "cpf") evento.target.value = maskCpf(evento.target.value);
});
addCoautor.addEventListener("click", () => {
  if (coautores.children.length >= 4) {
    toast("O trabalho aceita no máximo 4 coautores.", "err");
    return;
  }
  const linha = document.createElement("div");
  linha.className = "grid-2 coautor";
  linha.innerHTML = `
    <label class="field">Coautor
      <input name="co_nome" placeholder="Nome e sobrenome">
    </label>
    <label class="field">E-mail do coautor
      <input name="co_email" type="email">
    </label>`;
  coautores.appendChild(linha);
});
form.addEventListener("submit", enviar);
consulta.addEventListener("submit", acompanhar);

function palavrasDoForm() {
  const lista = [];
  form.palavras.value.split(/[,;]/).forEach((parte) => {
    const palavra = parte.trim();
    if (!palavra) return;
    if (lista.some((item) => item.toLowerCase() === palavra.toLowerCase())) return;
    lista.push(palavra);
  });
  return lista;
}

function coautoresDoForm() {
  return [...coautores.querySelectorAll(".coautor")].map((linha) => ({
    nome: linha.querySelector("[name=co_nome]").value.trim(),
    email: linha.querySelector("[name=co_email]").value.trim().toLowerCase(),
  })).filter((pessoa) => pessoa.nome || pessoa.email);
}

function imagensDoForm() {
  const itens = [];
  for (let i = 1; i <= 3; i += 1) {
    const arquivo = form[`img${i}`].files[0];
    const legenda = form[`leg${i}`].value.trim();
    if (!arquivo && !legenda) continue;
    if (!arquivo || legenda.length < 3) return { erro: "Cada imagem precisa de arquivo e legenda." };
    if (!["image/jpeg", "image/png"].includes(arquivo.type)) return { erro: "As imagens devem ser JPG ou PNG." };
    if (arquivo.size > 5 * 1024 * 1024) return { erro: "Cada imagem pode ter no máximo 5 MB." };
    itens.push({ arquivo, legenda });
  }
  return { itens };
}

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

async function enviar(evento) {
  evento.preventDefault();
  if (form.website.value) {
    toast("Não foi possível enviar.", "err");
    return;
  }
  if (!form.reportValidity()) return;
  if (form.autor_nome.value.trim().split(/\s+/).length < 2 || form.orientador_nome.value.trim().split(/\s+/).length < 2) {
    toast("Informe nome e sobrenome do autor e do orientador.", "err");
    return;
  }
  if (!documentoAutorValido()) return;
  const palavras = palavrasDoForm();
  if (palavras.length < 3 || palavras.length > 5 || palavras.some((item) => item.length < 2 || item.length > 40)) {
    toast("Informe de 3 a 5 palavras-chave, cada uma com 2 a 40 caracteres.", "err");
    return;
  }
  const pessoas = coautoresDoForm();
  if (pessoas.some((pessoa) => pessoa.nome.split(/\s+/).length < 2 || !pessoa.email.includes("@"))) {
    toast("Informe nome, sobrenome e e-mail de cada coautor.", "err");
    return;
  }
  const imagens = imagensDoForm();
  if (imagens.erro) {
    toast(imagens.erro, "err");
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
  const { data, error } = await supabase.rpc("submeter_trabalho", {
    p_dados: {
      website: "",
      titulo: form.titulo.value.trim(),
      eixo: form.eixo.value,
      palavras_chave: palavras,
      autor_nome: form.autor_nome.value.trim(),
      autor_email: email,
      autor_cpf: cpf || null,
      autor_matricula: matricula || null,
      orientador_nome: form.orientador_nome.value.trim(),
      orientador_email: form.orientador_email.value.trim().toLowerCase(),
      coautores: pessoas,
      resumo: form.resumo.value.trim(),
      introducao: form.introducao.value.trim(),
      fundamentacao: form.fundamentacao.value.trim(),
      metodologia: form.metodologia.value.trim(),
      resultados: form.resultados.value.trim(),
      discussoes: form.discussoes.value.trim(),
      bibliografia: form.bibliografia.value.trim(),
    },
  });
  if (error || !data?.id) {
    botao.disabled = false;
    toast(error ? mensagemErro(error) : "Não foi possível enviar o trabalho.", "err");
    return;
  }
  for (const imagem of imagens.itens) {
    const ext = imagem.arquivo.type === "image/png" ? "png" : "jpg";
    const caminho = `${data.id}/${crypto.randomUUID()}.${ext}`;
    const envio = await supabase.storage.from("trabalhos").upload(caminho, imagem.arquivo, {
      contentType: imagem.arquivo.type,
      upsert: false,
    });
    if (envio.error) {
      botao.disabled = false;
      recibo.innerHTML = reciboHtml(data.protocolo, "O texto foi salvo, mas uma imagem não foi enviada. Anote o protocolo e avise a coordenação.");
      toast(mensagemErro(envio.error), "err");
      return;
    }
    const anexo = await supabase.rpc("anexar_imagem_trabalho", {
      p_trabalho: data.id,
      p_cpf: cpf || null,
      p_matricula: matricula || null,
      p_email: email,
      p_caminho: caminho,
      p_legenda: imagem.legenda,
    });
    if (anexo.error) {
      botao.disabled = false;
      recibo.innerHTML = reciboHtml(data.protocolo, "O texto foi salvo, mas uma imagem não foi registrada.");
      toast(mensagemErro(anexo.error), "err");
      return;
    }
  }
  botao.disabled = false;
  form.reset();
  form.eixo.value = "secitec";
  coautores.innerHTML = "";
  recibo.innerHTML = reciboHtml(data.protocolo, "A coordenação vai conferir o trabalho antes de encaminhar para avaliação.");
  consulta.email.value = email;
  if (cpf) consulta.cpf.value = maskCpf(cpf);
  if (matricula) consulta.matricula.value = matricula;
  toast("Trabalho enviado.");
}

function reciboHtml(protocolo, texto) {
  return `<article class="painel-branco"><h2>Protocolo ${esc(protocolo)}</h2><p>${esc(texto)} Acompanhe o status abaixo com o mesmo e-mail e o CPF ou a matrícula. O nome do professor avaliador não é mostrado.</p></article>`;
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
      ${(trabalho.imagens || []).length ? `<ul>${trabalho.imagens.map((img) => `<li>Imagem ${esc(img.ordem)}: ${esc(img.legenda)}</li>`).join("")}</ul>` : ""}
      <ol>${(trabalho.historico || []).map((item) => `
        <li>
          <strong>${esc(formatarQuando(item.quando))}</strong> — ${esc(MOVIMENTOS[item.tipo] || item.tipo)}
          ${item.recomendacao ? `<br>${esc(RECOMENDACOES[item.recomendacao] || "")}` : ""}
          ${item.parecer ? `<br>${esc(item.parecer)}` : ""}
        </li>`).join("")}
      </ol>
    </article>`).join("");
}
