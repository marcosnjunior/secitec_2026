-- IFPB Conecta 2026
-- Semana de 23 a 27 de novembro de 2026
--
-- COMO USAR ESTE SCRIPT
-- 1. Crie um projeto em https://supabase.com
-- 2. Abra SQL Editor → New query
-- 3. Cole este arquivo inteiro e clique em Run
-- 4. Em Authentication → Sign In / Providers → Email, desative "Confirm email"
--    (assim a coordenação entra na hora, sem esperar um e-mail)
-- 5. Em Project Settings → API, copie:
--      Project URL          → SUPABASE_URL em js/config.js
--      anon public          → SUPABASE_ANON_KEY em js/config.js
-- 6. Não cole a chave service_role no site. Ela ignora toda a segurança.
-- 7. Recarregue o site, abra Organização e crie o acesso da coordenação.
--
-- O script pode ser executado de novo: ele não apaga dados já gravados.
-- A programação pública, a inscrição e os certificados passam por funções
-- com permissão controlada. As tabelas internas só são lidas por quem
-- estiver cadastrado como organizador.

begin;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.eixo_evento as enum (
    'semana_inclusao',
    'secitec',
    'festival_moda',
    'consciencia_negra',
    'geral'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tipo_evento as enum (
    'palestra',
    'oficina',
    'minicurso',
    'mesa_redonda',
    'mostra',
    'roda_conversa',
    'apresentacao',
    'visita',
    'outro'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.forma_inscricao as enum (
    'online',
    'presencial',
    'link_externo',
    'livre'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.status_inscricao as enum (
    'confirmada',
    'lista_espera',
    'cancelada',
    'presente'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.funcao_organizador as enum (
    'coordenacao',
    'comissao',
    'apoio',
    'monitor'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.categoria_participante as enum (
    'estudante',
    'servidor',
    'professor',
    'comunidade'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tipo_certificado as enum (
    'participante',
    'organizador',
    'avaliador'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

create or replace function public.cpf_valido(cpf text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  d text;
  s int;
  r int;
  i int;
begin
  d := regexp_replace(coalesce(cpf, ''), '\D', '', 'g');
  if length(d) <> 11 then
    return false;
  end if;
  if d ~ '^(\d)\1{10}$' then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::int * (11 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + substr(d, i, 1)::int * (12 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> substr(d, 11, 1)::int then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.email_da_sessao()
returns text
language sql
stable
set search_path = public
as $$
  select lower(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', '')
  ));
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.organizadores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nome text not null,
  email text not null unique,
  cpf text,
  matricula text,
  telefone text,
  funcao public.funcao_organizador not null default 'comissao',
  eixo public.eixo_evento not null default 'geral',
  instituicao text not null default 'IFPB',
  carga_horaria_minutos integer not null default 1200,
  pode_avaliar_trabalhos boolean not null default false,
  created_at timestamptz not null default now(),
  constraint organizadores_nome_ok check (char_length(trim(nome)) between 5 and 160),
  constraint organizadores_cpf_ok check (cpf is null or public.cpf_valido(cpf)),
  constraint organizadores_matricula_ok check (matricula is null or char_length(matricula) between 3 and 30),
  constraint organizadores_documento_ok check (cpf is not null or matricula is not null),
  constraint organizadores_email_ok check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint organizadores_carga_ok check (carga_horaria_minutos between 60 and 6000)
);

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  observacao text,
  tipo public.tipo_evento not null default 'outro',
  eixo public.eixo_evento not null default 'geral',
  responsavel_nome text not null,
  responsavel_email text,
  data date not null,
  horario_inicio time not null,
  duracao_minutos integer not null,
  localizacao text not null,
  capacidade integer not null,
  forma_inscricao public.forma_inscricao not null default 'online',
  link_externo text,
  carga_horaria_minutos integer,
  requer_avaliacao boolean not null default false,
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  constraint eventos_titulo_ok check (char_length(trim(titulo)) between 3 and 180),
  constraint eventos_responsavel_ok check (char_length(trim(responsavel_nome)) between 3 and 160),
  constraint eventos_local_ok check (char_length(trim(localizacao)) between 2 and 160),
  constraint eventos_periodo check (data between date '2026-11-23' and date '2026-11-27'),
  constraint eventos_duracao check (duracao_minutos between 10 and 600),
  constraint eventos_capacidade check (capacidade between 1 and 5000),
  constraint eventos_carga check (carga_horaria_minutos is null or carga_horaria_minutos between 10 and 6000),
  constraint eventos_link check (
    forma_inscricao <> 'link_externo'
    or coalesce(char_length(trim(link_externo)), 0) > 0
  )
);

create table if not exists public.evento_avaliadores (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  nome text not null,
  email text,
  cpf text,
  titulacao text,
  created_at timestamptz not null default now(),
  constraint avaliadores_nome_ok check (char_length(trim(nome)) between 5 and 160),
  constraint avaliadores_cpf_ok check (cpf is null or public.cpf_valido(cpf)),
  constraint avaliadores_email_ok check (
    email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create table if not exists public.participantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  cpf text not null unique,
  telefone text,
  instituicao text,
  categoria public.categoria_participante not null,
  created_at timestamptz not null default now(),
  constraint participantes_nome_ok check (char_length(trim(nome)) between 5 and 160),
  constraint participantes_cpf_ok check (public.cpf_valido(cpf)),
  constraint participantes_email_ok check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

alter table public.participantes add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.participantes add column if not exists checkin_em timestamptz;
create unique index if not exists participantes_user_id_unico
  on public.participantes (user_id) where user_id is not null;

create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references public.participantes (id) on delete cascade,
  evento_id uuid not null references public.eventos (id) on delete restrict,
  status public.status_inscricao not null default 'confirmada',
  created_at timestamptz not null default now(),
  unique (participante_id, evento_id)
);

create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo public.tipo_certificado not null,
  participante_id uuid references public.participantes (id) on delete set null,
  organizador_id uuid references public.organizadores (id) on delete set null,
  avaliador_id uuid references public.evento_avaliadores (id) on delete set null,
  evento_id uuid references public.eventos (id) on delete restrict,
  inscricao_id uuid references public.inscricoes (id) on delete set null,
  nome_snapshot text not null,
  descricao_snapshot text not null,
  carga_horaria_minutos integer not null,
  detalhe jsonb not null default '{}'::jsonb,
  emitido_em timestamptz not null default now(),
  constraint certificados_carga_ok check (carga_horaria_minutos between 10 and 6000)
);

create unique index if not exists certificados_inscricao_unica
  on public.certificados (inscricao_id)
  where inscricao_id is not null and tipo = 'participante';

create unique index if not exists certificados_organizador_unico
  on public.certificados (organizador_id)
  where organizador_id is not null and tipo = 'organizador';

create unique index if not exists certificados_avaliador_unico
  on public.certificados (avaliador_id)
  where avaliador_id is not null and tipo = 'avaliador';

create unique index if not exists avaliadores_email_evento
  on public.evento_avaliadores (evento_id, lower(email))
  where email is not null and email <> '';

create index if not exists eventos_data_hora_idx
  on public.eventos (data, horario_inicio);

create index if not exists inscricoes_evento_idx
  on public.inscricoes (evento_id, status);

create index if not exists inscricoes_participante_idx
  on public.inscricoes (participante_id);

-- Bancos já criados com a versão anterior: CPF deixa de ser obrigatório
-- e a matrícula passa a ser aceita no cadastro do organizador.
alter table public.organizadores add column if not exists matricula text;
alter table public.organizadores alter column cpf drop not null;
alter table public.organizadores drop constraint if exists organizadores_cpf_ok;
alter table public.organizadores drop constraint if exists organizadores_matricula_ok;
alter table public.organizadores drop constraint if exists organizadores_documento_ok;
alter table public.organizadores
  add constraint organizadores_cpf_ok check (cpf is null or public.cpf_valido(cpf));
alter table public.organizadores
  add constraint organizadores_matricula_ok check (matricula is null or char_length(matricula) between 3 and 30);
alter table public.organizadores
  add constraint organizadores_documento_ok check (cpf is not null or matricula is not null);
alter table public.organizadores
  add column if not exists pode_avaliar_trabalhos boolean not null default false;

create unique index if not exists organizadores_matricula_unica
  on public.organizadores (matricula)
  where matricula is not null;

-- ---------------------------------------------------------------------------
-- Normalização
-- ---------------------------------------------------------------------------

create or replace function public.tg_normalizar_pessoa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.nome := trim(new.nome);
  if new.email is not null then
    new.email := lower(trim(new.email));
    if new.email = '' then
      new.email := null;
    end if;
  end if;
  if new.cpf is not null then
    new.cpf := regexp_replace(new.cpf, '\D', '', 'g');
    if new.cpf = '' then
      new.cpf := null;
    elsif not public.cpf_valido(new.cpf) then
      raise exception 'CPF inválido';
    end if;
  end if;
  if tg_table_name = 'organizadores' then
    new.matricula := nullif(upper(regexp_replace(coalesce(new.matricula, ''), '\s+', '', 'g')), '');
    if new.matricula is not null and char_length(new.matricula) not between 3 and 30 then
      raise exception 'Matrícula inválida';
    end if;
    if new.cpf is null and new.matricula is null then
      raise exception 'Informe o CPF ou a matrícula';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tg_evento_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.titulo := trim(new.titulo);
  new.responsavel_nome := trim(new.responsavel_nome);
  new.localizacao := trim(new.localizacao);
  if new.descricao is not null then
    new.descricao := nullif(trim(new.descricao), '');
  end if;
  if new.observacao is not null then
    new.observacao := nullif(trim(new.observacao), '');
  end if;
  if new.responsavel_email is not null then
    new.responsavel_email := nullif(lower(trim(new.responsavel_email)), '');
  end if;
  if new.link_externo is not null then
    new.link_externo := nullif(trim(new.link_externo), '');
  end if;
  if new.carga_horaria_minutos is null then
    new.carga_horaria_minutos := new.duracao_minutos;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalizar_organizador on public.organizadores;
create trigger trg_normalizar_organizador
before insert or update on public.organizadores
for each row execute function public.tg_normalizar_pessoa();

drop trigger if exists trg_normalizar_participante on public.participantes;
create trigger trg_normalizar_participante
before insert or update on public.participantes
for each row execute function public.tg_normalizar_pessoa();

drop trigger if exists trg_normalizar_avaliador on public.evento_avaliadores;
create trigger trg_normalizar_avaliador
before insert or update on public.evento_avaliadores
for each row execute function public.tg_normalizar_pessoa();

drop trigger if exists trg_evento_padrao on public.eventos;
create trigger trg_evento_padrao
before insert or update on public.eventos
for each row execute function public.tg_evento_padrao();

create or replace function public.tg_ultimo_organizador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.organizadores) <= 1 then
    raise exception 'Mantenha ao menos um organizador cadastrado';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_ultimo_organizador on public.organizadores;
create trigger trg_ultimo_organizador
before delete on public.organizadores
for each row execute function public.tg_ultimo_organizador();

-- ---------------------------------------------------------------------------
-- Acesso da organização
-- ---------------------------------------------------------------------------

create or replace function public.is_organizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizadores o
    where o.user_id = auth.uid()
  );
$$;

create or replace function public.estado_acesso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tem_organizador', exists (select 1 from public.organizadores)
  );
$$;

drop function if exists public.criar_primeiro_organizador(text, text, text, text, integer);

create or replace function public.criar_primeiro_organizador(
  p_nome text,
  p_cpf text,
  p_matricula text,
  p_telefone text,
  p_instituicao text,
  p_carga_horaria_minutos integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
  v_cpf text;
  v_matricula text;
begin
  perform pg_advisory_xact_lock(20261123::bigint);

  if auth.uid() is null then
    raise exception 'Entre com e-mail e senha antes de criar a coordenação';
  end if;
  if exists (select 1 from public.organizadores) then
    raise exception 'A coordenação já foi criada. Peça para cadastrarem o seu e-mail.';
  end if;

  v_email := public.email_da_sessao();
  if v_email is null then
    raise exception 'Não foi possível ler o e-mail da sessão. Desative a confirmação de e-mail no Supabase.';
  end if;
  if char_length(trim(coalesce(p_nome, ''))) < 5 or trim(p_nome) !~ '\S\s+\S' then
    raise exception 'Informe nome e sobrenome';
  end if;
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_matricula := nullif(upper(regexp_replace(coalesce(p_matricula, ''), '\s+', '', 'g')), '');
  if v_cpf is not null and not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido';
  end if;
  if v_cpf is null and v_matricula is null then
    raise exception 'Informe o CPF ou a matrícula';
  end if;
  if p_carga_horaria_minutos is null or p_carga_horaria_minutos < 60 then
    raise exception 'Informe a carga horária da organização em horas';
  end if;

  insert into public.organizadores (
    user_id, nome, email, cpf, matricula, telefone, funcao, eixo, instituicao, carga_horaria_minutos
  ) values (
    auth.uid(),
    trim(p_nome),
    v_email,
    v_cpf,
    v_matricula,
    nullif(trim(coalesce(p_telefone, '')), ''),
    'coordenacao',
    'geral',
    coalesce(nullif(trim(coalesce(p_instituicao, '')), ''), 'IFPB'),
    p_carga_horaria_minutos
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'email', v_email);
end;
$$;

create or replace function public.vincular_organizador()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para continuar';
  end if;

  v_email := public.email_da_sessao();
  if v_email is null then
    raise exception 'Não foi possível ler o e-mail da sessão';
  end if;

  update public.organizadores
     set user_id = auth.uid()
   where user_id is null
     and lower(email) = v_email
  returning id into v_id;

  if v_id is null then
    return null;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Programação pública e inscrição
-- ---------------------------------------------------------------------------

create or replace function public.programacao_publica()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(item order by item->>'data', item->>'horario_inicio', item->>'titulo'),
    '[]'::jsonb
  )
  from (
    select jsonb_build_object(
      'id', e.id,
      'titulo', e.titulo,
      'descricao', e.descricao,
      'observacao', e.observacao,
      'tipo', e.tipo,
      'eixo', e.eixo,
      'responsavel_nome', e.responsavel_nome,
      'data', e.data,
      'horario_inicio', to_char(e.horario_inicio, 'HH24:MI'),
      'horario_fim', to_char((e.horario_inicio + (e.duracao_minutos * interval '1 minute'))::time, 'HH24:MI'),
      'duracao_minutos', e.duracao_minutos,
      'localizacao', e.localizacao,
      'capacidade', e.capacidade,
      'forma_inscricao', e.forma_inscricao,
      'link_externo', e.link_externo,
      'carga_horaria_minutos', coalesce(e.carga_horaria_minutos, e.duracao_minutos),
      'requer_avaliacao', e.requer_avaliacao,
      'inscritos', oc.inscritos,
      'vagas_restantes', greatest(e.capacidade - oc.inscritos, 0),
      'avaliadores', coalesce(av.lista, '[]'::jsonb)
    ) as item
    from public.eventos e
    left join lateral (
      select count(*)::int as inscritos
      from public.inscricoes i
      where i.evento_id = e.id
        and i.status in ('confirmada', 'presente')
    ) oc on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('nome', a.nome, 'titulacao', a.titulacao)
        order by a.nome
      ) as lista
      from public.evento_avaliadores a
      where a.evento_id = e.id
    ) av on true
    where e.publicado
  ) lista;
$$;

create or replace function public.inscrever_participante(
  p_nome text,
  p_email text,
  p_cpf text,
  p_telefone text,
  p_instituicao text,
  p_categoria text,
  p_eventos uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text;
  v_email text;
  v_part uuid;
  v_email_db text;
  v_ids uuid[];
  v_evento uuid;
  v_result jsonb := '[]'::jsonb;
  v_cap integer;
  v_ocup integer;
  v_forma public.forma_inscricao;
  v_titulo text;
  v_data date;
  v_hora time;
  v_inicio timestamp;
  v_status public.status_inscricao;
  v_existente public.status_inscricao;
  v_msg text;
  v_ok boolean;
  v_user uuid;
begin
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_email := lower(trim(coalesce(p_email, '')));

  if trim(coalesce(p_nome, '')) !~ '\S\s+\S' or char_length(trim(p_nome)) < 5 then
    raise exception 'Informe nome e sobrenome';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  if not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido';
  end if;
  if p_categoria not in ('estudante', 'servidor', 'professor', 'comunidade') then
    raise exception 'Categoria inválida';
  end if;
  if auth.uid() is null then
    raise exception 'Entre com e-mail e senha para se inscrever';
  end if;
  if public.is_organizador() then
    raise exception 'Esta conta é da organização. Cadastre a participação com outro e-mail';
  end if;
  if v_email is distinct from public.email_da_sessao() then
    raise exception 'Use o e-mail da sua conta';
  end if;

  v_ids := array(
    select distinct x
    from unnest(coalesce(p_eventos, array[]::uuid[])) as x
    order by x
  );

  if cardinality(v_ids) = 0 then
    raise exception 'Selecione ao menos uma atividade';
  end if;
  if cardinality(v_ids) > 30 then
    raise exception 'Selecione no máximo 30 atividades por vez';
  end if;

  if exists (
    select 1 from public.participantes
    where lower(email) = v_email and cpf <> v_cpf
  ) then
    raise exception 'Este e-mail já está cadastrado com outro CPF';
  end if;

  select id, email, user_id into v_part, v_email_db, v_user
  from public.participantes
  where cpf = v_cpf;

  if v_part is not null and v_user is not null and v_user <> auth.uid() then
    raise exception 'Este CPF já está ligado a outra conta';
  end if;
  if v_part is not null and lower(v_email_db) <> v_email then
    raise exception 'Este CPF já está cadastrado com outro e-mail';
  end if;
  if exists (
    select 1 from public.participantes
    where user_id = auth.uid() and (v_part is null or id <> v_part)
  ) then
    raise exception 'Esta conta já está cadastrada com outro CPF';
  end if;

  if v_part is null then
    insert into public.participantes (nome, email, cpf, telefone, instituicao, categoria, user_id)
    values (
      trim(p_nome),
      v_email,
      v_cpf,
      nullif(trim(coalesce(p_telefone, '')), ''),
      nullif(trim(coalesce(p_instituicao, '')), ''),
      p_categoria::public.categoria_participante,
      auth.uid()
    )
    returning id into v_part;
  else
    update public.participantes
    set user_id = auth.uid(),
        nome = trim(p_nome),
        telefone = nullif(trim(coalesce(p_telefone, '')), ''),
        instituicao = nullif(trim(coalesce(p_instituicao, '')), ''),
        categoria = p_categoria::public.categoria_participante
    where id = v_part;
  end if;

  foreach v_evento in array v_ids loop
    perform pg_advisory_xact_lock(hashtext(v_evento::text)::bigint);

    select capacidade, forma_inscricao, titulo, data, horario_inicio
      into v_cap, v_forma, v_titulo, v_data, v_hora
    from public.eventos
    where id = v_evento and publicado;

    if not found then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'evento_id', v_evento,
        'ok', false,
        'mensagem', 'Atividade não encontrada'
      ));
      continue;
    end if;

    if v_forma <> 'online' then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'evento_id', v_evento,
        'ok', false,
        'titulo', v_titulo,
        'mensagem', 'Esta atividade não aceita inscrição pelo site'
      ));
      continue;
    end if;

    v_inicio := v_data + v_hora;
    if v_inicio <= (now() at time zone 'America/Fortaleza') then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'evento_id', v_evento,
        'ok', false,
        'titulo', v_titulo,
        'mensagem', 'As inscrições desta atividade já foram encerradas'
      ));
      continue;
    end if;

    select status into v_existente
    from public.inscricoes
    where participante_id = v_part and evento_id = v_evento;

    if found then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'evento_id', v_evento,
        'ok', true,
        'titulo', v_titulo,
        'status', v_existente,
        'mensagem', 'Você já estava inscrito nesta atividade'
      ));
      continue;
    end if;

    select count(*) into v_ocup
    from public.inscricoes
    where evento_id = v_evento
      and status in ('confirmada', 'presente');

    if v_ocup >= v_cap then
      v_status := 'lista_espera';
      v_msg := 'Vagas esgotadas. Você entrou na lista de espera';
      v_ok := true;
    else
      v_status := 'confirmada';
      v_msg := 'Inscrição confirmada';
      v_ok := true;
    end if;

    insert into public.inscricoes (participante_id, evento_id, status)
    values (v_part, v_evento, v_status);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'evento_id', v_evento,
      'ok', v_ok,
      'titulo', v_titulo,
      'status', v_status,
      'mensagem', v_msg
    ));
  end loop;

  return jsonb_build_object(
    'participante_id', v_part,
    'nome', trim(p_nome),
    'resultados', v_result
  );
