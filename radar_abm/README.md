# Radar de sinais ABM (protótipo)

Dada a lista de contas-alvo e seus comitês de compra, vigia movimentações das empresas que abrem janela
de compra B2B. Python 3.11+, banco SQLite num arquivo só (schema compatível com Postgres), sem painel.

Como cada conector funciona, em português simples: [CONECTORES.md](CONECTORES.md).

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
| `abm/conectores/http.py` | timeout, retry com backoff e rate limit |
