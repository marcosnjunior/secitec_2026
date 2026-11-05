#!/usr/bin/env bash
# Copia o IFPB Conecta de um projeto Supabase para outro.
# Leva a estrutura, os dados, as contas da organização (com a mesma senha)
# e as imagens dos trabalhos. Não grava a chave service_role no site.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=${1:-"$SCRIPT_DIR/migrar.env"}
TABELAS=(
  organizadores
  eventos
  evento_avaliadores
  participantes
  inscricoes
  certificados
  trabalhos
  trabalho_imagens
  trabalho_movimentos
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Crie $ENV_FILE a partir de supabase/migrar.env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for nome in ORIGEM_DB_URL DESTINO_DB_URL ORIGEM_URL DESTINO_URL; do
  if [[ -z "${!nome:-}" ]]; then
    echo "Preencha $nome em $ENV_FILE." >&2
    exit 1
  fi
done

ORIGEM_URL=${ORIGEM_URL%/}
DESTINO_URL=${DESTINO_URL%/}
if [[ "$ORIGEM_DB_URL" == "$DESTINO_DB_URL" || "$ORIGEM_URL" == "$DESTINO_URL" ]]; then
  echo "Origem e destino são o mesmo projeto." >&2
  exit 1
fi

for cmd in psql pg_dump curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Instale $cmd. O pg_dump precisa ser da mesma versão do Postgres do Supabase, ou mais novo." >&2
    exit 1
  fi
done

recusar_chave_publica() {
  local nome=$1 valor=$2 carga papel
  if [[ "$valor" == sb_publishable_* ]]; then
    echo "$nome é a chave pública. Use a service_role ou a chave secret." >&2
    exit 1
  fi
  if [[ "$valor" == eyJ* ]]; then
    carga=$(printf '%s' "$valor" | cut -d. -f2 | tr '_-' '/+')
    while (( ${#carga} % 4 )); do carga="${carga}="; done
    papel=$(printf '%s' "$carga" | base64 -d 2>/dev/null | sed -n 's/.*"role"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
    if [[ "$papel" != "service_role" ]]; then
      echo "$nome não é a chave service_role." >&2
      exit 1
    fi
  fi
}

echo "Destino: $DESTINO_URL"
echo "A estrutura será criada de novo. Os dados públicos desse destino serão substituídos."
if [[ "${SIM:-}" != "1" ]]; then
  if [[ ! -t 0 ]]; then
    echo "Rode no terminal, ou exporte SIM=1 para confirmar." >&2
    exit 1
  fi
  read -r -p "Continuar? [s/N] " resposta
  if [[ "$resposta" != "s" && "$resposta" != "S" ]]; then
    echo "Migração cancelada."
    exit 1
  fi
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

echo "Criando a estrutura no destino…"
psql "$DESTINO_DB_URL" -X -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/schema.sql" >/dev/null

tem_origem=$(psql "$ORIGEM_DB_URL" -X -At -c "SELECT to_regclass('public.organizadores') IS NOT NULL")
if [[ "$tem_origem" != "t" ]]; then
  echo "A origem não tem as tabelas do evento. Confira ORIGEM_DB_URL ou execute supabase/schema.sql nesse projeto." >&2
  exit 1
fi

echo "Copiando as contas da organização…"
psql "$ORIGEM_DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL
\\copy (SELECT id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at FROM auth.users WHERE id IN (SELECT user_id FROM public.organizadores WHERE user_id IS NOT NULL)) TO '$tmpdir/usuarios.csv' WITH (FORMAT csv, HEADER true)
\\copy (SELECT i.id, i.provider_id, i.user_id, i.identity_data::text, i.provider, i.last_sign_in_at, i.created_at, i.updated_at FROM auth.identities i WHERE i.user_id IN (SELECT user_id FROM public.organizadores WHERE user_id IS NOT NULL)) TO '$tmpdir/identidades.csv' WITH (FORMAT csv, HEADER true)
SQL

psql "$DESTINO_DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
CREATE TEMP TABLE usuarios_origem (
  id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz
);
\\copy usuarios_origem FROM '$tmpdir/usuarios.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, email_change_confirm_status, is_sso_user
)
SELECT
  COALESCE((SELECT instance_id FROM auth.users LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid),
  id,
  COALESCE(NULLIF(aud, ''), 'authenticated'),
  COALESCE(NULLIF(role, ''), 'authenticated'),
  email,
  encrypted_password,
  COALESCE(email_confirmed_at, now()),
  COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  COALESCE(created_at, now()),
  COALESCE(updated_at, now()),
  last_sign_in_at,
  md5(id::text || '-confirm'),
  md5(id::text || '-recovery'),
  md5(id::text || '-change'),
  '',
  md5(id::text || '-current'),
  0,
  false
FROM usuarios_origem
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE identidades_origem (
  id uuid,
  provider_id text,
  user_id uuid,
  identity_data text,
  provider text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);
\\copy identidades_origem FROM '$tmpdir/identidades.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
SELECT id, provider_id, user_id, identity_data::jsonb, provider,
       last_sign_in_at, COALESCE(created_at, now()), COALESCE(updated_at, now())
FROM identidades_origem o
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.id = o.id OR (i.provider = o.provider AND i.provider_id = o.provider_id)
);

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now()
FROM auth.users u
JOIN usuarios_origem o ON o.id = u.id
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );
COMMIT;
SQL

incluir=()
for tabela in "${TABELAS[@]}"; do
  origem=$(psql "$ORIGEM_DB_URL" -X -At -c "SELECT to_regclass('public.${tabela}') IS NOT NULL")
  if [[ "$origem" == "t" ]]; then
    incluir+=("--table=public.${tabela}")
  else
    echo "A origem não tem public.${tabela}; essa tabela fica vazia no destino."
  fi
done

if (( ${#incluir[@]} == 0 )); then
  echo "A origem não tem dados do evento para copiar." >&2
  exit 1
fi

echo "Copiando os dados…"
pg_dump "$ORIGEM_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  "${incluir[@]}" \
  --file="$tmpdir/dados.sql"

psql "$DESTINO_DB_URL" -X -v ON_ERROR_STOP=1 \
  --single-transaction \
  --command "TRUNCATE TABLE public.trabalho_movimentos, public.trabalho_imagens, public.trabalhos, public.certificados, public.inscricoes, public.evento_avaliadores, public.participantes, public.eventos, public.organizadores RESTART IDENTITY CASCADE" \
  --command "SET session_replication_role = replica" \
  --file "$tmpdir/dados.sql" >/dev/null

psql "$ORIGEM_DB_URL" -X -At -c "SELECT name || E'\t' || COALESCE(metadata->>'mimetype', CASE WHEN name ILIKE '%.png' THEN 'image/png' ELSE 'image/jpeg' END) FROM storage.objects WHERE bucket_id = 'trabalhos' ORDER BY name" > "$tmpdir/arquivos.tsv"
mapfile -t arquivos < "$tmpdir/arquivos.tsv"

if (( ${#arquivos[@]} )) && [[ -z "${ORIGEM_SERVICE_ROLE:-}" || -z "${DESTINO_SERVICE_ROLE:-}" ]]; then
  echo "Há imagens de trabalhos. Preencha ORIGEM_SERVICE_ROLE e DESTINO_SERVICE_ROLE." >&2
  exit 1
fi
if (( ${#arquivos[@]} )); then
  recusar_chave_publica "ORIGEM_SERVICE_ROLE" "$ORIGEM_SERVICE_ROLE"
  recusar_chave_publica "DESTINO_SERVICE_ROLE" "$DESTINO_SERVICE_ROLE"
  echo "Copiando ${#arquivos[@]} imagem(ns)…"
  for linha in "${arquivos[@]}"; do
    nome=${linha%%$'\t'*}
    mime=${linha#*$'\t'}
    curl -fsS \
      -H "Authorization: Bearer $ORIGEM_SERVICE_ROLE" \
      -H "apikey: $ORIGEM_SERVICE_ROLE" \
      -o "$tmpdir/blob" \
      "$ORIGEM_URL/storage/v1/object/trabalhos/$nome"
    curl -fsS -X POST \
      -H "Authorization: Bearer $DESTINO_SERVICE_ROLE" \
      -H "apikey: $DESTINO_SERVICE_ROLE" \
      -H "Content-Type: $mime" \
      -H "x-upsert: true" \
      --data-binary @"$tmpdir/blob" \
      "$DESTINO_URL/storage/v1/object/trabalhos/$nome" >/dev/null
  done
fi

echo
echo "Cópia concluída."
psql "$DESTINO_DB_URL" -X -c "SELECT 'organizadores' AS tabela, count(*) FROM public.organizadores UNION ALL SELECT 'eventos', count(*) FROM public.eventos UNION ALL SELECT 'inscricoes', count(*) FROM public.inscricoes UNION ALL SELECT 'certificados', count(*) FROM public.certificados UNION ALL SELECT 'trabalhos', count(*) FROM public.trabalhos UNION ALL SELECT 'imagens', count(*) FROM public.trabalho_imagens ORDER BY 1;"
echo
echo "No projeto novo:"
echo "1. Authentication → Providers → Email: desative Confirm email."
echo "2. Em js/config.js, troque SUPABASE_URL por $DESTINO_URL e cole a chave anon public desse projeto."
echo "A senha de quem já tinha acesso continua a mesma. É preciso entrar de novo."
