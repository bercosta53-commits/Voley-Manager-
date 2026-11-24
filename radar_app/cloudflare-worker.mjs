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
    const result = await worker.fetch(request, env, ctx);
    const response = new Response(result.body, result);
    response.headers.set('Cache-Control','private, no-store');
    return response;
  }
};
