/* ==========================================================================
   plugged.host — marketing site behaviour
   No external dependencies. The vhost CSP is script-src 'self' with no
   'unsafe-inline', so every visual state change below goes through classes
   or CSSOM custom properties rather than inline style attributes.
   ========================================================================== */

'use strict';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = t => 1 - Math.pow(1 - t, 3);

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


/* ------------------------------------------------------ scroll chrome ---- */

const progress = document.querySelector('[data-progress]');
const header = document.querySelector('.site-header');
let chromeQueued = false;

function paintChrome() {
    chromeQueued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    progress?.style.setProperty('--sp', ratio.toFixed(4));
    header?.classList.toggle('stuck', scrollY > 8);
}

function queueChrome() {
    if (chromeQueued) return;
    chromeQueued = true;
    requestAnimationFrame(paintChrome);
}

addEventListener('scroll', queueChrome, { passive: true });
addEventListener('resize', queueChrome, { passive: true });
paintChrome();

/* ------------------------------------------------- kinetic headline(s) ---- */

for (const node of document.querySelectorAll('[data-split]')) {
    const parts = [];
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            for (const chunk of child.textContent.split(/(\s+)/)) {
                if (!chunk) continue;
                parts.push(/^\s+$/.test(chunk) ? document.createTextNode(chunk) : wrapWord(chunk));
            }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            parts.push(wrapWord(child.textContent, child.className));
        }
    }

    node.replaceChildren(...parts);
    node.classList.add('kinetic');

    const words = node.querySelectorAll('.word > i');
    words.forEach((word, index) => word.style.setProperty('--d', `${60 + index * 62}ms`));
}

function wrapWord(text, className) {
    const word = document.createElement('span');
    word.className = 'word';
    const inner = document.createElement('i');
    if (className) inner.className = className;
    inner.textContent = text;
    word.append(inner);
    return word;
}

/* ------------------------------------------------------------ counters --- */

const counters = new Map();

