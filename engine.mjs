export const POS=['LEV','PON','CEN','OPO','PON','CEN','LIB'];
export const TRIBUTE_PLAYER_ID=1; // Homenagem: Thiago Alves. Único jogador com perfil fixo.
export const clubs=[{id:0,name:"Porto Alegre Vôlei",short:"POA",city:"Porto Alegre · RS",color:"#b5ee57",base:74,budget:240000,identity:"Equilíbrio e leitura",description:"Equipe consistente, com bom levantamento e poucas oscilações."},{id:1,name:"Belo Horizonte Vôlei",short:"BHZ",city:"Belo Horizonte · MG",color:"#7bb5ff",base:76,budget:370000,identity:"Altura e bloqueio",description:"Elenco físico, forte na rede e construído para pressionar pelo bloqueio."},{id:2,name:"Campinas Atlético",short:"CAM",city:"Campinas · SP",color:"#ffb974",base:74,budget:310000,identity:"Saque e agressividade",description:"Time de risco alto, saque pesado e volume ofensivo nas extremidades."},{id:3,name:"Joinville Vôlei",short:"JOI",city:"Joinville · SC",color:"#cfabff",base:72,budget:195000,identity:"Defesa e juventude",description:"Projeto jovem, móvel e competitivo em rallies longos."},{id:4,name:"Recife Maré",short:"REC",city:"Recife · PE",color:"#57d9d1",base:73,budget:220000,identity:"Passe e contra-ataque",description:"Recepção e defesa sustentam um jogo paciente e de reconstrução."},{id:5,name:"Goiânia Cerrado",short:"GOI",city:"Goiânia · GO",color:"#f2d45c",base:73,budget:255000,identity:"Bloqueio e saque",description:"Muito tamanho de rede e saque incômodo, com passe mais vulnerável."},{id:6,name:"Rio Atlântico",short:"RIO",city:"Rio de Janeiro · RJ",color:"#5fc4ff",base:75,budget:330000,identity:"Distribuição e controle",description:"Boa primeira bola e levantadores capazes de espalhar o jogo."},{id:7,name:"Manaus Norte",short:"MAN",city:"Manaus · AM",color:"#ff8b61",base:73,budget:205000,identity:"Potência e variância",description:"Ataque e saque de teto alto, mas com maior oscilação de execução."}];
export function rng(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
export const TEAM_STYLES={
0:{label:'Leitura adaptável',description:'Equilibra a distribuição e muda o desenho conforme a leitura do bloqueio.',direction:'mixed',tactics:{serve:'balanced',target:'mixed',distribution:'balanced',pace:'balanced',block:'read',defense:'standard'}},
1:{label:'Rede dominante',description:'Procura impor altura, centralizar o bloqueio e jogar com bastante presença no meio.',direction:'deep',tactics:{serve:'selective',target:'weak',distribution:'middle',pace:'balanced',block:'middle',defense:'diagonal'}},
2:{label:'Pressão e extremidades',description:'Saque de risco e volume alto nas pontas e na saída para acelerar a partida.',direction:'diagonal',tactics:{serve:'aggressive',target:'weak',distribution:'wings',pace:'fast',block:'wings',defense:'deep'}},
3:{label:'Rally e cobertura',description:'Reduz risco, alonga os rallies e protege o fundo para viver de reconstrução.',direction:'short',tactics:{serve:'balanced',target:'mixed',distribution:'balanced',pace:'control',block:'read',defense:'deep'}},
4:{label:'Primeira bola e paciência',description:'Prioriza passe, controle e contra-ataque antes de aumentar o risco.',direction:'parallel',tactics:{serve:'safe',target:'mixed',distribution:'balanced',pace:'control',block:'read',defense:'standard'}},
5:{label:'Saque + bloqueio',description:'Usa o saque para estreitar a distribuição rival e fecha a rede com agressividade.',direction:'deep',tactics:{serve:'selective',target:'weak',distribution:'middle',pace:'balanced',block:'middle',defense:'diagonal'}},
6:{label:'Velocidade e distribuição',description:'Com passe na mão, acelera o 5–1 e espalha o ataque para tirar o bloqueio do lugar.',direction:'mixed',tactics:{serve:'balanced',target:'mixed',distribution:'middle',pace:'fast',block:'read',defense:'standard'}},
7:{label:'Potência e variância',description:'Procura quebrar a partida no saque e no ataque, aceitando maior oscilação.',direction:'diagonal',tactics:{serve:'aggressive',target:'weak',distribution:'opposite',pace:'fast',block:'wings',defense:'deep'}}
};
export const CROWD_LEVELS={1:{label:'DISCRETA',effect:'baixo'},2:{label:'PRESENTE',effect:'leve'},3:{label:'ENGAJADA',effect:'moderado'},4:{label:'INTENSA',effect:'forte'},5:{label:'CALDEIRÃO',effect:'muito forte'}};
export const CROWD_PROFILES={
0:{level:4,label:'INTENSA',description:'Participa bastante e cresce quando o time encaixa uma sequência.'},
1:{level:5,label:'CALDEIRÃO',description:'Uma das torcidas mais presentes da liga; aumenta muito o ruído nos momentos de fechamento.'},
2:{level:4,label:'INTENSA',description:'Torcida exigente e presente, especialmente quando o saque começa a pressionar.'},
3:{level:3,label:'ENGAJADA',description:'Boa presença e apoio constante, sem transformar todo jogo em ambiente extremo.'},
4:{level:4,label:'INTENSA',description:'Ambiente caloroso que sustenta o time em rallies longos e sequências defensivas.'},
5:{level:4,label:'INTENSA',description:'Cresce com bloqueios e séries de saque e costuma pressionar o visitante.'},
6:{level:3,label:'ENGAJADA',description:'Boa atmosfera, com impacto moderado e maior oscilação conforme o placar.'},
7:{level:5,label:'CALDEIRÃO',description:'Ambiente muito hostil para o visitante quando o time embala.'}
};
export function teamStyle(id){return TEAM_STYLES[id]||TEAM_STYLES[0]}
export function crowdProfile(id){return CROWD_PROFILES[id]||CROWD_PROFILES[0]}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function ensureServeIdentity(p){if(p.serveStyle)return p.serveStyle;const x=((p.id+1)*2654435761>>>0)%1000/1000,k=p.archetypeKey||'';let weights=k.includes('forca')||k.includes('pontuador')||k.includes('atacante')?[.62,.18,.20]:k.includes('passador')||k.includes('recepcao')||k.includes('organizador')?[.24,.50,.26]:[.42,.34,.24];p.serveStyle=x<weights[0]?'viagem':x<weights[0]+weights[1]?'flutuante':'hibrido';return p.serveStyle;}
export function serveStyleLabel(p){return ({viagem:'VIAGEM',flutuante:'FLUTUANTE',hibrido:'HÍBRIDO'})[ensureServeIdentity(p)]||'SAQUE';}
function serveProfile(p){
 const style=ensureServeIdentity(p);
 if(style==='viagem')return {error:1.22,ace:1.27,pressure:5,target:.96,tacticalBreak:.015};
 if(style==='flutuante')return {error:.70,ace:.76,pressure:1,target:1.18,tacticalBreak:.045};
 return {error:.84,ace:.90,pressure:2.5,target:1.06,tacticalBreak:.075};
}
function routeFor(p,isFront,pass,courtPosition){
 if(p.pos==='LEV')return 'secondBall';
 if(p.pos==='CEN')return 'firstTempo';
 if(isFront)return p.pos==='OPO'?'saida':'entrada';
 if(p.pos==='OPO')return 'bolaD';
 return courtPosition===5?'pipe':'fundoPonta';
}
function routeAvailability(p,isFront,pass,route){
 if(p.pos==='LEV'){let base=isFront&&pass>=3?.042:0;if(p.archetypeKey==='lev_atacante')base*=1.85;else if(p.archetypeKey==='lev_pontuador')base*=1.45;else if(p.archetypeKey==='lev_organizador')base*=.72;return base;}
 if(p.pos==='CEN')return [0,.025,.30,1.12,1.42][pass]||.025;
 if(isFront)return p.pos==='OPO'?1.18:1;
 if(p.pos==='OPO')return pass>=3?.44:pass===2?.20:.07;
 if(p.pos==='PON'&&route==='pipe')return pass>=3?.34:pass===2?.15:.055;
 if(p.pos==='PON')return pass>=3?.20:pass===2?.10:.04;
 return .05;
}
function routeAttackModifier(p,isFront,pass,route){
 if(p.pos==='LEV')return pass>=4?-4:-8;
 if(p.pos==='CEN')return pass>=4?5:pass===3?3:pass===2?-3:-9;
 if(isFront)return 0;
 const base=p.pos==='OPO'?-6:route==='pipe'?-8:-10;
 return base+(pass>=4?1.5:pass===3?0:pass===2?-2:-5);
}
const routeOrigin={entrada:'FRONT_LEFT',firstTempo:'FRONT_MIDDLE',saida:'FRONT_RIGHT',fundoPonta:'BACK_LEFT',pipe:'BACK_MIDDLE',bolaD:'BACK_RIGHT'};
function originFor(route,courtPosition){if(route==='secondBall')return ['BACK_RIGHT','FRONT_RIGHT','FRONT_MIDDLE','FRONT_LEFT','BACK_LEFT','BACK_MIDDLE'][courtPosition]||'FRONT_RIGHT';return routeOrigin[route]||'FRONT_LEFT';}
function phaseFor(loops,pass,chaos){if(loops===0)return 'SIDEOUT_ATTACK';return chaos>=.64||pass<=1?'SCRAMBLE_ATTACK':'TRANSITION_ATTACK';}
function systemFor(pass,chaos){return pass>=3&&chaos<.45?'IN_SYSTEM':'OUT_OF_SYSTEM';}
function setTypeFor(p,route,pass,pace){if(route==='secondBall')return 'SECOND_BALL';if(route==='firstTempo')return 'QUICK';if(route==='pipe')return 'PIPE';if(pass<=1)return 'OUT_OF_SYSTEM';if(pass<=2)return 'HIGH';if(pace==='fast'&&['entrada','saida'].includes(route))return 'SHOOT';return 'HIGH';}
const directionCode={diagonal:'CROSS',parallel:'LINE',deep:'DEEP',short:'CROSS_SHARP'};
function pressureIndex(m,side,context){
 const set=m.setScores.length+1,target=set===5?15:25,top=Math.max(...m.score),gap=m.score[side]-m.score[1-side],recent=m.events.filter(e=>e.set===set).slice(-5);
 let runAgainst=0;for(let i=recent.length-1;i>=0&&recent[i].winner===1-side;i--)runAgainst++;
 const previousError=recent.at(-1)?.errorTeam===side?1:0;
 const hadLead=m.events.filter(e=>e.set===set).some(e=>e.score[side]-e.score[1-side]>=4),lostLead=hadLead&&gap<=0;
 return clamp(.08+(top>=target-5?.18:0)+(top>=target-2?.18:0)+(context.setPoint?.18:0)+(context.matchPoint?.12:0)+Math.min(.15,runAgainst*.035)+(lostLead?.10:0)+previousError*.06+Math.max(0,context.environment?.[side]||0)*.12,0,1);
}
function chaosIndex(pass,loops,precision,focus=0){return clamp(({1:.62,2:.34,3:.13,4:.04}[pass]??.45)+Math.min(.34,loops*.11)+Math.max(0,62-precision)*.006+focus*.10,0,1);}
function metaRng(m,side,loops,salt=0){return rng(((m.seed>>>0)^Math.imul(m.events.length+1,2654435761)^Math.imul(side+1,2246822519)^Math.imul(loops+1,3266489917)^salt)>>>0);}
function finishFor(attacker,nblock,pass,outcome,pressure,chaos,r){
 const read=clamp((attacker.attack*.30+attacker.mental*.25+attacker.consistency*.25+playerExperience(attacker)*.20)/100,0,1),bad=pass<=2?.06:0,crowd=nblock>=2?.06:0;
 if(outcome==='defended'&&nblock&&r()<clamp(.035+read*.055+bad+crowd,.02,.18))return 'RECYCLE';
 if(outcome==='kill'&&nblock){let x=r(),outside=clamp(.035+read*.075+bad+crowd,.03,.20),blockout=clamp(.045+read*.075+bad+crowd,.04,.22);if(x<outside)return 'OUTSIDE_HAND';if(x<outside+blockout)return 'BLOCK_OUT';if(x<outside+blockout+.045)return 'BLOCK_DEFLECTION';}
 if(['kill','defended'].includes(outcome)&&r()<clamp(.018+(nblock>=2?.035:0)+(pass<=2?.03:0)+read*.02,.015,.10))return 'TIP';
 return null;
}
function infractionContext(type,player,team,action,origin,pressure,chaos,set,score,decisive=false){return {type:'infraction',infractionType:type,typeKey:type,player:player?.id??null,team,action,origin,pressure,rallyChaos:chaos,set,score:[...score],decisive};}
function classifyAttackError({m,side,setter,attacker,attackPlan,pass,loops,precision,nblock,pressure,chaos,score,context}){
 const rr=metaRng(m,side,loops,0xA17F31),setterControl=clamp((100-setter.consistency)/100*.6+(100-playerExperience(setter))/100*.25+(100-setter.mental)/100*.15,0,1),attackerControl=clamp((100-attacker.consistency)/100*.55+(100-playerExperience(attacker))/100*.25+(100-attacker.mental)/100*.20,0,1),fatigue=(100-Math.min(setter.condition,attacker.condition))/100,poor=pass<=2?1:0,decisive=context.setPoint||context.matchPoint;
 let weights=[];
 // These are conditional shares of an already-existing error outcome, never extra error probability.
 weights.push(['doubleContact',clamp(.008+poor*.012+chaos*.018+setterControl*.014+fatigue*.006+pressure*.006,.002,.065),'SET',setter]);
 weights.push(['carry',clamp(.007+poor*.010+chaos*.015+setterControl*.010+pressure*.004,.002,.05),'SET',setter]);
 if(chaos>.45)weights.push(['fourTouches',clamp(.0035+chaos*.020+pressure*.004,.002,.04),'TEAM',setter]);
 weights.push(['antenna',clamp(.006+(pass<=2?.012:0)+chaos*.008+(nblock>=2?.005:0),.002,.035),'ATTACK',attacker]);
 if(!attackPlan.isFront)weights.push(['backRowAttack',clamp(.010+attackerControl*.010+fatigue*.006+pressure*.004,.004,.035),'ATTACK',attacker]);
 weights.push(['netTouch',clamp(.008+(nblock>=2?.006:0)+fatigue*.008+chaos*.005,.003,.04),'ATTACK',attacker]);
 if(chaos>.35)weights.push(['underNet',clamp(.0015+fatigue*.003+chaos*.003,.001,.012),'ATTACK',attacker]);
 const roll=rr(),sum=weights.reduce((n,w)=>n+w[1],0);if(roll>=sum)return null;let x=roll;for(const [type,w,action,p] of weights){x-=w;if(x<0)return infractionContext(type,p,side,action,originFor(attackPlan.route,attackPlan.courtPosition),pressure,chaos,m.setScores.length+1,score,decisive);}return null;
}
function classifyDefenderFault({m,defSide,participants,attacker,attackPlan,loops,pressure,chaos,score,context}){
 if(!participants.length)return null;const rr=metaRng(m,defSide,loops,0x91CDB5),p=participants[Math.floor(rr()*participants.length)],fatigue=(100-p.condition)/100,late=pressure>.7?1:0;
 const net=clamp(.0018+fatigue*.0025+chaos*.0015+late*.0008,.001,.009),over=clamp(.00035+chaos*.0008+late*.0003,.0002,.0028),under=clamp(.00025+fatigue*.0007+chaos*.0006,.00015,.0022),x=rr();let type=x<net?'netTouch':x<net+over?'overNet':x<net+over+under?'underNet':null;if(!type)return null;return infractionContext(type,p,defSide,'BLOCK',originFor(attackPlan.route,attackPlan.courtPosition),pressure,chaos,m.setScores.length+1,score,context.setPoint||context.matchPoint);
}


// =========================================================
// 0.9.3.3 — Grandes Momentos
// Momentum = estado contínuo. Grande Momento = evento raro e explicável.
// This layer annotates an already-resolved rally. It never chooses the winner.
// =========================================================
function rallyPhaseWeight(set,score){
 const top=Math.max(...score);
 if(set===5){if(top>=13)return 1.40;if(top>=10)return 1.15;return 1.00;}
 if(top>=25)return 1.35;if(top>=23)return 1.25;if(top>=21)return 1.10;if(top>=17)return 1.00;if(top>=9)return .90;return .75;
}
function durationImpact(seconds){return seconds>=70?100:seconds>=50?78:seconds>=35?58:seconds>=25?40:seconds>=15?20:0;}
function defenseSpectacularEvent({m,side,loops,chaos,pressure,difficulty,defender}){
 const rr=metaRng(m,side,loops,0x6D4F4D),x=rr();
 // Nested, deliberately rare outcomes. These are descriptions of the save, not extra saves.
 if(chaos>.68&&loops>=3&&difficulty>.72&&x<.003)return 'EXTERNAL_ANTENNA_SAVE';
 if(chaos>.64&&loops>=2&&difficulty>.68&&x<.012)return 'OUTSIDE_COURT_SAVE';
 if(chaos>.60&&loops>=1&&difficulty>.64&&x<.028)return 'CHASE_SAVE';
 if(difficulty>.74&&x<.015)return 'DIG_FOOT';
 if(difficulty>.70&&x<.038)return 'DIG_ONE_HAND';
 if(difficulty>.66&&x<.070)return 'DIG_DIVING';
 if(difficulty>.62&&x<.120)return 'DIG_REFLEX';
 return null;
}
function attackSpectacularEvents(step){
 const out=[];
 const tripleHard=step.nblock===3&&(((step.expected??1)<=.38&&step.quality<=2)||step.pressure>=.82);
 if(step.outcome==='kill'&&tripleHard)out.push('TRIPLE_BLOCK_KILL');
 if(step.outcome==='kill'&&tripleHard&&['OUTSIDE_HAND','BLOCK_OUT'].includes(step.finish))out.push('IMPOSSIBLE_BLOCK_OUT');
 if(step.outcome==='kill'&&step.setType==='SECOND_BALL')out.push('SECOND_BALL_SURPRISE');
 if(step.outcome==='kill'&&step.finish==='TIP'&&step.nblock>=2&&step.quality<=2&&((step.expected??1)<=.40||step.pressure>=.76))out.push('EXTREME_TIP');
 return out;
}
function sameRallyDigRecord(steps){
 const counts=new Map();for(const s of steps)if(s.type==='defense')counts.set(s.player,(counts.get(s.player)||0)+1);
 let player=null,count=0;for(const [id,n] of counts)if(n>count){player=id;count=n;}return {playerId:player,count};
}
function immediateStreak(m,event,reason){
 let n=1;for(let i=m.events.length-1;i>=0;i--){const e=m.events[i];if(e.set!==event.set||e.reason!==reason||e.actor!==event.actor)break;n++;}return n;
}
function playerAttackTouchStreak(m,event,playerId){
 const recent=[...m.events.filter(e=>e.set===event.set).slice(-10),event],attacks=recent.flatMap(e=>(e.steps||[]).filter(s=>s.type==='attack'&&s.player===playerId&&s.outcome!=='cancelled'));
 const last=attacks.slice(-5);let consecutive=0;for(let i=attacks.length-1;i>=0&&['kill','faultWin','defenseError'].includes(attacks[i].outcome);i--)consecutive++;
 return {last5:last.length===5&&last.every(s=>['kill','faultWin','defenseError'].includes(s.outcome))?5:0,consecutive};
}
function recentBlockStreak(m,event,playerId){
 const window=[...m.events,event].filter(e=>e.set===event.set).slice(-6);
 return window.reduce((n,e)=>n+((e.steps||[]).some(s=>s.type==='block'&&s.player===playerId)?1:0),0);
}
function spectacleScore(event){
 const weights={DIG_REFLEX:24,DIG_DIVING:34,DIG_ONE_HAND:42,DIG_FOOT:62,CHASE_SAVE:46,OUTSIDE_COURT_SAVE:70,EXTERNAL_ANTENNA_SAVE:96,TRIPLE_BLOCK_KILL:54,SINGLE_BLOCK_KILL:52,IMPOSSIBLE_BLOCK_OUT:78,SECOND_BALL_SURPRISE:46,EXTREME_TIP:42};
 let score=0;for(const x of event.spectacularEvents||[])score+=weights[x]||0;
 const digs=event.sameRallyDigs?.count||0;if(digs>=5)score+=96;else if(digs===4)score+=78;else if(digs===3)score+=42;

 return clamp(score,0,100);
}
function streakScore(m,event){
 let score=0,ace=0,blocks=0,kills=0;
 if(event.reason==='Ace'){ace=immediateStreak(m,event,'Ace');score=Math.max(score,ace>=4?100:ace===3?92:ace===2?44:0);}
 if(event.reason==='Bloqueio ponto'){blocks=immediateStreak(m,event,'Bloqueio ponto');score=Math.max(score,blocks>=4?100:blocks===3?88:blocks===2?48:0);}
 const attack=(event.steps||[]).find(s=>s.type==='attack'&&['kill','faultWin','defenseError'].includes(s.outcome));
 if(attack){const a=playerAttackTouchStreak(m,event,attack.player);kills=a.consecutive;score=Math.max(score,a.last5===5?72:a.consecutive>=4?42:a.consecutive===3?20:0);}
 const blocker=(event.steps||[]).find(s=>s.type==='block')?.player;if(blocker){const n=recentBlockStreak(m,event,blocker);score=Math.max(score,n>=3?78:n===2?34:0);}
 const digs=event.sameRallyDigs?.count||0;if(digs>=5)score=Math.max(score,100);else if(digs===4)score=Math.max(score,92);else if(digs===3)score=Math.max(score,64);
 event.streaks={consecutiveAces:ace,consecutiveBlocks:blocks,consecutiveKills:kills,blocksLast6Rallies:blocker?recentBlockStreak(m,event,blocker):0};
 return score;
}
function momentReasons(event){
 const reasons=[];
 if(event.rallyDuration>=50)reasons.push(`rally de ${Math.round(event.rallyDuration)}s`);else if(event.rallyDuration>=35)reasons.push(`rally longo de ${Math.round(event.rallyDuration)}s`);
 const digs=event.sameRallyDigs?.count||0;if(digs>=3)reasons.push(`${digs} defesas do mesmo jogador`);
 const map={DIG_FOOT:'defesa com o pé',OUTSIDE_COURT_SAVE:'salvamento fora da quadra',EXTERNAL_ANTENNA_SAVE:'bola recuperada por fora da antena',TRIPLE_BLOCK_KILL:'ponto contra bloqueio triplo',IMPOSSIBLE_BLOCK_OUT:'explorou o triplo',SECOND_BALL_SURPRISE:'bola de segunda inesperada',EXTREME_TIP:'largada em situação extrema',DIG_DIVING:'peixinho',DIG_ONE_HAND:'defesa de uma mão'};
 for(const x of event.spectacularEvents||[])if(map[x]&&!reasons.includes(map[x]))reasons.push(map[x]);
 if(event.streaks?.consecutiveAces>=3)reasons.push(`${event.streaks.consecutiveAces} aces seguidos`);
 if(event.streaks?.consecutiveBlocks>=3)reasons.push(`${event.streaks.consecutiveBlocks} bloqueios seguidos`);
 if(event.streaks?.consecutiveKills>=5)reasons.push(`${event.streaks.consecutiveKills} bolas viradas em sequência`);
 if(event.context?.setPointBefore)reasons.push('set point');if(event.context?.matchPointBefore)reasons.push('match point');
 return reasons.slice(0,5);
}
function annotateMoment(m,event){
 const attacks=(event.steps||[]).filter(s=>s.type==='attack').length,defenses=(event.steps||[]).filter(s=>s.type==='defense').length,loops=Math.max(0,defenses),rr=metaRng(m,event.winner,loops,0x4D4F4D45);
 event.rallyDuration=clamp(3.2+attacks*2.05+defenses*2.65+loops*.85+rr()*4.2+(defenses>=5?Math.pow(defenses-4,1.25)*1.8:0),3.5,92);
 event.sameRallyDigs=sameRallyDigRecord(event.steps||[]);
 event.spectacularEvents=[];
 for(const s of event.steps||[]){if(s.spectacularEvent)event.spectacularEvents.push(s.spectacularEvent);if(s.type==='attack')event.spectacularEvents.push(...attackSpectacularEvents(s));}
 if(event.reason==='Bloqueio ponto'&&(event.steps||[]).filter(s=>s.type==='blockAttempt').length===1){const a=(event.steps||[]).find(s=>s.type==='attack');if((event.context?.pressure||0)>=.62||(a?.expected||0)>=.58)event.spectacularEvents.push('SINGLE_BLOCK_KILL');}
 event.spectacularEvents=[...new Set(event.spectacularEvents)];
 const spectacle=spectacleScore(event),streak=streakScore(m,event),duration=durationImpact(event.rallyDuration),pressure=clamp((event.context?.pressure||0)*100,0,100),momentumDim=clamp(Math.abs((m.momentum?.[0]||0)-(m.momentum?.[1]||0))*20,0,100),crowdBefore=clamp((m.crowdEnergy?.[event.winner]||0)*100,0,100),phase=rallyPhaseWeight(event.set,event.scoreBefore||event.score),decisive=(event.context?.matchPointBefore?9:event.context?.setPointBefore?5:0),direct=(event.reason==='Ace'||event.reason==='Bloqueio ponto'?8:0),combo=Math.min(14,Math.max(0,(event.spectacularEvents.length-1)*5)+(event.sameRallyDigs?.count>=3?4:0));
 const core=Math.max(spectacle*.78,streak*.86,duration*.65),support=Math.min(18,spectacle*.10+streak*.08+duration*.06);
 let impact=clamp((core+support+pressure*.14+momentumDim*.015+crowdBefore*.010+direct+combo)*phase+decisive,0,100);
 // Rare actions must be perceived even early; score importance still amplifies them further.
 if(event.streaks.consecutiveAces>=3)impact=Math.max(impact,88);if(event.streaks.consecutiveBlocks>=3)impact=Math.max(impact,86);if(event.sameRallyDigs.count>=4)impact=Math.max(impact,88);if(event.spectacularEvents.includes('EXTERNAL_ANTENNA_SAVE'))impact=Math.max(impact,92);if(event.spectacularEvents.includes('OUTSIDE_COURT_SAVE'))impact=Math.max(impact,66);if(event.spectacularEvents.includes('DIG_FOOT'))impact=Math.max(impact,58);
 const target=event.set===5?15:25,topAfter=Math.max(...event.score),setEnding=event.score[event.winner]>=target&&event.score[event.winner]-event.score[1-event.winner]>=2,setHasGreat=m.events.some(e=>e.set===event.set&&e.greatMoment),visualCandidate=spectacle>=34||duration>=35||streak>=40||(event.sameRallyDigs?.count||0)>=3||(direct&&pressure>=55),lateWindow=topAfter>=(event.set===5?10:17),deepClosing=topAfter>=(event.set===5?12:21);
 const setFeature=!setHasGreat&&((lateWindow&&visualCandidate&&impact>=58)||(deepClosing&&impact>=65)||setEnding);
 if(setFeature){impact=Math.max(impact,setEnding?86:84);event.featuredMoment=true;event.featuredMomentReason=setEnding?'set-closing':'set-plasticity';}
 const previous=[...m.events].reverse().find(e=>e.greatMoment),distance=previous?event.index-previous.index:999,exception=impact>=95||event.context?.matchPointBefore&&impact>=88||setFeature,cooldownSuppressed=distance<=2&&!exception;
 const level=impact>=82&&!cooldownSuppressed?'GREAT':impact>=68?'STRONG':impact>=53?'FEED':'NORMAL';
 event.momentImpact=Math.round(impact);event.spectacle=Math.round(spectacle);event.streakImpact=Math.round(streak);event.pressureImpact=Math.round(pressure);event.momentumImpact=Math.round(momentumDim);event.crowdBefore=Math.round(crowdBefore);event.momentLevel=level;event.greatMoment=level==='GREAT';event.momentReasons=momentReasons(event);if(event.featuredMoment&&!event.momentReasons.length)event.momentReasons=[setEnding?'fechamento do set':'jogada de alto impacto no set'];event.cooldownSuppressed=cooldownSuppressed;
 const occupancy=m.arena?.occupancy??arenaFor(m).occupancy,eventType=event.reason==='Ace'?.42:event.reason==='Bloqueio ponto'?.52:event.rallyDuration>=35?.62:.18;
 event.crowdImpact=clamp(eventType+impact/180+(event.winner===0?occupancy*.15:0),0,1);
 m.crowdEnergy??=[0,0];m.crowdEnergy=m.crowdEnergy.map((v,i)=>clamp(v*.78+(i===event.winner?event.crowdImpact*.34:0),0,1));
 if(event.greatMoment){m.greatMoments??=[];m.greatMoments.push({index:event.index,set:event.set,score:[...event.score],winner:event.winner,actor:event.actor,momentImpact:event.momentImpact,rallyDuration:event.rallyDuration,spectacularEvents:[...event.spectacularEvents],sameRallyDigs:{...event.sameRallyDigs},streaks:{...event.streaks},reasons:[...event.momentReasons]});}
 return event;
}
function applyMomentAftermath(m,event){
 if(event.momentLevel==='NORMAL')return;
 const scale=event.greatMoment?.34:event.momentLevel==='STRONG'?.14:.05;m.momentum??=[0,0];m.momentum[event.winner]=clamp(m.momentum[event.winner]+scale,-5,5);m.momentum[1-event.winner]=clamp(m.momentum[1-event.winner]-scale*.45,-5,5);
 if(event.greatMoment){const actor=m.teams.flat().find(p=>p.id===event.actor);if(actor)actor.confidence=clamp((actor.confidence??actor.morale)+1.4,35,99);const digger=event.sameRallyDigs?.playerId?m.teams.flat().find(p=>p.id===event.sameRallyDigs.playerId):null;if(digger&&digger!==actor)digger.confidence=clamp((digger.confidence??digger.morale)+.8,35,99);}
}

const ATHLETE_CATALOG=[[["Maicon","Maicon Douglas da Rosa","Caxias do Sul","RS"],["Thiago Alves","Thiago Soares Alves","Porto Alegre","RS"],["Ademilson","Ademilson Rodrigues de Oliveira","Pelotas","RS"],["Alemão","Carlos Eduardo Schmitt","Santa Maria","RS"],["Damião","Damião Luís Ferreira","Porto Alegre","RS"],["Juninho","Júnior César de Souza","Passo Fundo","RS"],["Jeferson","Jeferson Luís Machado","Canoas","RS"],["Betão","Roberto Becker da Silva","Bento Gonçalves","RS"],["Rafinha","Rafael Nunes da Silva","Novo Hamburgo","RS"],["Deivid","Deivid Henrique Lopes","Bagé","RS"],["Hoffmann","Guilherme Hoffmann","Caxias do Sul","RS"],["Matheusinho","Matheus Oliveira da Costa","São Leopoldo","RS"],["Pires","Diego Pires","Uruguaiana","RS"],["Wesley","Wesley dos Santos Pacheco","Porto Alegre","RS"]],[["Luizão","Luiz Carlos Ferreira","Belo Horizonte","MG"],["Dudu","Eduardo Henrique Braga","Contagem","MG"],["Sabará","Marcos Vinícius de Almeida","Montes Claros","MG"],["Edmilson","Edmilson Pereira da Silva","Betim","MG"],["Vitinho","Vitor Hugo Nogueira","Juiz de Fora","MG"],["Jhonny","Jhonny Douglas Valadares","Uberlândia","MG"],["Vilela","Afonso Vilela de Moura","Belo Horizonte","MG"],["Douglas","Douglas Arantes Ribeiro","Nova Lima","MG"],["Nogueira","Henrique Nogueira Campos","Ipatinga","MG"],["Renatinho","Renato Alves Camargos","Sete Lagoas","MG"],["Talles","Talles Augusto Resende","Divinópolis","MG"],["Paulão","Paulo César Meireles","Governador Valadares","MG"],["Kauã","Kauã Lacerda Gomes","Uberaba","MG"],["Dênis","Dênis de Paula Lafetá","Sabará","MG"]],[["Pedrinho","Pedro Henrique Barros","Campinas","SP"],["Furlan","Diego Furlan","Jundiaí","SP"],["Akira","Akira Sanches Takahashi","São Paulo","SP"],["Leandrinho","Leandro Augusto Prado","Campinas","SP"],["Uehara","Felipe Uehara","Americana","SP"],["Cauê","Cauê Rodrigues Campana","Mogi das Cruzes","SP"],["Takeda","Raul Kenji Takeda","Sorocaba","SP"],["Gui","Guilherme Galvão","Limeira","SP"],["Matheus","Matheus de Mello Vassalo","Piracicaba","SP"],["Bira","Ubirajara Figueira Neto","São Paulo","SP"],["Nishi","Danilo Nishi","Ribeirão Preto","SP"],["Erick","Erick dos Santos Arakaki","Campinas","SP"],["Samuca","Samuel Campana Martins","Bauru","SP"],["Léo","Leonardo Prado Sanches","São José dos Campos","SP"]],[["Krüger","Jonas Henrique Krüger","Joinville","SC"],["Tessari","Kelvin Tessari","Chapecó","SC"],["Kelvinho","Kelvin Rafael Zanella","Blumenau","SC"],["Moser","Fábio Luís Moser","Criciúma","SC"],["Jean","Jean Carlos Kretzer","Florianópolis","SC"],["Zanella","Vitor Zanella","Jaraguá do Sul","SC"],["Tesser","Bruno Tesser","Joinville","SC"],["Kretzer","Alexandre Kretzer","São Bento do Sul","SC"],["Bressan","Heitor Bressan","Brusque","SC"],["Otto","Otto Marangoni","Pomerode","SC"],["Bittencourt","Noah Bittencourt","Itajaí","SC"],["Saulinho","Saulo Witt da Silva","Joinville","SC"],["Emanuel","Emanuel Koerich","Lages","SC"],["Rafa Schmitt","Rafael Schmitt","Rio do Sul","SC"]],[["Junão","Júnior Cavalcanti Nascimento","Recife","PE"],["Carlinhos","Carlos Henrique Bezerra","Olinda","PE"],["Janderson","Janderson Silva Tavares","Jaboatão dos Guararapes","PE"],["Ewerton","Ewerton Lins de Oliveira","Caruaru","PE"],["Kleyton","Kleyton Assunção Maciel","Recife","PE"],["Ruan","Ruan Albuquerque","Petrolina","PE"],["Moisés","Moisés Barbalho","Paulista","PE"],["Natan","Natan Tenório","Garanhuns","PE"],["Clebson","Clebson Andrade Siqueira","Recife","PE"],["Ítalo","Ítalo Gouveia","Olinda","PE"],["Vilar","João Vilar da Silva","Vitória de Santo Antão","PE"],["Pablo","Pablo Nascimento de Andrade","Cabo de Santo Agostinho","PE"],["Kiko","Francisco Maciel Neto","Recife","PE"],["Assunção","Mateus Assunção Maciel","Caruaru","PE"]],[["Claudinho","Cláudio Henrique Caiado","Goiânia","GO"],["Kauan","Kauan Rezende Borges","Anápolis","GO"],["Roriz","Hugo Roriz de Castro","Goiânia","GO"],["Póvoa","Emanuel Póvoa","Aparecida de Goiânia","GO"],["Danilo","Danilo Siqueira Amaral","Rio Verde","GO"],["Misael","Misael Mendonça","Catalão","GO"],["Breno","Breno Velasco Lobo","Goiânia","GO"],["Perillo","Vinícius Perillo","Jataí","GO"],["Alexsandro","Alexsandro Fleury Lemes","Anápolis","GO"],["Téo","Teodoro Malta","Goiânia","GO"],["Fleury","Arthur Fleury","Itumbiara","GO"],["Joabe","Joabe Mendonça","Formosa","GO"],["Malta","Pedro Malta","Goiânia","GO"],["Rafão","Rafael Augusto Roriz","Aparecida de Goiânia","GO"]],[["DG","Daniel Gomes Paes","Rio de Janeiro","RJ"],["Marlon","Marlon Bastos","Niterói","RJ"],["Yan","Yan Peçanha","Campos dos Goytacazes","RJ"],["Caíque","Caíque Fonseca","Petrópolis","RJ"],["Leozinho","Leonardo Tostes","Rio de Janeiro","RJ"],["Beto","Roberto Coelho","São Gonçalo","RJ"],["Nandinho","Fernando Valença","Volta Redonda","RJ"],["Paes","Breno Paes","Rio de Janeiro","RJ"],["Motta","Gabriel Motta","Niterói","RJ"],["Peçanha","João Miguel Peçanha","Duque de Caxias","RJ"],["Renan","Renan Marins","Nova Friburgo","RJ"],["Marins","Lucas Marins de Carvalho","Resende","RJ"],["Davi","Davi Saldanha","Rio de Janeiro","RJ"],["Nilo","Nilo Carvalho","Teresópolis","RJ"]],[["Jhonatan","Jhonatan Barroso","Manaus","AM"],["Ezequiel","Ezequiel Neves","Parintins","AM"],["Mikael","Mikael Pires Monteiro","Manaus","AM"],["Anderson","Anderson Braga","Itacoatiara","AM"],["Adriel","Adriel Pinheiro","Manacapuru","AM"],["Eliel","Eliel Corrêa","Tefé","AM"],["Raoni","Raoni Castro","Manaus","AM"],["Rian","Rian Monteiro","Coari","AM"],["Kailã","Kailã Souza","Manaus","AM"],["Enoque","Enoque Tavares","Iranduba","AM"],["Barroso","Samuel Barroso Gama","Parintins","AM"],["Jhow","João Victor Lima","Presidente Figueiredo","AM"],["Ariel","Ariel Nogueira","Manaus","AM"],["Yago","Yago Farias da Silva","Itacoatiara","AM"]]];
const CLUB_PROFILES={0:{set:4,consistency:5,mental:3,receive:2,chemistry:4},1:{block:4,attack:2,stamina:2,height:2},2:{serve:6,attack:4,receive:-1,consistency:-3},3:{defense:5,receive:3,stamina:4,mental:-2,age:-2},4:{receive:5,defense:6,consistency:3,serve:-3,attack:-1},5:{block:5,serve:4,height:2,receive:-4},6:{set:5,receive:3,mental:3,consistency:2},7:{attack:5,serve:6,receive:1,stamina:3,consistency:-5,mental:-1}};
const POSITION_BASE={LEV:{attack:-18,serve:0,receive:-6,block:-7,set:10,defense:2,stamina:1,mental:4,consistency:4},PON:{attack:2,serve:1,receive:2,block:-2,set:-20,defense:1,stamina:2,mental:1,consistency:1},CEN:{attack:3,serve:0,receive:-30,block:7,set:-26,defense:-14,stamina:3,mental:2,consistency:1},OPO:{attack:7,serve:2,receive:-25,block:1,set:-24,defense:-7,stamina:2,mental:2,consistency:0},LIB:{attack:-50,serve:-8,receive:8,block:-50,set:-8,defense:8,stamina:4,mental:3,consistency:5}};
export const ROLE_ARCHETYPES={
LEV:[{key:'lev_organizador',label:'Organizador',mods:{set:8,mental:8,consistency:8,defense:3,attack:-6},height:[188,4]},{key:'lev_acelerador',label:'Acelerador',mods:{set:6,stamina:7,mental:6,consistency:3,serve:2},height:[190,5]},{key:'lev_atacante',label:'Atacante',mods:{attack:11,set:3,block:5,serve:3,consistency:-3},height:[194,5]},{key:'lev_pontuador',label:'Pontuador',mods:{attack:7,serve:9,block:8,set:2,defense:-2},height:[197,5]}],
PON:[{key:'pon_passador',label:'Ponteiro passador',mods:{receive:10,defense:7,consistency:6,attack:-5,serve:1,block:-3},height:[194,5]},{key:'pon_atacante',label:'Ponteiro atacante',mods:{attack:9,serve:5,block:3,receive:-7,consistency:-2},height:[200,5]},{key:'pon_completo',label:'Ponteiro completo',mods:{attack:5,receive:6,defense:5,serve:4,block:2,consistency:4},height:[198,5]},{key:'pon_virador',label:'Ponteiro virador',mods:{attack:8,mental:7,consistency:5,stamina:4,receive:-3},height:[197,5]}],
CEN:[{key:'cen_bloqueador',label:'Central bloqueador',mods:{block:10,mental:4,attack:-3},height:[211,4]},{key:'cen_primeiro_tempo',label:'Central de 1º tempo',mods:{attack:9,stamina:6,block:2,serve:1},height:[205,5]},{key:'cen_leitura',label:'Central de leitura',mods:{block:6,mental:10,consistency:7,stamina:5,attack:2},height:[203,5]},{key:'cen_completo',label:'Central completo',mods:{attack:6,block:6,serve:4,mental:4,consistency:3},height:[208,4]}],
OPO:[{key:'opo_virador',label:'Saída virador de bola',mods:{attack:10,mental:8,consistency:6,serve:2,block:1},height:[201,5]},{key:'opo_forca',label:'Saída força',mods:{attack:9,serve:10,block:4,consistency:-5,mental:-1},height:[205,5]},{key:'opo_bloqueador',label:'Saída bloqueador',mods:{block:9,attack:6,serve:3,mental:3},height:[208,4]},{key:'opo_completo',label:'Saída completo',mods:{attack:7,serve:6,block:6,defense:3,mental:3,consistency:3},height:[203,5]}],
LIB:[{key:'lib_recepcao',label:'Líbero de recepção',mods:{receive:10,consistency:8,defense:4,set:2},height:[181,4]},{key:'lib_defesa',label:'Líbero de defesa',mods:{defense:10,stamina:8,receive:5,mental:4},height:[179,4]},{key:'lib_completo',label:'Líbero completo',mods:{receive:7,defense:7,set:5,mental:5,consistency:5},height:[183,4]},{key:'lib_organizador',label:'Líbero organizador',mods:{receive:5,defense:6,set:9,mental:9,consistency:5},height:[182,4]}]};
function roleProfileFor(clubId,pos,occurrence){const list=ROLE_ARCHETYPES[pos];return list[(clubId+occurrence)%list.length];}
export function roleLabel(p){return p.archetype||ROLE_ARCHETYPES[p.pos]?.find(x=>x.key===p.archetypeKey)?.label||p.pos;}
function roleHeight(p,r){const x=ROLE_ARCHETYPES[p.pos]?.find(a=>a.key===p.archetypeKey),fallback={LEV:[190,6],PON:[198,6],CEN:[207,6],OPO:[203,6],LIB:[182,5]},pair=x?.height||fallback[p.pos],mean=pair[0],sd=pair[1];return Math.round(clamp(mean+sd*Math.sqrt(-2*Math.log(Math.max(r(),.00001)))*Math.cos(2*Math.PI*r()),170,220));}

export function canonicalAthleteMeta(id){
  id=Number(id);
  if(!Number.isInteger(id)||id<0||id>=clubs.length*14)return null;
  const club=Math.floor(id/14),slot=id%14,meta=ATHLETE_CATALOG[club]?.[slot];
  return meta?{name:meta[0],fullName:meta[1],originCity:meta[2],originState:meta[3]}:null;
}
export function applySpecialPlayerProfile(p,{preserveDynamic=false}={}){
  if(!p||Number(p.id)!==TRIBUTE_PLAYER_ID)return p;
  const dynamic=preserveDynamic?{
    morale:p.morale,condition:p.condition,chemistry:p.chemistry
  }:null;
  Object.assign(p,{
    club:0,
    name:'Thiago Alves',
    fullName:'Thiago Soares Alves',
    originCity:'Porto Alegre',
    originState:'RS',
    pos:'PON',
    archetypeKey:'pon_atacante',
    archetype:'Ponteiro atacante · elite',
    age:27,
    attack:94,
    serve:91,
    receive:81,
    block:81,
    set:31,
    defense:79,
    stamina:88,
    mental:94,
    consistency:90,
    morale:84,
    condition:98,
    chemistry:88,
    salary:26500,
    height_cm:194,
    serveStyle:'viagem',
    tribute:true,
    lockedClub:true,
    legacyTitle:'Homenagem · Thiago Alves',
    legacyNote:'Ponteiro ofensivo de elite: virada de bola, saque viagem forte e alta confiabilidade em jogos grandes. Prata em Londres 2012, melhor jogador do Mundial Juvenil de 2005 e pentacampeão da Superliga.'
  });
  if(dynamic){
    if(Number.isFinite(dynamic.morale))p.morale=dynamic.morale;
    if(Number.isFinite(dynamic.condition))p.condition=dynamic.condition;
    if(Number.isFinite(dynamic.chemistry))p.chemistry=dynamic.chemistry;
  }
  return p;
}

export function players(){let r=rng(2709);return clubs.flatMap(c=>Array.from({length:14},(_,i)=>{let pos=POS[i%7],occ=POS.slice(0,i).filter(x=>x===pos).length,role=roleProfileFor(c.id,pos,occ),profile=CLUB_PROFILES[c.id]||{},b=c.base+(r()-.5)*12-(i>6?3:0),baseMods=POSITION_BASE[pos]||{},mods=role.mods||{},skill=(key)=>Math.round(clamp(b+(r()-.5)*16+(profile[key]||0)+(baseMods[key]||0)+(mods[key]||0),15,97)),meta=ATHLETE_CATALOG[c.id][i];let p={id:c.id*14+i,club:c.id,name:meta[0],fullName:meta[1],originCity:meta[2],originState:meta[3],pos,archetypeKey:role.key,archetype:role.label,age:clamp(20+Math.floor(r()*14)+(profile.age||0),18,37),attack:skill('attack'),serve:skill('serve'),receive:skill('receive'),block:skill('block'),set:skill('set'),defense:skill('defense'),stamina:skill('stamina'),mental:skill('mental'),consistency:skill('consistency'),morale:70+Math.floor(r()*20),condition:96,chemistry:clamp(70+Math.floor(r()*20)+(profile.chemistry||0),55,98),salary:Math.round((b-40)*(350+r()*300)/500)*500};if(pos==='LIB'){p.attack=clamp(p.attack,15,28);p.block=clamp(p.block,15,24)}if(pos==='CEN'){p.receive=clamp(p.receive,15,55);p.set=clamp(p.set,15,48)}if(pos==='OPO'){p.receive=clamp(p.receive,15,68);p.set=clamp(p.set,15,50)}if(pos==='LEV'){p.attack=clamp(p.attack,30,role.key==='lev_atacante'?82:role.key==='lev_pontuador'?76:64)}Object.keys(p).filter(k=>['attack','serve','receive','block','set','defense','stamina','mental','consistency'].includes(k)).forEach(k=>p[k]=clamp(p[k],15,97));p.height_cm=Math.round(clamp(roleHeight(p,r)+(profile.height||0),170,220));let physicalBlockCap=clamp(60+(p.height_cm-180)*1.30+(p.pos==='CEN'?5:0)+(p.archetypeKey==='cen_leitura'?6:0),58,97);p.block=Math.min(p.block,Math.round(physicalBlockCap));if(p.archetypeKey==='pon_passador')p.attack=Math.min(p.attack,88);if(p.archetypeKey==='pon_atacante')p.receive=Math.min(p.receive,80);if(p.archetypeKey==='lev_organizador')p.attack=Math.min(p.attack,60);if(p.archetypeKey==='opo_forca')p.consistency=Math.min(p.consistency,82);applySpecialPlayerProfile(p,{preserveDynamic:false});ensureServeIdentity(p);return p}));}
const BASE_TACTICS={serve:'balanced',distribution:'balanced',block:'read',target:'weak',pace:'balanced',protect:'none',defense:'standard'};
export const defaultTactics=(clubId=null)=>({...BASE_TACTICS,...(Number.isInteger(clubId)?teamStyle(clubId).tactics:{}),protect:'none'});
export function selectiveServers(team){
 const ranked=team.slice(0,6).map(p=>({p,score:p.serve*.72+p.consistency*.18+p.mental*.10})).sort((a,b)=>b.score-a.score),picked=ranked.filter((x,i)=>i<2&&x.score>=74).map(x=>x.p);
 return picked.length?picked:ranked.slice(0,1).map(x=>x.p);
}
function effectiveServeMode(mode,server,team){if(mode!=='selective')return mode;return selectiveServers(team).some(p=>p.id===server.id)?'aggressive':'balanced';}
export function activeSix(m,side){
 const team=m.teams?.[side]||[],rotation=m.rotation?.[side]||0,entries=team.slice(0,6).map((player,slot)=>({player,slot,position:(slot+rotation)%6,replaced:false,original:null})),libero=team[6];
 if(!libero)return entries;
 const backCentral=entries.find(e=>e.player?.pos==='CEN'&&[0,4,5].includes(e.position));
 if(backCentral&&!(m.server===side&&backCentral.position===0)){backCentral.original=backCentral.player;backCentral.player=libero;backCentral.replaced=true;}
 return entries;
}
function activeTalkTone(m,side){const e=m.talkEffects?.[side];return e&&e.set===m.setScores.length+1&&e.until>m.events.length?e.tone:null;}
function talkQualityBonus(m,side,key){const tone=activeTalkTone(m,side);if(tone==='execute'&&['serve','receive','defense','set'].includes(key))return 2.2;if(tone==='simplify'&&['receive','defense','set'].includes(key))return .8;if(tone==='calm'&&['receive','defense','set'].includes(key))return .65;if(tone==='energize'&&['serve','attack','block'].includes(key))return .75;return 0;}
export function lineup(all,id){let used=[];return POS.map(pos=>{let p=all.filter(p=>p.club===id&&p.pos===pos&&!used.includes(p.id))[0];used.push(p.id);return p.id})}
const pick=(a,r)=>a[Math.floor(r()*a.length)];
function weighted(a,weights,r){let n=r()*weights.reduce((s,v)=>s+v,0);return a[weights.findIndex(w=>(n-=w)<0)]||a.at(-1)}
function baseCompetitiveState(team){let avg=k=>team.reduce((n,p)=>n+Number(p[k]??0),0)/Math.max(1,team.length),confidence=team.reduce((n,p)=>n+Number(p.confidence??p.morale??75),0)/Math.max(1,team.length);return {confidence:clamp(confidence,35,99),concentration:clamp(avg('mental')*.55+avg('consistency')*.45,45,96),pressure:0,complacency:0,streak:0};}
function independentDayForm(seed,side){let q=rng(((seed>>>0)^Math.imul(side+1,0x9E3779B1)^0x85EBCA6B)>>>0);return (q()+q()+q()-1.5)*3.2;}
export function createMatch(all,home,away,lines,tactics,seed=Date.now()){const teams=[lines[home].map(id=>({...all.find(p=>p.id===id)})),lines[away].map(id=>({...all.find(p=>p.id===id)}))];teams.flat().forEach(ensureServeIdentity);const matchPlans=[matchTactics(tactics[home]||defaultTactics(home),lines[home].map(id=>all.find(p=>p.id===id)),lines[away].map(id=>all.find(p=>p.id===id)),home),matchTactics(tactics[away]||defaultTactics(away),lines[away].map(id=>all.find(p=>p.id===id)),lines[home].map(id=>all.find(p=>p.id===id)),away)];return {seed,rngState:seed>>>0,home,away,teams,tactics:matchPlans,initialTactics:matchPlans.map(t=>({...t})),score:[0,0],sets:[0,0],setScores:[],rotation:[0,0],server:seed%2,initialServer:seed%2,events:[],greatMoments:[],crowdEnergy:[0,0],momentum:[0,0],timeouts:[0,0],substitutions:[0,0],bench:{},decisions:[],competitiveState:teams.map(baseCompetitiveState),dayForm:[independentDayForm(seed,0),independentDayForm(seed,1)],done:false};}
function matchControlBonus(m,side){if(!m.setScores?.length)return 0;let pd=m.setScores.reduce((n,x)=>n+(x[side]-x[1-side]),0);return clamp(pd*0.28,-2.5,2.5);}
function twoSetResponse(m,side){if(m.setScores?.length!==2||m.sets[side]!==0||m.sets[1-side]!==2)return 0;let last=m.setScores.at(-1),gap=Math.abs((last?.[side]||0)-(last?.[1-side]||0));return gap>=7?1.15:.95;}
function attackGroup(p){return p.pos==='CEN'?'middle':p.pos==='OPO'?'opposite':p.pos==='PON'?'wings':'other';}
function distributionPlanned(t,p){return t.distribution!=='balanced'&&attackGroup(p)===t.distribution;}
function groupPredictability(m,side,group){if(group==='other')return 0;let set=m.setScores.length+1,recent=m.events.filter(e=>e.set===set).slice(-14).flatMap(e=>e.steps||[]).filter(s=>s.type==='attack'&&s.team===side&&s.outcome!=='cancelled'),ids=new Set(m.teams[side].filter(p=>attackGroup(p)===group).map(p=>p.id));if(recent.length<7)return 0;let share=recent.filter(s=>ids.has(s.player)).length/recent.length;return clamp((share-.54)*.115,0,.045);}
function tacticalAttackEdge(m,side,attacker,pass,pace){let own=m.tactics[side],opp=m.tactics[1-side],group=attackGroup(attacker),planned=distributionPlanned(own,attacker),blockedFocus=opp.block===group||String(opp.block)==='player:'+attacker.id,edge=0;if(planned)edge+=pass>=3?2.4:pass===2?.7:-1.4;if(opp.block!=='read'){if(blockedFocus)edge-=planned?7.0:3.8;else if(planned)edge+=3.0;else edge+=1.0;}if(pace==='fast'){if(pass>=4)edge+=blockedFocus?1.6:5.8;else if(pass===3)edge+=blockedFocus?.9:4.1;else edge-=2.8;}if(pace==='control')edge+=pass<=2?1.25:pass===3?-.25:-.75;edge-=groupPredictability(m,side,group)*90;return {edge,planned,blockedFocus,group};}
function zoneWeightsFor(route,group,clubId){let w=route==='firstTempo'?[2.5,1.1,4.4,2.0]:group==='opposite'?[4.1,2.8,2.1,1.0]:group==='wings'?[5.0,2.2,2.0,.8]:[4,2,3,1],pref=teamStyle(clubId).direction,index={diagonal:0,parallel:1,deep:2,short:3}[pref];if(Number.isInteger(index))w=w.map((x,i)=>x*(i===index?3:.55));return w;}
function defenseZoneEffect(plan,zone){if(plan==='standard')return {kill:0,dig:0,covered:false};let covered=plan===zone||(plan==='advance'&&zone==='short');if(covered)return {kill:plan==='advance'?-.060:-.052,dig:plan==='advance'?7.0:6.2,covered:true};let adjacent=(plan==='deep'&&zone==='diagonal')||(plan==='diagonal'&&zone==='deep')||(plan==='advance'&&['diagonal','parallel'].includes(zone));if(plan==='advance'&&!adjacent)return {kill:.014,dig:-1.3,covered:false};return {kill:adjacent?-.008:.022,dig:adjacent?1.0:-2.2,covered:false};}
function homeCourtQuality(m,side,key,context){let a=context?.arena||arenaFor(m),level=a.engagement||3;if(side===0){let base=.45+level*.23,phase=context?.act==='closing'?1.12:1;return base*phase*(['receive','set','defense'].includes(key)?1.05:.9);}let noise=context?.environment?.[1]||0;return -noise*(['receive','set'].includes(key)?1.7:1.05);}
function ensureAiSetTalk(m){
 const side=Number.isInteger(m.aiSide)?m.aiSide:null;
 if(side===null||side<0||side>1)return;
 const set=m.setScores.length+1,key=set+':'+side;
 m.aiSetTalks??=[];
 if(m.aiSetTalks.includes(key))return;
 m.aiSetTalks.push(key);
 m.talkEffects??=[null,null];
 const down=m.sets[side]<m.sets[1-side],tone=down?'calm':'execute',duration=down?6:5;
 m.talkEffects[side]={tone,set,until:m.events.length+duration};
 m.decisions??=[];
 m.decisions.push({type:'talk',side,set,rally:m.events.length,tone,automatic:true,reason:'ai-set-preparation'});
}
function competitiveQuality(m,side,key,context){let st=m.competitiveState?.[side]||baseCompetitiveState(m.teams?.[side]||[]),legacy=Number.isFinite(m.matchForm?.[side])?m.matchForm[side]*.30:0,day=Number.isFinite(m.dayForm?.[side])?m.dayForm[side]:legacy,concentration=clamp((Number(st.concentration??75)-75)*.018,-.65,.65),pressure=clamp(Number(st.pressure||0)/100,0,.6)*(context?.act==='closing'?.70:.28);return clamp(day+concentration-pressure,-2.8,2.8);}
export function rally(m){if(m.done)return null;ensureAiSetTalk(m);updateFocus(m);const context=matchContext(m);m.arena??=arenaFor(m);let r=rng(m.rngState);m.rngState=(Math.imul(m.rngState,1664525)+1013904223)>>>0; // Each rally gets an independent deterministic stream.
if(m.events.length===0||m.events.at(-1).set!==m.setScores.length+1)m.setForm=[(r()-.5)*1.2,(r()-.5)*1.2];
let serving=m.server,receiving=1-serving,steps=[],set=m.setScores.length+1,score=[...m.score],rot=[...m.rotation],late=context.act==='closing',quality=(p,key,side)=>(70+(p[key]-70)*1.08)*(.78+.22*p.condition/100)+((p.confidence??p.morale)-75)*.025+(p.chemistry-75)*.04+(m.setForm?.[side]||0)+competitiveQuality(m,side,key,context)+matchControlBonus(m,side)+twoSetResponse(m,side)+(m.momentum?.[side]||0)*.3+talkQualityBonus(m,side,key)+homeCourtQuality(m,side,key,context)-executionLoss(p,side,context,r)+(r()-.5)*(105-p.consistency)*.17;
let ts=m.tactics[serving],servingCourt=activeSix(m,serving),receivingCourt=activeSix(m,receiving),server=servingCourt.find(e=>e.position===0)?.player||m.teams[serving][(6-m.rotation[serving])%6],serveMode=effectiveServeMode(ts.serve,server,m.teams[serving]),serveProfileNow=serveProfile(server),receivers=receivingCourt.map(e=>e.player).filter(p=>['PON','LIB'].includes(p.pos));if(receivers.length<3){for(const e of receivingCourt.filter(e=>[0,4,5].includes(e.position)))if(!receivers.some(p=>p.id===e.player.id))receivers.push(e.player);receivers=receivers.slice(0,3);}let receiver=ts.target==='weak'?[...receivers].sort((a,b)=>a.receive-b.receive)[0]:ts.target==='libero'?(receivers.find(p=>p.pos==='LIB')||pick(receivers,r)):ts.target.startsWith('player:')?(receivers.find(p=>p.id===Number(ts.target.slice(7)))||pick(receivers,r)):pick(receivers,r);
// Placement is an intention, not a guaranteed hit on one passer.
if(ts.target!=='mixed'&&r()>clamp((ts.target==='weak'?.35:.56)*serveProfileNow.target,.22,.72))receiver=weighted(receivers,receivers.map(p=>p.pos==='LIB'?1.3:1),r);
if(m.tactics[receiving].protect==='libero'&&receiver.pos!=='LIB'&&r()<.35)receiver=receivers[2];
// Protection transfers some targeted serves to the other passers, increasing their workload.
if(m.tactics[receiving].protect==='player:'+receiver.id&&r()<.52)receiver=weighted(receivers.filter(p=>p.id!==receiver.id),receivers.filter(p=>p.id!==receiver.id).map(p=>p.pos==='LIB'?3:1),r);
server.condition=Math.max(35,server.condition-.035*({safe:.7,balanced:1,aggressive:1.55}[serveMode])*(100-server.stamina)/45);
let winner,reason,actor,pass,errorTeam=null,errorType=null,terminalInfraction=null,maxChaos=0,maxPressure=0;const serveIntensity={safe:.76,balanced:1,aggressive:1.43}[serveMode],serveQuality=quality(server,'serve',serving);steps.push({type:'serve',team:serving,player:server.id,style:ensureServeIdentity(server),risk:serveMode,planRisk:ts.serve});
const serveError=clamp((.072+focusLoad(m,serving)*.012-(serveQuality-70)*.00065)*serveProfileNow.error*serveIntensity*(activeTalkTone(m,serving)==='simplify'?.93:activeTalkTone(m,serving)==='calm'?.95:activeTalkTone(m,serving)==='energize'?1.06:1),.018,.175);
if(r()<serveError){
 winner=receiving;actor=server;errorTeam=serving;errorType='SERVE';
 const mr=metaRng(m,serving,0,0xF001F),servePressure=pressureIndex(m,serving,context),fatigue=(100-server.condition)/100,footChance=clamp(.0018+(ensureServeIdentity(server)==='viagem'?.0018:0)+(serveMode==='aggressive'?.0014:0)+fatigue*.0025+servePressure*.0012+(100-server.consistency)*.00002-playerExperience(server)*.000006,.0008,.012);
 if(mr()<footChance){reason='Infração de saque';terminalInfraction=infractionContext('serviceFootFault',server,serving,'SERVE',null,servePressure,.02,set,score,context.setPoint||context.matchPoint);steps.push({type:'serveError',team:serving,player:server.id,style:ensureServeIdentity(server),detail:'FOOT_FAULT'},{...terminalInfraction});}
 else {reason='Erro de saque';const detail=mr()<(ensureServeIdentity(server)==='viagem'||serveMode==='aggressive'?.46:.58)?'NET':'OUT';steps.push({type:'serveError',team:serving,player:server.id,style:ensureServeIdentity(server),detail});}
}
else {let servePressureRaw=serveQuality-quality(receiver,'receive',receiving)+serveProfileNow.pressure+({safe:-7,balanced:0,aggressive:9.2}[serveMode]);let protectedId=m.tactics[receiving].protect;if(protectedId==='libero')servePressureRaw+=receiver.pos==='LIB'?2:1;if(receivers.some(p=>'player:'+p.id===protectedId))servePressureRaw+=protectedId==='player:'+receiver.id?-3.2:1.1;
const aceChance=clamp((.037+servePressureRaw*.00105)*serveProfileNow.ace*(serveMode==='aggressive'?1.09:serveMode==='safe'?.82:1),.008,.155);
if(r()<aceChance){winner=serving;reason='Ace';actor=server;errorTeam=receiving;errorType='RECEPTION';steps.push({type:'ace',team:serving,player:server.id,style:ensureServeIdentity(server)},{type:'receive',team:receiving,player:receiver.id,quality:0,passGrade:'ERROR',serveStyle:ensureServeIdentity(server),error:true})}
else {let value=r()-.00175*servePressureRaw-focusLoad(m,receiving)*.025;pass=value<.19?1:value<.43?2:value<.78?3:4;const tacticalBreak=serveProfileNow.tacticalBreak*(serveMode==='aggressive'?1.18:serveMode==='safe'?.75:1);if(pass>1&&r()<tacticalBreak)pass--;let passGrade=pass===4?'ON_HAND':pass===3?(value>=.60?'POSITIVE':'OFF_NET'):pass===2?'BROKEN':'BURST';steps.push({type:'receive',team:receiving,player:receiver.id,quality:pass,passGrade,serveStyle:ensureServeIdentity(server),tacticalBreak:serveProfileNow.tacticalBreak>=.07&&pass<=2});let side=receiving,loops=0;
while(winner===undefined){let team=m.teams[side],opp=m.teams[1-side],t=m.tactics[side],setter=team[0],front=i=>((i+m.rotation[side])%6)>=1&&((i+m.rotation[side])%6)<=3;
let options=team.slice(0,6).filter((p,i)=>(p.pos!=='LEV'||(front(i)&&pass>=3))&&(p.pos!=='CEN'||front(i))),oppFront=opp.slice(0,6).filter((p,i)=>frontOpponent(i,m.rotation[1-side])),oppBlockAvg=oppFront.length?oppFront.reduce((n,p)=>n+p.block,0)/oppFront.length:70,setDecision=clamp((quality(setter,'set',side)-55)/35,.25,1.25);
let optionPre=options.map(p=>{const i=team.indexOf(p),courtPosition=(i+m.rotation[side])%6,isFront=front(i),route=routeFor(p,isFront,pass,courtPosition),availability=routeAvailability(p,isFront,pass,route),routeMod=routeAttackModifier(p,isFront,pass,route),value=clamp(.49+(p.attack-oppBlockAvg)*.0021+(pass-2.5)*.038+routeMod*.005,.12,.83);let tactical=1;if(t.distribution==='middle'&&p.pos==='CEN')tactical=1.82;if(t.distribution==='opposite'&&p.pos==='OPO')tactical=2.10;if(t.distribution==='wings'&&p.pos==='PON')tactical=1.32;if(setter.archetypeKey==='lev_acelerador'&&pass>=3&&(p.pos==='CEN'||route==='pipe'||route==='bolaD'))tactical*=1.12;if(setter.archetypeKey==='lev_atacante'&&p.pos==='LEV')tactical*=1.28;let middleTempo=p.pos==='CEN'?(pass>=4?1.15:pass===3?1.08:1):1,w=availability*tactical*middleTempo*clamp(1+(p.attack-70)*.009+(p.condition-90)*.003,.68,1.38);let decisionScale=setter.archetypeKey==='lev_organizador'?2.45:2.2;w*=clamp(.72+(value-.42)*setDecision*decisionScale,.52,1.72);if(late)w*=closingResponsibility(p);return {p,isFront,courtPosition,route,availability,value,w};});
let attacker=weighted(options,optionPre.map(o=>o.w),r),attackPlan=optionPre.find(o=>o.p.id===attacker.id),blockers=oppFront,block=0,focus=m.tactics[1-side].block,group=attackGroup(attacker),matched=focus===group||focus==='player:'+attacker.id,tactical=tacticalAttackEdge(m,side,attacker,pass,t.pace);let blockWeights=pass>=4?[.06,.52,.40,.02]:pass>=3?[.04,.40,.53,.03]:pass===2?[.03,.24,.65,.08]:[.02,.13,.68,.17];if(matched)blockWeights=blockWeights.map((w,i)=>w*(i>=2?1.72:.52));else if(focus!=='read')blockWeights=blockWeights.map((w,i)=>w*(i>=2?.62:1.48));if(t.pace==='fast'&&pass>=3)blockWeights=blockWeights.map((w,i)=>w*(i>=2?(matched?.91:.72):1.22));let nblock=weighted([0,1,2,3],blockWeights,r);let participants=blockUnit(opp,m.rotation[1-side],attacker,nblock,r),contest=participants.length?participants:blockers;block=contest.reduce((s,p)=>s+quality(p,'block',1-side)-focusLoad(m,1-side)*3,0)/contest.length+(matched?3.4:focus!=='read'?-2.4:0);for(const p of participants)steps.push({type:'blockAttempt',team:1-side,player:p.id,plan:focus,matched});
let precision=clamp(quality(setter,'set',side)-focusLoad(m,side)*4+(pass-3)*8-(loops>0?4:0)+tactical.edge*.34+(r()-.5)*12,0,100),blockHeight=contest.length?contest.reduce((n,b)=>n+(b.height_cm||heightFor(b)),0)/contest.length:198,optionValues=optionPre.map(o=>({player:o.p.id,value:clamp(o.value+(o.p.attack*(.78+.22*o.p.condition/100)-block)*.0011+((o.p.height_cm||heightFor(o.p))-blockHeight)*.0012,.1,.86),route:o.route,front:o.isFront})),expected=optionValues.find(p=>p.player===attacker.id).value,bestExpected=Math.max(...optionValues.map(p=>p.value)),zone=weighted(['diagonal','parallel','deep','short'],zoneWeightsFor(attackPlan.route,group,[m.home,m.away][side]),r),defensePlan=m.tactics[1-side].defense||'standard',defenseEffect=defenseZoneEffect(defensePlan,zone),covered=defenseEffect.covered,zoneEffect=defenseEffect.kill;
let talkTone=activeTalkTone(m,side),routeMod=routeAttackModifier(attacker,attackPlan.isFront,pass,attackPlan.route),attacking=quality(attacker,'attack',side)+(precision-70)*.45+((attacker.height_cm||heightFor(attacker))-blockHeight)*.25+(pass-2.5)*6+routeMod+tactical.edge+(t.pace==='fast'?(pass>=3?3.5:-3.4):t.pace==='control'?-.8:0),kill=clamp(.46+zoneEffect+(attacking-block)*.0018-(matched?.034:focus!=='read'?-.021:0)+(2-nblock)*.035-predictability(m,side,attacker.id)-groupPredictability(m,side,group)+(talkTone==='simplify'?-.018:talkTone==='energize'?.008:0),.16,.78),error=clamp(.082+(late?focusLoad(m,side)*.008:0)+(2-pass)*.015+(!attackPlan.isFront?.012:0)+(t.pace==='fast'?.010:t.pace==='control'?-.012:0)+(tactical.planned&&pass<=1?.008:0)+(talkTone==='simplify'?-.010:talkTone==='execute'?-.004:talkTone==='calm'?-.005:talkTone==='energize'?.005:0),.022,.18),blocked=nblock===0?0:clamp(.073+(block-attacking)*.0009+(matched?.026:focus!=='read'?-.012:0)+(nblock-2)*.018,.015,.21);
let attackPressure=pressureIndex(m,side,context),chaos=chaosIndex(pass,loops,precision,focusLoad(m,side)),phase=phaseFor(loops,pass,chaos),origin=originFor(attackPlan.route,attackPlan.courtPosition),setType=setTypeFor(attacker,attackPlan.route,pass,t.pace),direction=directionCode[zone]||'CROSS';maxChaos=Math.max(maxChaos,chaos);maxPressure=Math.max(maxPressure,attackPressure);
steps.push({type:'set',team:side,player:setter.id,target:attacker.id,quality:pass,transition:loops>0,nblock,precision,expected,bestExpected,optionValues,route:attackPlan.route,phase,systemState:systemFor(pass,chaos),rallyChaos:chaos,pressure:attackPressure,tactical:{distribution:t.distribution,planned:tactical.planned,attackEdge:Number(tactical.edge.toFixed(2)),blockPlan:focus,blockMatched:matched,defensePlan}});let chance=r(),outcome=chance<error?'error':chance<error+blocked?'blocked':chance<error+blocked+kill?'kill':'defended';
let mr=metaRng(m,side,loops,0x74B4D),finish=finishFor(attacker,nblock,pass,outcome,attackPressure,chaos,mr),attackStep={type:'attack',team:side,player:attacker.id,quality:pass,outcome,nblock,zone,direction,expected:kill,transition:loops>0,route:attackPlan.route,front:attackPlan.isFront,origin,setType,finish,phase,systemState:systemFor(pass,chaos),pressure:attackPressure,rallyChaos:chaos,block:nblock===0?'NONE':nblock===1?'SINGLE':nblock===2?'DOUBLE':'TRIPLE',tacticalEdge:Number(tactical.edge.toFixed(2)),distribution:t.distribution,planned:tactical.planned,blockPlan:focus,blockMatched:matched,defensePlan,defenseCovered:covered};
if(outcome==='error'){
 const inf=classifyAttackError({m,side,setter,attacker,attackPlan,pass,loops,precision,nblock,pressure:attackPressure,chaos,score,context});
 if(inf){terminalInfraction=inf;errorTeam=side;errorType=inf.infractionType==='doubleContact'||inf.infractionType==='carry'?'SETTING':inf.infractionType==='fourTouches'?'TEAM':'ATTACK';reason='Infração';actor=inf.player===setter.id?setter:attacker;if(['doubleContact','carry','fourTouches'].includes(inf.infractionType))attackStep.outcome='cancelled';else {attackStep.errorDetail=inf.infractionType==='antenna'?'ANTENNA':inf.infractionType==='backRowAttack'?'BACK_ROW_ATTACK':inf.infractionType==='netTouch'?'NET':'OUT';}steps.push(attackStep,{...inf});}
 else {winner=1-side;reason='Ataque para fora';actor=attacker;errorTeam=side;errorType='ATTACK';attackStep.errorDetail=mr()<.18?'NET':'OUT';steps.push(attackStep);}
 if(winner===undefined)winner=1-side;
}
else if(outcome==='blocked'){winner=1-side;actor=weighted(participants,participants.map(p=>blockStrength(p,participants)),r);reason='Bloqueio ponto';steps.push(attackStep,{type:'block',team:1-side,player:actor.id})}
else if(outcome==='kill'){
 const defInf=classifyDefenderFault({m,defSide:1-side,participants,attacker,attackPlan,loops,pressure:attackPressure,chaos,score,context});
 // A defensible ball occasionally becomes an explicit defensive error. It reclassifies an existing point only.
 let defensePool=activeSix(m,1-side).map(e=>e.player),defender=weighted(defensePool,defensePool.map(p=>p.pos==='LIB'?4:p.pos==='PON'?2:1),metaRng(m,1-side,loops,0xD3F3));const defenseErrorChance=covered&&kill<.48?clamp(.010+(100-defender.defense)*.00022+chaos*.006,.005,.025):0;
 if(defInf){winner=side;terminalInfraction=defInf;reason='Infração';actor=defender=opp.find(p=>p.id===defInf.player)||participants[0]||attacker;errorTeam=1-side;errorType='INFRACTION';attackStep.outcome='faultWin';steps.push(attackStep,{...defInf});}
 else if(metaRng(m,1-side,loops,0xD3F4)()<defenseErrorChance){winner=side;reason='Erro de defesa';actor=defender;errorTeam=1-side;errorType='DEFENSE';attackStep.outcome='defenseError';steps.push(attackStep,{type:'defenseError',team:1-side,player:defender.id,defensible:true});}
 else {winner=side;actor=attacker;reason='Ponto de ataque';steps.push(attackStep);}
}
else {steps.push(attackStep);let defensePool=activeSix(m,1-side).map(e=>e.player),defender=weighted(defensePool,defensePool.map(p=>p.pos==='LIB'?4:p.pos==='PON'?2:1),r),difficulty=clamp(.34+(kill-.42)*1.05+chaos*.27+Math.min(.18,loops*.025)+(100-defender.defense)*.0018-(defenseEffect.dig*.004),0,1),spectacularEvent=defenseSpectacularEvent({m,side:1-side,loops,chaos,pressure:attackPressure,difficulty,defender});side=1-side;let defenseValue=70+(quality(defender,'defense',side)-70-focusLoad(m,side)*3)*.4+defenseEffect.dig+r()*45,defensePass=defenseValue>105?3:2;steps.push({type:'defense',team:side,player:defender.id,chaos,difficulty,spectacularEvent,controlled:defensePass===3,controlQuality:defensePass,plan:defensePlan,covered});pass=defensePass;loops++;if(loops>200)throw Error('Rally excedeu limite de segurança')}
}}
}
m.score[winner]++;if(winner!==serving){m.rotation[winner]=(m.rotation[winner]+1)%6;m.server=winner}let event={index:m.events.length+1,set,scoreBefore:score,score:[...m.score],rotation:rot,act:context.act,dispute:context.level,crowd:context.crowd,serving,winner,reason,actor:actor.id,steps,errorTeam,errorType,infraction:terminalInfraction,context:{pressure:maxPressure||pressureIndex(m,errorTeam??winner,context),rallyChaos:maxChaos,setPointBefore:context.setPoint,matchPointBefore:context.matchPoint}};annotateMoment(m,event);event.highlight=event.momentLevel!=='NORMAL'||steps.filter(s=>s.type==='defense').length>=3||(reason==='Ace'||reason==='Bloqueio ponto'||terminalInfraction)&&Math.max(...score)>=23;event.focus=[focusLoad(m,0),focusLoad(m,1)];m.events.push(event);if(reason==='Ace'||reason==='Bloqueio ponto'||terminalInfraction||steps.filter(s=>s.type==='defense').length>=3)recoverFocus(m,winner,1,'ação decisiva');m.momentum??=[0,0];const swing=reason==='Ace'||reason==='Bloqueio ponto'?1.2:errorTeam!==null?1.1:1;m.momentum[winner]=clamp(m.momentum[winner]*.85+swing,-5,5);m.momentum[1-winner]=clamp(m.momentum[1-winner]*.85-swing,-5,5);applyMomentAftermath(m,event);
m.teams.forEach((team,side)=>team.forEach(p=>{p.confidence??=p.morale;let good=steps.some(s=>s.player===p.id&&(s.type==='ace'||s.type==='block'||s.type==='attack'&&s.outcome==='kill')),bad=steps.some(s=>s.player===p.id&&(s.type==='serveError'||s.type==='receive'&&s.quality<=1||s.type==='attack'&&['error','blocked'].includes(s.outcome)||s.type==='infraction'));if(good||bad){let sign=good?1:-1;p.actionRun=sign*(Math.sign(p.actionRun||0)===sign?Math.min(3,Math.abs(p.actionRun)+1):1);let swing=(good?4:-4)*(1+(Math.abs(p.actionRun)-1)*.35)*(late?1.3:1);p.confidence=clamp(p.confidence+swing,35,99);}else p.confidence=clamp(p.confidence+(side===winner?.12:-.14),35,99);}));
m.teams.forEach(team=>team.forEach(p=>p.condition=Math.max(35,p.condition-(.045+(100-p.stamina)*.0006))));let target=set===5?15:25;
if(m.score[winner]>=target&&m.score[winner]-m.score[1-winner]>=2){m.sets[winner]++;m.setScores.push([...m.score]);if(m.sets[winner]===3)m.done=true;else{m.timeouts=[0,0];m.substitutions=[0,0];m.momentum=[0,0];m.score=[0,0];m.rotation=[0,0];m.server=(m.initialServer+m.setScores.length)%2;m.teams.forEach(team=>team.forEach(p=>p.condition=Math.min(100,p.condition+1.5)))}}
return event;}
function frontOpponent(i,rot){return ((i+rot)%6)>=1&&((i+rot)%6)<=3}
export function finish(m,all=null){let safety=0;while(!m.done){if(all){coachDecision(m,all,0);coachDecision(m,all,1);}rally(m);if(++safety>10000)throw Error('Partida excedeu limite')}return m}
export function stats(events,side){let out={rallies:events.length,points:0,received:0,sideout:0,served:0,breaks:0,attacks:0,kills:0,errors:0,blocked:0,aces:0,serveErrors:0,blocks:0,receptions:0,positive:0,perfect:0,errorPoints:0,defenseErrors:0,settingErrors:0,infractions:0,infractionsByType:{},attackOrigins:{},attackSetTypes:{},attackFinishes:{},rotations:Array.from({length:6},()=>({n:0,points:0,received:0,sideout:0,served:0,breaks:0,attacks:0,kills:0,errors:0,blocked:0,aces:0,serveErrors:0,blocks:0,receptions:0,positive:0,perfect:0,errorPoints:0,infractions:0,defenses:0,blockAttempts:0})),players:{}};for(let e of events){let rr=out.rotations[e.rotation?.[side]??0];rr.n++;if(e.winner===side){out.points++;rr.points++}if(e.errorTeam===side){out.errorPoints++;rr.errorPoints++}if(e.serving===side){out.served++;rr.served++;if(e.winner===side){out.breaks++;rr.breaks++}}else{out.received++;rr.received++;if(e.winner===side){out.sideout++;rr.sideout++}}for(let s of e.steps||[]){if(s.team!==side)continue;let p=out.players[s.player]??={attacks:0,kills:0,errors:0,blocked:0,aces:0,blocks:0,receptions:0,positive:0,perfect:0,serveErrors:0,defenses:0,defenseControlled:0,defenseErrors:0,settingErrors:0,infractions:0,blockAttempts:0};if(s.type==='attack'&&s.outcome!=='cancelled'){out.attacks++;rr.attacks++;p.attacks++;if(s.origin){out.attackOrigins[s.origin]??={attacks:0,kills:0,errors:0,blocked:0};out.attackOrigins[s.origin].attacks++;}if(s.setType){out.attackSetTypes[s.setType]??={attacks:0,kills:0};out.attackSetTypes[s.setType].attacks++;}if(s.finish){out.attackFinishes[s.finish]=(out.attackFinishes[s.finish]||0)+1;}let key={kill:'kills',error:'errors',blocked:'blocked'}[s.outcome];if(key){out[key]++;rr[key]++;p[key]++;if(s.origin)out.attackOrigins[s.origin][key]=(out.attackOrigins[s.origin][key]||0)+1;if(s.setType&&key==='kills')out.attackSetTypes[s.setType].kills++;}}if(s.type==='ace'){out.aces++;rr.aces++;p.aces++}if(s.type==='serveError'){out.serveErrors++;rr.serveErrors++;p.serveErrors++}if(s.type==='block'){out.blocks++;rr.blocks++;p.blocks++}if(s.type==='defense'){p.defenses++;rr.defenses++;if(s.controlled)p.defenseControlled++;}if(s.type==='defenseError'){out.defenseErrors++;p.defenseErrors++;}if(s.type==='blockAttempt'){p.blockAttempts++;rr.blockAttempts++;}if(s.type==='receive'){out.receptions++;rr.receptions++;p.receptions++;let pos=s.passGrade?['POSITIVE','ON_HAND'].includes(s.passGrade):s.quality>=3,perf=s.passGrade?s.passGrade==='ON_HAND':s.quality>=4;if(pos){out.positive++;rr.positive++;p.positive++}if(perf){out.perfect++;rr.perfect++;p.perfect++}}if(s.type==='infraction'){out.infractions++;rr.infractions++;p.infractions++;out.infractionsByType[s.infractionType]=(out.infractionsByType[s.infractionType]||0)+1;if(['doubleContact','carry'].includes(s.infractionType)){out.settingErrors++;p.settingErrors++;}}}}return out}
export const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';

// 0.9.3.4 — Estado individual ao vivo.
// O estado é derivado dos mesmos eventos da partida. Não concede atributo técnico bruto.
const PLAYER_STATE_META={
 NERVOUS:{label:'😬 NERVOSO',priority:100},
 UNDER_PRESSURE:{label:'⚠ SOB PRESSÃO',priority:96},
 TURNING_EVERYTHING:{label:'⚡ VIRANDO TUDO',priority:94},
 DOMINATING_NET:{label:'🧱 DOMINANDO A REDE',priority:92},
 SERVE_CLICKED:{label:'🎯 SAQUE ENCAIXOU',priority:90},
 CLOSING_BACKCOURT:{label:'🛡 FECHANDO O FUNDO',priority:88},
 DISAPPEARED:{label:'↓ SUMIU DO JOGO',priority:85},
 TIRING:{label:'🔋 CANSANDO',priority:82},
 FELT_GAME:{label:'↘ SENTIU O JOGO',priority:80},
 PLAYING_FREE:{label:'✨ JOGANDO SOLTO',priority:74},
 ENTERED_GAME:{label:'🔥 ENTROU NO JOGO',priority:70}
};
function stateSide(m,p){if(m.teams[0].some(q=>q.id===p.id))return 0;if(m.teams[1].some(q=>q.id===p.id))return 1;return p?.club===m.home?0:p?.club===m.away?1:-1;}
function statePlayerActiveAt(m,side,playerId,atIndex){let active=new Set(m.teams[side].map(p=>p.id)),subs=(m.decisions||[]).filter(d=>d.type==='sub'&&d.side===side).sort((a,b)=>b.rally-a.rally);for(const d of subs)if(d.rally>=atIndex){active.delete(d.in);active.add(d.out);}return active.has(playerId);}
function stepGood(s){return s.type==='ace'||s.type==='block'||s.type==='attack'&&['kill','faultWin','defenseError'].includes(s.outcome)||s.type==='receive'&&s.quality>=3||s.type==='defense';}
function stepBad(s){return s.type==='serveError'||s.type==='attack'&&['error','blocked'].includes(s.outcome)||s.type==='receive'&&s.quality<=1||s.type==='defenseError'||s.type==='infraction';}
function stateCandidate(key,evidence,score=1,extra={}){return {key,label:PLAYER_STATE_META[key].label,evidence,priority:PLAYER_STATE_META[key].priority,score,...extra};}
export function playerLiveState(m,p,atIndex=m.events.length){
 const side=stateSide(m,p);if(side<0||!m.events.length||!statePlayerActiveAt(m,side,p.id,atIndex))return null;
 const events=m.events.slice(0,Math.max(0,atIndex)),last=events.at(-1),set=last?.set||1,setEvents=events.filter(e=>e.set===set);if(!setEvents.length)return null;
 const recent8=setEvents.slice(-8),recent6=setEvents.slice(-6),recent5=setEvents.slice(-5),recent4=setEvents.slice(-4),previous4=setEvents.slice(-8,-4),flat=x=>x.flatMap(e=>e.steps||[]),psteps=x=>flat(x).filter(s=>s.player===p.id),r8=psteps(recent8),r4=psteps(recent4),prev4=psteps(previous4),good=r8.filter(stepGood),bad=r8.filter(stepBad);
 const candidates=[];
 // ⚡ Repetição de conversões nas últimas bolas recebidas, não necessariamente pontos consecutivos do time.
 const attacks=setEvents.flatMap(e=>e.steps||[]).filter(s=>s.player===p.id&&s.type==='attack'&&s.outcome!=='cancelled'),last6Att=attacks.slice(-6),last5Att=attacks.slice(-5),attackWins=s=>['kill','faultWin','defenseError'].includes(s.outcome);
 if((last5Att.length===5&&last5Att.every(attackWins))||(last6Att.length===6&&last6Att.filter(attackWins).length>=5))candidates.push(stateCandidate('TURNING_EVERYTHING',last5Att.length===5&&last5Att.every(attackWins)?`${p.name.split(' ')[0]} fez ponto nas últimas cinco bolas que recebeu.`:`${p.name.split(' ')[0]} fez ponto em cinco das últimas seis bolas que recebeu.`,1,{count:5}));
 // 🧱 Bloqueios ponto em janela curta.
 const blocks=flat(recent6).filter(s=>s.player===p.id&&s.type==='block').length;
 if(blocks>=2)candidates.push(stateCandidate('DOMINATING_NET',`${p.name.split(' ')[0]} fez ${blocks} bloqueios ponto nos últimos ${recent6.length} rallies.`,blocks));
 // 🛡 Volume defensivo fora do normal, incluindo um rally extraordinário.
 const defenses=r8.filter(s=>s.type==='defense').length,sameRally=Math.max(0,...recent8.map(e=>e.sameRallyDigs?.playerId===p.id?e.sameRallyDigs.count:0));
 if(sameRally>=3||defenses>=4)candidates.push(stateCandidate('CLOSING_BACKCOURT',sameRally>=3?`${p.name.split(' ')[0]} fez ${sameRally} defesas no mesmo rally.`:`${p.name.split(' ')[0]} soma ${defenses} defesas nos últimos oito rallies.`,Math.max(sameRally,defenses)));
 // 🎯 Passagem individual: aces, passe quebrado e pontos no próprio saque.
 const servedRecent=setEvents.slice(-10).filter(e=>(e.steps||[]).some(s=>s.type==='serve'&&s.player===p.id)),serveWins=servedRecent.filter(e=>e.winner===side).length,aces=servedRecent.flatMap(e=>e.steps||[]).filter(s=>s.type==='ace'&&s.player===p.id).length,broken=servedRecent.flatMap(e=>e.steps||[]).filter(s=>s.type==='receive'&&s.team!==side&&s.quality<=2).length,lastServeDistance=servedRecent.length?events.length-servedRecent.at(-1).index:999;
 if(lastServeDistance<=3&&(aces>=2||(aces>=1&&serveWins>=3)||(serveWins>=4&&broken>=3)))candidates.push(stateCandidate('SERVE_CLICKED',aces>=2?`${p.name.split(' ')[0]} tem ${aces} aces nesta passagem recente.`:aces>=1?`${p.name.split(' ')[0]} combinou ace e pressão no saque nesta passagem.`:`${p.name.split(' ')[0]} pressionou ${broken} passes e o time fez ${serveWins} pontos em seus saques recentes.`,aces*2+serveWins+broken));
 // ⚠ Pressão de saque respeita o baseline individual de recepção.
 const oppServes=setEvents.filter(e=>e.serving===1-side).slice(-9),targeted=oppServes.flatMap(e=>e.steps||[]).filter(s=>s.type==='receive'&&s.player===p.id),priorReceives=setEvents.slice(0,Math.max(0,setEvents.length-oppServes.length)).flatMap(e=>e.steps||[]).filter(s=>s.type==='receive'&&s.player===p.id),baseline=priorReceives.length>=6?priorReceives.filter(s=>s.quality>=3).length/priorReceives.length:clamp(.38+(p.receive-60)*.006,.28,.78),recentPos=targeted.length?targeted.filter(s=>s.quality>=3).length/targeted.length:1;
 if(oppServes.length>=6&&targeted.length>=Math.max(5,Math.ceil(oppServes.length*.68))&&recentPos<=baseline-.07)candidates.push(stateCandidate('UNDER_PRESSURE',`Recebeu ${targeted.length} dos últimos ${oppServes.length} saques. Passe positivo: ${Math.round(recentPos*100)}% (referência ${Math.round(baseline*100)}%).`,targeted.length));
 // 😬 Nervosismo exige pressão competitiva + combinação de falhas. Um erro isolado não basta.
 const pressured=recent8.filter(e=>(e.context?.pressure||0)>=.52),pressBad=pressured.flatMap(e=>e.steps||[]).filter(s=>s.player===p.id&&stepBad(s)),liveConfidence=p.confidence??p.morale;
 if(pressured.length>=2&&pressBad.length>=2&&(p.mental+p.consistency<172||liveConfidence<76||pressBad.length>=3))candidates.push(stateCandidate('NERVOUS',`${pressBad.length} ações negativas sob pressão nos últimos oito rallies. Mental ${Math.round(p.mental)} · consistência ${Math.round(p.consistency)}.`,pressBad.length));
 // ↓ Sumiu: disponibilidade/oferta caiu de forma observável, com duas variantes causais.
 const last11=setEvents.slice(-11),teamAtt11=flat(last11).filter(s=>s.team===side&&s.type==='attack'&&s.outcome!=='cancelled'),ownAtt11=teamAtt11.filter(s=>s.player===p.id),prev11=setEvents.slice(-22,-11),ownPrev=flat(prev11).filter(s=>s.player===p.id&&s.type==='attack'&&s.outcome!=='cancelled');
 if(setEvents.length>=20&&p.pos==='CEN'&&teamAtt11.length>=8&&ownAtt11.length===0&&ownPrev.length>=3)candidates.push(stateCandidate('DISAPPEARED',`Recebeu ${ownAtt11.length===1?'apenas uma':'nenhuma'} das últimas ${teamAtt11.length} bolas de ataque, depois de participar mais da janela anterior. O passe e a distribuição podem ter tirado o meio do jogo.`,teamAtt11.length-ownAtt11.length,{cause:'middle-usage'}));
 else if(setEvents.length>=18&&['PON','OPO'].includes(p.pos)&&ownAtt11.length===0&&ownPrev.length>=3&&ownPrev.filter(s=>['blocked','error'].includes(s.outcome)).length>=2)candidates.push(stateCandidate('DISAPPEARED',`Depois de ${ownPrev.filter(s=>['blocked','error'].includes(s.outcome)).length} ataques negativos, recebeu apenas ${ownAtt11.length} bola(s) na janela recente.`,ownPrev.length,{cause:'usage-after-struggle'}));
 // ↘ Queda persistente sem exigir rótulo emocional.
 if(bad.length>=2&&good.length<=1&&r8.length>=3)candidates.push(stateCandidate('FELT_GAME',`${bad.length} ações negativas e apenas ${good.length} positiva(s) nos últimos oito rallies.`,bad.length));
 // 🔋 Fadiga só aparece quando há sintoma observável junto da condição baixa.
 if(atIndex===m.events.length&&p.condition<87&&bad.length>=2)candidates.push(stateCandidate('TIRING',`Físico em ${Math.round(p.condition)}% e ${bad.length} ações negativas recentes. A queda já aparece na execução.`,87-p.condition));
 // ✨ Produção consistente em mais de um fundamento, sem erros recentes.
 const goodKinds=new Set(good.map(s=>s.type==='attack'?'attack':s.type));
 if(r8.length>=6&&good.length>=5&&bad.length===0&&goodKinds.size>=2)candidates.push(stateCandidate('PLAYING_FREE',`${good.length} ações positivas recentes em ${goodKinds.size} fundamentos, com controle da execução.`,good.length));
 // 🔥 Crescimento claro de uma janela para a seguinte.
 const recentGood=r4.filter(stepGood).length,previousGood=prev4.filter(stepGood).length;
 if(setEvents.length>=8&&r4.length>=3&&recentGood>=3&&previousGood===0&&r4.filter(stepBad).length===0)candidates.push(stateCandidate('ENTERED_GAME',`${recentGood} ações positivas nas últimas quatro ações relevantes, acima da janela anterior.`,recentGood));
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.priority-a.priority||b.score-a.score);
 return {...candidates[0],set,atIndex,playerId:p.id};
}
export function playerStateSnapshot(m,side,atIndex=m.events.length){return m.teams[side].map(p=>({player:p,state:playerLiveState(m,p,atIndex)})).filter(x=>x.state);}
export function playerStateTimeline(m,side){
 const out=[],lastBy=new Map(),clubId=[m.home,m.away][side],pool=[...m.teams[side],...Object.values(m.bench||{}).filter(p=>p?.club===clubId)],players=[...new Map(pool.map(p=>[p.id,p])).values()];
 for(let i=1;i<=m.events.length;i++)for(const p of players){let st=playerLiveState(m,p,i),prev=lastBy.get(p.id)||null,key=st?.key||null;if(key!==prev){if(st)out.push({index:i,set:m.events[i-1]?.set||1,side,playerId:p.id,...st,matchScore:[...(m.events[i-1]?.score||[0,0])]});lastBy.set(p.id,key);}}
 return out;
}


