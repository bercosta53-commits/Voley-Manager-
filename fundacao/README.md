# Fundação de dados do Radar

Etapa 1 do roadmap: tirar a base da planilha e colocá-la num Postgres (Supabase ou local), com a
planilha passando a ser uma visão do banco, não a fonte.

## Entidades

| Tabela             | O que guarda                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `conta`            | Empresa. Chaves: raiz do CNPJ (8 dígitos), domínio registrável e grupo econômico             |
| `estabelecimento`  | Cada CNPJ conhecido da conta (matriz e filiais)                                              |
| `grupo_economico`  | Contas de CNPJs diferentes que pertencem ao mesmo grupo                                      |
| `pessoa`           | Gente da conta: papel no comitê (`papel_comite`) e, para quem veio do Snov, também `papel_icp` (pagador, dono do problema, guardião, influenciador) e `email_status` |
| `sinal`            | Fato que indica momento de compra: tipo, fonte, data, detalhe e evidência (link e trecho)    |
| `evento_abordagem` | Cada contato: canal, tipo, sinais que o motivaram e versão da rubrica usada                  |
| `desfecho`         | O que aconteceu: aceite, resposta, reunião, oportunidade, ganho, perdido, sem resposta       |
| `rubrica_versao`   | Versões da rubrica de fit; uma ativa por vez                                                 |
| `buraco`           | O que falta ou conflita na migração da planilha-mãe. A etapa 1 termina quando os abertos chegam a zero |
| `importacao_conflito` | O que uma importação de pessoas (Snov) não pôde decidir sozinha: campo divergente da conta já existente, pessoa que já estava em outra conta |
| `importacao_relatorio` | Resumo de cada rodada de importação (o que o terminal imprime), para consulta depois          |
| `coleta_item`      | Item bruto de cada fonte (link, texto, data), antes de virar sinal ou ruído                  |
| `fonte_snapshot`   | Última foto de uma fonte estruturada (QSA, capital social) para comparar na coleta seguinte  |

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
python -m velora_radar snov pessoas.csv    # export do Snov.io: uma linha por pessoa
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

## Importação do Snov.io

`snov arquivo.csv` lê um export de pessoas (uma linha por pessoa, não por conta) e cria contas e
pessoas a partir dele. Difere de `importar` (uma linha por conta, com um decisor opcional): aqui
várias linhas costumam ser a mesma empresa, então a conta nasce da agregação do grupo inteiro.

- **Cabeçalho tolerante**: aceita as variações mais comuns do export (`Full Name` ou `First
  Name`/`Last Name`; `Company Site`, `Company URL`, `Website` ou `Domain`; etc. — ver `ALIASES` em
  `velora_radar/snov.py`). O que não reconhece aparece no relatório para revisão.
- **Chave da conta**: domínio do site → domínio do e-mail (ignora provedor genérico) → nome
  normalizado. Uma empresa com linhas que só trazem o nome (sem site, e-mail genérico) e linhas
  com site não vira duas contas — a busca por conta existente checa as duas formas.
- **Base-mãe**: se já existe uma conta com o mesmo domínio ou nome, o importador só preenche o que
  está vazio; divergência vira linha em `importacao_conflito`, nunca sobrescreve em silêncio.
- **Pessoa**: dedupe por LinkedIn normalizado, depois e-mail, depois nome + conta. `papel_icp` sai
  de regras sobre o cargo (c_level/diretor/gerente → pagador, dono do problema, guardião ou
  influenciador; cargo vazio fica nulo, na fila "a classificar" — a IA entra numa etapa futura) e é
  espelhado em `papel_comite` para não quebrar `vw_planilha` nem o catálogo de sinais.
- **Localização**: `velora_radar/local_br.py` reconhece sigla, nome do estado por extenso (PT/EN,
  com ou sem acento) e as maiores cidades brasileiras. Fora do Brasil entra com `etapa =
  'descartada'`, sem apagar; local vazio não conta como "fora do Brasil", só fica sem UF.
- **ICP**: ao final, cada conta tocada ganha `fit_icp` (dentro do recorte de UF da rubrica ativa,
  ou com um pagador/dono do problema numa UF do recorte — `uf_decisor_relevante`) e
  `cobertura_comite` (quantos dos três papéis decisórios a conta tem identificados).
- **DEMO_ANONIMIZAR=true**: `exportar`/`vw_planilha` mostram iniciais + sobrenome no lugar do nome
  completo das pessoas. Só na exibição — o banco guarda o nome de verdade.

## Radar de sinais (etapa 2)

```sh
python -m velora_radar sinais coletar --fontes noticias,cnpj,cvm   # itens brutos das fontes
python -m velora_radar sinais importar vagas.json                  # itens do agente (Indeed, Gupy…)
python -m velora_radar sinais classificar                          # Claude se houver credencial; senão regras
python -m velora_radar sinais pendentes
python -m velora_radar sinais aprovar <id> …                       # ou descartar
```

- **Coletores**: Google News (RSS por empresa, últimos 30 dias), CNPJ na BrasilAPI (quadro societário
  e capital social comparados com a foto anterior; na primeira coleta só entram sócios recentes),
  CVM (documentos IPE do ano: fatos relevantes, comunicados e emissões, casados pela raiz do CNPJ)
  e vagas importadas do agente de captação.
- **Itens brutos** ficam em `coleta_item`, com a chave da fonte; o mesmo item nunca entra duas vezes.
- **Classificador**: com `ANTHROPIC_API_KEY`, usa a API do Claude (`claude-opus-5`, saída estruturada
  e reserva automática em caso de recusa) para descartar ruído e atribuir tipo, confiança, papel e
  cargo afetados, detalhe e trecho de evidência. Sem credencial, usa regras por palavras-chave. Em
  ambos, o trecho precisa existir no texto coletado; se não existir, o título entra no lugar e a
  confiança cai um nível.
- **Peso e decaimento** vêm do catálogo, nunca do modelo: força do tipo (forte 3, médio 1,5,
  negativo -3) ajustada pela confiança, com meia-vida por tipo. `vw_sinal_vigente` mostra o valor
  de cada sinal aprovado hoje.
- **Revisão humana**: todo sinal nasce pendente e só conta depois de aprovado.

Próximas fontes: Diário Oficial, CADE, BCB/SUSEP e diff de site.

## Pendências da etapa 1

- **Planilha real**: a importação e o modo DOMÍNIOS rodam assim que a base-mãe chegar.
- **Rubrica do agente do ChatGPT**: entra como nova `rubrica_versao` quando for colada; a inicial
  vem do documento do Radar.
- **Supabase**: as migrações rodam sem mudança; basta apontar `RADAR_DB_URL` para o projeto.
