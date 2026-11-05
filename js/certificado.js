import { configError, configured, mensagemErro, supabase } from "./api.js";
import {
  CERTIFICADO_MODELO,
  certificadoHtml, cpfValido, digitos, esc, htmlAviso, initNav, maskCpf, matriculaNormalizada, toast,
} from "./ui.js";

initNav();

const form = document.getElementById("form-busca");
const aviso = document.getElementById("aviso");
const resultado = document.getElementById("resultado");
const modelos = document.getElementById("modelos");
const codigoUrl = new URLSearchParams(location.search).get("codigo");

form.cpf.addEventListener("input", () => { form.cpf.value = maskCpf(form.cpf.value); });
form.addEventListener("submit", buscar);
modelos.addEventListener("click", (evento) => {
  const tipo = evento.target.closest("[data-modelo]")?.dataset.modelo;
  if (!tipo) return;
  mostrar([CERTIFICADO_MODELO[tipo]], { modelo: true });
});

window.addEventListener("beforeprint", () => {
  if (document.querySelector(".cert-sheet")) document.body.classList.add("printing-cert");
});
window.addEventListener("afterprint", () => document.body.classList.remove("printing-cert"));

if (!configured) aviso.innerHTML = htmlAviso(configError);
if (configured) carregarMeus();
if (codigoUrl && configured) buscarCodigo(codigoUrl);

async function carregarMeus() {
  const meus = document.getElementById("meus");
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) {
    meus.innerHTML = `<p class="painel-branco no-print">Participante: <a href="inscricao.html">entre na sua conta</a> para imprimir o certificado.</p>`;
    return;
  }
  const area = await supabase.rpc("minha_area");
  if (area.error || !area.data?.participante) return;
  form.hidden = true;
  modelos.hidden = true;
  const lista = area.data.certificados || [];
  if (!lista.length) {
    meus.innerHTML = `<p class="painel-branco no-print">Nenhum certificado liberado ainda. Eles aparecem aqui depois que a coordenação confirmar a presença.</p>`;
    return;
  }
  meus.innerHTML = `
    <div class="linha-acoes no-print">
      <p>${lista.length} certificado(s) liberado(s).</p>
      <button type="button" class="btn btn-dark" id="imprimir-meus">Imprimir ou salvar em PDF</button>
    </div>
    ${lista.map((cert) => certificadoHtml(cert, { modelo: false })).join("")}`;
  document.getElementById("imprimir-meus").onclick = () => window.print();
}

async function buscar(evento) {
  evento.preventDefault();
  const cpf = digitos(form.cpf.value);
  const matricula = matriculaNormalizada(form.matricula.value);
  const email = form.email.value.trim().toLowerCase();
  const codigo = form.codigo.value.trim().toUpperCase();
  if (codigo) {
    if (!configured) {
      toast("Conecte o Supabase para consultar um código real. O modelo abaixo é só visual.", "err");
      return;
    }
    await buscarCodigo(codigo);
    return;
  }
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
    toast("Informe o e-mail usado na inscrição.", "err");
    return;
  }
  if (!configured) {
    toast("Conecte o Supabase em js/config.js para buscar certificados.", "err");
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const { data, error } = await supabase.rpc("consultar_certificados", {
    p_cpf: cpf || null,
    p_email: email,
    p_codigo: null,
    p_matricula: matricula || null,
  });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  mostrar(data || [], { modelo: false });
}

async function buscarCodigo(codigo) {
  form.codigo.value = codigo;
  const { data, error } = await supabase.rpc("consultar_certificados", {
    p_cpf: null,
    p_email: null,
    p_codigo: codigo,
    p_matricula: null,
  });
  if (error) {
    resultado.innerHTML = `<p class="erro">${esc(mensagemErro(error))}</p>`;
    return;
  }
  mostrar(data || [], { modelo: false });
}

function mostrar(lista, { modelo }) {
  if (!lista.length) {
    resultado.innerHTML = `<p class="empty">Nenhum certificado encontrado. A presença precisa ser registrada pela organização antes da emissão.</p>`;
    return;
  }
  resultado.innerHTML = `
    <div class="linha-acoes no-print">
      <p>${modelo ? "Pré-visualização. Este documento não tem validade." : `${lista.length} certificado(s).`}</p>
      <button type="button" class="btn btn-dark" id="imprimir-cert">Imprimir ou salvar em PDF</button>
    </div>
    ${lista.map((cert) => certificadoHtml(cert, { modelo })).join("")}`;
  document.getElementById("imprimir-cert").onclick = () => window.print();
  if (!modelo && lista.length === 1 && lista[0].codigo) {
    const url = new URL(location.href);
    url.searchParams.set("codigo", lista[0].codigo);
    history.replaceState(null, "", url);
  }
}
