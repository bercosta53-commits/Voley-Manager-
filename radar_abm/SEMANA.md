# Uma semana com o Radar

Todos os comandos rodam dentro da pasta `radar_abm`. Onde aparece `<id>`, use o ID do sinal que o digest
mostra.

## Uma vez só: preparar

1. Instalar: `pip install -r requirements.txt`
2. Configurar: `cp .env.example .env` e preencher `ANTHROPIC_API_KEY` (classificador). `APOLLO_API_KEY` só
   com plano pago do Apollo.
3. Criar o banco e importar a lista:
   ```sh
   python manager.py iniciar
   python manager.py importar sua_lista.csv --dry-run   # ensaio: o que entraria
   python manager.py importar sua_lista.csv
   python manager.py qualidade                          # o que falta (CNPJ, site, UF, pessoas)
   ```
4. Revisar os nomes ambíguos (uma vez; depois, só quando entrar conta nova):
   ```sh
   python manager.py aliases revisar --saida saidas/aliases_revisar.csv
   # abra o arquivo, preencha a coluna "usar" com sim/nao e, se quiser, termos_negativos
   python manager.py aliases aplicar saidas/aliases_revisar.csv
   ```
5. Conferir a taxonomia: `python manager.py taxonomia`

## Toda segunda de manhã: rodar a semana (cerca de 20 minutos, quase tudo sozinho)

1. **Ensaio**, para ver o que vai acontecer sem gravar nada:
   ```sh
   python manager.py semana --dry-run
   ```
2. **Vagas do Indeed** (opcional, 10 minutos): siga o `VAGAS_ROTINA.md` para o Claude gerar
   `saidas/vagas_indeed_AAAA-MM-DD.csv`. A Gupy o radar visita sozinho.
3. **Para valer**:
   ```sh
   python manager.py semana --arquivo-vagas saidas/vagas_indeed_AAAA-MM-DD.csv   # ou só: python manager.py semana
   ```
   Isso faz, em sequência:
   - **coletar**: CNPJ (Receita), depois notícias (Google News), depois vagas (Gupy e o arquivo do Indeed),
     depois Apollo;
   - **classificar**: as notícias novas viram sinais ou ruído;
   - **digest**: gera `saidas/digest-AAAA-MM-DD.html`.

   Se preferir rodar os passos separados:
   ```sh
   python manager.py coletar
   python manager.py classificar
   python manager.py digest
   ```
4. **Conferir se a coleta correu bem**: `python manager.py execucoes`. Erro numa conta não para as outras; o
   que fazer em cada erro está no `CONECTORES.md`.

## Segunda, depois da coleta: ler o digest e decidir (30 a 45 minutos)

1. Abra `saidas/digest-AAAA-MM-DD.html` no navegador. Ele mostra, das contas que mais esquentaram:
   - o sinal;
   - a evidência (link e trecho);
   - o "por que agora";
   - quem abordar;
   - o ângulo;
   - o ID.
2. Para cada sinal, dê feedback. É o que faz o radar aprender e as métricas fazerem sentido:
   ```sh
   python manager.py feedback <id> util      # bom sinal: confirma (e aprova, se estava em revisão)
   python manager.py feedback <id> ruido     # não era sinal: sai do score
   python manager.py feedback <id> util --comentario "abordado; reunião marcada"
   ```
3. Esvazie a fila **Esperando revisão** do fim do digest com o mesmo comando. Sinal em revisão não conta no
   score até você aprovar.
4. Leve as 3 a 5 contas do topo para a cadência da semana, com o ângulo e a pessoa indicados.

## Durante a semana

- Conta nova na lista: `python manager.py importar sua_lista.csv` (não duplica as que já existem).
- Ver os sinais de uma conta: `python manager.py sinais --conta F-003`
- Ver o ranking a qualquer momento: `python manager.py score`

## Uma vez por mês: calibrar (30 minutos)

1. `python manager.py metricas`:
   - **precisão** por conector: % de sinais úteis. Abaixo de 60% num conector, algo precisa de ajuste;
   - **latência**: dias entre o fato e o alerta. Na primeira coleta ela sai alta, porque o radar pega fatos
     antigos; depois, deve ficar em poucos dias;
   - **volume**: quantos sinais cada fonte trouxe e quantos viraram ruído.
2. Ajuste o `sinais.yaml` conforme o que viu:
   - tipo que gera muito ruído: peso menor, ou mais palavras em `ruido`;
   - tipo que sempre vira reunião: peso maior.

   Depois, `python manager.py taxonomia` para conferir. O score muda na hora.
3. Notícias de homônimos (pessoa, rua, filme): acrescente termos negativos no alias da conta
   (`python manager.py aliases adicionar <conta> "<nome>" --negativos "termo1; termo2"`).
4. Complete CNPJ, site e pessoas das contas que o `qualidade` aponta, começando pelas tier A.
