/* ==========================================================================
   plugged.host — marketing site behaviour
   No external dependencies. The CSP is script-src 'self' / style-src 'self'
   with no 'unsafe-inline', so every visual state change below goes through
   classes or CSSOM custom properties rather than inline style attributes.

   What is here: the theme switch, the live fleet card in the hero and the
   Website/Panel uptime rows, both read from the panel's status export.
   ========================================================================== */

'use strict';

const root = document.documentElement;

/* -------------------------------------------------------------- theme ---- */

const THEME_KEY = 'plugged-host-theme';
const themeButton = document.querySelector('[data-theme-toggle]');

function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const next = theme === 'light' ? 'dark' : 'light';
    themeButton?.setAttribute('aria-label', `Switch to ${next} theme`);
    themeButton?.setAttribute('title', `Switch to ${next} theme`);
}

function storedTheme() {
    try {
        return localStorage.getItem(THEME_KEY);
    } catch {
        return null;
    }
}

applyTheme(storedTheme() || 'dark');

themeButton?.addEventListener('click', () => {
    const current = root.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch { /* private mode — the choice just won't persist */ }
    applyTheme(next);
});

/* ------------------------------------------------------ live telemetry --- */

/* Same-origin /data/* is proxied to the panel's status export by worker.js;
   when that fails the page asks the panel directly (it serves CORS *). The
   export carries node names and metrics only, never hostnames or addresses. */
const FLEET_URL = '/data/current.json';
const UPTIME_URL = '/data/history.json';
const REMOTE_PANEL_ORIGIN = 'https://panel.plugged.host';
const STALE_AFTER = 180000;

const STATUS_LABEL = {
    operational: 'All systems operational',
    degraded: 'Degraded performance',
    maintenance: 'Maintenance in progress',
    partial_outage: 'Partial outage',
    major_outage: 'Major outage',
    offline: 'Offline',
    unknown: 'Status unknown',
};

const num = (value, digits = 2) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(value) || 0);

/* Human precision: two decimals below 1, one below 100, none above. */
const short = value => {
    const n = Math.abs(Number(value) || 0);
    return num(value, n < 1 ? 2 : n < 100 ? 1 : 0);
};

/* The status page's units, so both sites read the same: storage 1000-based
   (how disks are sold), memory 1024-based (wings reports the kernel's
   MemTotal). */
function bytes(value, binary = false) {
    const n = Number(value) || 0;
    const base = binary ? 1024 : 1000;
    const units = binary ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = n > 0 ? Math.min(Math.floor(Math.log(n) / Math.log(base)), units.length - 1) : 0;
    return `${short(n / base ** i)} ${units[i]}`;
}

function ago(iso) {
    const seconds = (Date.now() - new Date(iso).valueOf()) / 1000;
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 60) return `updated ${Math.max(0, Math.round(seconds))}s ago`;
    if (seconds < 3600) return `updated ${Math.round(seconds / 60)} min ago`;
    return `updated ${Math.round(seconds / 3600)} h ago`;
}

const percent = (used, total) => Number(total) > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;

function setText(key, value) {
    for (const el of document.querySelectorAll(`[data-fleet="${key}"]`)) el.textContent = value;
}

function setMeter(key, value) {
    for (const el of document.querySelectorAll(`[data-meter="${key}"]`)) {
        el.firstElementChild?.style.setProperty('--p', value.toFixed(2));
        el.classList.toggle('warn', value >= 75 && value < 90);
        el.classList.toggle('hot', value >= 90);
        el.setAttribute('aria-valuenow', String(Math.round(value)));
    }
}

function setStatus(status, label) {
    for (const dot of document.querySelectorAll('[data-fleet="status-dot"]')) dot.className = `dot ${status}`;
    setText('status-label', label);
}

function renderFleet(data) {
    const generated = new Date(data.generated_at).valueOf();
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER;
    const status = stale ? 'unknown' : (data.overall?.status || 'unknown');

    setStatus(status, stale ? 'Monitoring data delayed' : (data.overall?.label || STATUS_LABEL[status]));
    setText('updated', data.generated_at ? ago(data.generated_at) : '');

    const global = data.global || {};
    setText('nodes-online', num(global.reporting_nodes, 0));
    setText('nodes-total', num(global.total_nodes, 0));

    const cpu = percent(global.cpu_used, global.cpu_total);
    const memory = percent(global.memory_used, global.memory_total);
    const storage = percent(global.storage_used, global.storage_total);

    /* cpu_total is a sum of per-node budgets at 100% per thread. */
    const threads = (Number(global.cpu_total) || 0) / 100;
    setText('cpu', `${num(cpu, 0)}% of ${short(threads)} ${threads === 1 ? 'thread' : 'threads'}`);
    setText('memory', `${num(memory, 0)}% of ${bytes(global.memory_total, true)}`);
    setText('storage', `${num(storage, 0)}% of ${bytes(global.storage_total)}`);
    setMeter('cpu', cpu);
    setMeter('memory', memory);
    setMeter('storage', storage);
}

