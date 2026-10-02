-- Suporte à importação do Snov.io (planilha com uma linha por pessoa, não por conta).
--
-- `papel_comite` (de 001) já é usado pela vw_planilha, pelo catálogo de sinais e pelos testes com um
-- sentido diferente ("papel no comitê clássico": decisor, campeão, bloqueador...). A classificação do
-- Snov é outra dimensão — quem paga, quem é dono do problema, quem guarda a porta — por isso ganha
-- coluna própria (`papel_icp`); o importador ainda espelha um `papel_comite` razoável, para a vw_planilha
-- e o catálogo de sinais continuarem funcionando sem mudança.

alter table conta
  add column porte text,
  add column etapa text not null default 'ativa' check (etapa in ('ativa', 'descartada')),
  add column motivo_descarte text,
  add column uf_decisor_relevante boolean not null default false,
  add column fit_icp boolean,
  add column cobertura_comite smallint check (cobertura_comite between 0 and 3);

alter table pessoa
  add column papel_icp text check (papel_icp in ('pagador', 'dono_problema', 'guardiao', 'influenciador')),
  add column email_status text not null default 'desconhecido' check (
    email_status in ('verificado', 'provavel', 'invalido', 'desconhecido')
  ),
  add column linkedin_normalizado text;

create index pessoa_linkedin_normalizado_idx on pessoa (linkedin_normalizado) where linkedin_normalizado is not null;
create index pessoa_email_lower_idx on pessoa (lower(email)) where email is not null;

-- Conflitos de uma importação: campo que a planilha traz diferente do que a conta já tinha (não
-- sobrescrito), pessoa cujo e-mail/LinkedIn já apontava para outra conta, etc. Fica para revisão humana.
create table importacao_conflito (
  id serial primary key,
  importacao text not null,
  tipo text not null check (
    tipo in ('campo_divergente', 'pessoa_mudou_de_conta', 'conta_duplicada_possivel')
  ),
  conta_id uuid references conta (id) on delete cascade,
  pessoa_id uuid references pessoa (id) on delete set null,
  detalhe text,
  linha_origem integer,
  criado_em timestamptz not null default now()
);

-- Um resumo por rodada de importação (o que o terminal imprime, gravado para consulta depois).
create table importacao_relatorio (
  id serial primary key,
  importacao text not null,
  arquivo text not null,
  resumo jsonb not null,
  criado_em timestamptz not null default now()
);
