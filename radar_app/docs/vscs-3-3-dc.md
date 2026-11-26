# VSCS 3.2 canônico e proposta 3.3-DC

**Estado:** a 3.2 canônica está implementada em código para reconciliação. A 3.3-DC é **proposta em teste** e **não deve ser publicada em produção**. O motor de produção do repositório (`scripts/score_v2.py`, 3.0) não muda.

**Dados:** este documento e o código não contêm dados reais. O snapshot do Supabase, os rankings e as saídas das simulações ficam fora do repositório.

## 1. Arquivos

| Arquivo | O que faz |
|---|---|
| `scripts/vscs/parametros_32.json` | Parâmetros da 3.2: tabela de cargos, blocos e bases. Os itens marcados `confirmar` precisam bater com o registro do Supabase |
| `scripts/vscs/parametros_33.json` | Parâmetros da 3.3: DC, movimento, dupla janela, taxonomia de fonte, faixa 90+ e janelas de ação |
| `scripts/vscs/classificar.py` | Senioridade do cargo de receita, área do cargo e base de bloco |
| `scripts/vscs/motor32.py` | 3.2 canônica: o motor 3.0 com cargos e blocos |
| `scripts/vscs/fontes.py` | Taxonomia de fonte da 3.3 e corroboração documental |
| `scripts/vscs/tempo.py` | Decaimento convencional, dupla janela da liderança nomeada e rótulo da janela |
| `scripts/vscs/agrupar.py` | Documento → acontecimento → movimento, com as regras de vínculo |
| `scripts/vscs/motor33.py` | 3.3-DC: agregação sobre movimentos, penalidade e requisitos da faixa 90+ |
| `scripts/vscs/reconciliar.py` | Compara a 3.2 canônica com o snapshot: bases usadas e score por conta |
| `scripts/vscs/simular.py` | Compara 3.2 canônica, quatro variantes de DC e os cortes de CQ-1 |
| `scripts/vscs/casos.py` | Contrafactuais sintéticos |
| `scripts/tests/test_vscs.py` | Testes da 3.2 e da 3.3: propriedades, agrupamento, fonte, tempo e faixa 90+ |

## 2. 3.2 canônica

Usa a mesma agregação da 3.0: `100·[1 − Π(1 − 0,5·s/100)] + bônus (+5/+8) − maior penalidade`. Também mantém o mesmo decaimento exponencial por categoria. O que muda é a classificação.

- **Vaga ou nomeação de receita.** A base vem da senioridade **do cargo do ocupante ou da vaga**, e não de qualquer palavra do texto (seção 3.7, item 3). Áreas de receita: marketing, vendas, growth, parcerias, RevOps e CS.

  | Senioridade | Base |
  |---|---:|
  | SDR/BDR e operacionais | 20 |
  | Especialista GTM/RevOps | 35 |
  | Coordenação | 55 |
  | Gerência | 70 |
  | Head | 80 |
  | Diretoria de receita, inclusive VP de receita | 85 |
  | C-level de receita (CRO, CMO, CCO, CSO, Chief …; VP só com evidência de responsabilidade C-level) | 95 |

  Não pontuam como receita: diretor financeiro ou técnico, gerente de TI, "Customer Success Manager" e "Account Manager", que são operacionais.
- **Vagas operacionais distintas em até 30 dias formam um bloco**, que **substitui** as vagas que o compõem. Duas vagas valem 30, três a quatro valem 50 e cinco ou mais valem 70. Um especialista sozinho (35) vale mais que um bloco de duas.
- **Republicação da mesma vaga** não conta de novo nem renova a data.

**Reconciliação.** Rode `reconciliar.py` sobre o payload. A tabela "bases usadas no snapshot × parâmetros" mostra onde a reconstrução de produção diverge da tabela. Só depois de zerar as divergências, ou de registrá-las no `parametros_32.json`, a 3.2 canônica passa a ser a referência.

## 3. Proposta 3.3-DC

### 3.1 Tempo: vaga não amadurece; liderança nomeada tem dupla janela

- **Vaga aberta**, inclusive de liderança, segue o decaimento convencional (contratação: meia-vida de 45 d, zero depois de 135 d). Vaga é intenção de contratar.
- **Liderança nomeada** (pessoa no cargo) segue a dupla janela abaixo.

