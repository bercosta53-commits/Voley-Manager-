-- PROPOSTA (D6) · não aplicar antes do alinhamento com a carga diária (ver docs/contrato-radar-acoes.md).
--
-- Registro das ações comerciais feitas no Velora Radar. Só de inserção: cada clique vira uma linha nova,
-- com autor e data. "Desfazer" também é uma linha nova (desfaz_id aponta para a ação desfeita); nada é
-- atualizado ou apagado. O estado atual de cada sinal e de cada conta é derivado deste registro.
--
-- Quem escreve: só o app (servidor do Worker, chave secreta). A carga diária do ChatGPT só lê.
-- Reversão: db/001_radar_acoes.down.sql.

create table if not exists radar_acoes (
  id           bigint generated always as identity primary key,
  -- ids do snapshot (radar_snapshots.payload): precisam ser estáveis entre cargas
  conta_id     text not null,
  sinal_id     text,
  tipo         text not null check (tipo in (
                 'abordado', 'adiado', 'arquivado', 'reaberto',   -- o que se fez com o sinal (tela Hoje)
                 'util', 'ruido', 'relevancia',                   -- avaliação do sinal (feedback para o VSCS)
                 'status'                                         -- andamento da conta depois do contato
               )),
  ate          date,                                              -- só para 'adiado'
  relevancia   smallint check (relevancia between 1 and 3),       -- só para 'relevancia'
  status       text check (status in ('abordado', 'respondeu', 'reuniao', 'oportunidade', 'descartada')),
  nota         text check (char_length(nota) <= 500),
  desfaz_id    bigint references radar_acoes (id),
  autor_email  text not null,                                     -- e-mail do Cloudflare Access de quem clicou
  origem       text not null default 'app',
  criado_em    timestamptz not null default now(),

  constraint adiado_tem_data      check (tipo <> 'adiado'     or ate is not null),
  constraint relevancia_tem_nota  check (tipo <> 'relevancia' or relevancia is not null),
  constraint status_tem_valor     check (tipo <> 'status'     or status is not null),
  constraint sinal_quando_precisa check (tipo = 'status' or sinal_id is not null or desfaz_id is not null)
);

create index if not exists radar_acoes_conta_idx on radar_acoes (conta_id, criado_em desc);
create index if not exists radar_acoes_sinal_idx on radar_acoes (sinal_id, criado_em desc) where sinal_id is not null;

-- Sem acesso pelas chaves públicas: o app usa a chave secreta no servidor, que ignora RLS.
alter table radar_acoes enable row level security;

-- Registro imutável: bloqueia update e delete mesmo para quem tiver acesso direto ao banco.
create or replace function radar_acoes_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'radar_acoes é só de inserção; para desfazer, insira uma linha com desfaz_id';
end;
$$;

drop trigger if exists radar_acoes_sem_update_delete on radar_acoes;
create trigger radar_acoes_sem_update_delete
  before update or delete on radar_acoes
  for each row execute function radar_acoes_imutavel();

comment on table radar_acoes is
  'Ações comerciais do Velora Radar (só inserção). Escrita: app. Leitura: app e carga diária (feedback). Ver radar_app/docs/contrato-radar-acoes.md';
