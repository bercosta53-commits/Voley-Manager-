# Fundação de dados do Radar

Etapa 1 do roadmap: tirar a base da planilha e colocá-la num Postgres (Supabase ou local), com a
planilha passando a ser uma visão do banco, não a fonte.

## Entidades

| Tabela             | O que guarda                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `conta`            | Empresa. Chaves: raiz do CNPJ (8 dígitos), domínio registrável e grupo econômico             |
| `estabelecimento`  | Cada CNPJ conhecido da conta (matriz e filiais)                                              |
| `grupo_economico`  | Contas de CNPJs diferentes que pertencem ao mesmo grupo                                      |
| `pessoa`           | Gente da conta, com papel no comitê de compra (decisor, influenciador, campeão, financeiro…) |
| `sinal`            | Fato que indica momento de compra: tipo, fonte, data, detalhe e evidência (link e trecho)    |
| `evento_abordagem` | Cada contato: canal, tipo, sinais que o motivaram e versão da rubrica usada                  |
| `desfecho`         | O que aconteceu: aceite, resposta, reunião, oportunidade, ganho, perdido, sem resposta       |
| `rubrica_versao`   | Versões da rubrica de fit; uma ativa por vez                                                 |
| `buraco`           | O que falta ou conflita na migração. A etapa 1 termina quando os abertos chegam a zero       |

`vw_planilha` é a planilha como visão: conta, CNPJ, site, ABC, grupo, decisor, sinais dos últimos 30
dias, último desfecho e buracos abertos.

## Uso

```sh
pip install -e ".[dev]"
export RADAR_DB_URL="postgresql://…"      # Supabase ou Postgres local
python -m velora_radar migrar              # cria as tabelas e registra a rubrica inicial
python -m velora_radar importar base.xlsx  # CSV ou XLSX; mostra os buracos no fim
python -m velora_radar buracos --detalhe
python -m velora_radar dominios pendencias --saida pendencias.json
python -m velora_radar dominios aplicar resolucoes.json
python -m velora_radar grupo "Sistema Sicredi" <conta_id> <conta_id>
python -m velora_radar mesclar <conta_mantida> <conta_removida>
python -m velora_radar exportar base.xlsx  # a planilha, agora gerada a partir do banco
python -m pytest                           # testes contra um Postgres real
```

## Deduplicação

Cada linha é casada com uma conta nesta ordem: raiz do CNPJ, domínio, nome normalizado (sem acento,
sem forma jurídica). Matriz e filial viram uma conta com dois estabelecimentos. E-mail ou site
gratuito (gmail, hotmail, uol…) não conta como domínio. CNPJ inválido, domínio que já pertence a
outra conta e nomes iguais com CNPJs diferentes viram buracos para revisão, nunca uma escolha
silenciosa.

## Modo DOMÍNIOS

1. `dominios pendencias` gera a lista de contas sem CNPJ ou sem domínio, contas A primeiro.
2. Quem resolve (um agente com Parallel Search ou Apollo, ou uma pessoa) devolve um JSON:
   `[{"conta_id": "…", "dominio": "…", "cnpj": "…", "fonte": "…", "confianca": "alta|media|baixa"}]`.
3. `dominios aplicar` valida cada resolução. Confiança baixa não é gravada. Um CNPJ que já é de
   outra conta revela duplicata e as duas são mescladas, com sinais, pessoas, abordagens e
   desfechos preservados. A fonte fica registrada no buraco fechado.

## Pendências da etapa 1

- **Planilha real**: a importação e o modo DOMÍNIOS rodam assim que a base-mãe chegar.
- **Rubrica do agente do ChatGPT**: entra como nova `rubrica_versao` quando for colada; a inicial
  vem do documento do Radar.
- **Supabase**: as migrações rodam sem mudança; basta apontar `RADAR_DB_URL` para o projeto.
