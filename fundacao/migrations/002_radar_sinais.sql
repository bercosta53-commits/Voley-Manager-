-- Etapa 2: radar de sinais brasileiro.
-- Coletores gravam itens brutos; o classificador transforma os relevantes em sinais, sempre com evidência.

create table coleta_item (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references conta (id) on delete cascade,
  coletor text not null,
  -- Identidade do item na fonte (URL, protocolo CVM, sócio+data...): o mesmo item nunca entra duas vezes.
  chave text not null,
  fonte text not null,
  url text,
  titulo text not null,
  texto text,
  publicado_em date,
  tipo_sugerido text,
  bruto jsonb,
  status text not null default 'novo' check (status in ('novo', 'sinal', 'ruido', 'erro')),
  motivo text,
  coletado_em timestamptz not null default now(),
  classificado_em timestamptz,
  unique (coletor, chave)
);
create index coleta_item_novo_idx on coleta_item (status) where status = 'novo';

-- Última foto de uma fonte estruturada por conta, para detectar o que mudou (QSA, capital social).
create table fonte_snapshot (
  conta_id uuid not null references conta (id) on delete cascade,
  coletor text not null,
  conteudo jsonb not null,
  capturado_em timestamptz not null default now(),
  primary key (conta_id, coletor)
);

alter table sinal
  add column coleta_item_id uuid references coleta_item (id) on delete set null,
  add column papel_afetado text check (
    papel_afetado in ('decisor', 'influenciador', 'campeao', 'financeiro', 'tecnico', 'usuario', 'bloqueador', 'indefinido')
  ),
  add column cargo_afetado text,
  add column meia_vida_dias integer check (meia_vida_dias > 0),
  add column confianca text check (confianca in ('alta', 'media', 'baixa')),
  add column classificador text;

-- Valor de cada sinal hoje: peso com decaimento exponencial pela meia-vida do tipo.
create view vw_sinal_vigente as
select
  s.*,
  (current_date - s.data_evento) as idade_dias,
  round((s.peso * power(0.5, greatest(current_date - s.data_evento, 0)::numeric / coalesce(s.meia_vida_dias, 30)))::numeric, 3)
    as valor_hoje
from sinal s
where s.status = 'aprovado' and s.data_evento <= current_date;
