-- Estado das ações da pessoa sobre cada sinal, feitas no app Velora Radar (tela Hoje): abordado, adiado,
-- arquivado e útil/ruído. Uma linha por sinal; a última substitui a anterior. Útil/ruído também vira uma
-- linha em `feedback` (a mesma tabela que `manager.py feedback` grava), para `manager.py metricas` enxergar
-- as duas fontes juntas.
create table app_estados (
    sinal_id  text primary key,
    acao      text check (acao in ('abordado', 'adiado', 'arquivado')),
    ate       date,
    avaliacao text check (avaliacao in ('util', 'ruido')),
    em        date not null
);