| Período | Fator | Janela comercial |
|---|---:|---|
| 0–90 d | 0,85 | **diagnóstico**: o líder novo monta o plano (Diagnóstico de Aquisição, GTM) |
| 90–150 d | 0,85 → 0,65 | transição: executa com o time que já existe |
| 150–180 d | 0,65 → 1,00 | subida |
| 180–450 d | 1,00 | **implementação e escala** (6–15 meses): domínio do orçamento (RevOps, Growth Leader, ABM) |
| > 450 d | meia-vida de 90 d, zero em 720 d | residual |

A curva 3.1 (0,6 até 90 d, pico em 365 d) atrasava o pico. Também tratava o início como "nada acontece", quando o começo é a janela de diagnóstico. A contribuição grava `janela_lideranca`, para a tela e o playbook escolherem a oferta certa.

### 3.2 Independência causal: documento → acontecimento → movimento

| Nível | O que é | Efeito no score |
|---|---|---|
| Documento | Uma matéria, um post, um anúncio | — |
| Acontecimento | O fato no mundo | Vários documentos são **corroboração documental**: sobem o nível da fonte, **nunca** o número de gatilhos |
| Movimento | A decisão estratégica que gera vários acontecimentos | Acontecimentos do mesmo movimento são **execução**: reforço pequeno (γ = 0,25, teto de +10). O movimento conta como **um** gatilho |
| Convergência comercial | Movimentos **independentes** na mesma conta | Só ela soma como corroboração no DC |

**Mesmo acontecimento.** Basta uma das condições:
- `acontecimentoId` igual;
- mesmo grupo ou URL;
- mesmo tipo em até 21 d, com a mesma pessoa, o mesmo cargo (nível + área) ou texto parecido (Jaccard ≥ 0,5);
- mesmo tipo com texto quase igual (Jaccard ≥ 0,8) em até 180 d (republicação). Vale a data do primeiro documento.

**Mesmo movimento.** Regras dentro de 180 d. Cada vínculo grava a regra que o criou.

| Regra | Quando liga |
|---|---|
| `explicito` | `movimentoId` igual (campo do classificador; sempre prevalece) |
| `vaga_concluida` | Vaga de liderança → nomeação da mesma área. A vaga sai do cálculo (`superado_por`) |
| `estruturacao_da_area` | Nomeação de liderança → vagas da área desse líder |
| `declaracao_executada` | Declaração de expansão → expansão efetiva ou nova filial |
| `mesma_praca` | Expansão, filial, parceria e vagas que citam o mesmo lugar |
| `mesmo_produto` | Lançamento + parceria, vaga ou lançamento que citam o mesmo nome próprio |
| `integracao_societaria` | Aquisição ou fusão feita pela conta + reestruturação |
| `uso_do_capital` | Captação + fato que cita o aporte. Sem citação, vira **possível vínculo**: não agrupa, mas bloqueia a faixa 90+ |

Sinal negativo nunca entra num movimento positivo. Com isso, a penalidade não pode sumir dentro de um grupo.

### 3.3 Fórmula revisada

```text
s_acontecimento = base × fonte(taxonomia 3.3) × tempo(3.1 acima)        # sem fator de correlação: o agrupamento o substitui
s_movimento     = min(s₁ + 10, 100·[1 − (1 − s₁/100)·Π_k (1 − 0,25·s_k/100)])

Para a escolha (dominante D, corroboradores C₁..C_m, m ≤ 2) entre movimentos que não são contexto nem negativos:
  valor(D, C) = 100·[1 − (1 − 0,85·S_D/100)·Π_j (1 − 0,60·c_j·S_Cj/100)]
  c_j = 0,7 quando o movimento repete a categoria de outro já escolhido; senão 1
principal = max sobre as escolhas de valor(D, C)        # garante monotonia
contexto  = 0,85 · max(S de contexto)                   # contexto pode ser o gatilho, nunca corrobora
VSCS      = limitar(max(principal, contexto) − maior penalidade, 0, 100)
Se VSCS ≥ 90 e algum requisito da faixa 90+ falhar: VSCS = 89,9, com os motivos em requisitos_90_pendentes
```

O tier não entra no cálculo, e há teste para isso.

### 3.4 Faixa 90–100: condições necessárias

Valem todas. O modelo não define nenhuma quantidade mínima de contas nessa faixa.