// Simplified competition: six substitutions and two timeouts per team, per set.
export function substitute(m,side,slot,incoming){
 if(m.done||![0,1].includes(side)||!Number.isInteger(slot)||slot<0||slot>6)throw Error('Substituição indisponível.');
 if(!incoming||incoming.club!==[m.home,m.away][side]||incoming.pos!==POS[slot]||m.teams[side].some(p=>p.id===incoming.id))throw Error('Escolha um reserva da mesma função.');
 m.substitutions??=[0,0];if(m.substitutions[side]>=6)throw Error('Limite de seis substituições neste set.');
 m.bench??={};const out=m.teams[side][slot];m.bench[out.id]={...out};m.teams[side][slot]={...(m.bench[incoming.id]||incoming)};delete m.bench[incoming.id];m.substitutions[side]++;if(incoming.age>=29&&incoming.mental>=75)recoverFocus(m,side,2,'liderança em quadra');
 m.decisions??=[];m.decisions.push({type:'sub',set:m.setScores.length+1,rally:m.events.length,side,out:out.id,in:incoming.id});return out;
}
export function takeTimeout(m,side,tone='calm'){
 if(m.done||![0,1].includes(side))throw Error('Tempo indisponível.');m.timeouts??=[0,0];if(m.timeouts[side]>=2)throw Error('Você já usou os dois tempos deste set.');
 recoverFocus(m,side,4,'pedido de tempo');m.timeouts[side]++;m.momentum??=[0,0];m.momentum[side]*=.5;m.momentum[1-side]*=.5;
 m.teams[side].forEach(p=>{p.condition=Math.min(100,p.condition+1.2);p.confidence=clamp((p.confidence??p.morale)+(tone==='firm'?(p.mental>=70?4:-3):3),35,99)});
 m.decisions??=[];m.decisions.push({type:'timeout',tone,set:m.setScores.length+1,rally:m.events.length,side});
}

