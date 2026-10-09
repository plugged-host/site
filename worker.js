/* Worker for the static site (Cloudflare Workers + static assets).

   Static files are served straight from the assets, with _headers and
   _redirects applied. This script only runs for the run_worker_first routes in
   wrangler.jsonc and for paths with no matching asset (which get the assets'
   404).

   /data/* is the status data, produced by the status Worker (status-plugged),
   which probes from outside the panel box and so keeps answering while the
   panel is down. It is asked through the STATUS service binding first, then
   over HTTPS at STATUS_URL. _headers does not apply to Worker responses, so
   the headers the page relies on are set here (the status Worker sets the
   same ones). Only a single file name is accepted (no slashes). When both
   fail, the page falls back to fetching the panel cross-origin itself. */

const STATUS = 'https://status.plugged.host';
const DATA = /^\/data\/([a-z0-9_-]+\.(json|xml))$/;
const TYPES = {
    json: 'application/json; charset=utf-8',
    xml: 'application/rss+xml; charset=utf-8',
};

async function statusData(request, env, file, extension) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const url = `${String(env.STATUS_URL || STATUS).replace(/\/+$/, '')}/data/${file}`;

    /* A clean request (no client headers), addressed to the status host so
       both sites share the status Worker's cached copies. A 404 or 405 is an
       answer; only a 5xx or an exception falls through. */
    if (env.STATUS) {
        try {
            const bound = await env.STATUS.fetch(new Request(url, { method: request.method }));
            if (bound.status < 500) return bound;
            bound.body?.cancel().catch(() => {});
        } catch {
            /* binding unavailable: try the public URL */
        }
    }

    let upstream;
    try {
        upstream = await fetch(url, { method: request.method, signal: AbortSignal.timeout(8000) });
    } catch {
        upstream = null;
    }

    /* Never relay an upstream error body (e.g. a challenge page) under this
       origin; the page only needs the status to decide on its fallback. */
    if (!upstream || !upstream.ok) {
        upstream?.body?.cancel().catch(() => {});
        return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': TYPES[extension],
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);

        const data = DATA.exec(pathname);
        if (data) return statusData(request, env, data[1], data[2]);

        return env.ASSETS.fetch(request);
    },
};
