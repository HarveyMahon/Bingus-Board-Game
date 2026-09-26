/*
 * public.js — renders the public event page from data/event.json.
 * Personal data (followed team, collapsed sections, theme, private checklist)
 * lives only in this browser's localStorage.
 */
(function () {
  'use strict';
  const B = window.Bingus;
  const $ = (id) => document.getElementById(id);
  const esc = B.esc;

  const params = new URLSearchParams(location.search);
  const PREVIEW = params.has('preview');
  const REFRESH_MS = 5 * 60 * 1000;

  const prefs = Object.assign({ followTeam: '', collapsed: {}, theme: 'dark' }, B.store.get('prefs', {}));
  const savePrefs = () => B.store.set('prefs', prefs);
  B.applyTheme(prefs.theme);

  let data = null;
  let loadError = null;
  let showAllActivity = false;

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  let lastLoad = 0;
  async function load() {
    if (PREVIEW) return;
    lastLoad = Date.now();
    try {
      const res = await fetch('data/event.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = normalise(await res.json());
      loadError = null;
    } catch (e) {
      loadError = e;
    }
    render();
  }

  function normalise(d) {
    d = d || {};
    d.event = Object.assign({ name: 'Tile race', timezone: B.DEFAULT_TZ, rules: [], host: {}, showIcons: true }, d.event || {});
    d.event.host = d.event.host || {};
    d.tiles = Array.isArray(d.tiles) ? d.tiles : [];
    d.teams = (Array.isArray(d.teams) ? d.teams : []).map((t) => Object.assign({ members: [], completions: [], progress: { count: 0, items: [] }, currentTile: 0 }, t));
    d.activity = Array.isArray(d.activity) ? d.activity : [];
    d.totalTiles = Math.max(Number(d.totalTiles) || 0, d.tiles.length);
    return d;
  }

  if (PREVIEW) {
    const stored = B.store.get('preview', null);
    if (stored) data = normalise(stored);
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'bingus-preview') return;
      data = normalise(e.data.payload);
      render();
    });
    try { if (window.opener) window.opener.postMessage({ type: 'bingus-preview-ready' }, location.origin); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const tz = () => (data && data.event.timezone) || B.DEFAULT_TZ;
  const teamById = (id) => (data ? data.teams.find((t) => t.id === id) : null);
  const tileAt = (i) => (data ? data.tiles[i] || null : null);
  const showIcons = () => data && data.event.showIcons !== false;
  const icon = (i, cls) => (showIcons() ? B.iconHtml(i, cls) : '');

  function eventPhase() {
    const ev = data.event;
    const now = Date.now();
    const s = ev.start ? Date.parse(ev.start) : null;
    const e = ev.end ? Date.parse(ev.end) : null;
    if (!s) return 'tbc';
    if (now < s) return 'soon';
    if (e && now >= e) return 'over';
    if (data.teams.some((t) => t.finishedAt) && data.teams.every((t) => t.finishedAt)) return 'over';
    return 'live';
  }

  function tierBadge(tier) {
    return tier ? `<span class="badge tier-${esc(tier)}">${esc(B.TIERS[tier] || 'Tier ' + tier)}</span>` : '';
  }
  function catBadge(cat) {
    return cat ? `<span class="badge">${esc(B.CATEGORY_LABEL[cat] || cat)}</span>` : '';
  }
  function swatch(team) {
    return `<span class="swatch" style="--c:${esc(team.colour || '#888')}"></span>`;
  }
  function reachedAt(team) {
    return B.lastCompletionAt(team) || (data.event.start || null);
  }
  function qtyText(tile, n) {
    return B.fmtNum(n, tile && tile.format);
  }

  function section(id, title, body, extra) {
    const collapsed = !!prefs.collapsed[id];
    return `<section class="panel${collapsed ? ' collapsed' : ''}" id="sec-${id}">
      <button class="panel-head" type="button" data-toggle="${id}" aria-expanded="${!collapsed}">
        <h2>${title}</h2>${extra ? `<span class="extra">${extra}</span>` : ''}<span class="chev" aria-hidden="true"></span>
      </button>
      <div class="panel-body">${body}</div>
    </section>`;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render() {
    renderBanners();
    if (!data) {
      $('ev-desc').textContent = loadError ? 'Could not load the event data.' : 'Loading the board…';
      $('main').innerHTML = loadError
        ? `<div class="panel"><div class="panel-body" style="padding-top:16px">Couldn't load <code>data/event.json</code> (${esc(loadError.message)}). If you're testing locally, serve the folder with a web server (see README) rather than opening the file directly.</div></div>`
        : '';
      return;
    }
    const ev = data.event;
    document.title = ev.name || 'Tile race';
    $('ev-name').textContent = ev.name || 'Tile race';
    $('ev-desc').textContent = ev.description || '';
    renderFollow();
    renderHeaderStatus();
    $('updated').textContent = data.lastUpdated ? `Updated ${B.fmtAgo(data.lastUpdated)}` : '';
    $('updated').title = data.lastUpdated ? `Last published ${B.fmtDate(data.lastUpdated, tz())}` : '';
    $('theme').textContent = prefs.theme === 'light' ? 'Dark mode' : 'Light mode';

    const followed = teamById(prefs.followTeam);
    let html = '';
    html += submitSection();
    html += section('race', 'The race', raceHtml(), `${data.tiles.length} of ${data.totalTiles} tiles revealed`);
    html += section('leaderboard', 'Leaderboard', leaderboardHtml());
    html += section('teams', 'Teams &amp; current tiles', teamsHtml(followed));
    html += section('board', 'Revealed tiles', boardHtml());
    html += section('activity', 'Activity', activityHtml(), data.activity.length ? `${data.activity.length} updates` : '');
    if (ev.rules && ev.rules.length) {
      html += section('rules', 'Rules', `<ol class="steps">${ev.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`);
    }
    $('main').innerHTML = html;
    tick();
  }

  function renderBanners() {
    const out = [];
    if (PREVIEW) out.push('<div class="banner preview">PREVIEW — draft data from the admin page. This is not what’s published.</div>');
    if (data && data.sample) out.push('<div class="banner sample">Sample data — replace data/event.json from the admin page before your event.</div>');
    if (data && loadError) out.push(`<div class="banner error">Couldn't refresh (${esc(loadError.message)}). Showing the last loaded data.</div>`);
    $('banners').innerHTML = out.join('');
  }

  function renderFollow() {
    const sel = $('follow');
    const opts = ['<option value="">— none —</option>']
      .concat(data.teams.map((t) => `<option value="${esc(t.id)}"${t.id === prefs.followTeam ? ' selected' : ''}>${esc(t.name)}</option>`));
    sel.innerHTML = opts.join('');
  }

  function renderHeaderStatus() {
    const phase = eventPhase();
    const labels = { tbc: ['tbc', 'Dates TBC'], soon: ['soon', 'Starting soon'], live: ['live', 'Live'], over: ['over', 'Finished'] };
    const [cls, label] = labels[phase];
    $('ev-status').innerHTML = `<span class="pill ${cls}">${label}</span>`;
  }

  /** Called every second — only touches the countdown. */
  function tick() {
    if (!data) return;
    const el = $('countdown');
    const ev = data.event;
    const phase = eventPhase();
    const now = Date.now();
    if (phase === 'tbc') {
      el.innerHTML = '<small>Start date to be announced</small>';
    } else if (phase === 'soon') {
      el.innerHTML = `${esc(clock(Date.parse(ev.start) - now))}<small>until the start · ${esc(B.fmtDate(ev.start, tz()))}</small>`;
    } else if (phase === 'live') {
      el.innerHTML = ev.end
        ? `${esc(clock(Date.parse(ev.end) - now))}<small>remaining · ends ${esc(B.fmtDate(ev.end, tz()))}</small>`
        : '<small>Event in progress</small>';
    } else {
      el.innerHTML = `<small>Ended ${esc(B.fmtDate(ev.end || data.lastUpdated, tz()))}</small>`;
    }
  }

  function clock(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (d ? d + 'd ' : '') + `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  // ----- How to submit -----
  function submitSection() {
    const ev = data.event;
    const host = ev.host || {};
    const parts = [];
    if (ev.keyword && data.live !== false) {
      parts.push(`<div>Event keyword: <span class="keyword">${esc(ev.keyword)}</span></div>`);
    } else {
      parts.push('<div class="muted">The event keyword is revealed when the event starts.</div>');
    }
    if (ev.submission) parts.push(`<div>${esc(ev.submission)}</div>`);
    const who = host.discord || host.name;
    if (who) {
      const link = host.discordUserId
        ? `<a href="https://discord.com/users/${encodeURIComponent(host.discordUserId)}" target="_blank" rel="noopener">${esc(who)}</a>`
        : `<strong>${esc(who)}</strong>`;
      parts.push(`<div>Send proof by Discord DM to ${link}${host.name && host.discord ? ` (${esc(host.name)})` : ''}.</div>`);
    }
    if (ev.discordInvite) {
      parts.push(`<div><a class="btn small" href="${esc(ev.discordInvite)}" target="_blank" rel="noopener">Join the event Discord</a></div>`);
    }
    return section('submit', 'How to submit', `<div class="submit-box">${parts.join('')}</div>`);
  }

  // ----- Race track -----
  function raceHtml() {
    const total = data.totalTiles;
    if (!data.teams.length) return '<p class="muted">No teams yet.</p>';
    if (!total) return '<p class="muted">The board hasn’t been set up yet.</p>';
    const revealed = data.tiles.length;
    let legend = '';
    for (let i = 0; i < total; i++) {
      const t = tileAt(i);
      legend += `<div class="cell ${t ? 't' + esc(t.tier) : 'hidden-tile'}" title="${t ? esc(`Tile ${i + 1}: ${t.title}`) : 'Hidden'}"></div>`;
    }
    let html = `<div class="race">
      <div class="lane legend"><div class="lane-name">Difficulty</div><div class="track tiers" style="--n:${total}">${legend}</div><div class="lane-pos"></div></div>`;
    for (const { team, rank } of B.rankTeams(data.teams)) {
      const cur = Math.min(team.currentTile || 0, total);
      let cells = '';
      for (let i = 0; i < total; i++) {
        let cls = 'cell ';
        if (i < cur) cls += 'done';
        else if (i === cur) cls += 'current';
        else if (i < revealed) cls += 'open';
        else cls += 'hidden-tile';
        const t = tileAt(i);
        const title = t ? `Tile ${i + 1}: ${t.title}` : `Tile ${i + 1}`;
        cells += `<div class="${cls}" title="${esc(title)}"></div>`;
      }
      const finished = !!team.finishedAt;
      const pos = finished ? 'Finished!' : `Tile ${cur + 1}/${total}`;
      html += `<div class="lane${team.id === prefs.followTeam ? ' followed' : ''}" style="--c:${esc(team.colour || '#888')}">
        <div class="lane-name">${swatch(team)}<span>${B.ordinal(rank)} · ${esc(team.name)}</span></div>
        <div class="track" style="--n:${total}">${cells}</div>
        <div class="lane-pos">${pos}</div>
      </div>`;
    }
    html += '</div>';
    if (revealed < total) html += `<p class="muted" style="margin:10px 0 0;font-size:.85rem">Striped tiles are still hidden. A tile is revealed when the first team reaches it.</p>`;
    return html;
  }

  // ----- Leaderboard -----
  function leaderboardHtml() {
    if (!data.teams.length) return '<p class="muted">No teams yet.</p>';
    const total = data.totalTiles;
    const rows = B.rankTeams(data.teams).map(({ team, rank }) => {
      const tile = tileAt(team.currentTile);
      const finished = !!team.finishedAt;
      let prog = '—';
      if (!finished && tile) {
        const req = B.requiredFor(tile);
        const got = B.progressFor(team, tile);
        prog = `<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar" style="flex:1"><span style="width:${Math.round((got / req) * 100)}%"></span></div><span class="num">${esc(qtyText(tile, got))}/${esc(qtyText(tile, req))}</span></div>`;
      }
      const since = finished ? B.fmtDate(team.finishedAt, tz()) : (reachedAt(team) ? B.fmtAgo(reachedAt(team)).replace(' ago', '') : '—');
      return `<tr class="${team.id === prefs.followTeam ? 'followed' : ''}">
        <td class="rank">${rank}</td>
        <td>${swatch(team)} ${esc(team.name)}</td>
        <td class="num">${finished ? '<strong>Finished</strong>' : `${Math.min(team.currentTile + 1, total)} / ${total}`}</td>
        <td class="hide-sm" style="min-width:140px">${tile && !finished ? `<div style="font-size:.85rem;margin-bottom:3px">${esc(tile.title)}</div>` : ''}${prog}</td>
        <td class="num">${esc(since)}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Team</th><th>Tile</th><th class="hide-sm">Current tile progress</th><th>On tile for / finished</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ----- Team cards -----
  function teamsHtml(followed) {
    if (!data.teams.length) return '<p class="muted">No teams yet.</p>';
    const ranked = B.rankTeams(data.teams);
    const ordered = followed ? [ranked.find((r) => r.team.id === followed.id)].concat(ranked.filter((r) => r.team.id !== followed.id)) : ranked;
    return `<div class="team-grid">${ordered.map(({ team, rank }) => teamCard(team, rank, followed && team.id === followed.id)).join('')}</div>`;
  }

  function teamCard(team, rank, isFollowed) {
    const total = data.totalTiles;
    const tile = tileAt(team.currentTile);
    let body = '';
    if (team.finishedAt) {
      body = `<div class="finished-banner">Board complete! · ${esc(B.fmtDate(team.finishedAt, tz()))}</div>`;
    } else if (!data.tiles.length) {
      body = '<p class="muted">The board is revealed when the event starts.</p>';
    } else if (tile) {
      const req = B.requiredFor(tile);
      const got = B.progressFor(team, tile);
      let official = '';
      if (tile.items && tile.items.length) {
        const have = new Set((team.progress && team.progress.items) || []);
        official = `<ul class="items">${tile.items.map((it) => `<li class="${have.has(it) ? 'got' : 'need'}">${esc(it)}</li>`).join('')}</ul>`;
      }
      official = `<div class="kv">Official progress: <strong>${esc(qtyText(tile, got))} / ${esc(qtyText(tile, req))}</strong></div>
        <div class="bar"><span style="width:${Math.round((got / req) * 100)}%"></span></div>${official}`;
      body = `<div class="tile-block">
          <div class="ic-box">${icon(tile.icon)}</div>
          <div class="tile-main">
            <div><span class="kv">Tile ${team.currentTile + 1}</span> <span class="tile-title">${esc(tile.title)}</span></div>
            <div class="tile-meta">${tierBadge(tile.tier)} ${catBadge(tile.category)}</div>
            ${tile.description ? `<p class="tile-desc">${esc(tile.description)}</p>` : ''}
          </div>
        </div>
        ${tile.requirements ? `<div class="kv">Requirements: <strong>${esc(tile.requirements)}</strong></div>` : ''}
        ${tile.proof ? `<div class="kv">Proof: <strong>${esc(tile.proof)}</strong></div>` : ''}
        ${official}
        ${isFollowed ? checklistHtml(team, tile) : ''}`;
    }
    const since = reachedAt(team);
    const done = (team.completions || []).slice().reverse();
    return `<article class="card team-card${isFollowed ? ' followed' : ''}" style="--c:${esc(team.colour || '#888')}">
      <header>${swatch(team)}<h3>${esc(team.name)}</h3>
        <span class="meta">${B.ordinal(rank)} · ${team.finishedAt ? 'finished' : `tile ${Math.min(team.currentTile + 1, total)}/${total}`}${!team.finishedAt && since ? ` · on it ${esc(B.fmtAgo(since).replace(' ago', ''))}` : ''}</span>
      </header>
      ${body}
      <div class="members">${(team.members || []).map((m) => `<span>${esc(m.rsn)}</span>`).join('')}</div>
      ${done.length ? `<details><summary>Completed tiles (${done.length})</summary><ul class="done-list">${done.map((c) => completionRow(team, c)).join('')}</ul></details>` : ''}
    </article>`;
  }

  function completionRow(team, c) {
    const t = tileAt(c.tileIndex);
    const prev = (team.completions || []).find((x) => x.tileIndex === c.tileIndex - 1);
    const startedAt = prev ? prev.at : data.event.start;
    const took = startedAt ? B.fmtDuration(Date.parse(c.at) - Date.parse(startedAt)) : '';
    return `<li><span>${c.tileIndex + 1}. ${esc(t ? t.title : 'Tile ' + (c.tileIndex + 1))}${c.by ? ` <span class="muted">— ${esc(c.by)}</span>` : ''}</span>
      <span class="when" title="${esc(B.fmtDate(c.at, tz()))}">${took ? esc(took) : esc(B.fmtDate(c.at, tz()))}</span></li>`;
  }

  // ----- Private checklist (this browser only) -----
  function checkKey(team, tile) { return `check.${team.id}.${tile.id}`; }

  function checklistHtml(team, tile) {
    const key = checkKey(team, tile);
    const state = B.store.get(key, { count: 0, items: [] });
    let inner;
    if (tile.items && tile.items.length) {
      inner = tile.items.map((it, i) => `<label><input type="checkbox" data-check="${esc(key)}" data-item="${i}"${state.items && state.items.includes(it) ? ' checked' : ''}> ${esc(it)}</label>`).join('');
    } else {
      const req = B.requiredFor(tile);
      const step = tile.format === 'xp' || tile.format === 'gp' ? Math.max(1, Math.round(req / 20)) : 1;
      inner = `<div class="counter">
        <button class="btn small icon" type="button" data-count="${esc(key)}" data-delta="${-step}" aria-label="Decrease">−</button>
        <output>${esc(qtyText(tile, state.count || 0))} / ${esc(qtyText(tile, req))}</output>
        <button class="btn small icon" type="button" data-count="${esc(key)}" data-delta="${step}" aria-label="Increase">+</button>
        <button class="btn small ghost" type="button" data-count="${esc(key)}" data-reset="1">Reset</button>
      </div>`;
    }
    return `<div class="private-check">
      <div class="head"><strong>My checklist</strong><small>Private to this browser · unofficial — only the host updates official progress</small></div>
      ${inner}
    </div>`;
  }

  // ----- Revealed tiles -----
  function boardHtml() {
    if (!data.tiles.length) {
      return `<p class="muted">No tiles revealed yet.${data.totalTiles ? ` The board has ${data.totalTiles} tiles.` : ''}</p>`;
    }
    const rows = data.tiles.map((t, i) => {
      const chips = [];
      for (const team of data.teams) {
        const c = (team.completions || []).find((x) => x.tileIndex === i);
        if (c) chips.push(`<span class="chip" title="${esc(B.fmtDate(c.at, tz()))}${c.by ? ' — ' + esc(c.by) : ''}">${swatch(team)} ${esc(team.name)} ✓</span>`);
        else if (team.currentTile === i && !team.finishedAt) chips.push(`<span class="chip here">${swatch(team)} ${esc(team.name)} …</span>`);
      }
      return `<li class="card board-tile">
        <div class="idx">${i + 1}</div>
        <div>${icon(t.icon)}</div>
        <div>
          <div><strong>${esc(t.title)}</strong> ${tierBadge(t.tier)} ${catBadge(t.category)}</div>
          ${t.description ? `<div class="muted" style="font-size:.86rem">${esc(t.description)}</div>` : ''}
          ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        </div>
      </li>`;
    }).join('');
    const hidden = data.totalTiles - data.tiles.length;
    return `<ol class="board-list">${rows}</ol>${hidden > 0 ? `<div class="hidden-count">${hidden} more tile${hidden === 1 ? '' : 's'} hidden until a team reaches them</div>` : ''}`;
  }

  // ----- Activity -----
  function activityHtml() {
    const list = data.activity.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!list.length) return '<p class="muted">Nothing yet — check back once the event starts.</p>';
    const shown = showAllActivity ? list : list.slice(0, 20);
    const rows = shown.map((a) => {
      const team = teamById(a.teamId);
      return `<li class="t-${esc(a.type || 'note')}"><span class="when" title="${esc(B.fmtDate(a.at, tz()))}">${esc(B.fmtDate(a.at, tz(), { weekday: 'short' }))}</span>
        <span>${team ? swatch(team) + ' ' : ''}<span class="txt">${esc(a.text || '')}</span></span></li>`;
    }).join('');
    const more = list.length > 20
      ? `<div class="row" style="margin-top:8px"><button class="btn small" type="button" data-more="1">${showAllActivity ? 'Show fewer' : `Show all ${list.length}`}</button></div>`
      : '';
    return `<ul class="feed">${rows}</ul>${more}`;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  $('main').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      prefs.collapsed[id] = !prefs.collapsed[id];
      savePrefs();
      const sec = $('sec-' + id);
      sec.classList.toggle('collapsed', !!prefs.collapsed[id]);
      toggle.setAttribute('aria-expanded', String(!prefs.collapsed[id]));
      return;
    }
    const counter = e.target.closest('[data-count]');
    if (counter) {
      const key = counter.dataset.count;
      const team = teamById(prefs.followTeam);
      const tile = team && tileAt(team.currentTile);
      if (!tile) return;
      const st = B.store.get(key, { count: 0, items: [] });
      const req = B.requiredFor(tile);
      st.count = counter.dataset.reset ? 0 : Math.max(0, Math.min(req, (st.count || 0) + Number(counter.dataset.delta)));
      if (!B.store.set(key, st)) flashNoStorage();
      render();
      return;
    }
    if (e.target.closest('[data-more]')) {
      showAllActivity = !showAllActivity;
      render();
    }
  });

  $('main').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-check]');
    if (!cb) return;
    const team = teamById(prefs.followTeam);
    const tile = team && tileAt(team.currentTile);
    if (!tile || !tile.items) return;
    const key = cb.dataset.check;
    const st = B.store.get(key, { count: 0, items: [] });
    const item = tile.items[Number(cb.dataset.item)];
    const set = new Set(st.items || []);
    if (cb.checked) set.add(item); else set.delete(item);
    st.items = [...set];
    if (!B.store.set(key, st)) flashNoStorage();
  });

  let warned = false;
  function flashNoStorage() {
    if (warned) return;
    warned = true;
    alert('Your browser is blocking local storage, so your personal checklist won’t be saved after you leave this page.');
  }

  $('follow').addEventListener('change', (e) => {
    prefs.followTeam = e.target.value;
    savePrefs();
    render();
  });
  $('theme').addEventListener('click', () => {
    prefs.theme = prefs.theme === 'light' ? 'dark' : 'light';
    savePrefs();
    B.applyTheme(prefs.theme);
    $('theme').textContent = prefs.theme === 'light' ? 'Dark mode' : 'Light mode';
  });
  $('refresh').addEventListener('click', () => {
    if (PREVIEW) { render(); return; }
    load();
  });

  setInterval(tick, 1000);
  setInterval(() => {
    if (!PREVIEW && document.visibilityState === 'visible') load();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!PREVIEW && document.visibilityState === 'visible' && data && Date.now() - lastLoad > REFRESH_MS) load();
  });

  render();
  load();
})();
