# Mandato declarado da liderança — extensão experimental 3.3-DC

Aprovada para teste. Feature flag `missao.habilitada` desligada por padrão. Não publicar rankings, dados de empresas ou relações privadas neste repositório.

## Contrato

Somente no sinal de entrada efetiva de liderança de receita — coordenação, gerência, head, diretoria ou C-level — registrar `missao` com tipo, texto literal (até 120 caracteres), especifica, meta (ou null), praca (ou null), confianca (0–1), fonteUrl e opcionalmente ativa/substituidaEm. Revisão individual prevalece. Preservar versões anteriores no histórico privado. Nunca criar um novo sinal de missão. Vagas abertas, encerradas ou canceladas não participam desta variável: sem missão elegível, sem amplificação, sem oferta derivada da missão. Dados antigos de vagas permanecem apenas como histórico, fora da ativação por mandato. Exigir ingressoConfirmado=true e ingressoFonteUrl (fonte que comprova que a pessoa assumiu); ingressoEm, se conhecido, não pode ser futuro. A data do anúncio não comprova posse. Coordenação deve envolver gestão real de receita, não função operacional com título de liderança. A regra não altera o peso-base de vagas em outras variáveis do VSCS nem a curva de maturação vigente. Não usar resumo interno como citação. Fallback apenas sobre tituloOriginal/trechoLiteral e padrões inequívocos; incerteza não pontua. Para tipo explícito, classificador valida nexo GTM e evidência na fonte.

Fatores 1,00 / 1,15 / 1,20. Meta concreta ou praça identificada no trecho; prazo sozinho não qualifica. Confiança menor que 0,6, missão genérica ou sem fonte neutras. Escolher uma missão principal, sem acumular. Relação multiplica antes do teto de 100; DC de um movimento limitado a 85. Para 90+, o controle sem missão precisa ser elegível por si mesmo. O tier permanece fora do cálculo.

O motor retorna acontecimentos[].missao com texto, fonte, tipo, fator, oferta e ângulo. Catálogo em missao.py: 10 tipos e generica. Tensão de execução (baixa/moderada/alta/muito alta/indeterminada) e aderência à Velora (baixa/média/alta/muito alta/indeterminada) são hipóteses qualitativas, sem pontuação, com justificativa e evidências; não inferir necessidade de consultoria como fato. Frontend: mostrar trecho e fonte no Hoje, playbook e briefing; personalizar abordagem sem sugerir vigilância. Não enviar mensagens automaticamente.

## Agrupamento causal

movimentoId explícito liga execução confirmada à nomeação. Mesma praça sem evidência de nexo é possível vínculo e não prova independência para 90+. Novo mercado e produto: exigir evidência explícita, não mera coincidência semântica. Não alterar datas do fato por republicação.

## Validação antes de merge

1. Rodar testes existentes e novos; comparar feature desligada/ligada com as mesmas entradas, revisões, data e relacionamentos privados.
2. Classificar entradas efetivas: fonte literal, URL, cargo, mandato vigente, confiança e evidência de ingresso. Revalidar o histórico antes de amplificar. Registrar secundárias apenas como contexto, sem acumular.
3. Mostrar delta de score, ranking e CQ-1 por conta, razões, teto e agrupamento. Nenhum dado real no GitHub.
4. Rotulagem cega e revisão humana; obter aprovação comercial. Só então integrar playbooks/telas e considerar publicação, com backup e rollback.
