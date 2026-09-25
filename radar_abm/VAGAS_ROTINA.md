# Rotina semanal de vagas pelo Indeed

O Indeed não tem uma API aberta que o radar possa chamar sozinho. Quem busca é o Claude, pelo conector do
Indeed que você já conectou. Ele gera um CSV, e o radar importa esse arquivo. A Gupy o radar visita
sozinho; esta rotina cobre as empresas que anunciam no Indeed.

## 1. Gerar a lista de contas

```sh
python manager.py vagas contas --tier A --saida saidas/contas_vagas.csv
```

## 2. Pedir ao Claude (numa conversa com o conector do Indeed ligado)

Anexe `saidas/contas_vagas.csv` e cole o texto abaixo:

> Para cada linha do arquivo anexo, busque vagas no Indeed (search_jobs) com o nome da empresa como
> busca, a cidade e a UF da linha como local (se estiverem vazias, use "Brasil") e o país BR.
> Guarde **só** as vagas cuja empresa é a mesma da linha. Nome parecido não serve: "Junto Seguros" não é
> "Grupo Servopa". **Não** filtre pelo tipo de vaga; o radar decide o que interessa. Não use o LinkedIn.
> Monte um CSV com as colunas `id_conta,empresa,titulo,url,fonte,data,local`, uma linha por vaga:
> - `id_conta`: o da linha do arquivo;
> - `empresa`: como o Indeed mostra;
> - `url`: o link "View Job URL" inteiro, sem cortar parâmetros;
> - `fonte`: Indeed;
> - `data`: o "Posted on".
>
> Salve como `vagas_indeed_AAAA-MM-DD.csv` com a data de hoje e me devolva o arquivo.

## 3. Importar

Salve o arquivo em `saidas/` e rode:

```sh
python manager.py vagas importar saidas/vagas_indeed_AAAA-MM-DD.csv --dry-run   # o que entraria
python manager.py vagas importar saidas/vagas_indeed_AAAA-MM-DD.csv
```

Ou junte à rotina da semana: `python manager.py semana --arquivo-vagas saidas/vagas_indeed_AAAA-MM-DD.csv`.

O radar confere de novo a empresa de cada linha e descarta a vaga que não for da conta. Também não
repete vaga que já viu, nem conta duas vezes a vaga que está na Gupy e no Indeed.
