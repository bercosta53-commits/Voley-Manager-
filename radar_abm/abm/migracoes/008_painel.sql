-- Envio ao painel: quando cada sinal foi para a caixa "Captados pela IA" e com qual documento.
alter table sinais add column enviado_painel_em timestamp;
alter table sinais add column painel_doc_id text;
