-- Fundação única de dados do Radar de Sinais Velora.
-- Cinco entidades: conta, pessoa, sinal, evento de abordagem e desfecho.
-- Apoio: grupo econômico, estabelecimentos (CNPJs de matriz e filiais), versões da rubrica e buracos.

create table grupo_economico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table conta (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_normalizado text not null,
  -- Matriz e filiais têm a mesma raiz: a raiz identifica a conta.
  cnpj_raiz char(8) unique check (cnpj_raiz ~ '^[0-9]{8}$'),
  dominio text unique check (dominio ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  grupo_economico_id uuid references grupo_economico (id),
  uf char(2),
  cidade text,
  setor text,
  braco text,
  abc char(1) check (abc in ('A', 'B', 'C')),
  headcount integer check (headcount >= 0),
  capital_social numeric(18, 2),
  observacoes text,
  origem text not null default 'planilha',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index conta_nome_normalizado_idx on conta (nome_normalizado);

create table estabelecimento (
  cnpj char(14) primary key check (cnpj ~ '^[0-9]{14}$'),
  conta_id uuid not null references conta (id) on delete cascade,
  matriz boolean not null,
  uf char(2),
  cidade text
);

create table pessoa (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references conta (id) on delete cascade,
  nome text not null,
  cargo text,
  papel_comite text not null default 'indefinido' check (
    papel_comite in ('decisor', 'influenciador', 'campeao', 'financeiro', 'tecnico', 'usuario', 'bloqueador', 'indefinido')
  ),
  email text,
  linkedin text,
  uf char(2),
  ativo boolean not null default true,
  origem text not null default 'planilha',
  criado_em timestamptz not null default now(),
  unique (conta_id, nome)
);

create table sinal (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references conta (id) on delete cascade,
  pessoa_id uuid references pessoa (id) on delete set null,
  tipo text not null,
  fonte text not null,
  data_evento date not null,
  detalhe text,
  evidencia_url text,
  evidencia_trecho text,
  peso numeric(6, 2),
  status text not null default 'aprovado' check (status in ('pendente', 'aprovado', 'descartado')),
  coletor text,
  captado_em timestamptz not null default now(),
  unique (conta_id, tipo, data_evento)
);

-- Cada contato registra qual versão da rubrica o motivou (loop de calibração).
create table rubrica_versao (
  id serial primary key,
  nome text not null,
  criterios jsonb not null,
  pesos jsonb not null,
  observacao text,
  ativa boolean not null default false,
  criada_em timestamptz not null default now()
);
create unique index rubrica_uma_ativa on rubrica_versao (ativa) where ativa;

create table evento_abordagem (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references conta (id) on delete cascade,
  pessoa_id uuid references pessoa (id) on delete set null,
  canal text not null check (canal in ('linkedin', 'email', 'telefone', 'whatsapp', 'evento', 'outro')),
  tipo text not null check (tipo in ('convite', 'mensagem', 'follow_up', 'ligacao', 'conteudo', 'reuniao_marcada')),
  ocorrido_em timestamptz not null default now(),
  sinal_ids uuid[] not null default '{}',
  rubrica_versao_id integer references rubrica_versao (id),
  texto text,
  autor text
);

create table desfecho (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references conta (id) on delete cascade,
  evento_id uuid references evento_abordagem (id) on delete set null,
  resultado text not null check (
    resultado in ('aceite', 'resposta', 'reuniao', 'oportunidade', 'ganho', 'perdido', 'sem_resposta', 'descartado')
  ),
  ocorrido_em timestamptz not null default now(),
  valor numeric(18, 2),
  observacao text
);

-- Buracos da migração: o que falta ou conflita. A meta da etapa 1 é zerar os abertos.
create table buraco (
  id serial primary key,
  conta_id uuid references conta (id) on delete cascade,
  tipo text not null check (
    tipo in ('sem_cnpj', 'cnpj_invalido', 'sem_dominio', 'dominio_generico', 'conflito_cnpj_dominio', 'possivel_grupo', 'linha_vazia')
  ),
  detalhe text,
  linha_origem integer,
  aberto boolean not null default true,
  resolucao text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create unique index buraco_aberto_unico on buraco (conta_id, tipo) where aberto and conta_id is not null;

-- A planilha passa a ser visão, não fonte.
create view vw_planilha as
select
  c.nome as empresa,
  (select e.cnpj from estabelecimento e where e.conta_id = c.id order by e.matriz desc, e.cnpj limit 1) as cnpj,
  c.dominio as site,
  c.uf,
  c.cidade,
  c.setor,
  c.braco,
  c.abc,
  g.nome as grupo_economico,
  d.nome as decisor,
  d.cargo as cargo_decisor,
  d.linkedin as linkedin_decisor,
  (select count(*) from sinal s where s.conta_id = c.id and s.status = 'aprovado'
     and s.data_evento >= current_date - 30) as sinais_30d,
  (select f.resultado from desfecho f where f.conta_id = c.id order by f.ocorrido_em desc limit 1) as ultimo_desfecho,
  (select count(*) from buraco b where b.conta_id = c.id and b.aberto) as buracos_abertos,
  c.id as conta_id
from conta c
left join grupo_economico g on g.id = c.grupo_economico_id
left join lateral (
  select p.nome, p.cargo, p.linkedin from pessoa p
  where p.conta_id = c.id and p.ativo
  order by (p.papel_comite = 'decisor') desc, p.criado_em
  limit 1
) d on true;
