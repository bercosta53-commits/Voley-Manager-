-- Bibliotecas de anúncios (Google Ads Transparency Center e Meta Ad Library).

-- IDs confirmados do anunciante em cada plataforma (listas em JSON). Só entram por confirmação humana.
alter table contas add column meta_page_ids text;          -- ex.: ["1234567890"]
alter table contas add column google_advertiser_ids text;  -- ex.: ["AR01234567890123456789"]

-- Candidatos descobertos na primeira rodada, esperando confirmação. Nunca associados automaticamente.
create table anunciantes_candidatos (
    conta_id     text not null references contas(id) on delete cascade,
    plataforma   text not null check (plataforma in ('google', 'meta')),
    id_externo   text not null,
    nome         text,
    evidencia    text,                                -- por que ele é candidato (nome, domínio dos anúncios...)
    pontos       integer not null default 0,
    status       text not null default 'pendente' check (status in ('pendente', 'confirmado', 'rejeitado')),
    descoberto_em timestamp not null,
    decidido_em  timestamp,
    primary key (conta_id, plataforma, id_externo)
);

-- Cada anúncio visto: texto e link, nunca imagem ou vídeo.
create table anuncios (
    plataforma     text not null check (plataforma in ('google', 'meta')),
    id             text not null,
    conta_id       text not null references contas(id) on delete cascade,
    anunciante_id  text,
    inicio         date,
    ultimo         date,
    ativo          integer not null default 0,
    texto          text,
    cta            text,
    url_destino    text,
    formato        text,
    visto_em       timestamp not null,
    primary key (plataforma, id)
);
create index idx_anuncios_conta on anuncios (conta_id, plataforma, ativo);

-- Tecnologias de mídia detectadas no site (pixel do Meta, tag do Google Ads, LinkedIn Insight Tag).
-- Quem preenche é o conector de site (a construir); o conector de anúncios só lê.
create table site_tecnologias (
    conta_id     text not null references contas(id) on delete cascade,
    tecnologia   text not null check (tecnologia in ('meta_pixel', 'google_ads_tag', 'linkedin_insight')),
    detectado_em timestamp not null,
    primary key (conta_id, tecnologia)
);

-- Raio-x de mídia da conta, refeito a cada coleta.
create table raiox_midia (
    conta_id   text primary key references contas(id) on delete cascade,
    gerado_em  timestamp not null,
    texto      text not null,
    dados_json text not null
);

-- Chamadas pagas a provedores, para o custo mensal por provedor.
create table chamadas_provedor (
    provedor  text not null,
    conector  text not null,
    operacao  text not null,
    data      timestamp not null,
    custo_usd double precision not null default 0
);
create index idx_chamadas_provedor on chamadas_provedor (provedor, data);