function formatCount(value, decimals) {
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

function runCounter(el) {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;

    const decimals = Number(el.dataset.decimals || 0);
    const from = counters.get(el) ?? 0;
    counters.set(el, target);

    if (reduced.matches) {
        el.textContent = formatCount(target, decimals);
        return;
    }

    const duration = 1250;
    const start = performance.now();

    const tick = now => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = formatCount(from + (target - from) * EASE_OUT(t), decimals);
        if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

/* -------------------------------------------------------------- reveal --- */

const revealed = new WeakSet();

const revealer = new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        revealer.unobserve(el);
        revealed.add(el);
        el.classList.add('in');

        if (el.dataset.count !== undefined) runCounter(el);
        for (const child of el.querySelectorAll('[data-count]')) runCounter(child);
    }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

function stagger(scope) {
    for (const group of scope.querySelectorAll('[data-stagger]')) {
        const step = Number(group.dataset.stagger) || 70;
        Array.from(group.children).forEach((child, index) => {
            child.style.setProperty('--d', `${index * step}ms`);
        });
    }
}

stagger(document);
for (const el of document.querySelectorAll('[data-reveal], .kinetic, .uptime')) revealer.observe(el);

/* -------------------------------------------------------- pointer glow --- */

if (matchMedia('(hover: hover)').matches) {
    for (const el of document.querySelectorAll('.card, .stat')) {
        el.addEventListener('pointermove', event => {
            const box = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${event.clientX - box.left}px`);
            el.style.setProperty('--my', `${event.clientY - box.top}px`);
        });
    }

    /* The fleet card leans toward the cursor. Kept subtle so the hero copy
       beside it never appears to wobble. */
    const tiltable = document.querySelector('[data-tilt]');
    if (tiltable && !reduced.matches) {
        addEventListener('pointermove', event => {
            const box = tiltable.getBoundingClientRect();
            const x = (event.clientX - box.left) / box.width - 0.5;
            const y = (event.clientY - box.top) / box.height - 0.5;
            tiltable.style.setProperty('--ty', `${(x * 7).toFixed(2)}deg`);
            tiltable.style.setProperty('--tx', `${(-y * 7).toFixed(2)}deg`);
        }, { passive: true });
    }
}

/* ------------------------------------------------------------- scrolly --- */

const scrolly = document.querySelector('[data-scrolly]');

if (scrolly) {
    const steps = Array.from(scrolly.querySelectorAll('[data-step]'));
    const stages = Array.from(scrolly.querySelectorAll('[data-stage]'));
    let active = -1;
    let queued = false;

    const pick = () => {
        queued = false;
        const line = innerHeight * 0.45;
        let index = 0;

        steps.forEach((step, i) => {
            if (step.getBoundingClientRect().top <= line) index = i;
        });

        if (index === active) return;
        active = index;
        steps.forEach((step, i) => step.classList.toggle('on', i === index));
        stages.forEach((stage, i) => stage.classList.toggle('on', i === index));
    };

    const queue = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(pick);
    };

    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue, { passive: true });
    pick();
}

/* ----------------------------------------------------------- fleet map --- */

const STATUS_COLOR = {
    operational: [34, 197, 94],
    degraded: [245, 158, 11],
    maintenance: [59, 130, 246],
    partial_outage: [249, 115, 22],
    major_outage: [239, 68, 68],
    offline: [239, 68, 68],
    unknown: [113, 113, 122],
};

function buildFleetMap(canvas) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;

    let nodes = Array.from({ length: 2 }, () => ({ load: 0.08, status: 'operational' }));
    let width = 0;
    let height = 0;
    let spin = 0;
    let visible = false;
    let frame = 0;
    let pointer = { x: 0, y: 0 };

    const dust = Array.from({ length: 70 }, (_, i) => ({
        a: (i / 70) * Math.PI * 2,
        r: 0.28 + (i % 7) / 16,
        z: (i % 11) / 11,
        speed: 0.00006 + (i % 5) * 0.00002,
    }));

    /* Evenly spread points over a sphere so the mesh never looks banded. */
    const placement = count => Array.from({ length: count }, (_, i) => {
        const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = i * 2.399963229728653;
        return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
    });

    let points = placement(nodes.length);

    const resize = () => {
        const box = canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        width = box.width;
        height = box.height;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const project = point => {
        const cos = Math.cos(spin);
        const sin = Math.sin(spin);
        const x = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const y = point.y * 0.86 + pointer.y * 0.12;
        const depth = 1 / (2.6 - z);
        const scale = Math.min(width, height) * 0.34;

        return {
            sx: width / 2 + (x + pointer.x * 0.1) * scale * depth * 2.6,
            sy: height / 2 + y * scale * depth * 2.6,
            depth: (z + 1) / 2,
        };
    };

    const draw = () => {
        context.clearRect(0, 0, width, height);
        if (!width || !height) return;

        const ink = getComputedStyle(root).getPropertyValue('--ink-rgb').trim() || '59, 130, 246';
        const flat = points.map(project);

        /* Mesh: link every pair that is close in screen space. */
        const reach = Math.min(width, height) * 0.42;
        for (let i = 0; i < flat.length; i++) {
            for (let j = i + 1; j < flat.length; j++) {
                const dx = flat[i].sx - flat[j].sx;
                const dy = flat[i].sy - flat[j].sy;
                const distance = Math.hypot(dx, dy);
                if (distance > reach) continue;

                const strength = (1 - distance / reach) * 0.5 * ((flat[i].depth + flat[j].depth) / 2);
                context.strokeStyle = `rgba(${ink}, ${strength.toFixed(3)})`;
                context.lineWidth = 1;
                context.beginPath();
                context.moveTo(flat[i].sx, flat[i].sy);
                context.lineTo(flat[j].sx, flat[j].sy);
                context.stroke();
            }
        }

        /* Drifting dust for depth. */
        for (const speck of dust) {
            const angle = speck.a + frame * speck.speed * 1000;
            const radius = Math.min(width, height) * speck.r;
            const x = width / 2 + Math.cos(angle) * radius + pointer.x * 6;
            const y = height / 2 + Math.sin(angle) * radius * 0.62 + pointer.y * 6;
            context.fillStyle = `rgba(${ink}, ${(0.05 + speck.z * 0.16).toFixed(3)})`;
            context.beginPath();
            context.arc(x, y, 0.9 + speck.z, 0, Math.PI * 2);
            context.fill();
        }

        /* Nodes, drawn back to front so the near ones sit on top. */
        const order = flat.map((p, i) => i).sort((a, b) => flat[a].depth - flat[b].depth);
        for (const index of order) {
            const p = flat[index];
            const node = nodes[index] || { load: 0, status: 'unknown' };
            const [r, g, b] = STATUS_COLOR[node.status] || STATUS_COLOR.unknown;
            const size = (2.4 + node.load * 5) * (0.55 + p.depth * 0.75);
            const pulse = reduced.matches ? 0.5 : 0.5 + Math.sin(frame * 0.03 + index) * 0.5;

            context.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.06 + p.depth * 0.1 + pulse * 0.06).toFixed(3)})`;
            context.beginPath();
            context.arc(p.sx, p.sy, size * 4.2, 0, Math.PI * 2);
            context.fill();

            context.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.35 + p.depth * 0.6).toFixed(3)})`;
            context.beginPath();
            context.arc(p.sx, p.sy, size, 0, Math.PI * 2);
            context.fill();
        }
    };

    const loop = () => {
        if (!visible) return;
        frame++;
        spin += 0.0016;
        draw();
        requestAnimationFrame(loop);
    };

    const start = () => {
        if (visible) return;
        visible = true;
        if (reduced.matches) {
            draw();
            visible = false;
            return;
        }
        requestAnimationFrame(loop);
    };

    const stop = () => { visible = false; };

    resize();
    new ResizeObserver(() => { resize(); if (!visible) draw(); }).observe(canvas);

    new IntersectionObserver(entries => {
        entries[0].isIntersecting && !document.hidden ? start() : stop();
    }, { threshold: 0.05 }).observe(canvas);

    document.addEventListener('visibilitychange', () => {
        document.hidden ? stop() : start();
    });

    if (matchMedia('(hover: hover)').matches && !reduced.matches) {
        addEventListener('pointermove', event => {
            const box = canvas.getBoundingClientRect();
            pointer.x = (event.clientX - box.left) / box.width - 0.5;
            pointer.y = (event.clientY - box.top) / box.height - 0.5;
        }, { passive: true });
    }

    draw();

    return {
        update(list) {
            nodes = list.length ? list : nodes;
            points = placement(nodes.length);
            if (!visible) draw();
        },
    };
}

const fleetMap = (() => {
    const canvas = document.querySelector('[data-fleet-canvas]');
    return canvas ? buildFleetMap(canvas) : null;
})();

/* ------------------------------------------------------ live telemetry --- */

/* Both endpoints are same-origin nginx aliases onto the sanitized export that
   the panel writes for status.plugged.host — see the vhost. Node identity is
   never part of that payload, only opaque display names and metrics. */
const FLEET_URL = '/data/current.json';
const UPTIME_URL = '/data/history.json';
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

/* Decimal units, matching the panel (PANEL_USE_BINARY_PREFIX=false) and the
   status page, so the same byte count reads the same in all three places. */
function bytesTo(value, unit) {
    const power = ['B', 'KB', 'MB', 'GB', 'TB'].indexOf(unit);
    return (Number(value) || 0) / Math.pow(1000, power < 0 ? 0 : power);
}

function ago(iso) {
    const seconds = (Date.now() - new Date(iso).valueOf()) / 1000;
    if (!Number.isFinite(seconds)) return 'no data';
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
}

const percent = (used, total) => Number(total) > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;

function setText(key, value) {
    for (const el of document.querySelectorAll(`[data-fleet="${key}"]`)) el.textContent = value;
}

function setCount(key, value, decimals = 0) {
    for (const el of document.querySelectorAll(`[data-fleet="${key}"]`)) {
        el.dataset.count = String(value);
        el.dataset.decimals = String(decimals);
        if (revealed.has(el) || revealed.has(el.closest('[data-reveal]') || el)) runCounter(el);
    }
}

function setMeter(key, value) {
    for (const el of document.querySelectorAll(`[data-meter="${key}"]`)) {
        el.style.setProperty('--p', value.toFixed(2));
        el.classList.toggle('warn', value >= 75 && value < 90);
        el.classList.toggle('hot', value >= 90);
        el.setAttribute('aria-valuenow', String(Math.round(value)));
    }
}

function renderFleet(data) {
    const generated = new Date(data.generated_at).valueOf();
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER;
    const status = stale ? 'unknown' : (data.overall?.status || 'unknown');

    for (const dot of document.querySelectorAll('[data-fleet="status-dot"]')) {
        dot.className = `pulse s-${status}`;
    }
    setText('status-label', stale ? 'Monitoring data delayed' : (data.overall?.label || STATUS_LABEL[status]));
    setText('updated', data.generated_at ? ago(data.generated_at) : 'no data');

    const global = data.global || {};
    setText('nodes-online', num(global.reporting_nodes, 0));
    setText('nodes-total', num(global.total_nodes, 0));

    const cpu = percent(global.cpu_used, global.cpu_total);
    const memory = percent(global.memory_used, global.memory_total);
    const storage = percent(global.storage_used, global.storage_total);

    setText('cpu-pct', `${num(cpu, 1)}%`);
    setText('memory-pct', `${num(memory, 1)}%`);
    setText('storage-pct', `${num(storage, 1)}%`);
    setMeter('cpu', cpu);
    setMeter('memory', memory);
    setMeter('storage', storage);

    setText('memory-free', `${num(bytesTo(global.memory_total - global.memory_used, 'TB'), 2)} TB free`);
    setText('storage-free', `${num(bytesTo(global.storage_total - global.storage_used, 'TB'), 1)} TB free`);

    /* cpu_total is a sum of per-node "100% per thread" budgets. */
    setCount('threads', Math.round((Number(global.cpu_total) || 0) / 100));
    setCount('nodes', Number(global.total_nodes) || 0);
    setCount('memory-total', bytesTo(global.memory_total, 'TB'), 2);
    setCount('storage-total', bytesTo(global.storage_total, 'TB'), 1);

    fleetMap?.update((data.nodes || []).map(node => ({
        status: node.status || 'unknown',
        load: Math.max(
            percent(node.metrics?.cpu_used, node.metrics?.cpu_total),
            percent(node.metrics?.memory_used, node.metrics?.memory_total),
        ) / 100,
    })));
}

function renderUptime(data) {
    const host = document.querySelector('[data-uptime]');
    if (!host) return;

    /* Only the site and the panel — per-node rows live on the status page. */
    const rows = (data.uptime || []).filter(row => row.label === 'Website' || row.label === 'Panel');
    if (!rows.length) return;

    host.replaceChildren(...rows.map(row => {
        const days = row.days || [];
        const known = days.filter(day => day.status && day.status !== 'unknown');

        const article = document.createElement('article');
        article.className = 'uprow';

        const head = document.createElement('div');
        head.className = 'uprow-head';
        const name = document.createElement('strong');
        name.textContent = row.label;
        const value = document.createElement('span');
        value.textContent = known.length ? `${num(row.uptime_percent, 3)}% uptime` : 'building history';
        head.append(name, value);

        const bars = document.createElement('div');
        bars.className = 'bars';
        bars.setAttribute('role', 'img');
        bars.setAttribute('aria-label', `Daily status for ${row.label} over the last ${days.length} days`);

        days.forEach((day, index) => {
            const bar = document.createElement('i');
            bar.className = day?.status || 'unknown';
            bar.title = `${day?.date || 'No data'}: ${day?.status ? day.status.replace(/_/g, ' ') : 'no data'}`;
            bar.style.setProperty('--d', `${index * 6}ms`);
            bars.append(bar);
        });

        const foot = document.createElement('p');
        foot.className = 'uprow-foot';
        foot.textContent = known.length
            ? `${known.length} day${known.length === 1 ? '' : 's'} of recorded checks · ${days.length - known.length} days before monitoring started`
            : 'Monitoring has just started for this component.';

        article.append(head, bars, foot);
        return article;
    }));

    host.classList.add('in');
}

const REMOTE_PANEL_ORIGIN = 'https://panel.plugged.host';

async function pullFleet() {
    try {
        let res = null;
        try {
            res = await fetch(FLEET_URL, { cache: 'no-store' });
        } catch { /* ignore and try fallback */ }

        if (!res || !res.ok) {
            res = await fetch(`${REMOTE_PANEL_ORIGIN}${FLEET_URL}`, { cache: 'no-store' });
        }
        if (!res.ok) throw new Error(String(res.status));
        renderFleet(await res.json());
    } catch {
        for (const dot of document.querySelectorAll('[data-fleet="status-dot"]')) dot.className = 'pulse s-unknown';
        setText('status-label', 'Live status unavailable');
        setText('updated', '');
    }
}

async function pullUptime() {
    try {
        let res = null;
        try {
            res = await fetch(UPTIME_URL, { cache: 'no-store' });
        } catch { /* ignore and try fallback */ }

        if (!res || !res.ok) {
            res = await fetch(`${REMOTE_PANEL_ORIGIN}${UPTIME_URL}`, { cache: 'no-store' });
        }
        if (!res.ok) throw new Error(String(res.status));
        renderUptime(await res.json());
    } catch { /* the section keeps its static fallback copy */ }
}

if (document.querySelector('[data-fleet]')) {
    pullFleet();
    setInterval(pullFleet, 60000);
}

/* 50 KB of history is only worth fetching once the section is approached. */
const uptimeHost = document.querySelector('[data-uptime]');
if (uptimeHost) {
    const lazy = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        lazy.disconnect();
        pullUptime();
    }, { rootMargin: '400px' });
    lazy.observe(uptimeHost);
}

/* ---------------------------------------------------------------- misc --- */

for (const el of document.querySelectorAll('[data-year]')) {
    el.textContent = String(new Date().getFullYear());
}