/* Check-weighted, like the status page: recorded days carry total_checks and
   operational_checks; exports without them fall back to clean days. */
function uptimeWindow(days) {
    const recorded = days.filter(d => d && d.status && d.status !== 'unknown');
    if (!recorded.length) return null;
    const checks = recorded.reduce((n, d) => n + (Number(d.total_checks) || 0), 0);
    const value = checks > 0
        ? recorded.reduce((n, d) => n + (Number(d.operational_checks) || 0), 0) / checks * 100
        : recorded.filter(d => d.status === 'operational').length / recorded.length * 100;
    return { value, recorded: recorded.length };
}

function renderUptime(data) {
    const host = document.querySelector('[data-uptime]');
    if (!host) return;

    /* Only the site and the panel; per-node rows live on the status page. */
    const rows = (data.uptime || []).filter(row => row.label === 'Website' || row.label === 'Panel');
    if (!rows.length) return;

    host.replaceChildren(...rows.map(row => {
        const days = (row.days || []).slice(-90);
        const stats = uptimeWindow(days);

        const article = document.createElement('div');
        article.className = 'uptime-row';

        const head = document.createElement('div');
        head.className = 'uptime-head';
        const name = document.createElement('span');
        name.className = 'uptime-name';
        name.textContent = row.label;
        const value = document.createElement('span');
        value.className = 'uptime-pct';
        value.textContent = stats ? `${num(stats.value, 2)}%` : 'No data yet';
        /* A short record says how many days it rests on. */
        if (stats && stats.recorded < days.length) {
            const note = document.createElement('small');
            note.textContent = `over ${stats.recorded} recorded day${stats.recorded === 1 ? '' : 's'}`;
            value.append(note);
        }
        head.append(name, value);

        const bars = document.createElement('div');
        bars.className = 'bars';
        bars.setAttribute('role', 'img');
        bars.setAttribute('aria-label', `Daily status of ${row.label} over the last ${days.length} days`);
        for (const day of days) {
            const bar = document.createElement('i');
            bar.className = `bar ${day?.status || 'unknown'}`;
            bar.title = `${day?.date || 'No data'}: ${day?.status ? day.status.replace(/_/g, ' ') : 'no data'}`;
            bars.append(bar);
        }

        const axis = document.createElement('div');
        axis.className = 'axis';
        axis.setAttribute('aria-hidden', 'true');
        const from = document.createElement('span');
        from.textContent = `${days.length} days ago`;
        const to = document.createElement('span');
        to.textContent = 'Today';
        axis.append(from, to);

        article.append(head, bars, axis);
        return article;
    }));
}

/* Same-origin first, then the panel itself. */
async function getJson(path) {
    let res = null;
    try {
        res = await fetch(path, { cache: 'no-store' });
    } catch { /* ignore and try the panel */ }

    if (!res || !res.ok) res = await fetch(`${REMOTE_PANEL_ORIGIN}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

async function pullFleet() {
    try {
        renderFleet(await getJson(FLEET_URL));
    } catch {
        setStatus('unknown', 'Live status unavailable');
        setText('updated', '');
    }
}

async function pullUptime() {
    try {
        renderUptime(await getJson(UPTIME_URL));
    } catch {
        for (const el of document.querySelectorAll('[data-uptime] .uptime-pct')) el.textContent = 'unavailable';
    }
}

if (document.querySelector('[data-fleet]')) {
    pullFleet();
    setInterval(pullFleet, 60000);
}

/* ~100 KB of history is only worth fetching once the section is near. */
const uptimeHost = document.querySelector('[data-uptime]');
if (uptimeHost) {
    if ('IntersectionObserver' in window) {
        const lazy = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            lazy.disconnect();
            pullUptime();
        }, { rootMargin: '400px' });
        lazy.observe(uptimeHost);
    } else {
        pullUptime();
    }
}

/* ---------------------------------------------------------------- misc --- */

for (const el of document.querySelectorAll('[data-year]')) {
    el.textContent = String(new Date().getFullYear());
}