1. **Independência.** Dominante e corroborador são movimentos distintos, sem vínculo nem possível vínculo entre eles.
2. **Materialidade.** Cada um tem `s_movimento` ≥ 70.
3. **Atualidade.** O fato principal de cada movimento está dentro da janela de ação do seu tipo. Liderança nomeada precisa estar na janela de diagnóstico ou de implementação: **transição e residual ficam fora**. A maturação também precisa estar aplicada, com vínculo atual e mandato de receita.
4. **Fonte.** O dominante tem fonte ≥ 0,95 (institucional, declaração direta ou imprensa corroborada) e o corroborador ≥ 0,90. Nenhum dos dois tem data estimada.
5. **Conexão com Growth, Vendas ou GTM.** As categorias são liderança, expansão, contratação, GTM ou intenção. Contexto e C-level fora de receita não servem.
6. **Sem penalidade ativa.**

Um fato sozinho não chega a 90: o teto de um movimento é 85. O caso típico que chega lá é uma CRO na janela de implementação somada a uma expansão comercial efetiva com fonte primária: dá 90,2.

### 3.5 Taxonomia de fonte

| Nível | Fator | Quando |
|---|---:|---|
| institucional | 1,00 | Site, comunicado ou RI da empresa, carreiras, registro público, página do evento, interação direta |
| declaração direta | 0,95 | O próprio executivo, com nome e cargo (`fonteTipo: "declaracao_executivo"` ou fonte da lista) |
| secundária corroborada | 0,95 | Decidido só em `corroborar()`, nunca pelo documento sozinho. Exige duas ou mais testemunhas independentes, cada uma com nível de pelo menos secundária. Mesmo domínio conta uma vez. Cópias de release (`release: true`) colapsam numa testemunha. Entradas `replicado` não contam. Indício não testemunha e nunca é promovido |
| imprensa reputada | 0,90 | Veículo da lista curada em `parametros_33.json` (a lista precisa ser confirmada) |
| secundária | 0,80 | Demais veículos |
| indício | 0,60 | Confiança de classificação entre 0,60 e 0,85 |
| descartado | 0 | Confiança abaixo de 0,60, ou sem leitura do fato |

Confiança do classificador e fonte são coisas diferentes: a confiança limita o teto, a fonte define o nível.

### 3.6 Contrato de saída (por conta)

| Campo | Conteúdo |
|---|---|
| `versao` | `"vscs-3.3-dc"` |
| `vscs`, `vscs_base`, `penalidade` | Score final, valor antes da penalidade e penalidade aplicada |
| `bonus_convergencia` | Sempre 0 (o campo continua no contrato) |
| `excepcional`, `requisitos_90_pendentes` | Se a conta está na faixa 90+, e o que falta quando ficou em 89,9 |
| `movimentos[]` | `id`, `s`, `categoria`, `papel` (dominante, corroborador ou fora), `pontos` (as parcelas somam `vscs_base`), `vinculos[{de, para, regra}]` e `acontecimentos[]` |
| `acontecimentos[]` | `chave`, `base`, `data`, `fonte`, `fator_fonte`, `tempo`, `janela_lideranca`, `s`, `documentos[]`, `superado_por` |
| `possiveis_vinculos[]` | Ligações plausíveis que a heurística não confirma |

Para publicar, o mapeamento para `v2.contribuicoes` é: um registro por acontecimento, com `pontos` = parcela do movimento distribuída entre os acontecimentos dele. Série e tendência precisam ser recalculadas reexecutando os eventos datados com a nova fórmula, marcadas com `serie_recalculada`. Histórico não pode ser interpolado.

### 3.7 Revisão de 26/11 (segunda rodada): correções antes da publicação

1. **`payload.scoreModelo` é a fonte dos parâmetros efetivos.**
   - `reconciliar.py` lê o `scoreModelo` e sobrepõe o `parametros_32.json` pelo nome do campo (camelCase ou snake_case).
   - Lista as diferenças e as chaves sem correspondência.
   - Lê também `revisoesPorSinal`, como dict por id ou como lista. Mostra campos reconhecidos, campos desconhecidos e revisões sem sinal.
2. **Revisões individuais prevalecem** (`adaptador.revisoes` e `motor32._da_revisao`). Campos: `chave`, `base`, `categoria`, `nivel`, `cargo`, `pontua` (`false` = não pontua), fonte, data, precisão, confiança, `vinculoAtual`, `responsabilidadeClevel`, `movimentoId` e `acontecimentoId`.
3. **Cargo do ocupante ou da vaga** (`classificar.cargo_do_evento`). A ordem de leitura é:
   1. revisão;
   2. campo explícito (`cargo`, `cargoOcupante`, `cargoVaga`);
   3. título da vaga;
   4. cargo após o gatilho da nomeação no título curto;
   5. título curto inteiro.

   O texto de contexto (`porQueAgora`) **não** é lido. Exemplo: em "Ex-CRO da Beta assume como gerente de parcerias", o cargo é gerência.