export const coaches=[
 {name:'Eduardo Vidal',label:'Estrategista',description:'Procura um alvo no passe e revê a distribuição quando fica atrás.'},
 {name:'Márcio Tavares',label:'Disciplinador',description:'Pouca tolerância a sequências negativas. Cobra uma resposta rápida.'},
 {name:'André Seixas',label:'Motivador',description:'Usa a conversa para estabilizar o time e aliviar a pressão.'},
 {name:'Paulo Azevedo',label:'Conservador',description:'Evita riscos cedo e mantém o plano enquanto o placar permite.'}
];
function observedAttackPattern(m,attackingSide){
 const set=m.setScores.length+1,attacks=m.events.filter(e=>e.set===set).slice(-14).flatMap(e=>e.steps||[]).filter(s=>s.type==='attack'&&s.team===attackingSide&&s.outcome!=='cancelled').slice(-16);
 if(attacks.length<7)return null;
 const groups=['middle','opposite','wings'].map(group=>{let ids=new Set(m.teams[attackingSide].filter(p=>attackGroup(p)===group).map(p=>p.id)),n=attacks.filter(s=>ids.has(s.player)).length;return {group,n,share:n/attacks.length};}).sort((a,b)=>b.n-a.n);
 const zones=['diagonal','parallel','deep','short'].map(zone=>{let n=attacks.filter(s=>s.zone===zone).length;return {zone,n,share:n/attacks.length};}).sort((a,b)=>b.n-a.n);
 const block=groups[0].share>=.46&&groups[0].share-(groups[1]?.share||0)>=.10?groups[0]:null;
 const defense=zones[0].share>=.38&&zones[0].share-(zones[1]?.share||0)>=.06?zones[0]:null;
 return {n:attacks.length,block,defense};
}
export function coachDecision(m,all,side){
 if(m.done||!m.events.length)return null;
 let set=m.setScores.length+1,last=m.events.at(-1);if(last.set!==set)return null;
 // 0.9.3.4: os estados servem como leitura de quadra. A reação automática do banco rival continua baseada em persistência e contexto tático, não em gatilho direto de estado individual.
 const id=side===0?m.home:m.away,style=coaches[id%coaches.length].label,seq=m.events.filter(e=>e.set===set).slice(-8);
 let run=0;for(let i=seq.length-1;i>=0&&seq[i].winner!==side;i--)run++;
 const previous=(m.decisions||[]).filter(d=>d.side===side&&d.automatic).at(-1);
 if(previous&&m.events.length-previous.rally<4)return null;
 const autoTimeouts=(m.decisions||[]).filter(d=>d.side===side&&d.automatic&&d.type==='timeout'&&d.set===set),lastAutoTimeout=autoTimeouts.at(-1),timeoutGap=lastAutoTimeout?m.events.length-lastAutoTimeout.rally:99,leaderScore=Math.max(...m.score),deficitNow=m.score[1-side]-m.score[side],focusTimeoutAllowed=leaderScore>=(set===5?6:8)&&run>=3&&deficitNow>=2&&timeoutGap>=8&&(!(autoTimeouts.length)||leaderScore>=(set===5?10:17));
 if(focusLoad(m,side)>0&&(m.timeouts?.[side]||0)<2&&focusTimeoutAllowed){takeTimeout(m,side,'calm');m.decisions.at(-1).automatic=true;return m.decisions.at(-1);}
 const targeted=seq.flatMap(e=>e.steps).filter(s=>s.type==='receive'&&s.team===side);
 const vulnerable=m.teams[side].find(p=>targeted.filter(s=>s.player===p.id).length>=4&&targeted.filter(s=>s.player===p.id&&s.quality<3).length>=3);
 if(vulnerable&&m.tactics[side].protect!=='player:'+vulnerable.id){let from=m.tactics[side].protect||'none';m.tactics[side].protect='player:'+vulnerable.id;let d={type:'tactic',key:'protect',from,to:m.tactics[side].protect,set,rally:m.events.length,side,automatic:true};m.decisions??=[];m.decisions.push(d);return d;}
 const observed=observedAttackPattern(m,1-side),leaderScoreNow=Math.max(...m.score);
 if(observed&&leaderScoreNow>=7){
   if(observed.block&&m.tactics[side].block!==observed.block.group){
     let from=m.tactics[side].block;m.tactics[side].block=observed.block.group;
     let d={type:'tactic',key:'block',from,to:m.tactics[side].block,set,rally:m.events.length,side,automatic:true,reason:'opponent-pattern',evidence:{sample:observed.n,share:observed.block.share}};
     m.decisions??=[];m.decisions.push(d);return d;
   }
   const defensePlan=observed.defense?(observed.defense.zone==='short'?'advance':observed.defense.zone):null;
   if(defensePlan&&m.tactics[side].defense!==defensePlan){
     let from=m.tactics[side].defense;m.tactics[side].defense=defensePlan;
     let d={type:'tactic',key:'defense',from,to:m.tactics[side].defense,set,rally:m.events.length,side,automatic:true,reason:'opponent-direction',evidence:{sample:observed.n,share:observed.defense.share}};
     m.decisions??=[];m.decisions.push(d);return d;
   }
 }
 const deficit=m.score[1-side]-m.score[side],threshold=style==='Disciplinador'?4:style==='Conservador'?6:5,secondTimeoutLate=autoTimeouts.length===0||leaderScore>=(set===5?10:17),timeoutWindow=leaderScore>=(set===5?5:7)&&timeoutGap>=8&&secondTimeoutLate;
 if(run>=threshold&&deficit>=3&&(m.timeouts?.[side]||0)<2&&timeoutWindow){takeTimeout(m,side,style==='Disciplinador'?'firm':'calm');m.decisions.at(-1).automatic=true;return m.decisions.at(-1);}
 if(matchContext(m).act==='adjust'&&style==='Estrategista'&&deficit>=3&&!(m.decisions||[]).some(d=>d.type==='tactic'&&d.set===set&&d.side===side)){
   const targets=[m.teams[1-side][1],m.teams[1-side][4],m.teams[1-side][6]].sort((a,b)=>a.receive-b.receive);
   const from={...m.tactics[side]};m.tactics[side].target='player:'+targets[0].id;m.tactics[side].distribution=coachedDistribution(m,side);
   const d={type:'tactic',set,rally:m.events.length,side,automatic:true,from,to:{...m.tactics[side]}};m.decisions??=[];m.decisions.push(d);return d;
 }
 if(deficit>=5&&m.score[1-side]>=16&&(m.substitutions?.[side]||0)<6&&!(m.decisions||[]).some(d=>d.type==='sub'&&d.automatic&&d.set===set&&d.side===side)){
   const slot=m.teams[side].slice(0,6).reduce((best,p,i,team)=>p.condition<team[best].condition?i:best,0),out=m.teams[side][slot];
   const reserve=all.filter(p=>p.club===id&&p.pos===out.pos&&!m.teams[side].some(q=>q.id===p.id)).sort((a,b)=>(m.bench?.[b.id]||b).condition-(m.bench?.[a.id]||a).condition)[0];
   if(reserve){substitute(m,side,slot,reserve);m.decisions.at(-1).automatic=true;return m.decisions.at(-1);}
 }
 return null;
}

