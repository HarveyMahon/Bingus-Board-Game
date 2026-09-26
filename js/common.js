/*
 * common.js — shared helpers for the public site and the admin page.
 *
 * Network policy: the site only ever fetches its own data/event.json.
 * It makes NO calls to the OSRS Wiki API. Item icons are plain <img> tags
 * pointing at the Wiki's static /images/ path (or at your own /icons folder),
 * loaded lazily and only for tiles that are actually on screen.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // localStorage wrapper — every read/write is guarded so the site still works
  // in private windows, with storage blocked, or when quota is exceeded.
  // ---------------------------------------------------------------------------
  const NS = 'bingus.';
  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(NS + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(NS + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { window.localStorage.removeItem(NS + key); } catch (e) { /* ignore */ }
    },
    available() {
      try {
        const k = NS + '__probe';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Categories and tiers
  // ---------------------------------------------------------------------------
  const CATEGORIES = [
    { id: 'boss', label: 'Boss drop' },
    { id: 'kc', label: 'Kill count' },
    { id: 'xp', label: 'XP' },
    { id: 'clues', label: 'Clues' },
    { id: 'skilling', label: 'Skilling' },
    { id: 'minigame', label: 'Minigame' },
    { id: 'clog', label: 'Collection log' },
    { id: 'other', label: 'Other' },
  ];
  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

  const TIERS = {
    1: 'Easy',
    2: 'Medium',
    3: 'Hard',
    4: 'Elite',
    5: 'Master',
  };

  // Upper bounds (estimated team-hours) for tiers 1–4; anything above is tier 5.
  // ASSUMPTION — tune these to your clan's pace.
  const TIER_HOUR_LIMITS = [2, 6, 15, 35];
  function hoursToTier(hours) {
    for (let i = 0; i < TIER_HOUR_LIMITS.length; i++) {
      if (hours < TIER_HOUR_LIMITS[i]) return i + 1;
    }
    return 5;
  }

  const DEFAULT_PROOF = {
    boss: 'Screenshot of the drop (loot message or item on the ground) with the event keyword visible in the chatbox.',
    kc: 'Before and after screenshots of the kill count (chat message or collection log) with the event keyword visible.',
    xp: 'Before and after screenshots of each contributor’s XP (skill tab or XP tracker) with the event keyword visible.',
    clues: 'Screenshot of each casket reward / completion message with the event keyword visible.',
    skilling: 'Screenshot(s) showing the items or completion, with the event keyword visible.',
    minigame: 'Screenshot of the reward or completion screen with the event keyword visible.',
    clog: 'Before and after collection log screenshots with the event keyword visible.',
    other: 'Screenshot showing the completion, with the event keyword visible.',
  };

  // ---------------------------------------------------------------------------
  // Text / number formatting
  // ---------------------------------------------------------------------------
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function trimNum(x) {
    return String(Math.round(x * 100) / 100);
  }

  /** Format a quantity. format 'xp' → 1.5M, 'gp' → 10M GP, otherwise 1,234. */
  function fmtNum(n, format) {
    const v = Number(n) || 0;
    if (format === 'xp' || format === 'gp') {
      let s;
      if (v >= 1e6) s = trimNum(v / 1e6) + 'M';
      else if (v >= 1e3) s = trimNum(v / 1e3) + 'K';
      else s = String(v);
      return format === 'gp' ? s + ' GP' : s;
    }
    return v.toLocaleString('en-GB');
  }

  function renderTemplate(template, qty, format) {
    // {qty} → formatted quantity, {s} → "s" unless the quantity is exactly 1.
    return String(template || '')
      .replace(/\{qty\}/g, fmtNum(qty, format))
      .replace(/\{s\}/g, Number(qty) === 1 ? '' : 's');
  }

  // ---------------------------------------------------------------------------
  // Dates and time zones (no libraries)
  // ---------------------------------------------------------------------------
  const DEFAULT_TZ = 'Europe/London';

  function fmtDate(iso, tz, extra) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', Object.assign({
        timeZone: tz || DEFAULT_TZ,
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }, extra || {})).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function fmtDuration(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function fmtAgo(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    if (ms < 0) return 'in ' + fmtDuration(-ms);
    if (ms < 60000) return 'just now';
    return fmtDuration(ms) + ' ago';
  }

  function zoneParts(date, tz) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || DEFAULT_TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const part of f.formatToParts(date)) p[part.type] = part.value;
    return p;
  }

  /** Offset (ms) of a time zone from UTC at a given instant. */
  function tzOffset(date, tz) {
    const p = zoneParts(date, tz);
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  /** "2026-10-03T18:00" (wall-clock time in tz) → ISO string in UTC. */
  function zonedInputToIso(value, tz) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const off1 = tzOffset(new Date(guess), tz);
    let utc = guess - off1;
    const off2 = tzOffset(new Date(utc), tz);
    if (off2 !== off1) utc = guess - off2;
    return new Date(utc).toISOString();
  }

  /** ISO string → "YYYY-MM-DDTHH:MM" wall-clock value in tz (for datetime-local inputs). */
  function isoToZonedInput(iso, tz) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = zoneParts(d, tz);
    return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, '0')}:${p.minute}`;
  }

  // ---------------------------------------------------------------------------
  // Icons — NO Wiki API calls. An icon value may be:
  //   • an item name ("Dragon pickaxe") → https://oldschool.runescape.wiki/images/Dragon_pickaxe.png
  //   • a full URL (https://…)
  //   • a path in this repo ("icons/Dragon_pickaxe.png") → zero requests to the Wiki
  // ---------------------------------------------------------------------------
  const WIKI_IMAGES = 'https://oldschool.runescape.wiki/images/';

  function iconUrl(icon) {
    if (!icon) return null;
    const s = String(icon).trim();
    if (!s) return null;
    if (/^(https?:)?\/\//i.test(s) || s.includes('/')) return s;
    let name = s.replace(/\s+/g, '_');
    name = name.charAt(0).toUpperCase() + name.slice(1);
    if (!/\.(png|gif|jpe?g|webp)$/i.test(name)) name += '.png';
    return WIKI_IMAGES + encodeURIComponent(name);
  }

  function iconHtml(icon, cls) {
    const url = iconUrl(icon);
    if (!url) return '';
    return `<img class="${cls || 'tile-icon'}" src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
  }

  // ---------------------------------------------------------------------------
  // Progress and ranking
  // ---------------------------------------------------------------------------
  function requiredFor(tile) {
    if (!tile) return 1;
    if (Array.isArray(tile.items) && tile.items.length) return tile.items.length;
    return Math.max(1, Number(tile.quantity) || 1);
  }

  function progressFor(team, tile) {
    const p = (team && team.progress) || {};
    if (tile && Array.isArray(tile.items) && tile.items.length) {
      return (p.items || []).filter((x) => tile.items.includes(x)).length;
    }
    return Math.min(Number(p.count) || 0, requiredFor(tile));
  }

  function lastCompletionAt(team) {
    const c = (team && team.completions) || [];
    return c.length ? c[c.length - 1].at : null;
  }

  /**
   * Ranking rules:
   *  1. Teams that finished the board, earliest finish first.
   *  2. Otherwise the furthest tile.
   *  3. Ties → whoever reached that tile first (time of their last completion;
   *     a team with no completions reached tile 1 at the start, so it's "earliest").
   */
  function compareTeams(a, b) {
    const af = a.finishedAt ? new Date(a.finishedAt).getTime() : null;
    const bf = b.finishedAt ? new Date(b.finishedAt).getTime() : null;
    if (af != null && bf != null) return af - bf;
    if (af != null) return -1;
    if (bf != null) return 1;
    if ((b.currentTile || 0) !== (a.currentTile || 0)) return (b.currentTile || 0) - (a.currentTile || 0);
    const ar = lastCompletionAt(a);
    const br = lastCompletionAt(b);
    if (ar === br) return 0;
    if (ar == null) return -1;
    if (br == null) return 1;
    return new Date(ar).getTime() - new Date(br).getTime();
  }

  function rankTeams(teams) {
    const sorted = [...(teams || [])].sort(compareTeams);
    let rank = 0;
    return sorted.map((team, i) => {
      if (i === 0 || compareTeams(sorted[i - 1], team) !== 0) rank = i + 1;
      return { team, rank };
    });
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  function newId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  window.Bingus = {
    store, CATEGORIES, CATEGORY_LABEL, TIERS, TIER_HOUR_LIMITS, hoursToTier, DEFAULT_PROOF,
    esc, fmtNum, renderTemplate, fmtDate, fmtDuration, fmtAgo,
    DEFAULT_TZ, tzOffset, zonedInputToIso, isoToZonedInput,
    WIKI_IMAGES, iconUrl, iconHtml,
    requiredFor, progressFor, lastCompletionAt, compareTeams, rankTeams, ordinal,
    applyTheme, newId,
  };
})();
