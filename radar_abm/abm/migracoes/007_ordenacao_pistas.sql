-- Ordenação das candidatas de uma pista pelo Claude: quem ordenou, quando e qual conta ele sugere.
alter table pistas_vagas add column ordenado_por text;
alter table pistas_vagas add column ordenado_em timestamp;
alter table pistas_vagas add column sugestao_conta text;   -- só quando uma candidata se destaca claramente
