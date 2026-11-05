export const DIAS = [
  { data: "2026-11-23", semana: "segunda-feira", curta: "Seg", num: "23" },
  { data: "2026-11-24", semana: "terça-feira", curta: "Ter", num: "24" },
  { data: "2026-11-25", semana: "quarta-feira", curta: "Qua", num: "25" },
  { data: "2026-11-26", semana: "quinta-feira", curta: "Qui", num: "26" },
  { data: "2026-11-27", semana: "sexta-feira", curta: "Sex", num: "27" },
];

export const EIXOS = {
  semana_inclusao: "Semana da Inclusão",
  secitec: "SECITEC — Ciência e Tecnologia",
  festival_moda: "Festival a Moda",
  consciencia_negra: "Consciência Negra",
  geral: "Programação geral",
};

export const TIPOS = {
  palestra: "Palestra",
  oficina: "Oficina",
  minicurso: "Minicurso",
  mesa_redonda: "Mesa-redonda",
  mostra: "Mostra",
  roda_conversa: "Roda de conversa",
  apresentacao: "Apresentação de trabalho",
  visita: "Visita técnica",
  outro: "Outra atividade",
};

export const TIPO_FRASE = {
  palestra: "da palestra",
  oficina: "da oficina",
  minicurso: "do minicurso",
  mesa_redonda: "da mesa-redonda",
  mostra: "da mostra",
  roda_conversa: "da roda de conversa",
  apresentacao: "da apresentação",
  visita: "da visita técnica",
  outro: "da atividade",
};

export const FORMAS = {
  online: "Inscrição online",
  presencial: "Inscrição presencial",
  link_externo: "Link externo",
  livre: "Entrada livre",
};

export const FUNCOES = {
  coordenacao: "Coordenação",
  comissao: "Comissão organizadora",
  apoio: "Apoio",
  monitor: "Monitoria",
};

export const CATEGORIAS = {
  estudante: "Estudante",
  servidor: "Servidor",
  professor: "Professor",
  comunidade: "Comunidade externa",
};

export const STATUS = {
  confirmada: "Confirmada",
  lista_espera: "Lista de espera",
  cancelada: "Cancelada",
  presente: "Presente",
};

export const STATUS_TRABALHO = {
  submetido: "Submetido",
  em_avaliacao: "Em avaliação",
  avaliado: "Avaliado",
  com_coordenacao: "Com a coordenação",
};

export const RECOMENDACOES = {
  aceitar: "Aceitar",
  aceitar_com_correcoes: "Aceitar com correções",
  nao_aceitar: "Não aceitar",
};

export const MOVIMENTOS = {
  submetido: "Submetido. O trabalho está com a coordenação.",
  encaminhado: "Em avaliação.",
  parecer: "Avaliação devolvida à coordenação.",
  cancelado: "A coordenação cancelou o envio. O trabalho voltou para a coordenação.",
};

export function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function digitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

