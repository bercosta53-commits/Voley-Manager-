# Radar de Sinais

MVP da ferramenta ABM descrita em _Radar de Sinais Velora: prospecção própria e modelo replicável_.
O Radar pega a base-mãe de contas já triada, cruza a classe ABC de cada conta com os sinais
recentes e entrega toda semana uma fila de contatos com o sinal, a fonte, o decisor sugerido e
uma primeira linha de abordagem para revisar.

O Radar prepara e a pessoa envia: não há automação de envio nem raspagem do LinkedIn.

## Como rodar

É um app estático, sem build nem dependências. Os módulos ES precisam de um servidor HTTP:

```sh
cd radar
python3 -m http.server 8080   # ou: npx serve .
# abra http://localhost:8080
```

Testes do núcleo (Node 20+):

```sh
node --test radar/core.test.mjs
```

## Estrutura

| Arquivo                 | Papel                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `core.mjs`              | Núcleo fixo: importação, deduplicação, pontuação, matriz ABC × sinal, fila, métricas  |
| `profiles/velora.mjs`   | Perfil da Velora: ICP, 44 tipos de sinal em 7 famílias, pesos, capacidade, tom de voz |
| `profiles/modelo.mjs`   | Perfil-modelo para escritórios de advocacia (base para o piloto da Lefosse)           |
| `profiles/index.mjs`    | Registro dos perfis disponíveis no painel                                             |
| `store.mjs`             | Persistência por espaço de trabalho no navegador, backup e restauração                |
| `app.mjs`, `index.html` | Painel web                                                                            |

Nada específico de cliente fica em `core.mjs`: tudo o que muda vive no perfil.

## Regras de priorização

- **Pesos:** forte = 3, médio = 1,5. Fora do braço do ICP em que o sinal pesa mais, vale 60%.
- **Validade:** o sinal vale 30 dias; depois a conta volta à sua célula de origem. Sinais negativos
  têm prazo próprio (ex.: recuperação judicial, 365 dias) e tiram a conta da fila enquanto valem.
- **Combinação:** dois ou mais tipos de sinal na janela somam e ganham +25%. O mesmo tipo repetido
  conta uma vez.
- **Nível:** 3 pontos ou mais é sinal forte; acima de zero, médio.
- **Matriz:**

  |         | Sinal forte recente                           | Sinal médio                    | Sem sinal                         |
  | ------- | --------------------------------------------- | ------------------------------ | --------------------------------- |
  | Conta A | Contato nesta semana, abordagem personalizada | Contato nas próximas 2 semanas | Aquecimento: conteúdo e interação |
  | Conta B | Contato nesta semana                          | Fila normal                    | Monitorar                         |
  | Conta C | Fila normal                                   | Monitorar                      | Fora da cadência                  |

  Sinal forte promove C a B (sinalizado como “C → B”), nunca a A.

- **Fila semanal:** ordenada pela matriz e pela pontuação, limitada à capacidade da semana
  (25 contas no perfil da Velora, ajustável no painel). Contas já em cadência, com reunião gerada,
  descartadas ou sem resposta há menos de 60 dias ficam retidas.
- **Fora do ICP:** UF fora de SP, PR, SC e RS (considerando a sede e a UF do decisor) ou setor
  excluído (saúde, investimentos).

## Planilhas

**Contas:** `empresa; cnpj; site; uf; cidade; setor; braco; abc; decisor; cargo; linkedin; uf_decisor;
headcount; headcount_6m; observacoes`. Aceita ponto e vírgula ou vírgula, com ou sem acento no
cabeçalho. Contas repetidas são casadas pela raiz do CNPJ (matriz e filiais viram uma conta), pelo
site ou pelo nome; campos vazios não apagam o que já existe. Com `headcount` e `headcount_6m`, a
variação acima de 10% vira sinal de crescimento ou de queda.

**Sinais:** `cnpj ou empresa; tipo; data; fonte; detalhe; url; pessoa`. `tipo` aceita o código
(`vaga_sdr`) ou o nome do sinal. É o formato de entrada para coletores e pesquisas em lote.

O painel tem botões para baixar os dois modelos e para exportar a fila e a base em CSV.

## Resultado e calibragem

A aba Resultados mostra as contas prontas para contato contra a meta (100 na Velora), as taxas de
aceite e de resposta com sinal e sem sinal (só sobre convites com desfecho) e as reuniões por mês.
A calibragem compara a taxa de resposta de cada tipo de sinal com a das abordagens sem sinal e
sugere um novo peso a partir de 5 abordagens, com mudança limitada a ±50%. Nada é aplicado sem
confirmação.

## Cliente novo

1. Copie `profiles/modelo.mjs` (ou `velora.mjs`) e ajuste ICP, critérios ABC, pesos, sinais
   ativos, capacidade e regras de tom (ex.: OAB).
2. Registre o perfil em `profiles/index.mjs`.
3. No painel, crie um espaço com esse perfil e importe a planilha de contas.

Cada espaço fica numa chave separada do navegador; os dados de um nunca alimentam outro.

## O que fica para as próximas fases

- **Coletores automáticos** (Receita Federal, bibliotecas de anúncios, vagas, detecção de CRM): no
  MVP os sinais entram pelo formulário ou pela planilha de sinais, que é o formato que os coletores
  vão gerar.
- **Classificação e resumo por IA** dos sinais coletados.
- **Login por cliente e base no servidor** (fase de produtização): hoje os dados ficam no navegador
  de quem usa, com backup em JSON.
- **Alertas por e-mail, WhatsApp ou Slack:** hoje o resumo da fila é copiado para e-mail.
