import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

function papelDaChave(key) {
  try {
    const parte = key.split(".")[1];
    const json = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
    return json.role || "";
  } catch {
    return "";
  }
}

const url = (SUPABASE_URL || "").trim();
const key = (SUPABASE_ANON_KEY || "").trim();
const papel = key ? papelDaChave(key) : "";

export let configError = "";
export const configured = Boolean(url && key) && papel !== "service_role";

if (url && key && papel === "service_role") {
  configError = "A chave colada em js/config.js é a service_role. Troque pela chave anon public.";
}

export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export function mensagemErro(error) {
  const bruto = error?.message || error?.error_description || String(error || "Erro desconhecido");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(bruto)) {
    return "Não foi possível conectar ao Supabase. Confira a internet, a URL e a chave em js/config.js.";
  }
  if (/schema cache|does not exist|could not find the function|relation/i.test(bruto)) {
    return "O Supabase ainda não reconhece as tabelas. Execute supabase/schema.sql no SQL Editor e aguarde alguns segundos.";
  }
  if (/invalid login credentials/i.test(bruto)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email not confirmed/i.test(bruto)) {
    return "O Supabase está exigindo confirmação de e-mail. Desative “Confirm email” em Authentication → Providers → Email.";
  }
  if (/you can only request this after (\d+) seconds/i.test(bruto)) {
    const segundos = bruto.match(/after (\d+) seconds/i)[1];
    return `Aguarde ${segundos} segundos antes de pedir outro e-mail.`;
  }
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(bruto)) {
    return "O limite de e-mails foi atingido por enquanto. Tente de novo mais tarde.";
  }
  if (/new password should be different/i.test(bruto)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/password should be at least/i.test(bruto)) {
    return "A senha precisa ter ao menos 8 caracteres.";
  }
  if (/auth session missing|session.*expired|invalid refresh token/i.test(bruto)) {
    return "A sessão do link expirou. Peça um novo link de recuperação.";
  }
  if (/organizadores_matricula_unica/i.test(bruto)) {
    return "Esta matrícula já está cadastrada.";
  }
  return bruto.replace(/^.*?ERROR:\s*/i, "").replace(/^PGRST\d+:\s*/i, "");
}
