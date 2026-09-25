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

## Google News (RSS)

Arquivo: `abm/conectores/noticias.py`. Vigia o que a imprensa publica sobre cada conta.

- **BUSCA**: monta uma consulta com os aliases **ligados** da conta (até 5) e pede ao Google News as
  notícias dos últimos 30 dias em RSS. RSS é uma lista padronizada de notícias em texto, feita para
  programas lerem. O endereço é
  `https://news.google.com/rss/search?q={consulta}&hl=pt-BR&gl=BR&ceid=BR:pt-419`.

  Exemplos de consulta:
  - `"Junto Seguros" when:30d`: "Junto" sozinho é ambíguo e está desligado, por isso fica de fora.
  - `"Pinheiro Guimarães" (advogados OR advocacia OR escritório OR sócio OR sócia OR auditoria) when:30d`:
    escritórios têm nome de sobrenome, então a consulta exige uma palavra de contexto.
  - `("Cresol Confederação" OR "Cresol") (cooperativa OR ... OR banco) -"futsal" when:30d`: um alias
    ambíguo que você aprovou também ganha contexto; os termos negativos entram com sinal de menos.
- **TRADUZ**: de cada notícia guarda o título (sem o " - Veículo" e o "| Nome do Site" do fim), o veículo,
  o link, a data e o trecho. O RSS do Google só traz a manchete, então o trecho costuma ser a própria
  manchete.
- **COMPARA**: joga fora, e mostra na tela quantas e quais:
  - **não cita a empresa**: o Google às vezes traz notícias em que o nome só aparece no corpo, ou nem
    isso. Buscando "Junto Seguros", vieram notícias da Porto Seguro e da Susep;
  - **termo negativo**: tem uma das palavras que você marcou como "outra empresa";
  - **já vista**: mesmo link ou mesmo título normalizado (sem acento, pontuação e maiúsculas);
  - **fora da janela**: mais velha que 30 dias.

  Depois **agrupa**: a mesma notícia publicada por vários veículos vira um único **evento**. A regra: os
  títulos têm ao menos 2 palavras-chave em comum, cobrindo metade das palavras-chave do título menor, e
  saíram com até 3 dias de diferença. Uma notícia que chega dias depois entra no evento que já existe.
- **ENTREGA**: grava cada notícia nova em `itens_brutos`, com o evento e o veículo. **Ainda não vira
  sinal**: quem decide se é sinal ou ruído (patrocínio, prêmio, sorteio) é o classificador da fase 5.

**Precisa para funcionar**:
- aliases ligados (revise os ambíguos com `aliases revisar`);
- nenhuma chave de API;
- o RSS do Google News é gratuito, mas não tem limite publicado nem garantia. Uma consulta por conta
  por semana, com 1 segundo entre chamadas, fica bem abaixo do que costuma ser bloqueado. Para 315
  contas, conte com 5 a 8 minutos.

**Opção no `.env`**: `RADAR_NOTICIAS_JANELA_DIAS` (padrão 30).

**Comandos**:
```sh
python manager.py coletar --conector noticias --tier A --limite 5 --dry-run
python manager.py coletar --conector noticias
```

**Limites conhecidos**:
- Manchetes que não citam a empresa são descartadas, mesmo quando o texto cita (ex.: matéria da CNN
  sobre IA no comércio exterior que talvez entreviste alguém da Logcomex). É o preço de não encher a
  base de ruído.
