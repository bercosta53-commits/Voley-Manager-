-- Dados de curadoria que a planilha de contatos enriquecida (r13+) traz por conta: prioridade de
-- ataque, lote/tier de sourcing, critério de ICP que justificou a entrada, região declarada no
-- sourcing e de onde a conta veio. `regiao_validada` registra que o sourcing já filtrou a conta pelo
-- recorte de UFs — o cálculo de fit usa isso enquanto a UF não chega.

alter table conta
  add column prioridade text check (prioridade ~ '^P[0-9]$'),
  add column lote text,
  add column criterio_icp text,
  add column regiao_sourcing text,
  add column fonte_conta text,
  add column regiao_validada boolean not null default false;