4. **VP de receita = diretoria executiva (85).** Só vira C-level (95) com `responsabilidadeClevel` registrado.
5. **`corroborar()` corrigida** (seção 3.5): independência por domínio, release colapsado, réplicas ignoradas, teto de confiança preservado.
6. **Transição e residual** fora da elegibilidade para a faixa 90+ (seção 3.4).
7. **Adaptador dos sinais históricos** (`adaptador.adaptar`):
   - `dataPrecisao` diferente de dia ou exata → `dataEstimada`;
   - `confianca` (alta 0,95 · média 0,85 · baixa 0,65, ou número de 0–1 ou 0–100) → `classification_confidence`;
   - `fontes[]` vai para `corroborar()`.
8. **Maturação com salvaguardas.** Só se aplica a gerência, head, diretoria e C-level de receita. Depois dos 90 dias, exige **vínculo atual confirmado**, verificado nesta ordem:
   1. `vinculoAtual` na revisão;
   2. `vinculoConfirmadoEm` com até 180 d;
   3. pessoa no comitê da conta com cargo de receita, sem status `RECONFIRMAR_VINCULO` ou `BLOQUEADO`.

   Sem isso, vale o decaimento convencional, e o acontecimento grava `maturacao: "suspensa: …"`. CEO/sócio (70) e C-level fora de receita (50) não amadurecem. A simulação traz uma **auditoria da maturação**: ganho de cada liderança contra o decaimento convencional, para revisão manual dos maiores ganhos.
9. **Contexto e notícia setorial.** Contexto tem contribuição limitada: base ≤ 45 e não corrobora. Notícia setorial genérica vale 0.

### 3.8 Reconciliação de 26/11: o contrato de classificação

A reconciliação preliminar mostrou que o problema principal não era aritmética: era **reclassificar pelo texto sinais já validados**. A partir daqui, a classificação de um sinal tem uma ordem fixa de autoridade, igual na 3.2 e na 3.3:

1. **Revisão individual** (`scoreModelo.revisoesPorSinal`), inclusive `pontua: false`. Chaves legadas são traduzidas por uma tabela explícita (`classificar.LEGADO`): `troca_lideranca_head` vira `nomeacao_head`, com categoria liderança e tipo `troca_lideranca`. `vaga_gerencia` e `vaga_coordenacao` continuam vagas de liderança, sem fallback operacional.
2. **Classificação registrada no snapshot** (`v2.contribuicoes`): `chave`, `base`, `categoria`, **fator de fonte efetivo** e **data do fato**. `s`, `tempo` e `correlacao` **não** entram: são temporais e recalculados na data de referência. Item registrado não é reagrupado em bloco nem reinterpretado.
3. **Decisão registrada de não pontuar.** Sinal com `tipoSpec`, `categoria` e `nivel` nulos gravados pelo motor não pontua.
4. **Inferência pelo texto**, só para sinal nunca classificado, com as salvaguardas abaixo.

| Salvaguarda | Regra |
|---|---|
| Aquisição sofrida × realizada | Decide pelo papel da conta na frase: "X adquire a [conta]" é `foi_adquirida` (negativo); "[conta] adquire X" é aquisição realizada |
| Contribuidor individual com título de gerente | Hunter, farmer, gerente de contas ou relacionamento e "executivo/gerente" são operacionais. O título sozinho não promove a gerência |
| Contexto | Evento, palestra e prêmio só pontuam com classificação explícita. Notícia setorial vale 0 |
| Marco histórico × meta | Número de resultado passado ("fechou 2025 com…") é declaração genérica, não meta quantificada |
| Declaração encerrada | Só quando o fato posterior executa a **mesma** decisão (mesmo lugar, texto próximo ou `movimentoId`). Vale na 3.2 e na regra R3 da 3.3 |
| Fonte | Nome de veículo normalizado (sem acento nem caixa, "site", "comunicado", "carreiras"…). O fator efetivo registrado é preservado: não sobe nem desce por nome |
| `scoreModelo` | Equivalências semânticas explícitas (`adaptador.EQUIVALENCIAS`: `senioridade.*`, `vagasOperacionais.*`, `janelaAgrupamentoDias`, `meiaVidaDias`, `metaQuantificada`). `contexto`, `criterio` e `aprovadoEm` são metadados e não sobrescrevem parâmetros |

