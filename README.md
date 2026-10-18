# plugged.host website

The website at [plugged.host](https://plugged.host): free hosting for game servers, bots and small
services. Plain HTML pages and one compiled stylesheet, served by Cloudflare Workers.

## How it's built

- **Pages:** `index.html`, `about.html`, `contact.html`, `guides/`, `404.html`. No framework, no
  client-side build: what's in the repo is what's served.
- **Styles:** Tailwind CSS v4, compiled locally and committed (`assets/app.src.css` →
  `assets/app.v5.css`). A strict Content Security Policy (`_headers`) allows no inline styles or
  scripts and no CDNs, so the stylesheet and the fonts (`assets/fonts/`) are self-hosted. The file
  name carries a version (`app.v5.css`): bump it when the styles change, assets are cached for a week.
- **Hosting:** Cloudflare Workers static assets (`wrangler.jsonc`), deployed by Workers Builds on
  every push to `main`. `worker.js` answers `/data/*` (the live status shown on the page) by asking
  the [status Worker](https://github.com/plugged-host/status); everything else is a static file.
  `.assetsignore` keeps tooling and these docs out of the upload; `_redirects` handles old URLs.

## Working on it

```bash
npm install
npm run build:css        # or: npm run watch:css
npx wrangler dev         # local preview (keep --persist-to outside the repo)
```

Node.js 26 (`.node-version`).

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## Licence

MIT, © noprofit.space, see [LICENSE](LICENSE). The plugged.host name and logo are not covered by
the licence. The panel's code is in [plugged-host/plugins](https://github.com/plugged-host/plugins).

Come say hi on [Discord](https://discord.gg/plugged-host-1502647500295635085).
