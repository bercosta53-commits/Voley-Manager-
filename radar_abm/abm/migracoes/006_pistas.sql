-- Vagas de consultorias de recrutamento (Michael Page, Robert Half, Hays...). O anúncio costuma esconder o
-- cliente: a vaga vira uma pista com contas candidatas, e só vira sinal quando alguém confirma a conta.
create table pistas_vagas (
    id              text primary key,
    consultoria     text not null,
    referencia      text not null,              -- código da vaga na consultoria (ou o link)
    titulo          text not null,
    url             text,
    local           text,
    setor           text,
    descricao       text,                       -- "Sobre nosso cliente" e resumo do anúncio
    data_publicacao date,
    data_coleta     timestamp not null,
    grupo           text,                       -- vaga_lideranca_receita | vaga_marketing_growth | vaga_comercial
    braco_icp       text,                       -- deduzido do setor e da descrição
    candidatos_json text,                       -- [{"conta_id", "nome", "pontos", "motivos"}]
    status          text not null check (status in ('aberta', 'sem_candidato', 'fora_do_icp', 'atribuida', 'descartada')),
    conta_id        text references contas(id) on delete set null,
    sinal_id        text,
    unique (consultoria, referencia)
);
create index idx_pistas_status on pistas_vagas (status);
