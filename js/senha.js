import { configError, configured, mensagemErro, supabase } from "./api.js";
import { esc, htmlAviso, initNav, toast } from "./ui.js";

initNav();

const aviso = document.getElementById("aviso");
const formPedir = document.getElementById("form-pedir");
const enviado = document.getElementById("enviado");
const formNova = document.getElementById("form-nova");
const pronto = document.getElementById("pronto");
const paineis = [formPedir, enviado, formNova, pronto];

function mostrar(painel) {
  paineis.forEach((item) => { item.hidden = item !== painel; });
}

// Endereço desta página, usado como destino do link enviado por e-mail.
// Precisa estar na lista de Redirect URLs do Supabase (Authentication → URL Configuration).
const urlRetorno = new URL("senha.html", location.href).href;

if (!configured) {
  aviso.innerHTML = htmlAviso(configError);
} else {
  iniciar();
}

formPedir.addEventListener("submit", pedirLink);
formNova.addEventListener("submit", salvarSenha);
document.getElementById("reenviar").addEventListener("click", () => {
  const emailAtual = formPedir.email.value;
  formPedir.reset();
  formPedir.email.value = emailAtual;
  mostrar(formPedir);
  formPedir.email.focus();
});

async function iniciar() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);

  // Link expirado ou já usado: o Supabase devolve o erro na própria URL.
  const descricaoErro = hash.get("error_description") || query.get("error_description");
  if (descricaoErro) {
    limparUrl();
    aviso.innerHTML = `<div class="banner"><strong>Este link não vale mais.</strong><p>${esc(traduzirErroLink(descricaoErro))} Peça um novo link abaixo.</p></div>`;
    mostrar(formPedir);
    return;
  }

  // Fluxo implícito: tokens chegam no fragmento da URL.
  if (hash.get("access_token") && hash.get("refresh_token")) {
    const { error } = await supabase.auth.setSession({
      access_token: hash.get("access_token"),
      refresh_token: hash.get("refresh_token"),
    });
    limparUrl();
    if (error) {
      aviso.innerHTML = `<div class="banner"><strong>Não foi possível abrir o link.</strong><p>${esc(mensagemErro(error))}</p></div>`;
      mostrar(formPedir);
      return;
    }
    await prepararNovaSenha();
    return;
  }

  // Fluxo PKCE: chega um código para trocar pela sessão.
  if (query.get("code")) {
    const { error } = await supabase.auth.exchangeCodeForSession(query.get("code"));
    limparUrl();
    if (error) {
      aviso.innerHTML = `<div class="banner"><strong>Não foi possível abrir o link.</strong><p>${esc(mensagemErro(error))}</p></div>`;
      mostrar(formPedir);
      return;
    }
    await prepararNovaSenha();
    return;
  }

  // Quem já está conectado pode trocar a senha direto.
  const { data } = await supabase.auth.getSession();
  if (data.session && query.get("trocar") === "1") {
    await prepararNovaSenha();
    return;
  }

  mostrar(formPedir);
  const emailSugerido = query.get("email");
  if (emailSugerido) formPedir.email.value = emailSugerido;
}

function limparUrl() {
  history.replaceState(null, "", location.pathname);
}

function traduzirErroLink(texto) {
  if (/expired|invalid/i.test(texto)) return "O link expirou ou já foi usado.";
  return texto;
}

async function prepararNovaSenha() {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email || "";
  document.getElementById("nova-conta").textContent = email ? `Conta: ${email}` : "";
  mostrar(formNova);
  formNova.senha.focus();
}

async function pedirLink(evento) {
  evento.preventDefault();
  const email = formPedir.email.value.trim().toLowerCase();
  const botao = formPedir.querySelector("[type=submit]");
  botao.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlRetorno });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  document.getElementById("enviado-email").textContent = email;
  mostrar(enviado);
}

async function salvarSenha(evento) {
  evento.preventDefault();
  const senha = formNova.senha.value;
  if (senha.length < 8) {
    toast("A senha precisa ter ao menos 8 caracteres.", "err");
    return;
  }
  if (senha !== formNova.confirma.value) {
    toast("As duas senhas não são iguais.", "err");
    return;
  }
  const botao = formNova.querySelector("[type=submit]");
  botao.disabled = true;
  const { data, error } = await supabase.auth.updateUser({ password: senha });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), "err");
    return;
  }
  const org = await supabase.from("organizadores").select("id").eq("user_id", data.user.id).maybeSingle();
  document.getElementById("pronto-acoes").innerHTML = org.data
    ? `<a class="btn btn-dark" href="admin.html">Abrir a organização</a>`
    : `<a class="btn btn-dark" href="inscricao.html">Abrir minha conta</a>
       <a class="btn btn-ghost" href="certificado.html">Meus certificados</a>`;
  mostrar(pronto);
  toast("Senha alterada.");
}
