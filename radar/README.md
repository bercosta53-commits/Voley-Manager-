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
node --test radar/core.test.mjs radar/ai.test.mjs
```

## Rotina no painel

1. **Semana:** toda segunda, a fila traz as contas a abordar, cada uma com o sinal, o decisor e a
   primeira linha da abordagem. Revise o texto, use “Copiar abordagem”, envie pelo Sales Navigator e
   clique em “Marcar convite enviado”. “Adiar 1 semana” tira a conta da fila até a próxima segunda.
2. **Cadência:** avance cada conta com um clique (Aceitou, Respondeu, Reunião marcada, Sem
   resposta). Convites parados há mais de 14 dias ficam destacados. “Desfazer” volta um passo.
3. **Contas:** importe colando direto do Excel ou do Google Planilhas (ou por CSV), com conferência
   das colunas antes de gravar; cadastre contas avulsas; filtre por “Faltando dados” para chegar às
   100 contas prontas.
4. **Sinais:** registre pelo botão “+ Sinal” na linha da conta ou pela aba Sinais; “Registrar e
   adicionar outro” agiliza a pesquisa em série.

Enquanto a base não está montada, a aba Semana mostra os primeiros passos, e há um espaço de
exemplo com dados fictícios para conhecer o painel.

## IA no painel

Pelo link publicado no claude.ai, o painel usa a IA do Claude (com a conta de quem está usando, que
autoriza no primeiro uso). Rodando localmente, esses botões não aparecem.

- **ICP (aba ICP):** descreva a operação num texto livre e a IA desenha o ICP: braços, setores,
  porte, decisores, sinais que mais pesam em cada braço, geografia, exclusões, critérios ABC e tom de
  voz. O rascunho é editável, pode ser ajustado com novos pedidos e só vale depois de “Aplicar ao
  espaço”. As últimas cinco versões aplicadas ficam guardadas.
- **Passo 2, ABC e decisor:** a IA classifica as contas em lotes de 20 pelo ICP e sugere classe,
  braço e cargo do decisor. Nomes de pessoas só vêm quando a IA tem alta certeza e ficam marcados
  “IA · confirmar”. Tudo passa por uma tela de revisão; confiança baixa vem desmarcada.
- **Passo 3, sinais:** a IA lê o material colado (notícias, vagas, posts, anotações) e aponta os
  sinais das contas da base, com o trecho que comprova. Ela não pesquisa na internet sozinha.
- **Passo 4, abordagens:** a IA escreve a primeira linha de cada conta da fila seguindo o tom e os
  termos vetados do ICP. O envio continua manual, pelo Sales Navigator.

Os pedidos e a checagem das respostas ficam em `ai.mjs`, com testes em `ai.test.mjs`.

## Captação semanal

Toda segunda às 7h (Brasília), uma rotina agendada no Claude Code segue `coletor.md`: pesquisa até 40
contas por espaço nos sites de vagas (Indeed, Glassdoor, Gupy, Vagas.com, Catho, InfoJobs) e em
notícias, sem LinkedIn, e deixa cada sinal na caixa “Captados pela IA” da aba Sinais para aprovação.
Conectores que aprofundam a captação quando conectados no claude.ai: Indeed, Apollo.io, Crustdata e
Parallel Search.

## Visual

O painel segue o Velora Design System v2026: fundo Ink, neon #CCFF00 só onde há ação ou o dado
que importa, Space Grotesk nos títulos, Manrope no texto e JetBrains Mono nos rótulos, alinhamento
à esquerda e a assinatura de barras (barra-acento e hash no rodapé). O único bloco Bone é o número
de contas prontas, na aba Resultados.

## Estrutura

| Arquivo                 | Papel                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `core.mjs`              | Núcleo fixo: importação, deduplicação, pontuação, matriz ABC × sinal, fila, métricas   |
| `profiles/velora.mjs`   | Perfil da Velora: ICP, 44 tipos de sinal em 7 famílias, pesos, capacidade, tom de voz  |
| `profiles/modelo.mjs`   | Perfil-modelo para escritórios de advocacia (base para o piloto da Lefosse)            |
| `profiles/index.mjs`    | Registro dos perfis disponíveis no painel                                              |
| `ai.mjs`                | Pedidos à IA (ICP, classificação, sinais, abordagens) e checagem das respostas         |
| `store.mjs`             | Persistência por espaço: banco do link publicado no claude.ai ou navegador, com backup |
| `app.mjs`, `index.html` | Painel web                                                                             |

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

Cada espaço é guardado separadamente; os dados de um nunca alimentam outro.

## O que fica para as próximas fases

- **Coletores automáticos** (Receita Federal, bibliotecas de anúncios, vagas, detecção de CRM): no
  MVP os sinais entram pelo formulário ou pela planilha de sinais, que é o formato que os coletores
  vão gerar.
- **Classificação e resumo por IA** dos sinais coletados.
- **Login por cliente** (fase de produtização): publicado no claude.ai, os dados ficam no banco do
  link e são compartilhados com quem tem acesso a ele; rodando localmente, ficam no navegador.
- **Alertas por e-mail, WhatsApp ou Slack:** hoje o resumo da fila é copiado para e-mail.