- Paráfrases do mesmo fato ("lança IA para corretores emitirem apólices" x "lança agentes de IA para
  emissão de apólices") podem ficar em eventos separados. O classificador junta.
- Homônimos (pessoa, rua ou filme com o nome do escritório) passam se citarem o nome. A saída é pôr
  termos negativos no alias (ex.: `Pequenas Criaturas; consultora; Galeria`).

**Quando quebra**:
- "respondeu 503" ou "429" repetidos: o Google está limitando as chamadas. Rode de novo mais tarde ou em
  lotes menores (`--limite 50`). As notícias já gravadas não se repetem.
- Muitas contas com 0 novidades e "não cita a empresa" alto: confira se os aliases ligados são os nomes
  que a imprensa usa (`aliases listar <conta>`); acrescente com `aliases adicionar`.
- O Google mudou o formato do RSS: o erro aparece no passo TRADUZ. Só esse passo precisa ser ajustado.

## Vagas (páginas de carreiras e arquivo do Indeed)

Arquivos: `abm/conectores/vagas.py` e `abm/conectores/plataformas.py`. Vigia quem está contratando
marketing, growth, RevOps ou comercial. Time em formação é janela de compra.

- **BUSCA**: duas fontes.
  1. **Página de carreiras da conta** numa plataforma de vagas. Todas são públicas e sem chave: são as
     páginas que as próprias empresas publicam.

     | Plataforma | Página de carreiras | Comum em |
     | --- | --- | --- |
     | Gupy | `https://<empresa>.gupy.io` | a maioria das empresas brasileiras |
     | Greenhouse | `https://boards.greenhouse.io/<empresa>` | tecnologia e fintechs |
     | Lever | `https://jobs.lever.co/<empresa>` | tecnologia |
     | Ashby | `https://jobs.ashbyhq.com/<empresa>` | startups |
     | Sólides | `https://<empresa>.vagas.solides.com.br` | médias empresas, serviços |

     - O endereço fica gravado na conta.
     - Sem endereço, o conector tenta descobrir sozinho na **Gupy** e no **Greenhouse**, pelo site e pelo
       nome da conta. São as duas em que dá para conferir o nome da empresa na página. A conferência é
       estrita: "Logcomex.ai" serve para Logcomex; "Alfa Turismo" não serve para Alfa.
     - Para as outras plataformas, o endereço entra por você ou pela rotina do Claude:
       `python manager.py vagas pagina <conta> <endereço>`, ou em lote,
       `python manager.py vagas paginas paginas.csv` (colunas `id_conta,url`).
     - `vagas pagina <conta> -` desliga a busca para a conta.
     - Conta sem página achada só é procurada de novo depois de 30 dias.
  2. **Arquivo de vagas (CSV)** de outras fontes, montado pela rotina do Claude (`VAGAS_ROTINA.md`):
     - **Indeed**, pelo conector do Indeed. O Indeed não tem API aberta para programas como este, por
       isso o arquivo;
     - **Glassdoor** (opcional), por busca na web: a rotina anota título e link dos anúncios que a busca
       mostra, sem entrar no site.
     - **LinkedIn não é usado.**
- **TRADUZ**: de cada vaga, título, local, modo (remoto, híbrido), fonte, link e data (quando a fonte
  informa; a lista da Gupy não informa).
- **COMPARA**:
  - **empresa certa**: a vaga do arquivo com `id_conta` só entra se a empresa for a da conta; sem
    `id_conta`, entra se o nome da empresa bater com uma única conta;
  - **grupo**, pelas regras da seção `vagas:` do `sinais.yaml`:

    | Título tem | Grupo | Peso |
    | --- | --- | --- |
    | área + liderança ("Head de Growth", "Coordenador de Marketing", "Diretor Comercial") | liderança de receita | 9 |
    | área ("Especialista em Marketing", "Analista de CRM", "RevOps Analyst") | marketing/growth | 7 |
    | comercial ("SDR", "Account Executive") | comercial | 5 |

    Banco de talentos, estágio e aprendiz não contam.
  - **novidade**: só entram as vagas que não estavam abertas na coleta anterior. A mesma vaga na página
    da empresa e no Indeed conta uma vez.
- **ENTREGA**: cada vaga nova vira item bruto, com o link como evidência. Cada grupo vira **um** sinal:
  - confiança 0,9 na página da empresa e no arquivo com `id_conta`; 0,7 quando a conta foi reconhecida só
    pelo nome;
  - a data do fato é a do anúncio ou, sem data, o dia em que a vaga foi vista aberta;
  - se o grupo já tem sinal nos últimos 30 dias, as vagas novas entram no mesmo evento, sem sinal novo.

**Por que não há conector do Glassdoor**:
- não existe conector do Glassdoor para o Claude;
- o Glassdoor não tem API aberta e bloqueia acesso automático ao site;
- as vagas que ele publica costumam ser anúncios das mesmas plataformas das empresas (Gupy, Greenhouse…)
  e do Indeed.

Por isso ele é coberto pelas fontes de origem e, opcionalmente, pela busca na web da rotina.

**Precisa para funcionar**:
- nenhuma chave;
- para o Indeed, o conector do Indeed numa conversa com o Claude.

O conector espera 1 segundo entre chamadas ao mesmo site. Na primeira semana, a descoberta faz até 6
tentativas por conta (Gupy e Greenhouse, até 3 nomes cada; cerca de 30 minutos para 315 contas); depois,
uma visita por conta. Para descobrir só na Gupy: `RADAR_VAGAS_ADIVINHAR=gupy` no `.env`.

**Comandos**:
```sh
python manager.py coletar --conector vagas --tier A --dry-run
python manager.py coletar --conector vagas --arquivo-vagas saidas/vagas_indeed_AAAA-MM-DD.csv
python manager.py vagas importar saidas/vagas_indeed_AAAA-MM-DD.csv   # só o arquivo, sem visitar páginas
python manager.py vagas paginas saidas/paginas_vagas.csv              # endereços achados pela rotina
```

**Limites conhecidos**:
- A página da Gupy mostra 10 vagas por vez. Se o conteúdo vier paginado, as seguintes podem ficar de
  fora; o Indeed cobre parte disso.
- Empresas com vagas só no site próprio, ou em outras plataformas (InHire, Recrutei, Workable), entram
  pelo arquivo.

**Quando quebra**:
- Conta sem página achada, mas você sabe onde ela anuncia: `python manager.py vagas pagina <conta> <endereço>`.
- "é de '<outra empresa>', não desta conta": o endereço adivinhado é de outra empresa. Informe o certo.
- "não é de uma plataforma conhecida": o endereço não é de uma das 5 plataformas. As vagas dessa
  empresa entram pelo arquivo.
- Uma plataforma mudou o formato e nenhuma vaga aparece: o erro está no leitor dela (`plataformas.py`).
  Só ele precisa ser ajustado.
- Vagas do arquivo "sem conta correspondente": o nome da empresa na fonte é diferente do da conta.
  Preencha `id_conta` no CSV ou acrescente o nome como alias (`aliases adicionar`).

## Consultorias de recrutamento (pistas)

Arquivo: `abm/pistas.py`. Vagas da Michael Page, Robert Half, Hays, Talenses e outras consultorias. Esses
anúncios **quase nunca dizem quem é o cliente**. Exemplo real da Michael Page: *"Nosso cliente é uma
empresa brasileira em forte expansão no segmento de consumo"*. Por isso a vaga vira uma **pista**, não um
sinal.

- **BUSCA**: as vagas chegam num CSV montado pela rotina do Claude (`VAGAS_ROTINA.md`, parte D), a partir
  dos sites públicos das consultorias. Colunas: `consultoria, referencia, titulo, url, data, local, setor,
  descricao, empresa` (a última só quando o anúncio diz o nome).
- **TRADUZ**:
  - **grupo** da vaga pelo título, com as mesmas regras das vagas no `sinais.yaml`;
  - **braço do ICP** pelo setor e pela descrição, com as palavras da seção `consultorias.setores` do
    `sinais.yaml` ("seguradora", "cooperativa de crédito", "escritório de advocacia", "software"...).
- **COMPARA**:
  - descarta o que não é liderança, marketing/growth ou comercial, e o que está fora do ICP (consumo,
    indústria, saúde...);
  - se o anúncio diz o nome e ele é de uma conta, liga direto;
  - senão, lista até 5 **contas candidatas** do mesmo braço e da mesma cidade. Pontos: cidade 2,
    subsegmento do mesmo setor do anúncio 3 (anúncio de seguradora x conta de seguro garantia), tier A 1;
  - a mesma vaga (consultoria e referência) nunca entra duas vezes.
- **ENTREGA**: grava a pista com as candidatas. **Só vira sinal quando você confirma a conta**:
  `python manager.py vagas atribuir <pista> <conta>`, com confiança 0,9 porque uma pessoa confirmou. Com o
  nome no anúncio, o sinal nasce na hora, com confiança 0,8. `vagas atribuir <pista> -` descarta. As pistas
  abertas aparecem no digest.

**Precisa para funcionar**: nenhuma chave. A busca é feita pelo Claude na rotina.

**Comandos**:
```sh
python manager.py vagas consultorias saidas/consultorias_AAAA-MM-DD.csv --dry-run
python manager.py vagas consultorias saidas/consultorias_AAAA-MM-DD.csv
python manager.py vagas ordenar --dry-run      # o que seria enviado ao Claude, sem chamar a API
python manager.py vagas ordenar                # o Claude ordena as candidatas das pistas novas
python manager.py vagas pistas
python manager.py vagas atribuir <pista> <conta>
```

**Limites**:
- Em cidades com muitas contas do mesmo setor (escritórios de advocacia em São Paulo), as candidatas
  empatam: o anúncio não traz o que distingue uma da outra. A descrição do cliente ("grande porte",
  "presença nacional", "foco em seguro garantia") ajuda você a decidir.
- A ordenação pelo Claude (abaixo) ajuda nesses empates, mas só quando o anúncio e o contexto das contas
  trazem algo que as diferencie.

### O Claude ordena as candidatas

Arquivo: `abm/ordenar_pistas.py`. Roda sozinho ao importar as vagas de consultorias quando há
`ANTHROPIC_API_KEY`; ou com `python manager.py vagas ordenar`.

- **BUSCA**: para cada pista aberta com duas ou mais candidatas, manda ao Claude:
  - o anúncio: título, setor, local e a descrição do cliente, que costuma dizer porte, abrangência, foco e
    momento;
  - o contexto de cada candidata: razão social, subsegmento, cidade, porte, portfólio, maturidade de
    marketing, gatilho recente e os sinais dos últimos 90 dias.
- **TRADUZ**: a resposta vem num formato fixo. Para cada candidata, a **probabilidade** (0 a 1) de ser o
  cliente e **uma frase com o motivo**, citando o anúncio e a conta.
- **COMPARA**:
  - só valem as contas que já eram candidatas: o Claude não inventa conta nova;
  - probabilidade fora de 0 a 1 é ajustada;
  - candidata não avaliada vai para o fim;
  - as probabilidades não precisam somar 1, porque o cliente pode não ser nenhuma delas.
- **ENTREGA**: reordena as candidatas e guarda o motivo. Se uma se destaca (0,7 ou mais e pelo menos 0,3
  acima da segunda), ela aparece como **sugestão** em `vagas pistas` e no digest. **A pista continua
  aberta**: só vira sinal quando você confirma com `vagas atribuir`.

Custo: uma chamada por pista nova com duas ou mais candidatas. Pista já ordenada não é enviada de novo;
para refazer, use `vagas ordenar --refazer`. Sem chave, as candidatas ficam na ordem por pontos.

**Quando quebra**:
- Muitas vagas "fora do ICP" que deveriam entrar: acrescente as palavras do setor em
  `consultorias.setores` no `sinais.yaml`.
- Pista "sem conta na cidade": nenhuma conta do braço está naquela cidade (ou a conta está sem cidade;
  veja `qualidade`).

## Apollo (comitê de compra)

Arquivo: `abm/conectores/apollo.py`. Vigia as pessoas do comitê de compra.

- **BUSCA**: vai à API do Apollo (`https://api.apollo.io`) com a sua chave e faz duas consultas.
  1. **Atualização do comitê** (`people/bulk_match`): só as pessoas que **já estão** na tabela `pessoas`
     da conta, e só as que não foram consultadas nos últimos 30 dias. Vão até 10 pessoas por chamada.
     Na primeira vez a pessoa é procurada por nome, empresa e domínio; depois, pelo id do Apollo, que é
     exato. **Custa 1 crédito por pessoa encontrada.**
  2. **Pessoas novas em cargos-alvo** (`mixed_people/api_search`): quem ocupa hoje cargos de marketing,
     growth, RevOps e comercial no domínio da conta. Não gasta crédito, mas **exige plano pago**. No
     plano Free o Apollo recusa; o conector avisa e segue só com a parte 1.

  `reveal_personal_emails` e `reveal_phone_number` vão **sempre** como `false`, no endereço e no corpo
  de toda chamada. Isso está travado no código e coberto por teste.
- **TRADUZ**: de cada pessoa guarda só nome, cargo, empresa atual, domínio da empresa e id do Apollo.
  Descarta e-mail, telefone, LinkedIn e foto, mesmo quando o Apollo manda.
- **COMPARA**: com a foto anterior, procura três coisas:
  - **mudou de empresa**: o domínio da empresa atual não é o da conta. Sem domínio, compara o nome da
    empresa com os aliases da conta. Na dúvida, não acusa;
  - **mudou de cargo**: o cargo no Apollo mudou desde a última consulta. O cargo que veio da planilha não
    entra nessa comparação, porque a grafia é outra ("CEO e fundador" x "Founder & CEO");
  - **pessoa nova em cargo-alvo**: está hoje num cargo-alvo, não estava na lista anterior e não é do
    comitê. Na primeira coleta, a lista vira só a linha de base.
- **ENTREGA**: cada mudança vira item bruto e sinal (confiança 0,8: dado de terceiro, não oficial), com o
  membro do comitê afetado. Guarda o id do Apollo da pessoa e o cargo atual, mas não sobrescreve o cargo
  de quem saiu da empresa.

**Como economizar créditos**:
- Só pessoas do comitê são consultadas. Nunca a empresa inteira.
- Cada pessoa é consultada no máximo **uma vez a cada 30 dias** (`RADAR_APOLLO_INTERVALO_DIAS`).
  Coletar toda semana não multiplica o gasto.
- Cada execução tem um **teto** (`RADAR_APOLLO_MAX_CREDITOS`, padrão 25). O que passa do teto fica para a
  próxima semana, com **decisores primeiro**.
- Pessoa não encontrada não custa crédito.
- `--dry-run` mostra quem seria consultado e quantos créditos **seriam** gastos, sem gastar nada.

Na base de hoje são 126 pessoas (98 decisores e 28 influenciadores, todas em contas A). A primeira
volta custa até 126 créditos. Com o teto padrão de 25 por semana, ela fecha em cerca de 5 semanas; com 30,
em cerca de 4. Depois se repete todo mês, dentro dos 180 créditos mensais do seu plano.

**Precisa para funcionar**:
- `APOLLO_API_KEY` no `.env` (Apollo > Settings > Integrations > API);
- **plano pago do Apollo**. Teste real de 25/09/2026: o plano Free recusou as duas APIs
  (`people/match`, a atualização do comitê, e `mixed_people/api_search`, a busca de pessoas novas), com
  a mensagem "not included in your Free plan". Não gastou crédito. No Free, o conector para na primeira
  conta e avisa. Enquanto isso, o conector CNPJ cobre parte do sinal: diretor ou sócio novo no quadro da
  Receita;
- créditos de enriquecimento;
- o limite de chamadas por minuto depende do plano. O conector espera 1 segundo entre chamadas e respeita
  o "espere" (código 429).
- Com o site da conta preenchido, o Apollo acha a pessoa certa com mais frequência.

**Comandos**:
```sh
python manager.py coletar --conector apollo --tier A --dry-run   # quem seria consultado e quanto custaria
python manager.py coletar --conector apollo --tier A
```

**Quando quebra**:
- "respondeu 401": a chave está errada ou foi revogada. Gere outra no Apollo e troque no `.env`.
- "o Apollo recusou a atualização do comitê": o plano não inclui a API (o Free não inclui). É preciso
  assinar um plano pago. Na busca de cargos-alvo, a recusa só desliga essa parte.
- "respondeu 422": o Apollo não entendeu o pedido (nome vazio, por exemplo). Confira a pessoa na planilha.
- Créditos acabando: baixe `RADAR_APOLLO_MAX_CREDITOS` ou aumente `RADAR_APOLLO_INTERVALO_DIAS`.
- Muitas pessoas "não encontradas": preencha o site das contas; sem domínio, homônimos confundem a busca.

---

## Painel (caixa "Captados pela IA")

Arquivo: `abm/painel.py`. Leva os sinais do radar ao painel Radar de Sinais publicado no claude.ai
(https://claude.ai/artifact/7cRJtmAGEYnia4TdvF5wK8). Lá, cada sinal espera na caixa "Captados pela IA", na aba Sinais,
até uma pessoa aprovar ou descartar. Nada entra na fila da semana sem essa aprovação.

- **BUSCA**: lê no banco do radar os sinais em alerta ou em revisão, com data do fato nos últimos 90 dias, que
  ainda não foram enviados. Com `--reenviar`, lê também os já enviados.
- **TRADUZ**: monta cada sinal no formato da caixa:
  - conta do painel;
  - tipo do catálogo do painel;
  - data;
  - resumo de até 15 palavras;
  - pessoa, quando houver (só o nome);
  - fonte, link e trecho que comprova.

  O tipo do radar vira o tipo mais próximo do painel. Nas vagas e nas trocas de pessoas, o título decide:
  - vaga de SDR vira `vaga_sdr`;
  - vaga de CRM ou RevOps vira `vaga_revops`;
  - vaga de marketing vira `vaga_marketing`;
  - vaga comercial vira `vaga_executivo_regiao`;
  - novo diretor de marketing vira `novo_cmo`;
  - novo presidente vira `novo_ceo`.
- **COMPARA**: deixa de fora:
  - o que o painel não tem como receber: saída de sócio, mudança de capital ou de endereço, parceria;
  - conta que não existe no painel;
  - o mesmo tipo na mesma conta em menos de 30 dias. Isso vale dentro do envio e, com `--painel-baixado`,
    também contra o que o painel já tem, na lista de sinais ou na caixa, aprovado ou descartado.

  Sinal descartado no painel não volta.
- **ENTREGA**: grava `saidas/painel_caixa_<espaço>.json` com os documentos em lotes de até 50, e marca no
  radar quais sinais foram enviados. Quem grava no painel é o Claude, com a ferramenta de dados do artifact:
  o radar não tem acesso direto ao banco do link.

**A conta do painel** é achada pela raiz do CNPJ, porque o painel usa o id `cnpj-<raiz>`. Com o banco do painel
baixado, ela também é achada pelo domínio e pelo nome.

**Precisa para funcionar**: nada além do radar. Para gravar no painel, peça ao Claude numa sessão do Claude Code.

**Comandos**:
```sh
python manager.py painel --dry-run                        # o que iria, com o tipo do painel de cada sinal
python manager.py painel --painel-baixado <pasta>         # usa o banco do painel baixado para não repetir
python manager.py painel --espaco <id-do-espaço>          # outro espaço do painel (padrão: velora-cnpj70)
```
Depois, peça ao Claude: "grave no painel os lotes de saidas/painel_caixa_velora-cnpj70.json".

**Quando quebra**:
- "Conta não achada no painel": a conta não tem CNPJ, ou não está no espaço. Baixe o banco do painel e use
  `--painel-baixado`, que também procura pelo site e pelo nome, ou cadastre a conta no painel.
- "Sem tipo equivalente no painel": o painel não tem esse tipo. O sinal continua no radar e no digest.
- O botão "Aprovar" avisa que a conta não está no espaço: o sinal foi para o espaço errado. Use `--espaco`.

---

## Classificador (API do Claude)

Arquivo: `abm/classificador.py`. Não vigia uma fonte, mas conversa com um serviço de fora (a API do
Claude) e segue os mesmos quatro passos. Decide se cada notícia coletada é sinal ou ruído.

- **BUSCA**: manda ao Claude as notícias ainda não classificadas de uma conta, até 15 por chamada. Vão
  junto os dados da conta (nome, aliases, braço, cidade), os tipos de sinal válidos para o braço dela e as
  categorias de ruído do `sinais.yaml`. O modelo vem de `ANTHROPIC_MODEL` (padrão `claude-opus-5`).
- **TRADUZ**: a resposta vem num formato fixo (JSON com esquema: o Claude só pode responder com os
  campos e valores combinados). Para cada notícia vêm: é a empresa certa? é relevante? tipo, confiança
  de 0 a 1, membro do comitê afetado, frase de "por que agora", trecho de evidência e, se for o mesmo
  fato de outra notícia do lote, qual.
- **COMPARA**: confere a resposta:
  - o tipo tem de existir no `sinais.yaml` e valer para o braço da conta;
  - o trecho de evidência tem de estar no texto coletado. Se não estiver, entra o título e a confiança
    cai 0,15;
  - notícias sobre o mesmo fato viram um só evento. Aqui entram as paráfrases que o conector de
    notícias não juntou;
  - abaixo de `limiar_confianca` (0,6), o sinal vai para **revisar**, não para alerta.
- **ENTREGA**: grava um sinal por evento. A notícia mais confiável vira a evidência; peso e ângulo vêm do
  `sinais.yaml`. Cada notícia fica marcada como sinal, revisar, ruído, outra empresa, sem tipo ou mesmo
  evento. Notícia que o Claude não devolveu fica pendente para a próxima rodada. Evento que já tinha
  sinal não gera outro. Também completa os sinais de CNPJ e Apollo com peso, ângulo e "por que agora".

**Sem chave da API**: o classificador por regras usa as `palavras_chave` e o `ruido` do `sinais.yaml`.
Ele separa bem o ruído (prêmio, patrocínio, sorteio), mas não entende contexto, e por isso **nunca cria
alerta**: tudo o que acha vai para revisar, com confiança 0,5.

**Precisa para funcionar**:
- `ANTHROPIC_API_KEY` no `.env` (console.anthropic.com > API Keys);
- opcional: `ANTHROPIC_MODEL`;
- custo: uma chamada por conta com notícias novas, por semana. São poucas centenas de chamadas curtas
  por mês.

**Limites**:
- **Recusa**: se o filtro de segurança do modelo recusar o pedido, a API tenta sozinha outro modelo
  (`fallbacks: "default"`); se ainda assim recusar, as notícias ficam pendentes.
- **Timeout e novas tentativas**: 120 segundos por chamada, até 4 novas tentativas (limite de chamadas
  429, erro 5xx, rede).

**Comandos**:
```sh
python manager.py classificar --dry-run        # com Claude: mostra o que enviaria, sem chamar a API
python manager.py classificar                  # Claude se houver chave; senão, regras
python manager.py classificar --regras         # força as regras
python manager.py sinais --status revisar      # a fila de revisão
python manager.py sinal <id> alerta            # aprova (ou: descartado)
```

**Quando quebra**:
- "a API do Claude respondeu 401": chave errada. Gere outra e troque no `.env`.
- "limite de chamadas (429)": rode mais tarde ou em partes (`--contas`, `--limite`).
- "a resposta foi cortada (max_tokens)": lote grande demais. Rode por conta (`--contas`).
- "o modelo recusou o pedido": as notícias ficam pendentes. Tente de novo, ou use `--regras`.

## Taxonomia e score

- **`sinais.yaml`**: cada tipo tem braço do ICP, peso (1 a 10), meia-vida em dias, membro do comitê que ele
  "acorda" e ângulo sugerido. Os `ajustes` mudam valores por braço. `python manager.py taxonomia`
  confere o arquivo e lista os tipos.
- **Score da conta**: soma dos sinais em alerta, cada um com valor `peso × confiança × 0,5^(idade ÷ meia-vida)`.
  Um sinal de peso 8 vale 8 no dia do fato, 4 depois de uma meia-vida e 2 depois de duas. Peso e
  meia-vida são lidos do `sinais.yaml` na hora do cálculo: editar o arquivo muda o score. Sinais em
  revisar não contam até você aprovar.
- `python manager.py score` mostra o ranking e, para cada conta, a conta de cada sinal.
