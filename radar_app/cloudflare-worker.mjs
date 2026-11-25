import worker from './.open-next/worker.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let issuerCache;
let jwks;
export default {
  ...worker,
  async fetch(request, env, ctx) {
    const issuer = String(env.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
    const audience = env.CF_ACCESS_AUD;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience) {
      return new Response('Acesso ainda não configurado.', { status: 503, headers: {'Cache-Control':'no-store'} });
    }
    if (!token) return new Response('Acesso restrito.', {status:401, headers:{'Cache-Control':'no-store'}});
    try {
      if (issuerCache !== issuer) {
        jwks = createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'));
        issuerCache = issuer;
      }
      await jwtVerify(token, jwks, {issuer, audience, algorithms:['RS256'], requiredClaims:['exp','iat','sub']});
    } catch {
      return new Response('Acesso negado.', {status:403, headers:{'Cache-Control':'no-store'}});
    }
    // o cabeçalho do agendamento (resumo diário) nunca vem de fora
    if (request.headers.has('x-radar-agendado')) {
      request = new Request(request);
      request.headers.delete('x-radar-agendado');
    }
    const result = await worker.fetch(request, env, ctx);
    const response = new Response(result.body, result);
    response.headers.set('Cache-Control','private, no-store');
    return response;
  },

  // Resumo diário (P2-12), pelo Cron Trigger do wrangler.jsonc (10h UTC = 7h em São Paulo). Desligado até
  // RESUMO_DIARIO=1. Chama a rota interna direto no handler do Next (sem passar pela rede nem pelo Access),
  // com um token aleatório de uso único que a rota confere no escopo global do isolate.
  async scheduled(controller, env, ctx) {
    if (env.RESUMO_DIARIO !== '1') return;
    const token = crypto.randomUUID();
    globalThis.__radarAgendado = token;
    try {
      const r = await worker.fetch(new Request('https://radar.interno/api/resumo', { method: 'POST', headers: { 'x-radar-agendado': token } }), env, ctx);
      console.log(JSON.stringify({ evento: 'resumo_diario_agendado', cron: controller.cron, status: r.status }));
    } finally {
      delete globalThis.__radarAgendado;
    }
  }
};