O reconciliador recalcula cada conta na data `v2.calculadoEm`, para o tempo não criar divergência falsa. Para cada conta divergente, ele explica a causa sinal a sinal: gravada sem recálculo, pontuada sem registro, base, fonte, tempo, correlação, bônus ou penalidade. Também mostra a tabela **registro × inferência pelo texto**, que mede onde o classificador erraria em sinais novos. O objetivo é 100% das contas explicadas, com cada diferença marcada como correção válida ou regressão.

### 3.9 Reconhecimento de uma nova liderança (decisão de 26/11)

A proximidade da Velora com a **pessoa nomeada** multiplica a força da nomeação. A regra só amplifica: não cria sinal e não conta como corroboração independente, porque é o mesmo acontecimento.

| Nota | Relação | Fator na força da nomeação |
|---:|---|---:|
| 0 | Sem relação | ×1,00 |
| 1 | Conexão no LinkedIn ou conhecido de mercado | ×1,05 |
| 2 | Contato prévio | ×1,10 |
| 3 | Relação profissional | ×1,20 |
| 4 | Acesso direto | ×1,30 |
| 5 | Amigo profissional, com entrada | ×1,40 |

- **Alcance:** só nomeações de liderança, casadas pelo nome da pessoa (`pessoa` ou `abordar.nome` do sinal) com a tabela de relacionamentos ou com `comite[].relacionamento`.
- **Teto:** a força continua limitada a 100, e um fato sozinho continua limitado a 85 no DC. A faixa 90+ segue exigindo dois movimentos independentes.
- **Validade:** registro com mais de 365 dias não vale.
- **Vínculo atual:** um registro com nota ≥ 1 e até 180 dias também confirma o vínculo atual da pessoa no cargo. Com isso, a maturação passa a valer para ela.
- **Saída do motor:** `acontecimentos[].relacionamento = {nota, fator, em, rotulo}`. Quem registrou não sai do motor.

Exemplo sintético: CRO nomeada há 36 dias, em imprensa reputada.

| Relação | Score 3.3 |
|---|---:|
| Sem relação | 61,8 |
| Nota 3 | 74,1 |
| Nota 5 | 85,0 (teto de um fato) |

**Tabela privada proposta**, a criar no Supabase com aprovação. Fica fora do snapshot exportado e do GitHub:

```sql
create table if not exists public.radar_relacionamentos (
  id          uuid primary key default gen_random_uuid(),
  conta_id    text not null,
  pessoa      text not null,              -- nome como está no comitê/sinal
  nota        smallint not null check (nota between 0 and 5),
  registrado_em date not null default current_date,
  autor       text not null,              -- e-mail do Cloudflare Access de quem registrou
  observacao  text,
  unique (conta_id, pessoa, autor)
);
alter table public.radar_relacionamentos enable row level security;  -- sem política para anon: só o servidor lê
```

Para a simulação, exporte `{contaId: {pessoa: {nota, em}}}` (sem autor) e passe com `--relacionamentos`. No modo apresentação, a tela mostra só o selo "via quente", sem nome de quem conhece nem a nota.

## 4. Como reproduzir sobre a base real (somente leitura)

```bash
cd radar_app/scripts
python3 -m vscs.reconciliar --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/reconciliacao.md
python3 -m vscs.simular     --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/simulacao-33.md
python3 -m vscs.casos                                                             # contrafactuais sintéticos
python3 -m unittest discover -s tests -p 'test_*.py'                              # 89 testes
```

O payload é o JSON do campo `payload` de `radar_snapshots` (`id = 'current'`), exportado por quem tem acesso. Ele e as saídas **ficam fora do repositório**.

## 5. Decisões pendentes (humanas)

1. Confirmar a tabela de bases da 3.2 contra `payload.scoreModelo` (`reconciliar.py`). Liderança fora de receita (70/50) e contexto foram decididos em 26/11.
2. Lista de veículos reputados.
3. Profundidade do vale de 90–180 d da dupla janela, a validar com a rotulagem de especialistas. Aprovados para teste em 26/11: fator 0,85 na janela de diagnóstico; γ 0,25 com teto +10; captação sem vínculo comprovado = possível vínculo; cortes de CQ-1 mantidos.

## 6. Não publicar

Ainda faltam: a reconciliação da 3.2, a simulação na base real, a rotulagem cega de 40 contas por especialistas e a aprovação. Antes da publicação: backup do snapshot, recálculo em cópia privada, verificação de que `score = v2.vscs`, de que a composição fecha e de que tudo fica em [0, 100]. Rollback: restaurar o backup.
