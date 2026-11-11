-- Fase 5: o que o classificador decidiu sobre cada item bruto, e de onde veio cada sinal.
alter table itens_brutos add column classificacao text;      -- sinal | revisar | ruido | outra_empresa | sem_tipo | duplicado
alter table itens_brutos add column classificacao_motivo text;
alter table itens_brutos add column classificado_em timestamp;
alter table sinais add column item_id text;                   -- o item bruto que serviu de evidência
alter table sinais add column por_que_agora text;
alter table sinais add column classificador text;             -- claude:<modelo>, regras ou o conector que gerou
create index idx_itens_classificacao on itens_brutos (conector, classificacao);