export function heightFor(p){const role=ROLE_ARCHETYPES[p.pos]?.find(a=>a.key===p.archetypeKey),profiles={LEV:[190,7],OPO:[203,6],PON:[198,6],CEN:[207,6],LIB:[182,5]},pair=role?.height||profiles[p.pos],mean=pair[0],sd=pair[1],r=rng(808+p.id*7919);return Math.round(clamp(mean+sd*Math.sqrt(-2*Math.log(Math.max(r(),.00001)))*Math.cos(2*Math.PI*r()),170,220));}
export function athleteLabel(p){return p.name+' · '+((p.height_cm||heightFor(p))/100).toFixed(2).replace('.',',')+' m';}

export function matchTactics(t,own,opponent,clubId=null){let out={...defaultTactics(Number.isInteger(clubId)?clubId:null),...t},specific=k=>String(out[k]).startsWith('player:'),valid=(k,team,roles)=>team.some(p=>p.id===Number(out[k].slice(7))&&roles.includes(p.pos));if(!['safe','balanced','selective','aggressive'].includes(out.serve))out.serve='balanced';if(!['balanced','middle','opposite','wings'].includes(out.distribution))out.distribution='balanced';if(!['balanced','fast','control'].includes(out.pace))out.pace='balanced';if(!['standard','diagonal','parallel','deep','advance'].includes(out.defense))out.defense='standard';if(specific('target')&&!valid('target',opponent,['PON','LIB']))out.target='weak';if(specific('block')&&!valid('block',opponent,['LEV','PON','CEN','OPO']))out.block='read';if(specific('protect')&&!valid('protect',own,['PON','LIB']))out.protect='none';return out;}

