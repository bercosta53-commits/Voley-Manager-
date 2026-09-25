# Radar de sinais ABM (protótipo)

Dada a lista de contas-alvo e seus comitês de compra, vigia movimentações das empresas que abrem janela
de compra B2B. Python 3.11+, banco SQLite num arquivo só (schema compatível com Postgres), sem painel.

Como cada conector funciona, em português simples: [CONECTORES.md](CONECTORES.md).
Passo a passo de uma semana completa: [SEMANA.md](SEMANA.md).

## Primeiros passos

```sh
cd radar_abm
pip install -r requirements.txt
cp .env.example .env                      # e preencha as chaves quando chegar a fase delas
python manager.py iniciar                 # cria dados/radar.db
python manager.py importar lista.csv --dry-run
python manager.py importar lista.csv      # CSV, XLSX ou a ABM_Outbound_Final.xlsm
python manager.py qualidade --pendencias saidas/pendencias.csv
python manager.py aliases revisar --saida saidas/aliases_revisar.csv
python manager.py aliases aplicar saidas/aliases_revisar.csv
python manager.py coletar --conector cnpj --tier A --limite 5 --dry-run
python manager.py coletar --conector cnpj
python manager.py coletar --conector noticias --tier A --limite 5 --dry-run
python manager.py coletar --conector noticias
python manager.py coletar --conector apollo --tier A --dry-run
python manager.py taxonomia               # confere o sinais.yaml
python manager.py classificar             # notícias -> sinais (Claude, ou regras sem chave)
python manager.py sinais --status revisar
python manager.py score
python manager.py digest                  # HTML semanal em saidas/
python manager.py feedback <id> util      # ou ruido
python manager.py metricas
python manager.py semana                  # coletar + classificar + digest
python manager.py execucoes
python -m pytest tests                    # testes, sem internet
```

Importar de novo a mesma lista (por exemplo, depois de preencher CNPJ e site) atualiza as contas sem
duplicar.

## Regras

- Nada de raspar LinkedIn: links do LinkedIn ficam só como referência e nunca são abertos.
- Apollo com `reveal_personal_emails` e `reveal_phone_number` sempre desligados.
- De pessoas, só nome, cargo, empresa e papel no comitê.
- Tier, scores e status comercial vêm da planilha (rubrica do agente) e não são recalculados aqui.

## Estrutura

| Caminho | O quê |
| --- | --- |
| `manager.py` | comandos |
| `abm/migracoes/` | tabelas do banco |
| `abm/importador.py` | leitura da planilha, deduplicação por CNPJ, pessoas |
| `abm/aliases.py` | nomes usados nas buscas e os ambíguos |
| `abm/qualidade.py` | relatório do que falta |
| `abm/conectores/base.py` | contrato único de conector (buscar, traduzir, comparar, entregar) |
| `abm/conectores/http.py` | timeout, retry com backoff e rate limit; respostas salvas para testes |
| `abm/conectores/cnpj.py` | conector CNPJ (BrasilAPI) |
| `abm/conectores/noticias.py` | conector Google News (RSS) |
| `abm/conectores/apollo.py` | conector Apollo (comitê de compra) |
| `sinais.yaml` | taxonomia de sinais: pesos, meia-vida, membro do comitê, ângulo (editável) |
| `abm/taxonomia.py` | leitura e validação do sinais.yaml |
| `abm/classificador.py` | classificador (Claude, ou regras sem chave) |
| `abm/score.py` | score da conta com decaimento |
| `abm/digest.py` | digest semanal em HTML |
| `abm/metricas.py` | feedback e métricas (precisão, latência, volume) |

## Próximas fases (fora do escopo agora)

| Fase | Fonte sugerida | O que traria |
| --- | --- | --- |
| Diário Oficial | Querido Diário (API aberta da Open Knowledge Brasil, diários municipais) e Imprensa Nacional (DOU, busca e dados abertos) | nomeações, licitações vencidas, contratos públicos, atos societários publicados |
| CADE | SEI/CADE (pesquisa pública de processos) e o boletim de atos de concentração | fusões e aquisições submetidas ao CADE, muitas vezes antes da imprensa |
| CVM | Dados abertos da CVM (dados.cvm.gov.br: documentos IPE, fatos relevantes, emissões) | fato relevante, emissão de dívida, comunicado ao mercado (companhias abertas) |
| Vagas | Gupy (páginas públicas das empresas), Indeed (conector já conectado), Vagas.com | vagas de marketing, growth, RevOps e comercial como sinal de time em formação |
| HubSpot ou Dynamics | APIs do HubSpot (CRM v3) e do Dataverse (Dynamics 365) | levar sinal e "por que agora" para a conta no CRM e trazer de volta o desfecho (reunião, oportunidade) para medir conversão |
| Painel web | a pasta `radar/` do repositório (painel já publicado) lendo o mesmo banco | digest, fila de revisão e feedback com um clique, sem terminal |
