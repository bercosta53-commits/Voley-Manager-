# Conectores do Radar

Um **conector** é o pedaço do sistema que vai até uma fonte de informação (um site, um serviço) e traz
para o nosso banco o que mudou numa conta. Todos seguem os mesmos quatro passos:

| Passo | Pergunta que responde |
| --- | --- |
| **BUSCA** | Onde ele vai e o que ele pede? |
| **TRADUZ** | Como ele converte a resposta da fonte para o nosso formato? |
| **COMPARA** | Como ele descobre o que mudou desde a última vez? |
| **ENTREGA** | O que ele grava no banco? |

## Palavras que aparecem aqui

- **API**: a "porta de serviço" de um site, feita para programas conversarem com ele, em vez de pessoas.
- **JSON**: o formato de texto que as APIs usam para responder, com campos e valores (`"capital": 1000`).
- **Chave de API**: uma senha que identifica a Velora para o serviço. Fica no arquivo `.env`, nunca no código.
- **Snapshot (foto)**: cópia do que a fonte dizia na última coleta. É com ela que o conector compara.
- **Hash (impressão digital)**: um código curto calculado a partir de um texto. Textos iguais têm o mesmo
  hash; é assim que o sistema sabe que já viu uma notícia.
- **Timeout**: tempo máximo de espera por uma resposta (20 s). Passou disso, desiste e tenta de novo.
- **Retry com backoff**: tentar de novo quando a fonte falha por instabilidade, esperando 2 s, depois 4 s,
  depois 8 s. São 4 tentativas no total.
- **Rate limit**: limite de chamadas que a fonte aceita por minuto. O sistema espera um intervalo mínimo
  entre chamadas ao mesmo site e, se a fonte disser "muitas chamadas" (código 429), espera o tempo pedido.
- **Dry-run**: modo ensaio. O conector busca e mostra na tela o que faria, passo a passo, mas não grava nada.

## O molde comum (`abm/conectores/base.py`)

Todo conector herda da classe `Conector` e escreve só os quatro métodos: `buscar(conta)`,
`traduzir(resposta_bruta)`, `comparar(novo, snapshot_anterior)` e `entregar(itens)`. O resto é igual
para todos e já vem pronto:

- percorre as contas e pula as que não têm o necessário (ex.: sem CNPJ), dizendo o motivo;
- mostra cada passo na tela;
- um erro numa conta não para as outras; ele é contado e registrado;
- os itens e a foto nova de uma conta são gravados juntos: se algo falhar, nada fica pela metade;
- cada execução fica registrada na tabela `execucoes` (início, fim, itens, erros) e em `logs/radar.log`;
- no `--dry-run`, nada vai para o banco, nem o registro da execução (só o log em arquivo).

Para ver as últimas execuções: `python manager.py execucoes`.

---

## Planilha (importador): a porta de entrada das contas

Não é um conector de fonte externa, mas segue a mesma lógica e é por onde tudo começa.

- **BUSCA**: lê o arquivo que você indicar: CSV, XLSX ou XLSM. Na `ABM_Outbound_Final.xlsm`, lê as abas
  "02 Contas" e "03 Pessoas". O cabeçalho muda de linha entre as abas; o importador procura, nas 30
  primeiras linhas, a que tem mais nomes de coluna conhecidos (empresa, cnpj, uf...). Fórmulas são lidas
  pelo valor calculado.
- **TRADUZ**: reconhece colunas com nomes diferentes ("empresa", "nome fantasia"...), limpa marcadores
  como "NÃO ENCONTRADO", deixa o CNPJ com 14 dígitos e confere o dígito verificador, reduz o site ao
  domínio (`https://www.alfa.adv.br/contato` vira `alfa.adv.br`) e ignora LinkedIn e e-mails grátis. O
  braço do ICP vira uma chave fixa (`servicos_profissionais`, `servicos_financeiros`, `tecnologia`). O papel
  de cada pessoa no comitê é deduzido do cargo (CEO, sócio, diretor = decisor; gerente, head = influenciador;
  analista = usuário; compras = bloqueador), a menos que a aba de pessoas informe.
- **COMPARA**: procura a conta no banco, nesta ordem: raiz do CNPJ (8 primeiros dígitos, iguais na matriz
  e nas filiais), id da planilha, domínio, nome. Se achar, atualiza; se não, cria. Duas linhas com a mesma
  raiz são a mesma empresa: fica a matriz (CNPJ com 0001) e a outra vira filial registrada. Se a planilha
  passar a trazer um CNPJ que revela que duas contas eram a mesma, elas são juntadas, com pessoas e
  histórico.
- **ENTREGA**: grava `contas`, `filiais` e `pessoas`; as colunas extras da planilha (gatilho, ângulo,
  próxima ação...) ficam guardadas na conta. Em seguida gera os `aliases`.

**Precisa para funcionar**: só o arquivo. Nada de chave de API.

**Comandos**: `python manager.py importar arquivo.csv --dry-run` (ensaio) e depois sem `--dry-run`.

**Quando quebra**:
- "não achei a linha de cabeçalho": a aba não tem ao menos duas colunas com nomes conhecidos. Renomeie a
  coluna do nome da empresa para "empresa" e a do CNPJ para "cnpj".
- CNPJ inválido: aparece no relatório de qualidade; corrija na planilha e importe de novo.
- Domínio "já é de outra conta": duas contas com o mesmo site. Confira se são a mesma empresa.

## Aliases: os nomes que as buscas usam

