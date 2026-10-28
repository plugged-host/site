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
- **Hosting:** the Cloudflare Worker `site-plugged`, static assets (`wrangler.jsonc`). `worker.js`
  answers `/data/*` (the live status shown on the page) by asking the
  [status Worker](https://github.com/plugged-host/status) (`status-plugged`, service binding
  `STATUS`); everything else is a static file. `_redirects` handles old URLs; `/terms` and
  `/privacy` go to noprofit.space.
- **The upload is the repo root:** `.assetsignore` keeps tooling, sources and these docs out of it.
  A new file that is not part of the site goes in there too.

## Working on it

```bash
npm install
npm run build:css        # after editing assets/app.src.css or the classes in a page; commit the output
```

Node.js 26 (`.node-version`).

## Deploy and roll back

Pushing to `main` deploys: Workers Builds runs `npx wrangler deploy`. When a change touches
`/data/*` on both sides, push the status repository first.

Roll back by reverting the commit and pushing. In a hurry, Cloudflare's dashboard (Workers &
Pages › `site-plugged` › Deployments) rolls back to an earlier version at once; push the revert
afterwards so `main` matches what is served.

No secrets: the Worker's variables in `wrangler.jsonc` are public URLs.

## Related

- [plugged-host/status](https://github.com/plugged-host/status): status.plugged.host and the data
  behind `/data/*`.
- [plugged-host/docs](https://github.com/plugged-host/docs): docs.plugged.host.
- [plugged-host/panel](https://github.com/plugged-host/panel): the panel.

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## Licence

MIT, © noprofit.space, see [LICENSE](LICENSE). The plugged.host name and logo are not covered by
the licence.

Come say hi on [Discord](https://discord.gg/plugged-host-1502647500295635085).
