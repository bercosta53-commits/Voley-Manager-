-- Velora Radar · relacionamento da Velora com pessoas do comitê (reconhecimento de nova liderança, 26/11/2026)
-- Privado: nunca entra no snapshot exportado nem no GitHub como dado. Só o servidor (chave secreta) lê e grava.
-- Aplicar no SQL Editor do Supabase. Reversão: ver o fim do arquivo.

create table if not exists public.radar_relacionamentos (
  id             bigint generated always as identity primary key,
  conta_id       text        not null,
  pessoa         text        not null,                  -- nome como está no comitê da conta
  nota           smallint    not null check (nota between 0 and 5),
  autor_email    text        not null,                  -- e-mail do Cloudflare Access de quem registrou
  registrado_em  timestamptz not null default now(),
  constraint radar_relacionamentos_unico unique (conta_id, pessoa, autor_email)
);

create index if not exists radar_relacionamentos_conta on public.radar_relacionamentos (conta_id);

-- RLS ligado e nenhuma política para anon/authenticated: só a chave secreta (servidor do Radar) acessa.
alter table public.radar_relacionamentos enable row level security;

-- Escala (docs/vscs-3-3-dc.md 3.9): 0 sem relação · 1 conexão no LinkedIn/conhecido de mercado · 2 contato prévio
-- · 3 relação profissional · 4 acesso direto · 5 amigo profissional, com entrada.

-- Exportação para a simulação da 3.3 (somente leitura; sem autor), maior nota por pessoa:
-- select jsonb_object_agg(conta_id, pessoas) from (
--   select conta_id, jsonb_object_agg(pessoa, jsonb_build_object('nota', nota, 'em', em::date)) as pessoas
--   from (select distinct on (conta_id, pessoa) conta_id, pessoa, nota, registrado_em as em
--         from public.radar_relacionamentos order by conta_id, pessoa, nota desc, registrado_em desc) x
--   group by conta_id) y;

-- Reversão:
-- drop table if exists public.radar_relacionamentos;