- Para cada conta são gerados: o **nome fantasia**; a **variação** sem forma jurídica e sem descritor do
  setor ("Junto Seguros" → "Junto"); **nomes antigos** ("WeCogno (ex-Datarisk)" → "Datarisk"); **siglas**
  já presentes no nome ("KLA Advogados" → "KLA") e, em escritórios, siglas pelas iniciais ("Rossi, Maffini,
  Milman" → "RMM").
- **Ambíguo** é o alias que pode trazer notícia de outra empresa: termo de até 3 letras, palavra ou
  sobrenome comum ("Junto", "Machado"), sigla montada, ou termo igual em duas contas ("Cresol").
- Alias ambíguo nasce **desligado**, e desligado não entra nas buscas. O nome fantasia fica sempre ligado.
- Revisão: `python manager.py aliases revisar` gera `aliases_revisar.csv`; preencha `usar` com sim/nao e,
  se quiser, `termos_negativos` (ex.: para "Junto": `junto com; juntos`); depois
  `python manager.py aliases aplicar aliases_revisar.csv`.

---

## CNPJ (BrasilAPI)

Arquivo: `abm/conectores/cnpj.py`. Vigia o cadastro oficial da empresa na Receita Federal.

- **BUSCA**: vai até `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` e pede o cadastro do CNPJ da matriz.
  É uma chamada por conta. A BrasilAPI é gratuita e repassa os dados públicos da Receita. Contas sem
  CNPJ são puladas (a tela diz "pulada (sem CNPJ)").
- **TRADUZ**: da resposta, guarda só o que usamos:
  - QSA (quadro de sócios e administradores): nome, qualificação (Sócio, Diretor, Presidente,
    Administrador...) e data de entrada;
  - capital social;
  - situação cadastral (ATIVA, SUSPENSA, BAIXADA...);
  - CNAE principal (o código da atividade da empresa);
  - endereço da sede.

  Joga fora o CPF mascarado, a faixa etária e os telefones: não guardamos dado pessoal sensível.
- **COMPARA**: põe a foto nova ao lado da foto da coleta anterior e procura:
  - pessoa que entrou ou saiu do QSA;
  - pessoa que mudou de qualificação (ex.: de Diretor para Presidente);
  - capital social que mudou (com o percentual);
  - situação cadastral que mudou;
  - endereço da sede que mudou (logradouro, número, cidade, UF ou CEP; mudar só o andar não conta).

  Na **primeira coleta** não existe foto anterior. Aí só vira novidade quem entrou no QSA nos últimos
  **180 dias** (executivo recém-chegado costuma rever fornecedores) e empresa que não está ATIVA.
- **ENTREGA**: cada novidade vira:
  - um **item bruto**: a evidência, com o link da consulta e o trecho ("QSA na Receita: EDUARDO CRUCI
    (Diretor), entrada em 2026-04-06");
  - um **sinal** com confiança 1,0 (dado oficial), status `alerta` e o membro do comitê que ele
    "acorda" (mudança de sócio, administração, capital ou situação acorda o decisor; mudança de sede,
    o influenciador).

  A mesma novidade nunca entra duas vezes: cada uma tem uma impressão digital (hash). Também grava a
  foto nova e **completa a conta** com razão social, UF e cidade quando estavam vazias. As razões
  sociais novas viram aliases.

**Precisa para funcionar**:
- o CNPJ da conta (coluna `cnpj` na planilha);
- nenhuma chave de API;
- a BrasilAPI não publica um limite fixo de chamadas. O conector espera 1 segundo entre chamadas e
  respeita o "espere" (código 429) quando ele vem. Para 315 contas, conte com 6 a 10 minutos.

**Opção no `.env`**: `RADAR_CNPJ_JANELA_DIAS` (padrão 180), a janela da primeira coleta.

**Comandos**:
```sh
python manager.py coletar --conector cnpj --tier A --limite 5 --dry-run   # ensaio com 5 contas A
python manager.py coletar --conector cnpj                                 # todas as contas com CNPJ
python manager.py execucoes                                               # como foram as últimas rodadas
```
Sem internet, `--fixtures PASTA` usa respostas salvas em `PASTA/cnpj/<cnpj>.json`.

**Quando quebra**:
- "respondeu 404": o CNPJ não existe na Receita. Confira o número na planilha (`qualidade` mostra os inválidos).
- "respondeu 429" ou "falhou: timeout" repetidos: a BrasilAPI está sobrecarregada. O conector já tenta 4
  vezes com espera crescente; se ainda falhar, rode de novo mais tarde. As contas que deram certo não
  são repetidas, porque a foto delas já foi gravada.
- A BrasilAPI fora do ar por muito tempo: dá para trocar a fonte por outra que devolve o mesmo cadastro
  (ReceitaWS, CNPJá, publica.cnpj.ws). Só muda o passo BUSCA; os outros três ficam iguais.
- Um erro numa conta não para as outras: ele aparece na tela, em `execucoes` e em `logs/radar.log`.

## Google News (RSS): fase 3, a construir

- **BUSCA**: `https://news.google.com/rss/search?q={consulta}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, com a consulta
  montada pelos aliases ligados e pelos termos negativos.
- **TRADUZ**: título, veículo, link, data, trecho.
- **COMPARA**: descarta o que já foi visto (hash do link + título) e junta a mesma notícia de vários veículos
  num único evento.
- **ENTREGA**: itens brutos para o classificador (fase 5).

## Apollo (comitê de compra): fase 4, a construir

- **BUSCA**: dados atuais só das pessoas mapeadas no comitê, com a chave `APOLLO_API_KEY`.
  `reveal_personal_emails` e `reveal_phone_number` sempre desligados.
- **COMPARA**: mudou cargo ou empresa de alguém do comitê; apareceu pessoa nova num cargo-alvo.
