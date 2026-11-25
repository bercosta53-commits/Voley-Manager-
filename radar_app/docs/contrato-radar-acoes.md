# Contrato de dados: ações comerciais (`radar_acoes`) e carga diária

**Status:** proposta para alinhamento (D6). **Não aplicar** a migração antes do OK da carga diária (ChatGPT).
**Prazo para a demo de 3/12:** alinhado até sexta, 27/11. Sem isso, o registro compartilhado de ações (P0-4)
e a linha do tempo de ações (P1-5) saem do escopo da demo.

## Por que uma tabela nova

Hoje, útil/ruído/abordado/adiado/arquivado ficam só no navegador de quem clicou (`localStorage`). Outro
dispositivo ou outra pessoa do time não vê nada, e trocar de navegador perde o histórico. Para a demo, o
passo 7 ("registro e acompanhamento") precisa que uma ação feita num navegador apareça em outro, com autor
e data.

## Desenho

- **Uma tabela, só de inserção:** `radar_acoes`. Cada clique vira uma linha. Desfazer também é uma linha nova
  (`desfaz_id` aponta para a ação desfeita). Um gatilho no banco recusa `update` e `delete`.
- **Separada do snapshot:** a carga diária continua gravando só em `radar_snapshots`. Ela nunca escreve em
  `radar_acoes`, e o app nunca escreve no snapshot.
- **Autor:** o e-mail do Cloudflare Access de quem clicou, lido no servidor do Worker.
- **Estado atual:** derivado do registro (a última ação válida de cada sinal e o último `status` de cada conta).

Arquivos:

- Migração: [`db/001_radar_acoes.sql`](../db/001_radar_acoes.sql)
- Reversão: [`db/001_radar_acoes.down.sql`](../db/001_radar_acoes.down.sql). Apaga o histórico; exporte antes.

Validação feita num Postgres 16 descartável:

- a migração aplica do zero e pode ser reaplicada sem erro;
- aceita as ações válidas;
- recusa adiado sem data, tipo desconhecido, ação sem sinal, linha sem autor, relevância fora de 1–3, `update` e `delete`;
- a reversão remove tudo.

### Campos

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | bigint | gerado |
| `conta_id` | text | id da conta no snapshot (`payload.contas[].id`) |
| `sinal_id` | text | id do sinal no snapshot (`payload.sinais[].id`); obrigatório, exceto em `status` |
| `tipo` | text | `abordado`, `adiado`, `arquivado`, `reaberto`, `util`, `ruido`, `relevancia`, `status` |
| `ate` | date | obrigatório em `adiado` |
| `relevancia` | smallint | 1–3, obrigatório em `relevancia` |
| `status` | text | `abordado`, `respondeu`, `reuniao`, `oportunidade`, `descartada`; obrigatório em `status` |
| `nota` | text | até 500 caracteres |
| `desfaz_id` | bigint | ação que esta linha desfaz |
| `autor_email` | text | obrigatório |
| `origem` | text | `app` por padrão |
| `criado_em` | timestamptz | `now()` |

Custo: algumas centenas de linhas por mês, muito abaixo do plano gratuito do Supabase.

## O que a carga diária precisa garantir

Estes pontos são condição para o registro funcionar. Sem eles, as ações perdem o vínculo com o sinal.

1. **IDs estáveis (crítico).** `conta.id` e `sinal.id` não podem mudar de uma carga para outra. Um sinal que
   reaparece na carga seguinte precisa ter o mesmo `id`. Sugestão: id determinístico, por exemplo um hash de
   `conta + tipo + url + data do fato`. Se hoje os ids são regenerados a cada carga, isso precisa mudar antes
   de aplicar a migração.
2. **Nunca escrever em `radar_acoes`**: nada de `insert`, `update`, `delete` ou `truncate`. Ler é permitido
   e desejável (útil/ruído e relevância servem para calibrar o VSCS).
3. **Não apagar sinais com ação recente.** Se um sinal sai do snapshot, as ações dele continuam no registro;
   a tela de Conta mostra a ação com o texto que estiver disponível.

## Outros pontos do contrato do snapshot (D1, D2, D12, D15)

| ID | Pedido | Prazo |
| --- | --- | --- |
| D1 | `payload.atualizadoEm` com data **e hora** reais de cada execução (ex.: `2026-11-26T00:41`, horário de São Paulo). O app usa esse campo para avisar quando a base passa de 36 h. | 27/11 |
| D2 | Todo sinal com `fonte`, `url` e `data` (do fato). Opcionais: `coletadoEm`, `confianca` (`alta`, `media`, `baixa`) e `fontes[]`. **Nenhum sinal com `exemplo: true`**: o app passa a descartá-los. | 30/11 |
| D12 | Por conta: `qualificada: { status, desde, motivo, regra_versao }` e `estagio_anterior`, para a Conta Qualificada e o movimento entre estágios. | 30/11 |
| D15 | Na carga de 1/12, todas as 348 contas com VSCS, estágio, tier e anel do Radar calculados. Informar quantas têm comitê com 2 ou mais papéis e quantos sinais há nos últimos 30 dias por categoria. | 01/12 |

## Mensagem para enviar ao ChatGPT

> Preciso alinhar o contrato de dados do Velora Radar até sexta, 27/11. O app vai ganhar uma tabela nova no
> Supabase, `radar_acoes`, só de inserção, escrita apenas pelo app (abordado, adiado, útil/ruído, status
> da conta). A carga diária das 00h30 **não pode escrever nela**; pode e deve ler, como feedback para
> calibrar o VSCS. A migração está em `radar_app/db/001_radar_acoes.sql`.
>
> Confirme ou ajuste:
>
> 1. **IDs estáveis:** `conta.id` e `sinal.id` são os mesmos de uma carga para a outra? Se não, proponha um
>    id determinístico (por exemplo, hash de conta + tipo + url + data do fato).
> 2. **`atualizadoEm`:** grave a data e a hora reais de cada execução no payload (horário de São Paulo).
> 3. **Sinais de exemplo:** algum sinal real tem `exemplo: true`? O app vai descartar esses sinais. Quantos são hoje?
> 4. **Evidência:** todo sinal com `fonte`, `url` e `data`; se possível, `coletadoEm` e `confianca`.
> 5. **Conta Qualificada:** você consegue gravar por conta `qualificada: {status, desde, motivo, regra_versao}`
>    e `estagio_anterior` até 30/11? Regra proposta: tier ICP A ou B, VSCS ≥ 55 nos últimos 60 dias e
>    nenhuma oportunidade aberta ou descartada nos últimos 90 dias.
> 6. **Base completa em 1/12:** todas as 348 contas com VSCS, estágio, tier e anel. Me diga quantas têm
>    comitê com 2 ou mais papéis e quantos sinais há nos últimos 30 dias por categoria.
>
> Responda item a item com "ok", "ajustar: …" ou "não dá: …".