end;
$$;

create or replace function public.minha_area()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_part public.participantes;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_part from public.participantes where user_id = auth.uid();
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'participante', jsonb_build_object(
      'id', v_part.id,
      'nome', v_part.nome,
      'email', v_part.email,
      'cpf', v_part.cpf,
      'telefone', v_part.telefone,
      'instituicao', v_part.instituicao,
      'categoria', v_part.categoria,
      'checkin_em', v_part.checkin_em
    ),
    'inscricoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'status', i.status,
        'evento_id', e.id,
        'titulo', e.titulo,
        'data', e.data,
        'horario_inicio', e.horario_inicio,
        'localizacao', e.localizacao
      ) order by e.data, e.horario_inicio)
      from public.inscricoes i
      join public.eventos e on e.id = i.evento_id
      where i.participante_id = v_part.id
    ), '[]'::jsonb),
    'certificados', coalesce((
      select jsonb_agg(public.certificado_json(c) order by c.emitido_em desc)
      from public.certificados c
      where c.participante_id = v_part.id
        and c.tipo = 'participante'
    ), '[]'::jsonb),
    'trabalhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'protocolo', t.protocolo,
        'titulo', t.titulo,
        'eixo', t.eixo,
        'status', t.status,
        'criado_em', t.created_at,
        'tem_pdf', t.arquivo is not null,
        'historico', coalesce((
          select jsonb_agg(jsonb_build_object(
            'quando', m.ocorrido_em,
            'tipo', m.tipo,
            'recomendacao', m.recomendacao,
            'parecer', m.parecer
          ) order by m.ocorrido_em)
          from public.trabalho_movimentos m
          where m.trabalho_id = t.id
        ), '[]'::jsonb)
      ) order by t.created_at desc)
      from public.trabalhos t
      where t.autor_email = lower(v_part.email)
        and t.autor_cpf = v_part.cpf
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.registrar_checkin(p_participante uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_quando timestamptz;
  v_presencas integer;
begin
  if not public.is_coordenacao() then
    raise exception 'Somente a coordenação confirma a presença';
  end if;
  if not exists (
    select 1 from public.inscricoes where participante_id = p_participante
  ) then
    raise exception 'Esta pessoa não tem inscrição';
  end if;

  update public.participantes
  set checkin_em = coalesce(checkin_em, now())
  where id = p_participante
  returning nome, checkin_em into v_nome, v_quando;

  if not found then
    raise exception 'Participante não encontrado';
  end if;

  update public.inscricoes
  set status = 'presente'
  where participante_id = p_participante
    and status = 'confirmada';
  get diagnostics v_presencas = row_count;

  return jsonb_build_object(
    'nome', v_nome,
    'checkin_em', v_quando,
    'presencas', v_presencas
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Certificados
-- ---------------------------------------------------------------------------

create or replace function public.novo_codigo_certificado()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  loop
    v_codigo := 'IFPB-2026-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.certificados where codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

create or replace function public.certificado_json(c public.certificados)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'codigo', c.codigo,
    'tipo', c.tipo,
    'nome', c.nome_snapshot,
    'descricao', c.descricao_snapshot,
    'carga_horaria_minutos', c.carga_horaria_minutos,
    'emitido_em', c.emitido_em,
    'detalhe', c.detalhe
  );
$$;

create or replace function public.emitir_certificado_participante(p_inscricao uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins public.inscricoes%rowtype;
  v_part public.participantes%rowtype;
  v_evt public.eventos%rowtype;
  v_cert public.certificados%rowtype;
begin
  if coalesce(auth.role(), '') = 'anon'
     or (auth.uid() is not null and not public.is_organizador()) then
    raise exception 'Acesso restrito à organização';
  end if;

  select * into v_ins from public.inscricoes where id = p_inscricao;
  if not found then
    raise exception 'Inscrição não encontrada';
  end if;
  if v_ins.status <> 'presente' then
    raise exception 'Registre a presença antes de emitir o certificado';
  end if;

  select * into v_cert
  from public.certificados
  where inscricao_id = p_inscricao and tipo = 'participante'
  limit 1;
  if found then
    return public.certificado_json(v_cert);
  end if;

  select * into v_part from public.participantes where id = v_ins.participante_id;
  select * into v_evt from public.eventos where id = v_ins.evento_id;

  insert into public.certificados (
    codigo, tipo, participante_id, evento_id, inscricao_id,
    nome_snapshot, descricao_snapshot, carga_horaria_minutos, detalhe
  ) values (
    public.novo_codigo_certificado(),
    'participante',
    v_part.id,
    v_evt.id,
    v_ins.id,
    v_part.nome,
    v_evt.titulo,
    coalesce(v_evt.carga_horaria_minutos, v_evt.duracao_minutos),
    jsonb_build_object(
      'tipo_evento', v_evt.tipo,
      'eixo', v_evt.eixo,
      'data', v_evt.data,
      'horario_inicio', to_char(v_evt.horario_inicio, 'HH24:MI'),
      'horario_fim', to_char((v_evt.horario_inicio + (v_evt.duracao_minutos * interval '1 minute'))::time, 'HH24:MI'),
      'localizacao', v_evt.localizacao,
      'instituicao', v_part.instituicao
    )
  )
  returning * into v_cert;

  return public.certificado_json(v_cert);
end;
$$;

create or replace function public.tg_emitir_certificado_presenca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'presente'
     and (tg_op = 'INSERT' or old.status is distinct from 'presente') then
    perform public.emitir_certificado_participante(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emitir_certificado_presenca on public.inscricoes;
create trigger trg_emitir_certificado_presenca
after insert or update of status on public.inscricoes
for each row execute function public.tg_emitir_certificado_presenca();

create or replace function public.emitir_certificado_organizador(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizadores%rowtype;
  v_cert public.certificados%rowtype;
begin
  if not public.is_organizador() then
    raise exception 'Acesso restrito à organização';
  end if;

  select * into v_org from public.organizadores where id = p_id;
  if not found then
    raise exception 'Organizador não encontrado';
  end if;

  select * into v_cert
  from public.certificados
  where organizador_id = p_id and tipo = 'organizador'
  limit 1;
  if found then
    return public.certificado_json(v_cert);
  end if;

  insert into public.certificados (
    codigo, tipo, organizador_id, nome_snapshot, descricao_snapshot, carga_horaria_minutos, detalhe
  ) values (
    public.novo_codigo_certificado(),
    'organizador',
    v_org.id,
    v_org.nome,
    'Organização do IFPB Conecta 2026',
    v_org.carga_horaria_minutos,
    jsonb_build_object(
      'funcao', v_org.funcao,
      'eixo', v_org.eixo,
      'instituicao', v_org.instituicao,
      'matricula', v_org.matricula
    )
  )
  returning * into v_cert;

  return public.certificado_json(v_cert);
end;
$$;

create or replace function public.emitir_certificado_avaliador(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_av public.evento_avaliadores%rowtype;
  v_evt public.eventos%rowtype;
  v_cert public.certificados%rowtype;
begin
  if not public.is_organizador() then
    raise exception 'Acesso restrito à organização';
  end if;

  select * into v_av from public.evento_avaliadores where id = p_id;
  if not found then
    raise exception 'Avaliador não encontrado';
  end if;
  select * into v_evt from public.eventos where id = v_av.evento_id;

  select * into v_cert
  from public.certificados
  where avaliador_id = p_id and tipo = 'avaliador'
  limit 1;
  if found then
    return public.certificado_json(v_cert);
  end if;

  insert into public.certificados (
    codigo, tipo, avaliador_id, evento_id,
    nome_snapshot, descricao_snapshot, carga_horaria_minutos, detalhe
  ) values (
    public.novo_codigo_certificado(),
    'avaliador',
    v_av.id,
    v_evt.id,
    v_av.nome,
    v_evt.titulo,
    coalesce(v_evt.carga_horaria_minutos, v_evt.duracao_minutos),
    jsonb_build_object(
      'titulacao', v_av.titulacao,
      'tipo_evento', v_evt.tipo,
      'eixo', v_evt.eixo,
      'data', v_evt.data,
      'horario_inicio', to_char(v_evt.horario_inicio, 'HH24:MI'),
      'horario_fim', to_char((v_evt.horario_inicio + (v_evt.duracao_minutos * interval '1 minute'))::time, 'HH24:MI'),
      'localizacao', v_evt.localizacao
    )
  )
  returning * into v_cert;

  return public.certificado_json(v_cert);
end;
$$;

drop function if exists public.consultar_certificados(text, text, text);

create or replace function public.consultar_certificados(
  p_cpf text default null,
  p_email text default null,
  p_codigo text default null,
  p_matricula text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cpf text;
  v_email text;
  v_codigo text;
  v_matricula text;
begin
  v_codigo := upper(trim(coalesce(p_codigo, '')));
  if v_codigo <> '' then
    return coalesce((
      select jsonb_agg(public.certificado_json(c) order by c.emitido_em)
      from public.certificados c
      where c.codigo = v_codigo
    ), '[]'::jsonb);
  end if;

  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_matricula := nullif(upper(regexp_replace(coalesce(p_matricula, ''), '\s+', '', 'g')), '');
  v_email := lower(trim(coalesce(p_email, '')));
  if v_cpf = '' and v_matricula is null then
    raise exception 'Informe o CPF ou a matrícula';
  end if;
  if v_cpf <> '' and not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;

  return coalesce((
    select jsonb_agg(public.certificado_json(c) order by c.emitido_em)
    from public.certificados c
    left join public.participantes p on p.id = c.participante_id
    left join public.organizadores o on o.id = c.organizador_id
    left join public.evento_avaliadores a on a.id = c.avaliador_id
    where (v_cpf <> '' and p.cpf = v_cpf and lower(p.email) = v_email)
       or (v_cpf <> '' and o.cpf = v_cpf and lower(o.email) = v_email)
       or (v_matricula is not null and o.matricula = v_matricula and lower(o.email) = v_email)
       or (v_cpf <> '' and a.cpf = v_cpf and lower(a.email) = v_email)
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trabalhos científicos
-- O aluno envia sem login. A coordenação encaminha a um professor com acesso.
-- O aluno vê o histórico, sem o nome de quem avaliou.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.status_trabalho as enum (
    'submetido',
    'em_avaliacao',
    'avaliado',
    'com_coordenacao'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.recomendacao_trabalho as enum (
    'aceitar',
    'aceitar_com_correcoes',
    'nao_aceitar'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.movimento_trabalho as enum (
    'submetido',
    'encaminhado',
    'parecer',
    'cancelado'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.trabalhos (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  titulo text not null,
  eixo public.eixo_evento not null,
  palavras_chave text[],
  autor_nome text not null,
  autor_email text not null,
  autor_cpf text,
  autor_matricula text,
  orientador_nome text,
  orientador_email text,
  coautores jsonb not null default '[]'::jsonb,
  resumo text,
  introducao text,
  fundamentacao text,
  metodologia text,
  resultados text,
  discussoes text,
  bibliografia text,
  arquivo text,
  status public.status_trabalho not null default 'submetido',
  avaliador_id uuid references public.organizadores (id) on delete set null,
  recomendacao public.recomendacao_trabalho,
  parecer text,
  encaminhado_em timestamptz,
  avaliado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint trabalhos_titulo_ok check (char_length(titulo) between 10 and 180),
  constraint trabalhos_documento_ok check (autor_cpf is not null or autor_matricula is not null),
  constraint trabalhos_cpf_ok check (autor_cpf is null or public.cpf_valido(autor_cpf)),
  constraint trabalhos_matricula_ok check (autor_matricula is null or char_length(autor_matricula) between 3 and 30),
  constraint trabalhos_arquivo_ok check (arquivo is null or arquivo ~* '\.pdf$'),
  constraint trabalhos_coautores_ok check (jsonb_typeof(coautores) = 'array' and jsonb_array_length(coautores) <= 4)
);

create table if not exists public.trabalho_imagens (
  id uuid primary key default gen_random_uuid(),
  trabalho_id uuid not null references public.trabalhos (id) on delete cascade,
  caminho text not null unique,
  legenda text not null,
  ordem smallint not null,
  created_at timestamptz not null default now(),
  constraint trabalho_imagens_ordem_ok check (ordem between 1 and 3),
  constraint trabalho_imagens_legenda_ok check (char_length(legenda) between 3 and 160),
  unique (trabalho_id, ordem)
);

create table if not exists public.trabalho_movimentos (
  id uuid primary key default gen_random_uuid(),
  trabalho_id uuid not null references public.trabalhos (id) on delete cascade,
  tipo public.movimento_trabalho not null,
  recomendacao public.recomendacao_trabalho,
  parecer text,
  avaliador_id uuid references public.organizadores (id) on delete set null,
  ocorrido_em timestamptz not null default now()
);

create index if not exists trabalhos_autor_email_idx on public.trabalhos (autor_email);
create index if not exists trabalhos_status_idx on public.trabalhos (status);

alter table public.trabalhos alter column palavras_chave drop not null;
alter table public.trabalhos alter column orientador_nome drop not null;
alter table public.trabalhos alter column orientador_email drop not null;
alter table public.trabalhos alter column resumo drop not null;
alter table public.trabalhos alter column introducao drop not null;
alter table public.trabalhos alter column fundamentacao drop not null;
alter table public.trabalhos alter column metodologia drop not null;
alter table public.trabalhos alter column resultados drop not null;
alter table public.trabalhos alter column discussoes drop not null;
alter table public.trabalhos alter column bibliografia drop not null;
alter table public.trabalhos add column if not exists arquivo text;
alter table public.trabalhos drop constraint if exists trabalhos_resumo_ok;
alter table public.trabalhos drop constraint if exists trabalhos_palavras_ok;
alter table public.trabalhos drop constraint if exists trabalhos_arquivo_ok;
alter table public.trabalhos
  add constraint trabalhos_arquivo_ok check (arquivo is null or arquivo ~* '\.pdf$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trabalhos', 'trabalhos', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_coordenacao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizadores o
    where o.user_id = auth.uid() and o.funcao = 'coordenacao'
  );
$$;

create or replace function public.organizador_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id from public.organizadores o where o.user_id = auth.uid() limit 1;
$$;

create or replace function public.submeter_trabalho(p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_protocolo text;
  v_cpf text;
  v_matricula text;
  v_email text;
  v_nome text;
  v_eixo public.eixo_evento;
  v_tentativa integer := 0;
begin
  if coalesce(p_dados->>'website', '') <> '' then
    raise exception 'Não foi possível enviar';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados inválidos';
  end if;

  begin
    v_eixo := (p_dados->>'eixo')::public.eixo_evento;
  exception when invalid_text_representation then
    raise exception 'Eixo inválido';
  end;

  if auth.uid() is null then
    raise exception 'Entre na sua conta para enviar o artigo';
  end if;
  select nome, lower(email), cpf
    into v_nome, v_email, v_cpf
  from public.participantes
  where user_id = auth.uid();
  if not found then
    raise exception 'Crie sua conta e inscreva-se em uma atividade antes de enviar o artigo';
  end if;
  if not exists (
    select 1 from public.inscricoes i
    join public.participantes p on p.id = i.participante_id
    where p.user_id = auth.uid()
      and i.status <> 'cancelada'
  ) then
    raise exception 'Inscreva-se em uma atividade antes de enviar o artigo';
  end if;
  v_matricula := null;
  if char_length(btrim(coalesce(p_dados->>'titulo', ''))) not between 10 and 180 then
    raise exception 'O título deve ter entre 10 e 180 caracteres';
  end if;

  while v_tentativa < 5 loop
    v_tentativa := v_tentativa + 1;
    v_protocolo := 'IFPB-T-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.trabalhos (
        protocolo, titulo, eixo, autor_nome, autor_email, autor_cpf, autor_matricula
      ) values (
        v_protocolo,
        btrim(p_dados->>'titulo'),
        v_eixo,
        v_nome,
        v_email,
        v_cpf,
        v_matricula
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tentativa >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.trabalho_movimentos (trabalho_id, tipo)
  values (v_id, 'submetido');

  return jsonb_build_object('id', v_id, 'protocolo', v_protocolo);
end;
$$;

drop function if exists public.anexar_imagem_trabalho(uuid, text, text, text, text, text);

create or replace function public.anexar_pdf_trabalho(
  p_trabalho uuid,
  p_cpf text,
  p_matricula text,
  p_email text,
  p_caminho text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.trabalhos;
begin
  perform pg_advisory_xact_lock(hashtext(p_trabalho::text)::bigint);
  select * into v_trabalho from public.trabalhos where id = p_trabalho for update;
  if not found then
    raise exception 'Trabalho não encontrado';
  end if;
  if v_trabalho.status <> 'submetido' or v_trabalho.arquivo is not null then
    raise exception 'Este trabalho já tem PDF';
  end if;

  if not exists (
    select 1 from public.participantes p
    where p.user_id = auth.uid()
      and lower(p.email) = v_trabalho.autor_email
      and p.cpf = v_trabalho.autor_cpf
  ) then
    raise exception 'Não foi possível anexar o PDF';
  end if;
  if p_caminho !~ ('^' || p_trabalho::text || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Envie um arquivo PDF';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'trabalhos' and name = p_caminho
  ) then
    raise exception 'O PDF não chegou ao armazenamento';
  end if;

  update public.trabalhos set arquivo = p_caminho where id = p_trabalho;
  return jsonb_build_object('arquivo', p_caminho);
end;
$$;

create or replace function public.descartar_submissao(
  p_trabalho uuid,
  p_cpf text,
  p_matricula text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.trabalhos;
begin
  select * into v_trabalho from public.trabalhos where id = p_trabalho for update;
  if not found then
    return;
  end if;
  if v_trabalho.status = 'submetido'
     and v_trabalho.arquivo is null
     and exists (
       select 1 from public.participantes p
       where p.user_id = auth.uid()
         and lower(p.email) = v_trabalho.autor_email
         and p.cpf = v_trabalho.autor_cpf
     ) then
    delete from public.trabalhos where id = p_trabalho;
  end if;
end;
$$;

create or replace function public.consultar_trabalhos_aluno(
  p_cpf text default null,
  p_matricula text default null,
  p_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cpf text;
  v_matricula text;
  v_email text;
begin
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_matricula := nullif(upper(regexp_replace(coalesce(p_matricula, ''), '\s+', '', 'g')), '');
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_cpf = '' and v_matricula is null then
    raise exception 'Informe o CPF ou a matrícula';
  end if;
  if v_cpf <> '' and not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'protocolo', t.protocolo,
      'titulo', t.titulo,
      'eixo', t.eixo,
      'status', t.status,
      'criado_em', t.created_at,
      'tem_pdf', t.arquivo is not null,
      'historico', coalesce((
        select jsonb_agg(jsonb_build_object(
          'quando', m.ocorrido_em,
          'tipo', m.tipo,
          'recomendacao', m.recomendacao,
          'parecer', m.parecer
        ) order by m.ocorrido_em)
        from public.trabalho_movimentos m
        where m.trabalho_id = t.id
      ), '[]'::jsonb)
    ) order by t.created_at desc)
    from public.trabalhos t
    where t.autor_email = v_email
      and (v_cpf = '' or t.autor_cpf = v_cpf)
      and (v_matricula is null or t.autor_matricula = v_matricula)
      and (
        (v_cpf <> '' and t.autor_cpf = v_cpf)
        or (v_matricula is not null and t.autor_matricula = v_matricula)
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.encaminhar_trabalho(p_id uuid, p_professor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.trabalhos;
begin
  if not public.is_coordenacao() then
    raise exception 'Só a coordenação encaminha trabalhos';
  end if;
  if not exists (
    select 1 from public.organizadores o
    where o.id = p_professor and o.pode_avaliar_trabalhos and o.user_id is not null
  ) then
    raise exception 'Escolha um professor que já criou senha e pode avaliar trabalhos';
  end if;

  select * into v_trabalho from public.trabalhos where id = p_id for update;
  if not found then
    raise exception 'Trabalho não encontrado';
  end if;
  if v_trabalho.status = 'em_avaliacao' then
    raise exception 'Cancele o envio atual antes de encaminhar a outro professor';
  end if;
  if v_trabalho.arquivo is null then
    raise exception 'Este trabalho ainda não tem PDF';
  end if;

  update public.trabalhos
  set status = 'em_avaliacao',
      avaliador_id = p_professor,
      encaminhado_em = now(),
      recomendacao = null,
      parecer = null,
      avaliado_em = null
  where id = p_id;

  insert into public.trabalho_movimentos (trabalho_id, tipo, avaliador_id)
  values (p_id, 'encaminhado', p_professor);

  return jsonb_build_object('id', p_id, 'status', 'em_avaliacao');
end;
$$;

create or replace function public.cancelar_encaminhamento(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.trabalhos;
begin
  if not public.is_coordenacao() then
    raise exception 'Só a coordenação cancela o envio';
  end if;
  select * into v_trabalho from public.trabalhos where id = p_id for update;
  if not found then
    raise exception 'Trabalho não encontrado';
  end if;
  if v_trabalho.status <> 'em_avaliacao' then
    raise exception 'Este trabalho não está com um professor';
  end if;

  update public.trabalhos
  set status = 'com_coordenacao',
      avaliador_id = null,
      encaminhado_em = null
  where id = p_id;

  insert into public.trabalho_movimentos (trabalho_id, tipo)
  values (p_id, 'cancelado');

  return jsonb_build_object('id', p_id, 'status', 'com_coordenacao');
end;
$$;

create or replace function public.devolver_parecer(
  p_id uuid,
  p_recomendacao text,
  p_parecer text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.trabalhos;
  v_recomendacao public.recomendacao_trabalho;
  v_parecer text := btrim(coalesce(p_parecer, ''));
begin
  begin
    v_recomendacao := p_recomendacao::public.recomendacao_trabalho;
  exception when invalid_text_representation then
    raise exception 'Recomendação inválida';
  end;
  if char_length(v_parecer) < 20 or char_length(v_parecer) > 8000 then
    raise exception 'O parecer deve ter entre 20 e 8000 caracteres';
  end if;

  select * into v_trabalho from public.trabalhos where id = p_id for update;
  if not found then
    raise exception 'Trabalho não encontrado';
  end if;
  if v_trabalho.status <> 'em_avaliacao' or v_trabalho.avaliador_id is distinct from public.organizador_atual() then
    raise exception 'Este trabalho não está com você para avaliação';
  end if;

  update public.trabalhos
  set status = 'avaliado',
      recomendacao = v_recomendacao,
      parecer = v_parecer,
      avaliado_em = now()
  where id = p_id;

  insert into public.trabalho_movimentos (trabalho_id, tipo, recomendacao, parecer, avaliador_id)
  values (p_id, 'parecer', v_recomendacao, v_parecer, v_trabalho.avaliador_id);

  return jsonb_build_object('id', p_id, 'status', 'avaliado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Segurança das tabelas
-- Quem visita o site (anon) só chama as funções públicas.
-- Quem entrou como organizador lê e grava as tabelas da organização.
-- ---------------------------------------------------------------------------

alter table public.organizadores enable row level security;
alter table public.eventos enable row level security;
alter table public.evento_avaliadores enable row level security;
alter table public.participantes enable row level security;
alter table public.inscricoes enable row level security;
alter table public.certificados enable row level security;
alter table public.trabalhos enable row level security;
alter table public.trabalho_imagens enable row level security;
alter table public.trabalho_movimentos enable row level security;

drop policy if exists organizadores_admin on public.organizadores;
create policy organizadores_admin on public.organizadores
for all to authenticated
using (public.is_organizador())
with check (public.is_organizador());

drop policy if exists eventos_admin on public.eventos;
create policy eventos_admin on public.eventos
for all to authenticated
using (public.is_organizador())
with check (public.is_organizador());

drop policy if exists avaliadores_admin on public.evento_avaliadores;
create policy avaliadores_admin on public.evento_avaliadores
for all to authenticated
using (public.is_organizador())
with check (public.is_organizador());

drop policy if exists participantes_admin on public.participantes;
create policy participantes_admin on public.participantes
for all to authenticated
using (public.is_organizador())
with check (public.is_organizador());

drop policy if exists inscricoes_admin on public.inscricoes;
create policy inscricoes_admin on public.inscricoes
for all to authenticated
using (public.is_organizador())
with check (public.is_organizador());

drop policy if exists certificados_leitura on public.certificados;
create policy certificados_leitura on public.certificados
for select to authenticated
using (public.is_organizador());

drop policy if exists certificados_exclusao on public.certificados;
create policy certificados_exclusao on public.certificados
for delete to authenticated
using (public.is_organizador());

drop policy if exists trabalhos_leitura on public.trabalhos;
create policy trabalhos_leitura on public.trabalhos
for select to authenticated
using (
  public.is_coordenacao()
  or avaliador_id = public.organizador_atual()
);

drop policy if exists trabalho_imagens_leitura on public.trabalho_imagens;
create policy trabalho_imagens_leitura on public.trabalho_imagens
for select to authenticated
using (
  public.is_coordenacao()
  or exists (
    select 1 from public.trabalhos t
    where t.id = trabalho_id and t.avaliador_id = public.organizador_atual()
  )
);

drop policy if exists trabalho_movimentos_leitura on public.trabalho_movimentos;
create policy trabalho_movimentos_leitura on public.trabalho_movimentos
for select to authenticated
using (public.is_coordenacao());

drop policy if exists trabalhos_envio_arquivo on storage.objects;
create policy trabalhos_envio_arquivo on storage.objects
for insert to authenticated
with check (
  bucket_id = 'trabalhos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lower(storage.extension(name)) = 'pdf'
);

drop policy if exists trabalhos_leitura_arquivo on storage.objects;
create policy trabalhos_leitura_arquivo on storage.objects
for select to authenticated
using (
  bucket_id = 'trabalhos'
  and (
    public.is_coordenacao()
    or exists (
      select 1 from public.trabalhos t
      where t.avaliador_id = public.organizador_atual()
        and t.id::text = (storage.foldername(name))[1]
    )
  )
);

revoke all on table public.organizadores from public, anon;
revoke all on table public.eventos from public, anon;
revoke all on table public.evento_avaliadores from public, anon;
revoke all on table public.participantes from public, anon;
revoke all on table public.inscricoes from public, anon;
revoke all on table public.certificados from public, anon;
revoke all on table public.trabalhos from public, anon;
revoke all on table public.trabalho_imagens from public, anon;
revoke all on table public.trabalho_movimentos from public, anon;

grant select, insert, update, delete on public.organizadores to authenticated;
grant select, insert, update, delete on public.eventos to authenticated;
grant select, insert, update, delete on public.evento_avaliadores to authenticated;
grant select, insert, update, delete on public.participantes to authenticated;
grant select, insert, update, delete on public.inscricoes to authenticated;
grant select, delete on public.certificados to authenticated;
grant select on public.trabalhos to authenticated;
grant select on public.trabalho_imagens to authenticated;
grant select on public.trabalho_movimentos to authenticated;

revoke all on function public.cpf_valido(text) from public;
revoke all on function public.email_da_sessao() from public;
revoke all on function public.is_organizador() from public;
revoke all on function public.estado_acesso() from public;
revoke all on function public.criar_primeiro_organizador(text, text, text, text, text, integer) from public;
revoke all on function public.vincular_organizador() from public;
revoke all on function public.programacao_publica() from public;
revoke all on function public.inscrever_participante(text, text, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.novo_codigo_certificado() from public;
revoke all on function public.certificado_json(public.certificados) from public;
revoke all on function public.emitir_certificado_participante(uuid) from public;
revoke all on function public.emitir_certificado_organizador(uuid) from public;
revoke all on function public.emitir_certificado_avaliador(uuid) from public;
revoke all on function public.consultar_certificados(text, text, text, text) from public;
revoke all on function public.tg_normalizar_pessoa() from public;
revoke all on function public.tg_evento_padrao() from public;
revoke all on function public.tg_ultimo_organizador() from public;
revoke all on function public.tg_emitir_certificado_presenca() from public;
revoke all on function public.is_coordenacao() from public;
revoke all on function public.organizador_atual() from public;
revoke all on function public.submeter_trabalho(jsonb) from public, anon;
revoke all on function public.anexar_pdf_trabalho(uuid, text, text, text, text) from public, anon;
revoke all on function public.descartar_submissao(uuid, text, text, text) from public, anon;
revoke all on function public.consultar_trabalhos_aluno(text, text, text) from public, anon, authenticated;
revoke all on function public.encaminhar_trabalho(uuid, uuid) from public;
revoke all on function public.cancelar_encaminhamento(uuid) from public;
revoke all on function public.devolver_parecer(uuid, text, text) from public;
revoke all on function public.minha_area() from public;
revoke all on function public.registrar_checkin(uuid) from public;

grant execute on function public.cpf_valido(text) to anon, authenticated;
grant execute on function public.email_da_sessao() to authenticated;
grant execute on function public.is_organizador() to authenticated;
grant execute on function public.estado_acesso() to anon, authenticated;
grant execute on function public.criar_primeiro_organizador(text, text, text, text, text, integer) to authenticated;
grant execute on function public.vincular_organizador() to authenticated;
grant execute on function public.programacao_publica() to anon, authenticated;
grant execute on function public.inscrever_participante(text, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.minha_area() to authenticated;
grant execute on function public.registrar_checkin(uuid) to authenticated;
grant execute on function public.certificado_json(public.certificados) to anon, authenticated;
grant execute on function public.emitir_certificado_participante(uuid) to authenticated;
grant execute on function public.emitir_certificado_organizador(uuid) to authenticated;
grant execute on function public.emitir_certificado_avaliador(uuid) to authenticated;
grant execute on function public.consultar_certificados(text, text, text, text) to anon, authenticated;
grant execute on function public.tg_normalizar_pessoa() to anon, authenticated;
grant execute on function public.tg_evento_padrao() to authenticated;
grant execute on function public.tg_ultimo_organizador() to authenticated;
grant execute on function public.tg_emitir_certificado_presenca() to authenticated;
grant execute on function public.is_coordenacao() to authenticated;
grant execute on function public.organizador_atual() to authenticated;
grant execute on function public.submeter_trabalho(jsonb) to authenticated;
grant execute on function public.anexar_pdf_trabalho(uuid, text, text, text, text) to authenticated;
grant execute on function public.descartar_submissao(uuid, text, text, text) to authenticated;
grant execute on function public.encaminhar_trabalho(uuid, uuid) to authenticated;
grant execute on function public.cancelar_encaminhamento(uuid) to authenticated;
grant execute on function public.devolver_parecer(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Exemplo comentado, para testar depois que a coordenação já tiver entrado.
-- A programação pública só mostra o que estiver publicado.
--
-- insert into public.eventos (
--   titulo, tipo, eixo, responsavel_nome, data, horario_inicio,
--   duracao_minutos, localizacao, capacidade, forma_inscricao, publicado
-- ) values (
--   'Abertura do IFPB Conecta', 'palestra', 'geral', 'Coordenação',
--   '2026-11-23', '08:00', 60, 'Auditório', 200, 'livre', true
-- );
