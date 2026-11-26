# Varreduras: "sem fato" × "não varrido"

Uma conta sem sinal pode ser uma conta em que nada aconteceu, ou uma conta que ninguém olhou. O Radar só sabe a diferença se cada varredura ficar registrada. Este campo é **aditivo e opcional**: um snapshot sem ele continua válido, e as contas sem registro aparecem como "Nunca varrida".

## Contrato

`payload.varreduras`: para cada conta e fonte, a **última** varredura.

```json
"varreduras": {
  "<contaId>": {
    "google-news":           { "em": "2026-11-26T00:41:00-03:00", "resultado": "sem_fato", "itens": 0 },
    "pesquisa-web-validada": { "em": "2026-11-25", "resultado": "com_fato", "itens": 2, "consulta": "empresa vagas liderança comercial" }
  }
}
```

| Campo | Regra |
|---|---|
| `<contaId>` | `id` da conta no snapshot |
| fonte | `id` de uma fonte de `payload.fontes` (google-news, veiculos, carreiras, indeed, eventos, linkedin-liderancas, pesquisa-web-validada…) |
| `em` | data (`AAAA-MM-DD`) ou data e hora ISO da varredura, **não** a data do fato |
| `resultado` | `com_fato` (trouxe ao menos um sinal aprovado), `sem_fato` (olhou e não achou nada) ou `erro` (não conseguiu olhar) |
| `itens` | itens encontrados antes da validação (opcional) |
| `consulta` | consulta usada, para reproduzir (opcional, até 200 caracteres) |

Regras:
- **Sem histórico:** fica só a última varredura por conta e fonte.
- **Erro preserva a leitura:** um `erro` não apaga uma varredura válida anterior da mesma fonte. A data da falha fica em `ultimoErroEm`.
- **Busca sem resultado também se registra:** quem busca uma conta e não acha nada registra `sem_fato`. É isso que transforma a ausência de sinal em informação.

## Estados na tela (`lib/varredura.ts`)

| Estado | Quando |
|---|---|
| Com fato recente | há fato nos últimos 90 dias |
| Varrida, sem fato | sem fato recente, mas varrida nos últimos 30 dias por alguma fonte, sem erro |
| Sem varredura recente | já foi olhada (varredura ou fato), mas não nos últimos 30 dias |
| Nunca varrida | nenhum registro de varredura nem fato |

Um sinal também prova que a conta foi olhada na data do fato.

## Onde aparece

- **Fontes:** bloco "Cobertura das contas", com a distribuição por estado e tier e a lista das contas A/B a varrer primeiro (nunca varridas, depois as mais antigas).
- **Conta:** selo no cabeçalho ("Varrida, sem fato · 20/11", "Nunca varrida") quando não há fato recente.

## Quem grava

- `scripts/coletar_noticias.py` grava a fonte `google-news`.
- `scripts/coletar_veiculos.py` grava a fonte `veiculos`.
- `scripts/coletar_vagas.py` grava a fonte `carreiras`.
- `scripts/importar_chatgpt.py`: bloco CSV `VARREDURAS` (`id;fonte;data;resultado;itens;consulta`).
- `scripts/varreduras.py`: registro manual, para varredura feita por outro agente sem sinal novo.

```bash
python3 scripts/varreduras.py --fonte pesquisa-web-validada --resultado sem_fato --em 2026-11-26 --contas <id1> <id2>
```

## Pedido ao classificador do ChatGPT

> Ao gerar o snapshot, inclua `payload.varreduras`. Para cada conta pesquisada nesta rodada e cada fonte consultada, grave `{ "em": <data da pesquisa>, "resultado": "com_fato" | "sem_fato" | "erro", "itens": <n> }`.
> - Conta pesquisada sem nenhum fato aprovado: `sem_fato`.
> - Conta que não pôde ser pesquisada: `erro`.
> - Conta não pesquisada nesta rodada: mantenha o registro anterior.
