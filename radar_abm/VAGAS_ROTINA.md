# Rotina semanal de vagas com o Claude

O radar visita sozinho as páginas de carreiras das contas (Gupy, Greenhouse, Lever, Ashby, Sólides). Esta
rotina cobre o resto, numa conversa com o Claude:
- achar a página de carreiras das contas que ainda não têm (uma vez por conta);
- trazer as vagas do **Indeed**, pelo conector do Indeed;
- opcionalmente, anúncios do **Glassdoor**, por busca na web.

O Indeed e o Glassdoor não têm API aberta que o radar possa chamar, e o Glassdoor bloqueia acesso
automático. Por isso quem busca é o Claude, e o radar importa o resultado. LinkedIn não é usado.

## 1. Gerar a lista de contas

```sh
python manager.py vagas contas --tier A --saida saidas/contas_vagas.csv
```

A coluna `pagina_vagas` mostra quem já tem página de carreiras conhecida.

## 2. Pedir ao Claude (conversa com o conector do Indeed e a busca na web ligados)

Anexe `saidas/contas_vagas.csv` e cole o texto abaixo:

> Para cada linha do arquivo anexo:
>
> **A. Página de carreiras** (só para linhas com `pagina_vagas` vazia). Procure na web a página de vagas da
> empresa (busque "vagas <empresa>" e "carreiras <empresa>"). Se ela estiver em `gupy.io`,
> `greenhouse.io`, `lever.co`, `ashbyhq.com` ou `vagas.solides.com.br`, anote o endereço da página
> principal da empresa, não de uma vaga só. Confira se é a mesma empresa: nome e cidade batem, e o site
> da linha, se houver, aponta para essa página. Monte `paginas_vagas.csv` com as colunas `id_conta,url`.
>
> **B. Indeed.** Busque vagas no Indeed (search_jobs) com o nome da empresa como busca, a cidade e a UF
> da linha como local (se estiverem vazias, use "Brasil") e o país BR.
>
> **C. Glassdoor (opcional).** Busque na web `site:glassdoor.com.br vagas <empresa>` e use só o que a
> busca mostrar (título e link do anúncio). Não entre no site.
>
> Em B e C, guarde **só** as vagas cuja empresa é a mesma da linha. Nome parecido não serve. **Não**
> filtre pelo tipo de vaga; o radar decide o que interessa. Não use o LinkedIn.
>
> **D. Consultorias de recrutamento.** Nos sites públicos de vagas da Michael Page (michaelpage.com.br),
> Robert Half (roberthalf.com/br), Hays (hays.com.br) e Talenses, procure vagas de liderança em marketing,
> growth, RevOps e comercial (gerente, head, diretor, coordenador) nas cidades do arquivo. De cada vaga,
> anote: consultoria, código da vaga (referência), título, link, data, local, setor (o "Resumo da vaga" da
> Michael Page traz setor, subsetor e indústria) e a descrição do cliente ("Sobre nosso cliente", copiada
> literalmente). Se o anúncio disser o nome da empresa, preencha `empresa`; senão, deixe vazio e **não**
> tente adivinhar. Monte `consultorias_AAAA-MM-DD.csv` com as colunas
> `consultoria,referencia,titulo,url,data,local,setor,descricao,empresa`.
>
> Monte `vagas_AAAA-MM-DD.csv`, com a data de hoje, e as colunas `id_conta,empresa,titulo,url,fonte,data,local`,
> uma linha por vaga:
> - `id_conta`: o da linha do arquivo;
> - `empresa`: como a fonte mostra;
> - `url`: o link do anúncio inteiro, sem cortar parâmetros;
> - `fonte`: Indeed ou Glassdoor;
> - `data`: a data de publicação, se a fonte informar.
>
> Me devolva os três arquivos.

## 3. Importar

Salve os arquivos em `saidas/` e rode:

```sh
python manager.py vagas paginas saidas/paginas_vagas.csv                  # grava as páginas de carreiras
python manager.py vagas importar saidas/vagas_AAAA-MM-DD.csv --dry-run    # o que entraria
python manager.py vagas importar saidas/vagas_AAAA-MM-DD.csv
python manager.py vagas consultorias saidas/consultorias_AAAA-MM-DD.csv   # vagas de headhunters viram pistas
python manager.py vagas pistas                                             # pistas com as contas candidatas
                                                                           # (com ANTHROPIC_API_KEY, já ordenadas pelo Claude)
python manager.py vagas atribuir <pista> <conta>                           # confirma a empresa (ou - descarta)
```

As consultorias escondem o nome do cliente. Por isso a vaga vira uma **pista** com as contas candidatas
(mesmo setor e mesma cidade). O Claude ordena as candidatas pela probabilidade de serem o cliente,
explicando cada nota, mas a vaga só vira sinal quando você confirma qual é a empresa. As pistas abertas
também aparecem no digest.

Ou junte à rotina da semana: `python manager.py semana --arquivo-vagas saidas/vagas_AAAA-MM-DD.csv`.

O radar confere de novo a empresa de cada linha e descarta a vaga que não for da conta. Também não
repete vaga que já viu, nem conta duas vezes a mesma vaga em duas fontes. As páginas gravadas passam a
ser visitadas sozinhas toda semana: a parte A da rotina só precisa das contas novas.