function predictability(m,side,id){let recent=m.events.slice(-12).flatMap(e=>e.steps).filter(s=>s.type==='attack'&&s.team===side);if(recent.length<8)return 0;return Math.max(0,recent.filter(s=>s.player===id).length/recent.length-.55)*.08;}

// Focus uses a separate seeded stream: it never selects the winner of a rally.
// A dip lasts at most six rallies; skills and structural morale remain intact.
export function focusLoad(m,side){const f=m.focus?.[side];return f&&f.set===m.setScores.length+1&&f.until>m.events.length ? .75 : 0;}
export function recoverFocus(m,side,amount,reason){const f=m.focus?.[side];if(!f||!focusLoad(m,side))return;f.until=Math.max(m.events.length,f.until-amount);if(!focusLoad(m,side))m.decisions.push({type:'focusRecovery',side,set:f.set,rally:m.events.length,reason});}
export function focusTalk(m,side,tone){m.focusTalks??={};const set=m.setScores.length+1;m.focusTalks[set+':'+side]=tone;if(['execute','simplify','calm','energize'].includes(tone)){m.talkEffects??=[null,null];m.talkEffects[side]={tone,set,until:m.events.length+(['execute','simplify'].includes(tone)?8:6)};}recoverFocus(m,side,tone==='demand'?6:tone==='guide'?4:tone==='simplify'?5:tone==='calm'?6:tone==='energize'?4:tone==='execute'?3:1,'palestra');}
export function updateFocus(m){
 if(m.focusDisabled)return;
 m.focus??=[null,null];m.focusChecks??=[];
 const set=m.setScores.length+1;
 for(let side=0;side<2;side++){
  const prev=m.setScores.at(-1),start=prev&&(!m.events.length||m.events.at(-1).set!==set)&&prev[side]>prev[1-side];
  const large=m.score[side]>=(set===5?11:20)&&m.score[side]-m.score[1-side]>=6;
  const key=set+':'+side+':'+(start?'start':'lead');
  if((!start&&!large)||m.focusChecks.includes(key))continue;
  m.focusChecks.push(key);
  const team=m.teams[side],experience=team.reduce((n,p)=>n+playerExperience(p),0)/7,leaders=team.filter(p=>playerLeadership(p)>=78).length;
  const tone=m.focusTalks?.[set+':'+side];
  const competitive=m.competitiveState?.[side]||{},complacency=clamp(Number(competitive.complacency||0),0,35);
  const risk=clamp(.055+(65-experience)*.001+(m.sets[side]===2&&m.sets[1-side]===0?.025:0)+(prev&&prev[side]-prev[1-side]>=8?.015:0)+complacency*.0015-leaders*.015+(tone==='reinforce'&&team.reduce((n,p)=>n+(p.confidence??p.morale),0)/7>=80?.015:tone==='demand'?-.06:tone==='guide'?-.035:tone==='simplify'?-.045:tone==='execute'?-.025:0),.01,.20);
  if(rng((m.seed>>>0)^Math.imul(set,73856093)^Math.imul(side+1,19349663)^(start?83492791:2971215073))()<risk){
   m.focus[side]={set,until:m.events.length+Math.max(3,6-Math.min(3,leaders)),reason:start?'relaxamento após vencer o set':'queda de atenção com vantagem larga'};
   m.decisions.push({type:'focus',side,set,rally:m.events.length,reason:m.focus[side].reason});
  }
 }
}

