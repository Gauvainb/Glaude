/**
 * CORS Proxy – Cloudflare Worker
 * ──────────────────────────────
 * Proxies requests to cetim-si.atlassian.net and adds CORS headers
 * so the TMA dashboard can be served from any origin (GitHub Pages, etc.)
 *
 * Deploy:
 *   1. Go to https://workers.cloudflare.com and create a free account
 *   2. Create a new Worker, paste this script, click Deploy
 *   3. Copy the worker URL (e.g. https://tma-proxy.YOUR_SUBDOMAIN.workers.dev)
 *   4. Enter it in the dashboard login form under "Paramètres avancés"
 *
 * Usage: GET https://your-worker.workers.dev?url=https://cetim-si.atlassian.net/...
 *        All request headers (Authorization, Accept) are forwarded as-is.
 */

const ALLOWED_HOST = 'cetim-si.atlassian.net';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    // Extract target URL from ?url= query parameter
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: CORS_HEADERS });
    }

    // Validate target host (security: only proxy to Jira)
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid URL', { status: 400, headers: CORS_HEADERS });
    }

    if (targetUrl.hostname !== ALLOWED_HOST) {
      return new Response(`Forbidden: only ${ALLOWED_HOST} is allowed`, {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    // Forward Authorization and Accept headers
    const forwardHeaders = new Headers();
    const auth   = request.headers.get('Authorization');
    const accept = request.headers.get('Accept') || 'application/json';
    if (auth) forwardHeaders.set('Authorization', auth);
    forwardHeaders.set('Accept', accept);

    // Proxy the request
    let response;
    try {
      response = await fetch(target, { method: 'GET', headers: forwardHeaders });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    // Return response with CORS headers added
    const responseHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));

    return new Response(response.body, {
      status:  response.status,
      headers: responseHeaders,
    });
  },
};
