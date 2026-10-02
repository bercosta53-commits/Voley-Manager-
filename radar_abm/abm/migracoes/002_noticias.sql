-- Fase 3: notícias. O mesmo fato publicado por vários veículos vira um único evento.
alter table itens_brutos add column evento_id text;
alter table itens_brutos add column veiculo text;
create index idx_itens_evento on itens_brutos (conta_id, evento_id);