// Relative weights, not percentage-point bonuses: height +14cm gives 1.14x
// the height component at equal skill; timing/skill and court location still matter.
export function blockStrength(p,unit){const h=p.height_cm||heightFor(p),technical=Math.pow(Math.max(15,p.block)/70,1.85),heightFactor=clamp(1+(h-198)*.016,.66,1.36),reading=clamp(.86+(p.mental+p.consistency-140)*.0035,.78,1.16),role=p.archetypeKey==='cen_leitura'?1.06:1,physical=.70+.30*p.condition/100;return technical*heightFactor*reading*role*physical;}
export function blockUnit(team,rotation,attacker,count,r){
 const front=team.slice(0,6).filter((p,i)=>frontOpponent(i,rotation)),pool=[...front],unit=[];
 const target=attacker.pos==='OPO'?3:attacker.pos==='CEN'?2:1;
 while(unit.length<count&&pool.length){const weights=pool.map(p=>{const position=(team.indexOf(p)+rotation)%6;const coverage=position===target?2:p.pos==='CEN'?1.8:.7;return coverage*blockStrength(p,front);});const p=weighted(pool,weights,r);unit.push(p);pool.splice(pool.indexOf(p),1);}
 return unit;
}
export function coachedDistribution(m,side){
 const attacks=m.events.filter(e=>e.set===m.setScores.length+1).flatMap(e=>e.steps).filter(s=>s.team===side&&s.type==='attack');
 const groups=['PON','CEN','OPO'].map(pos=>{const ids=m.teams[side].filter(p=>p.pos===pos).map(p=>p.id),a=attacks.filter(s=>ids.includes(s.player));return {pos,n:a.length,eff:a.length?a.reduce((n,s)=>n+(s.outcome==='kill'?1:['error','blocked'].includes(s.outcome)?-1:0),0)/a.length:0};}).filter(g=>g.n>=6).sort((a,b)=>b.eff-a.eff);
 if(groups.length<2||groups[0].eff-groups[1].eff<.08)return 'balanced';
 return {PON:'wings',CEN:'middle',OPO:'opposite'}[groups[0].pos];
}

