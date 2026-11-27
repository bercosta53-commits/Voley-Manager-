-- Reversão de db/001_radar_acoes.sql.
-- ATENÇÃO: apaga o histórico de ações do time. Antes de rodar, exporte a tabela:
--   copy (select * from radar_acoes order by id) to stdout with csv header;
drop trigger if exists radar_acoes_sem_update_delete on radar_acoes;
drop function if exists radar_acoes_imutavel();
drop table if exists radar_acoes;