export function cpfValido(valor) {
  const d = digitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function maskCpf(valor) {
  const d = digitos(valor).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(valor) {
  const d = digitos(valor).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function formatCpf(valor) {
  const d = digitos(valor);
  if (d.length !== 11) return valor || "";
  return maskCpf(d);
}

export function matriculaNormalizada(valor) {
  return String(valor ?? "").replace(/\s+/g, "").toUpperCase();
}

export function formatDataCurta(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatDataLonga(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatarQuando(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  });
}

export function horaCurta(valor) {
  return String(valor || "").slice(0, 5);
}

export function somarMinutos(hhmm, minutos) {
  const [hora, minuto] = horaCurta(hhmm).split(":").map(Number);
  if (Number.isNaN(hora) || Number.isNaN(minuto)) return "";
  const total = hora * 60 + minuto + Number(minutos || 0);
  const h = Math.floor((total % (24 * 60) + 24 * 60) % (24 * 60) / 60);
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatCarga(minutos) {
  const n = Number(minutos || 0);
  if (n <= 0) return "carga horária não informada";
  if (n < 60) return `${n} minutos`;
  const horas = n / 60;
  const texto = Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace(".", ",");
  return `${texto} ${horas === 1 ? "hora" : "horas"}`;
}

export function horasParaInput(minutos) {
  if (!minutos) return "";
  const horas = Number(minutos) / 60;
  return Number.isInteger(horas) ? String(horas) : String(Math.round(horas * 100) / 100);
}

export function diaInfo(iso) {
  return DIAS.find((dia) => dia.data === iso.slice(0, 10));
}

export function optionsHtml(mapa, selecionado = "", placeholder = "") {
  const inicio = placeholder ? `<option value="">${esc(placeholder)}</option>` : "";
  return inicio + Object.entries(mapa).map(([valor, rotulo]) => {
    const marcado = valor === selecionado ? " selected" : "";
    return `<option value="${esc(valor)}"${marcado}>${esc(rotulo)}</option>`;
  }).join("");
}

export function safeUrl(valor) {
  try {
    const url = new URL(String(valor || "").trim());
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "";
  }
  return "";
}

export function jaComecou(evento) {
  const [ano, mes, dia] = String(evento.data).slice(0, 10).split("-").map(Number);
  const [hora, minuto] = horaCurta(evento.horario_inicio).split(":").map(Number);
  const inicio = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
  return inicio.getTime() <= Date.now();
}

// Se o link de recuperação de senha cair em outra página do site,
// encaminha para senha.html mantendo o token que vem no fragmento da URL.
function encaminharRecuperacao() {
  const hash = location.hash || "";
  if (!/type=recovery/.test(hash) || /senha\.html$/.test(location.pathname)) return false;
  location.replace(new URL("senha.html", location.href).href + hash);
  return true;
}

export function initNav() {
  if (encaminharRecuperacao()) return;
  const botao = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!botao || !nav) return;
  botao.addEventListener("click", () => {
    const aberto = nav.classList.toggle("open");
    botao.setAttribute("aria-expanded", aberto ? "true" : "false");
  });
}

export function toast(mensagem, tipo = "ok") {
  let caixa = document.getElementById("toasts");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.id = "toasts";
    caixa.className = "toast-wrap";
    caixa.setAttribute("aria-live", "polite");
    document.body.appendChild(caixa);
  }
  const item = document.createElement("div");
  item.className = `toast ${tipo === "err" ? "err" : "ok"}`;
  item.textContent = mensagem;
  caixa.appendChild(item);
  setTimeout(() => item.remove(), 5200);
}

export function htmlAviso(extra = "") {
  return `
    <div class="banner">
      <strong>Conecte o Supabase para gravar os dados.</strong>
      <p>O site já está pronto. Falta criar o banco e colar a chave pública em <code>js/config.js</code>.</p>
      ${extra ? `<p>${esc(extra)}</p>` : ""}
      <ol>
        <li>Crie um projeto em supabase.com.</li>
        <li>No SQL Editor, execute o arquivo <code>supabase/schema.sql</code>.</li>
        <li>Em Authentication → Providers → Email, desative “Confirm email”.</li>
        <li>Em Project Settings → API, copie a Project URL e a chave <strong>anon public</strong>.</li>
        <li>Cole os dois valores em <code>js/config.js</code> e recarregue esta página.</li>
      </ol>
    </div>`;
}

export function textoCertificado(cert) {
  const detalhe = cert.detalhe || {};
  const nome = cert.nome;
  if (cert.tipo === "organizador") {
    const funcao = FUNCOES[detalhe.funcao] || "organização";
    const eixo = detalhe.eixo && detalhe.eixo !== "geral"
      ? `, com atuação no eixo ${EIXOS[detalhe.eixo] || detalhe.eixo}`
      : "";
    return `Certificamos que ${nome} integrou a organização do IFPB Conecta, Campus Pedras de Fogo, na função de ${funcao}${eixo}, no período de 23 a 27 de novembro de 2026.`;
  }
  const frase = TIPO_FRASE[detalhe.tipo_evento] || "da atividade";
  const quando = detalhe.data ? formatDataLonga(detalhe.data) : "novembro de 2026";
  const horario = detalhe.horario_inicio && detalhe.horario_fim
    ? `, das ${detalhe.horario_inicio} às ${detalhe.horario_fim}`
    : "";
  const local = detalhe.localizacao ? `, em ${detalhe.localizacao}` : "";
  const eixo = detalhe.eixo ? `, no eixo ${EIXOS[detalhe.eixo] || detalhe.eixo}` : "";
  const realizado = detalhe.tipo_evento === "minicurso" ? "realizado" : "realizada";
  if (cert.tipo === "avaliador") {
    const titulacao = detalhe.titulacao ? `, ${detalhe.titulacao},` : "";
    return `Certificamos que ${nome}${titulacao} atuou como professor(a) avaliador(a) ${frase} “${cert.descricao}”, ${realizado} em ${quando}${horario}${local}${eixo}, durante o IFPB Conecta, no Campus Pedras de Fogo.`;
  }
  const vinculo = detalhe.instituicao ? `, ${detalhe.instituicao},` : "";
  return `Certificamos que ${nome}${vinculo} participou ${frase} “${cert.descricao}”, ${realizado} em ${quando}${horario}${local}${eixo}, durante o IFPB Conecta, de 23 a 27 de novembro de 2026, no Campus Pedras de Fogo.`;
}

export function certificadoHtml(cert, { modelo = false } = {}) {
  const detalhe = cert.detalhe || {};
  const dataLinha = cert.tipo === "organizador" ? "2026-11-27" : (detalhe.data || "2026-11-27");
  const emitido = cert.emitido_em
    ? formatDataLonga(String(cert.emitido_em).slice(0, 10))
    : "";
  return `
    <article class="cert-sheet${modelo ? " modelo" : ""}">
      <div class="cores" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="cert-miolo">
        <div class="cert-marcas" aria-hidden="true">
          <img src="assets/logo-ifpb-conecta.jpg" alt="">
          <img src="assets/logo-ifpb-conecta.jpg" alt="">
          <img src="assets/logo-ifpb-conecta.jpg" alt="">
        </div>
        <div class="cert-logos">
          <img src="assets/logo-ifpb-pedras-de-fogo.jpg" alt="Instituto Federal da Paraíba, Campus Pedras de Fogo">
          <img src="assets/logo-ifpb-conecta.jpg" alt="IFPB Conecta">
        </div>
        <p class="cert-kicker">Instituto Federal da Paraíba · Campus Pedras de Fogo</p>
        <h2>Certificado</h2>
        <p class="cert-texto">${esc(textoCertificado(cert))}</p>
        <p class="cert-carga">Carga horária: ${esc(formatCarga(cert.carga_horaria_minutos))}</p>
        <p class="cert-local">Campus Pedras de Fogo, ${esc(formatDataLonga(dataLinha))}.</p>
        <div class="cert-assinaturas">
          <p><span></span>Coordenação do IFPB Conecta</p>
          <p><span></span>Comissão organizadora</p>
        </div>
        <p class="cert-codigo">Código de verificação: ${esc(cert.codigo)}</p>
        ${emitido && !modelo ? `<p class="cert-url">Emitido em ${esc(emitido)}.</p>` : ""}
      </div>
    </article>`;
}

export const CERTIFICADO_MODELO = {
  participante: {
    codigo: "IFPB-2026-MODELO",
    tipo: "participante",
    nome: "Nome do participante",
    descricao: "Nome da atividade",
    carga_horaria_minutos: 120,
    emitido_em: "2026-11-27",
    detalhe: {
      tipo_evento: "oficina",
      eixo: "secitec",
      data: "2026-11-24",
      horario_inicio: "14:00",
      horario_fim: "16:00",
      localizacao: "Local da atividade",
      instituicao: "IFPB",
    },
  },
  organizador: {
    codigo: "IFPB-2026-MODELO",
    tipo: "organizador",
    nome: "Nome do organizador",
    descricao: "Organização do IFPB Conecta 2026",
    carga_horaria_minutos: 1200,
    emitido_em: "2026-11-27",
    detalhe: { funcao: "comissao", eixo: "secitec" },
  },
  avaliador: {
    codigo: "IFPB-2026-MODELO",
    tipo: "avaliador",
    nome: "Nome do professor avaliador",
    descricao: "Nome da atividade",
    carga_horaria_minutos: 120,
    emitido_em: "2026-11-27",
    detalhe: {
      titulacao: "Doutor(a)",
      tipo_evento: "apresentacao",
      eixo: "secitec",
      data: "2026-11-25",
      horario_inicio: "09:00",
      horario_fim: "12:00",
      localizacao: "Local da atividade",
    },
  },
};