// Distinct mental dimensions. Legacy saves use bounded proxies, not technical boosts.
export function playerComposure(p){return clamp(Number.isFinite(p.composure)?p.composure:(p.mental+p.consistency)/2,0,100);}
export function playerExperience(p){return clamp(Number.isFinite(p.experience)?p.experience:25+(p.age-18)*3,0,100);}
export function playerLeadership(p){return clamp(Number.isFinite(p.leadership)?p.leadership:p.mental*.6+playerExperience(p)*.4,0,100);}
export function arenaFor(m){const r=rng((m.seed>>>0)^39182513),profile=crowdProfile(m.home),capacity=[5200,10000,6500,4300,5600,6200,8200,7000][m.home]||6000,occupancy=clamp(.46+profile.level*.075+(r()-.5)*.16,.48,.99),attendance=Math.round(capacity*occupancy),intensity=clamp(.30+profile.level*.115+(r()-.5)*.15,.35,1);return {capacity,attendance,occupancy,intensity,engagement:profile.level,engagementLabel:profile.label,engagementDescription:profile.description};}
export function matchContext(m){
 const set=m.setScores.length+1,target=set===5?15:25,top=Math.max(...m.score),gap=Math.abs(m.score[0]-m.score[1]),act=top<=(set===5?5:8)?'reading':top<=(set===5?10:16)?'adjust':'closing';
 const recent=m.events.filter(e=>e.set===set).slice(-5),last=recent.at(-1);let run=0;for(let i=recent.length-1;i>=0&&recent[i].winner===last?.winner;i--)run++;
 const leader=m.score[0]>m.score[1]?0:1,setPoint=top>=target-1&&gap>=1,matchPoint=setPoint&&m.sets[leader]===2;
 const level=(setPoint&&gap<=2||matchPoint&&gap<=3)?'Crítica':act==='closing'&&(gap<=3||run>=3)?'Alta':gap<=3&&top>3?'Disputada':'Aberta';
 const arena=arenaFor(m),homeLead=m.score[0]-m.score[1],strength=side=>m.teams[side].reduce((n,p)=>n+(p.attack+p.block+p.receive)/3,0)/7;
 let energy=m.crowdEnergy?.[0]||0,crowd=arena.occupancy<.65?'MORNO':'ACORDANDO';
 if(homeLead<=-5&&last?.winner===1&&run>=3)crowd='MORNO';
 else if(energy>=.72||(last?.winner===0&&run>=3&&arena.occupancy>=.8))crowd='PEGANDO FOGO';
 else if(energy>=.42||act==='closing'&&homeLead<0&&strength(0)>strength(1))crowd='PRESSIONANDO';
 else if(arena.occupancy>=.65)crowd='ACORDANDO';
 const noise=arena.intensity*(.55*arena.occupancy+.45*Math.min(1,arena.attendance/10000)),crowdFactor=crowd==='PEGANDO FOGO'?1:crowd==='PRESSIONANDO'?.72:crowd==='ACORDANDO'?.42:.12,environment=[0,noise*crowdFactor*(act==='closing'?1:.38)];
 const execution=[0,1].map(side=>{let v=competitiveQuality(m,side,'receive',{act});return v>=1.8?'solto':v<=-1.8?'travado':v>=.65?'confortável':v<=-.65?'oscilando':'estável';});
 return {act,level,crowd,environment,setPoint,matchPoint,arena,execution,teamPressure:[Number(m.competitiveState?.[0]?.pressure||0),Number(m.competitiveState?.[1]?.pressure||0)]};
}
function finishBenchmarkMatch(m,all,testSide){let safety=0;while(!m.done){if(testSide===0||testSide===1)coachDecision(m,all,1-testSide);else{coachDecision(m,all,0);coachDecision(m,all,1);}rally(m);if(++safety>10000)throw Error('Benchmark excedeu limite');}return m;}
export function benchmarkTactics({gamesPerOpponent=40,testClub=0,seed=91377}={}){let all=players(),lines=Object.fromEntries(clubs.map(c=>[c.id,lineup(all,c.id)])),baseTactics=Object.fromEntries(clubs.map(c=>[c.id,defaultTactics(c.id)])),opponents=clubs.filter(c=>c.id!==testClub).map(c=>c.id),dimensions={distribution:['balanced','middle','opposite','wings'],pace:['control','balanced','fast'],block:['read','middle','opposite','wings'],defense:['standard','diagonal','parallel','deep','advance']},report={testClub,gamesPerOpponent,dimensions:{},home:null,passed:true};for(const [key,options] of Object.entries(dimensions)){let rows=[];for(const value of options){let total=0,wins=0,byOpponent={};for(const opp of opponents){let ow=0,on=0;for(let g=0;g<gamesPerOpponent;g++){let userHome=g%2===0,home=userHome?testClub:opp,away=userHome?opp:testClub,tactics=Object.fromEntries(clubs.map(c=>[c.id,{...baseTactics[c.id]}]));tactics[testClub][key]=value;let m=createMatch(all,home,away,lines,tactics,(seed+key.length*100000+opp*137+g*7919)>>>0),side=home===testClub?0:1;finishBenchmarkMatch(m,all,side);let won=m.sets[side]===3;total++;on++;if(won){wins++;ow++;}}byOpponent[opp]={wins:ow,n:on,rate:ow/on};}rows.push({value,wins,n:total,rate:wins/total,byOpponent});}let baseline=rows.find(r=>r.value===options[0])?.rate??rows[0].rate,contextSpans=opponents.map(opp=>{let rates=rows.map(r=>r.byOpponent[opp].rate);return Math.max(...rates)-Math.min(...rates)}),span=Math.max(...rows.map(r=>r.rate))-Math.min(...rows.map(r=>r.rate)),contextSpan=contextSpans.reduce((a,b)=>a+b,0)/contextSpans.length,usefulOptions=options.filter(value=>opponents.some(opp=>{let best=Math.max(...rows.map(r=>r.byOpponent[opp].rate)),rate=rows.find(r=>r.value===value).byOpponent[opp].rate;return best-rate<=.025;})),pass=contextSpan>=.025&&usefulOptions.length===options.length;report.dimensions[key]={rows:rows.map(r=>({...r,delta:r.rate-baseline})),span,contextSpan,usefulOptions,pass};if(!pass)report.passed=false;}let homeWins=0,homeGames=0;for(let a=0;a<clubs.length;a++)for(let b=a+1;b<clubs.length;b++)for(let g=0;g<Math.max(8,Math.floor(gamesPerOpponent/2));g++){for(const [home,away] of [[a,b],[b,a]]){let m=createMatch(all,home,away,lines,baseTactics,(seed+700000+a*10007+b*997+g*61+home*17)>>>0);finishBenchmarkMatch(m,all,-1);homeWins+=m.sets[0]===3?1:0;homeGames++;}}let homeRate=homeWins/homeGames;report.home={wins:homeWins,n:homeGames,rate:homeRate,pass:homeRate>=.525&&homeRate<=.60};if(!report.home.pass)report.passed=false;return report;}
export function closingResponsibility(p){return clamp(1+(p.attack-70)*.003+(playerComposure(p)-65)*.001+(playerExperience(p)-60)*.0007+((p.confidence??p.morale)-75)*.001,.85,1.22);}
export function executionLoss(p,side,context,r){if(context.act!=='closing')return 0;const fragility=(100-playerComposure(p))/100,inexperience=(100-playerExperience(p))/100,stress=context.level==='Crítica'?1:context.level==='Alta'?.7:.35,teamPressure=clamp(Number(context.teamPressure?.[side]||0)/100,0,.5);const risk=clamp(.012+fragility*stress*.06+inexperience*.015+Math.max(0,75-(p.confidence??p.morale))*.0006+Math.max(0,75-p.condition)*.0006+context.environment[side]*fragility*.035+teamPressure*fragility*.025,.005,.14);return r()<risk?3+r()*7:0;}
