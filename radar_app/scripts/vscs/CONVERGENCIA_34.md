# Convergência operacional — VSCS 3.4-DC × fila comercial
Referência: 27/11/2026. Documento de coordenação; não é autorização para publicar score candidato.

## Fonte única e estado
- Produção de dados: public.radar_snapshots / id=current / payload; VSCS 3.3-DC.
- Interface: migration/cloudflare-supabase; PR #71 integrado no commit 69afd892d6fd7476dcf4f9c12f1de434afec39fa; CI GitHub aprovado. Cloudflare Workers Builds velora-radar falhou (build 11f4edc3-0a5e-4353-bbbd-97f2419dca7b). Não presumir promoção.
- Candidato do motor: proposta/vscs-3-4-dc-auditoria, scripts/vscs/recalcular34.py.
- Revisões privadas staged: revisaoPendentesVSCS34, rankingVSCS34Auditoria, auditoriaQuedasVSCS34. O ranking SQL anterior e a auditoria contrafactual corrigida são simulações distintas, nunca score oficial.
- Não foi possível abrir a conversa de origem por ID; este documento consolida o estado verificável no repositório e no banco, não uma transcrição daquela conversa.

## Decisões que devem convergir
1. Separar força intrínseca do fato (base × fonte × fatores temporais e de classificação), contribuição marginal ao VSCS, e prioridade de abordagem (ICP × VSCS × elegibilidade).
2. Vaga aberta não é contratação efetivada, inclusive vaga de liderança ou bloco: contexto sem contribuição no candidato 3.4. Contratações efetivamente realizadas e nomeações de coordenação ou acima podem pontuar segundo materialidade. Não transformar anúncio de vaga em posse.
3. Um movimento causal, uma unidade comercial. Preservar documentos e sinais absorvidos na conta; nunca inventar contribuição mínima para eliminar zero.
4. Na fila padrão, destacar o melhor fato elegível de cada conta por faixa de prioridade. Zero, pendente, negativo e contexto não são gatilhos autônomos; não excluir evidências do banco. Sinal válido com contribuição zero por saturação pode ser evidência complementar, não nova oportunidade independente.
5. Nomeação confirmada: preservar data original e aplicar janela de implementação apenas com vínculo atual comprovado e critérios do motor. Não confundir novo CEO/COO técnico com dono de receita. Verificar validade temporal a cada carga.
6. CQ-1: A >=55, B >=70, C não entra, sujeito às demais condições de qualificação (decisor/dono da dor, bloqueios e histórico). Score sozinho não é permissão de abordagem.
7. Gráfico de 180 dias: usar série diária consistente com versão e data do score; marcar reconstrução/estimativa. Não reutilizar série 3.3 para 3.4. Clima × intensidade comercial usa VSCS puro, sem dupla contagem.
8. Manter separados os escores de ICP, aquisição, clima e VSCS; não mudar pesos dessas dimensões nesta migração.

## Sequência única de execução
P0 — restaurar publicação da interface: verificar logs privados do build Cloudflare, configuração de raiz/comandos e credenciais sem expor segredos; corrigir causa comprovada, repetir build e verificar versão efetivamente servida. Não reverter PR #71 por falha não diagnosticada.
P1 — congelar snapshot privado de referência com hash/CAS e backup verificável; não parar coleta, mas evitar dois escritores concorrentes de score. Consolidar revisões staged por ID, preservando evidências, data e grupos; validar conflitos de vínculo/identidade e nomes de cargos. Sincronizar candidato com alterações da branch de produção sem sobrescrever a fila, clima ou aquisição.
P2 — rodar o Python canônico em ambiente privado (entrada e saída fora do GitHub): python3 -m vscs.recalcular34 --snapshot /caminho/privado/payload.json --hoje AAAA-MM-DD --output /caminho/privado/candidato.json. Reconciliar primeiro 3.3 com a data original de cálculo, depois comparar 3.3 e 3.4 na mesma data e separar envelhecimento. Auditar diferenças do SQL; não forçar igualdade com simulação não canônica. Revisar materialização de grupos no script: não confirmar causalidade só por agrupamento proposto e não apagar vínculos válidos preexistentes. Revisar fatores de vínculo/relacionamento, parâmetros efetivos e bloqueios parciais.
P3 — validar 100% das contas, IDs e contribuições, classificação de vagas, vínculos, soma/decomposição, score= v2.vscs, faixas e ações, sinais sem nota explicitamente tratados. Comparar quedas e altas, especialmente mudanças de limiar. Rodar testes reais de regressão, inclusive Kamino (sem vagas, CRO preservado), nomeação efetiva, duplicata, contexto e negativos. Nenhuma conta perde score por erro de vínculo. Revalidar CQ-1 e garantir estados de abordagem/arquivamento por ID preservados.
P4 — gerar candidato completo com metadados de versão e data, histórico de 180 dias recalculado/rotulado, relatório de diferenças, backup e rollback. Só publicar após gates; transação atômica com CAS do hash da entrada, sem substituir alterações de ICP, contatos, aquisição, clima ou sinais novos. Se hash divergir, rebase/recalcular. Verificação de leitura pós-gravação.
P5 — unificar rotina diária: coleta -> deduplicação/classificação -> avaliação pelo motor canônico -> validação -> publicação atômica -> atualização da série e da fila. Uma versão de motor ativa; nenhum cálculo improvisado em paralelo. Preservar logs, evidências e rastreabilidade de todas as decisões.

## Gate de publicação
Não publicar 3.4 com simulação SQL, com baseline não reconciliado, com erro de build ou sem backup. Testes sintéticos não substituem a execução integral do snapshot privado. Nenhuma mudança de score foi executada por este documento.
