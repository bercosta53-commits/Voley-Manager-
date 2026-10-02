-- Fase 1: contas, identidade e o registro de tudo que os conectores trazem.
-- Só usa tipos e comandos que o SQLite e o Postgres entendem igual, para migrar depois sem reescrever.
-- Datas ficam no formato ISO (2026-09-25 ou 2026-09-25T14:03:00).

create table contas (
    id               text primary key,          -- o id da planilha (ex.: F-002) ou um gerado
    cnpj             varchar(14) unique,        -- CNPJ da matriz, 14 dígitos
    cnpj_raiz        varchar(8) unique,         -- 8 primeiros dígitos: iguais na matriz e nas filiais
    razao_social     text,
    nome_fantasia    text not null,
    dominio          text unique,               -- site reduzido ao domínio (ex.: logcomex.com)
    uf               varchar(2),
    cidade           text,
    braco_icp        text,                      -- servicos_profissionais | servicos_financeiros | tecnologia
    subsegmento      text,
    grupo_economico  text,
    status           text,                      -- status comercial vindo da planilha
    tier             varchar(1),                -- A, B ou C (resultado da rubrica, não recalculado aqui)
    score_estrutural integer,
    score_ativacao   integer,
    confianca_base   text,
    fonte_principal  text,
    contexto_json    text,                      -- demais colunas da planilha (gatilho, ângulo, próxima ação...)
    criada_em        timestamp not null,
    atualizada_em    timestamp not null
);

-- Outros CNPJs da mesma empresa (filiais) e linhas duplicadas que foram juntadas numa conta.
create table filiais (
    cnpj          varchar(14) primary key,
    conta_id      text not null references contas(id) on delete cascade,
    nome_planilha text,
    uf            varchar(2),
    cidade        text,
    mesclada_de   text                          -- id da linha duplicada que virou esta filial, se houve
);

create table aliases (
    id               text primary key,
    conta_id         text not null references contas(id) on delete cascade,
    termo            text not null,
    tipo             text not null check (tipo in ('fantasia', 'sigla', 'variacao', 'manual')),
    termos_negativos text,                      -- palavras que, se aparecerem, indicam outra empresa (separadas por ;)
    ambiguo          boolean not null default false,
    motivo           text,                      -- por que foi marcado como ambíguo
    ativo            boolean not null default true,  -- só termos ativos entram nas buscas
    revisado         boolean not null default false,
    unique (conta_id, termo)
);

create table pessoas (
    id           text primary key,
    conta_id     text not null references contas(id) on delete cascade,
    nome         text not null,
    cargo        text,
    papel_comite text not null check (papel_comite in ('decisor', 'influenciador', 'usuario', 'bloqueador')),
    apollo_id    text,
    unique (conta_id, nome)
);

-- Última "foto" de cada fonte por conta, para comparar na próxima coleta.
create table snapshots (
    conta_id      text not null references contas(id) on delete cascade,
    conector      text not null,
    data          timestamp not null,
    conteudo_json text not null,
    primary key (conta_id, conector, data)
);

create table itens_brutos (
    id              text primary key,
    conector        text not null,
    conta_id        text references contas(id) on delete cascade,
    url             text,
    titulo          text,
    trecho          text,
    data_publicacao date,
    data_coleta     timestamp not null,
    hash            text not null unique        -- impressão digital do item: o mesmo item nunca entra duas vezes
);

create table sinais (
    id               text primary key,
    conta_id         text not null references contas(id) on delete cascade,
    tipo             text not null,
    evento_id        text,                      -- agrupa a mesma notícia vinda de vários veículos
    peso             integer,
    confianca        double precision,
    membro_comite    text,
    angulo           text,
    evidencia_url    text,
    evidencia_trecho text,
    data_fato        date,
    data_alerta      timestamp,
    status           text not null default 'revisar' check (status in ('alerta', 'revisar', 'descartado'))
);

create table feedback (
    sinal_id   text not null references sinais(id) on delete cascade,
    avaliacao  text not null check (avaliacao in ('util', 'ruido')),
    comentario text,
    data       timestamp not null
);

create table execucoes (
    id       text primary key,
    conector text not null,
    inicio   timestamp not null,
    fim      timestamp,
    itens    integer not null default 0,
    erros    integer not null default 0,
    detalhe  text                               -- mensagens de erro, uma por linha
);

create index idx_pessoas_conta on pessoas (conta_id);
create index idx_aliases_conta on aliases (conta_id);
create index idx_itens_conta on itens_brutos (conta_id, conector);
create index idx_sinais_conta on sinais (conta_id, status);
