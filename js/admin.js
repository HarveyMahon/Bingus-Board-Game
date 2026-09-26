/*
 * admin.js — the host's workspace.
 *
 * Everything here lives in THIS browser's localStorage (key "bingus.workspace"):
 * the full board (including hidden tiles), teams, progress, activity, library edits.
 * Nothing is sent anywhere. To publish, generate data/event.json and commit it to the repo.
 * Export a backup regularly — clearing browser data wipes the workspace.
 */
(function () {
  'use strict';
  const B = window.Bingus;
  const G = window.BingusGenerator;
  const LIB = window.BINGUS_LIBRARY || [];
  const $ = (id) => document.getElementById(id);
  const esc = B.esc;
  const round1 = (x) => Math.round(x * 10) / 10;

  const STORAGE_OK = B.store.available();
  const TEAM_COLOURS = ['#e0a126', '#3f8fdc', '#a35ee0', '#3fbf5a', '#e0513c', '#1fb5b5', '#e070b0', '#9aa33a'];
  const TABS = [
    ['event', 'Event'], ['teams', 'Teams'], ['board', 'Board'], ['library', 'Library'],
    ['generator', 'Generator'], ['progress', 'Progress'], ['publish', 'Publish & backup'],
  ];
  const DEFAULT_RULES = [
    'Tiles must be completed in order. Only progress made after the event starts, and while your team is on that tile, counts.',
    'Every screenshot must show the event keyword typed in the chatbox.',
    'Submit proof by Discord DM to the host. The host’s decision is final.',
    'Only registered team members’ progress counts.',
    'First team to complete the final tile wins. If nobody finishes, the team furthest along wins; ties go to whoever reached that tile first.',
  ];

  // ---------------------------------------------------------------------------
  // Workspace
  // ---------------------------------------------------------------------------
  function defaults() {
    return {
      version: 1,
      event: {
        name: 'Bingus Board Game',
        description: 'A two-week clan tile race. Teams of 5–6 work through the board in order — each tile unlocks the next. First to finish wins.',
        start: null,
        end: null,
        timezone: B.DEFAULT_TZ,
        keyword: '',
        host: { name: '', discord: '', discordUserId: '' },
        discordInvite: '',
        submission: 'Send your screenshot(s) to the host in a Discord DM. Include your team name, the tile number and the RSN of whoever got it. The event keyword must be visible in the chatbox of every screenshot.',
        rules: DEFAULT_RULES.slice(),
        showIcons: true,
      },
      live: false,
      board: [],
      teams: [],
      activity: [],
      library: { overrides: {}, hidden: [], custom: [] },
      generator: {
        tiles: 25, teamSize: 5, days: 14, hoursPerDay: 2.5, ironmen: true,
        categories: B.CATEGORIES.map((c) => c.id), fill: 85, ramp: 8,
      },
      prefs: { showIcons: false, repo: 'HarveyMahon/Bingus-Board-Game', branch: 'main' },
      updatedAt: null,
    };
  }

  function migrate(w) {
    const d = defaults();
    w = w && typeof w === 'object' ? w : {};
    const ev = Object.assign({}, d.event, w.event || {});
    ev.host = Object.assign({}, d.event.host, (w.event && w.event.host) || {});
    return Object.assign({}, d, w, {
      event: ev,
      board: Array.isArray(w.board) ? w.board : [],
      teams: (Array.isArray(w.teams) ? w.teams : []).map((t) => Object.assign({
        members: [], currentTile: 0, progress: { count: 0, items: [] }, completions: [], finishedAt: null,
      }, t)),
      activity: Array.isArray(w.activity) ? w.activity : [],
      library: Object.assign({}, d.library, w.library || {}),
      generator: Object.assign({}, d.generator, w.generator || {}),
      prefs: Object.assign({}, d.prefs, w.prefs || {}),
    });
  }

  let ws = migrate(B.store.get('workspace', null));
  let saveFailed = false;
  let undoStack = [];
  let tab = B.store.get('adminTab', 'event');
  if (!TABS.some((t) => t[0] === tab)) tab = 'event';
  let gen = null; // current generator result (kept in memory)
  const libQ = { q: '', cat: '', tier: '', iron: false, showHidden: false };
  let showAllActivity = false;

  function save() {
    ws.updatedAt = new Date().toISOString();
    saveFailed = !B.store.set('workspace', ws);
    renderStatus();
  }

  /** Apply a change with undo support. Return false from fn to cancel. */
  function mutate(label, fn, opts) {
    const snap = JSON.stringify(ws);
    const res = fn();
    if (res === false) return false;
    undoStack.push({ label, snap });
    if (undoStack.length > 100) undoStack.shift();
    save();
    if (!opts || opts.render !== false) render();
    return true;
  }

  function undo() {
    const u = undoStack.pop();
    if (!u) return;
    ws = migrate(JSON.parse(u.snap));
    save();
    render();
    toast('Undone: ' + u.label);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const tz = () => ws.event.timezone || B.DEFAULT_TZ;
  const teamById = (id) => ws.teams.find((t) => t.id === id);
  const maxCurrent = () => (ws.teams.length ? Math.max(...ws.teams.map((t) => t.currentTile || 0)) : 0);
  const anyProgress = () => ws.teams.some((t) => (t.completions || []).length || (t.progress && ((t.progress.count || 0) > 0 || (t.progress.items || []).length)));
  const revealCount = () => (ws.live ? Math.min(ws.board.length, maxCurrent() + 1) : 0);
  /** Tiles a team has reached or passed can't be moved/deleted (it would corrupt progress). */
  const lockedCount = () => ((ws.live || anyProgress()) ? Math.min(ws.board.length, maxCurrent() + 1) : 0);
  const totalHours = (tiles) => tiles.reduce((a, t) => a + (Number(t.estHours) || 0), 0);
  const nowInput = () => B.isoToZonedInput(new Date().toISOString(), tz());
  const tierBadge = (t) => `<span class="badge tier-${esc(t)}">${esc(B.TIERS[t] || t)}</span>`;
  const catBadge = (c) => `<span class="badge">${esc(B.CATEGORY_LABEL[c] || c)}</span>`;
  const swatch = (team) => `<span class="swatch" style="--c:${esc(team.colour || '#888')}"></span>`;
  const qty = (tile, n) => B.fmtNum(n, tile && tile.format);

  function addActivity(entry) {
    ws.activity.push(Object.assign({ id: B.newId('a'), at: new Date().toISOString(), type: 'note' }, entry));
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(title, bodyHtml, onSubmit, submitLabel) {
    const d = $('modal');
    d.innerHTML = `<form method="dialog">
      <div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="btn small ghost" data-close aria-label="Close">✕</button></div>
      ${bodyHtml}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">${esc(submitLabel || 'Save')}</button></div>
    </form>`;
    const f = d.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit(f) !== false) closeModal();
    });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    const first = f.querySelector('input, textarea, select');
    if (first) first.focus();
    return f;
  }
  function closeModal() {
    const d = $('modal');
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }

  // ---------------------------------------------------------------------------
  // Tile form (board tiles and library entries)
  // ---------------------------------------------------------------------------
  function tileFormHtml(t, mode) {
    const cats = B.CATEGORIES.map((c) => `<option value="${c.id}"${c.id === t.category ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
    const tiers = [1, 2, 3, 4, 5].map((n) => `<option value="${n}"${Number(t.tier) === n ? ' selected' : ''}>${n} — ${B.TIERS[n]}</option>`).join('');
    const auto = mode === 'board' && t.titleTemplate && t.perUnit;
    const scalableLib = mode === 'library' && t.scale;
    return `<div class="form-grid">
      <label class="field full"><span>Title</span><input name="title" required maxlength="140" value="${esc(t.title || '')}">
        ${scalableLib ? '<span class="hint">Scalable challenge: use {qty} where the quantity goes and {s} for a plural “s”. The generator changes the quantity to fit its time budget.</span>' : ''}</label>
      <label class="field full"><span>Description</span><textarea name="description" rows="2">${esc(t.description || '')}</textarea></label>
      <label class="field"><span>Difficulty tier</span><select name="tier">${tiers}</select></label>
      <label class="field"><span>Category</span><select name="category">${cats}</select></label>
      <label class="field"><span>Quantity required</span><input name="quantity" type="number" min="1" step="1" value="${esc(t.quantity || 1)}">
        <span class="hint">Ignored when specific items are listed below.</span></label>
      <label class="field"><span>Estimated team-hours</span><input name="estHours" type="number" min="0" step="0.1" value="${esc(t.estHours != null ? t.estHours : '')}">
        <span class="hint">Total player-hours for the team${scalableLib ? ' for the quantity above' : ''}.</span></label>
      ${auto ? `<label class="check full"><input type="checkbox" name="auto" checked> Update title, description, hours and tier automatically when the quantity changes</label>` : ''}
      <label class="field full"><span>Specific items (optional, one per line)</span>
        <textarea name="items" rows="3" placeholder="e.g.&#10;Berserker ring&#10;Archers ring">${esc((t.items || []).join('\n'))}</textarea>
        <span class="hint">Each line is tracked separately for partial progress.</span></label>
      <label class="field full"><span>Proof requirements</span><textarea name="proof" rows="2">${esc(t.proof || '')}</textarea></label>
      <label class="field full"><span>Requirements (quests, levels) — shown to players</span><input name="requirements" value="${esc(t.requirements || '')}"></label>
      <div class="field full"><span>Icon — item name (e.g. Dragon pickaxe), an image URL, or icons/your-file.png</span>
        <div class="row"><input name="icon" style="flex:1;min-width:180px" value="${esc(t.icon || '')}"><button type="button" class="btn small" data-icon-preview>Preview</button><span class="icon-preview" data-icon-out></span></div>
        <span class="hint">Item names become a direct OSRS Wiki image link — no Wiki API lookup. Preview loads that one image.</span></div>
      ${mode === 'board' ? `<label class="field full"><span>Private notes (never published)</span><textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></label>` : ''}
      ${mode === 'library' ? `<label class="check full"><input type="checkbox" name="ironOk"${t.ironOk !== false ? ' checked' : ''}> Achievable by ironmen (no Grand Exchange or trading needed)</label>` : ''}
    </div>`;
  }

  function wireTileForm(f, base) {
    const out = f.querySelector('[data-icon-out]');
    f.querySelector('[data-icon-preview]').addEventListener('click', () => {
      const url = B.iconUrl(f.elements.icon.value);
      out.innerHTML = url
        ? `<img class="tile-icon" src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('small'),{textContent:'Image not found — check the exact item name'}))">`
        : '<small>No icon</small>';
    });
    if (f.elements.auto) {
      f.elements.quantity.addEventListener('input', () => {
        if (!f.elements.auto.checked) return;
        const n = Math.max(1, parseInt(f.elements.quantity.value, 10) || 1);
        const h = n * base.perUnit;
        f.elements.title.value = B.renderTemplate(base.titleTemplate, n, base.format);
        f.elements.description.value = B.renderTemplate(base.descTemplate || '', n, base.format);
        f.elements.estHours.value = round1(h);
        f.elements.tier.value = String(B.hoursToTier(h));
      });
    }
  }

  function readTileForm(f, base, mode) {
    const get = (n) => String(f.elements[n] ? f.elements[n].value : '').trim();
    const items = get('items').split('\n').map((s) => s.trim()).filter(Boolean);
    const t = Object.assign({}, base, {
      title: get('title'),
      description: get('description'),
      tier: Number(get('tier')) || 1,
      category: get('category') || 'other',
      quantity: items.length ? items.length : Math.max(1, parseInt(get('quantity'), 10) || 1),
      items: items.length ? items : null,
      estHours: Math.max(0, parseFloat(get('estHours')) || 0),
      proof: get('proof'),
      requirements: get('requirements'),
      icon: get('icon'),
    });
    if (mode === 'board') {
      t.notes = get('notes');
      if (f.elements.auto && !f.elements.auto.checked) { t.titleTemplate = null; t.descTemplate = null; t.perUnit = null; }
      if (t.items) { t.titleTemplate = null; t.descTemplate = null; t.perUnit = null; }
    }
    if (mode === 'library') {
      t.ironOk = !!(f.elements.ironOk && f.elements.ironOk.checked);
      if (t.scale && !t.items) t.scale = Object.assign({}, t.scale, { perUnit: t.estHours / t.quantity });
      if (t.items) delete t.scale;
    }
    return t;
  }

  function editBoardTile(index) {
    const isNew = index == null;
    const base = isNew
      ? { id: B.newId('t'), title: '', description: '', tier: 1, category: 'boss', quantity: 1, estHours: 2, proof: B.DEFAULT_PROOF.boss, requirements: '', icon: '', notes: '', items: null }
      : ws.board[index];
    const f = openModal(isNew ? 'New tile' : `Edit tile ${index + 1}`, tileFormHtml(base, 'board'), (form) => {
      const t = readTileForm(form, base, 'board');
      if (!t.title) { toast('A title is required'); return false; }
      mutate(isNew ? 'Add tile' : 'Edit tile', () => {
        if (isNew) ws.board.push(t); else ws.board[index] = t;
      });
      toast(isNew ? `Added as tile ${ws.board.length}` : 'Tile saved');
    }, isNew ? 'Add tile' : 'Save tile');
    // Suggest matching proof text when a new tile's category changes.
    if (isNew) {
      f.elements.category.addEventListener('change', () => {
        const cur = f.elements.proof.value.trim();
        if (!cur || Object.values(B.DEFAULT_PROOF).includes(cur)) f.elements.proof.value = B.DEFAULT_PROOF[f.elements.category.value] || '';
      });
    }
    wireTileForm(f, base);
  }

  // ---------------------------------------------------------------------------
  // Library (built-in + your edits + your custom entries)
  // ---------------------------------------------------------------------------
  function libraryEntries(includeHidden) {
    const ov = ws.library.overrides || {};
    const hidden = new Set(ws.library.hidden || []);
    const base = LIB.map((e) => (ov[e.id] ? Object.assign({}, e, ov[e.id], { _edited: true }) : e));
    const all = base.concat((ws.library.custom || []).map((e) => Object.assign({}, e, { _custom: true })));
    return all
      .map((e) => Object.assign({}, e, { _hidden: hidden.has(e.id) }))
      .filter((e) => includeHidden || !e._hidden);
  }

  function libDisplayTitle(e) {
    return e.scale ? B.renderTemplate(e.title, e.quantity, e.format) : e.title;
  }

  function editLibraryEntry(id) {
    const isNew = id == null;
    const entry = isNew
      ? { id: B.newId('custom'), title: '', description: '', tier: 1, category: 'boss', quantity: 1, estHours: 2, proof: '', requirements: '', icon: '', ironOk: true, items: null }
      : libraryEntries(true).find((e) => e.id === id);
    if (!entry) return;
    const f = openModal(isNew ? 'New library challenge' : 'Edit library challenge', tileFormHtml(entry, 'library'), (form) => {
      const e = readTileForm(form, entry, 'library');
      if (!e.title) { toast('A title is required'); return false; }
      delete e._edited; delete e._custom; delete e._hidden;
      mutate(isNew ? 'Add library challenge' : 'Edit library challenge', () => {
        if (isNew || entry._custom) {
          const list = ws.library.custom;
          const i = list.findIndex((x) => x.id === e.id);
          if (i >= 0) list[i] = e; else list.push(e);
        } else {
          ws.library.overrides[e.id] = e;
        }
      });
      toast('Library updated');
    }, isNew ? 'Add to library' : 'Save');
    wireTileForm(f, entry);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    $('tabs').innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
    const views = { event: viewEvent, teams: viewTeams, board: viewBoard, library: viewLibrary, generator: viewGenerator, progress: viewProgress, publish: viewPublish };
    $('view').innerHTML = views[tab]();
    afterRender();
    renderStatus();
    renderBanners();
  }

  function renderStatus() {
    let s;
    if (!STORAGE_OK) s = '<span class="status-bad">Browser storage is unavailable — changes are lost when you close this tab. Export a backup!</span>';
    else if (saveFailed) s = '<span class="status-bad">Could not save (storage full?) — export a backup now.</span>';
    else s = `<span class="status-ok">✔ Saved in this browser</span>${ws.updatedAt ? ' · ' + esc(B.fmtAgo(ws.updatedAt)) : ''}`;
    $('save-status').innerHTML = s;
    const u = undoStack[undoStack.length - 1];
    $('undo').disabled = !u;
    $('undo').textContent = u ? `Undo: ${u.label.length > 28 ? u.label.slice(0, 27) + '…' : u.label}` : 'Undo';
  }

  function renderBanners() {
    $('banners').innerHTML = ws.live
      ? ''
      : '<div class="banner sample">Board is not live — published files contain no tiles or keyword until you tick “Board is live” on the Publish tab.</div>';
  }

  // ----- Event tab -----
  function viewEvent() {
    const ev = ws.event;
    const len = ev.start && ev.end ? (Date.parse(ev.end) - Date.parse(ev.start)) / 86400000 : null;
    return `<form class="card stack" data-form="event">
      <h2>Event settings</h2>
      <div class="form-grid">
        <label class="field full"><span>Event name</span><input name="name" required value="${esc(ev.name)}"></label>
        <label class="field full"><span>Short description</span><textarea name="description" rows="2">${esc(ev.description)}</textarea></label>
        <label class="field"><span>Start (${esc(tz())})</span><input type="datetime-local" name="start" value="${esc(B.isoToZonedInput(ev.start, tz()))}"></label>
        <label class="field"><span>End (${esc(tz())})</span><input type="datetime-local" name="end" value="${esc(B.isoToZonedInput(ev.end, tz()))}">
          <span class="hint">${len ? `Event length: ${round1(len)} days` : 'Leave blank until dates are decided — the site shows “Dates TBC”.'}</span></label>
        <label class="field"><span>Time zone</span><input name="timezone" value="${esc(tz())}"><span class="hint">IANA name, e.g. Europe/London</span></label>
        <label class="field"><span>Event keyword</span><input name="keyword" value="${esc(ev.keyword)}"><span class="hint">Only published once the board is live.</span></label>
        <label class="field"><span>Host name</span><input name="hostName" value="${esc(ev.host.name)}"></label>
        <label class="field"><span>Host Discord handle</span><input name="hostDiscord" value="${esc(ev.host.discord)}" placeholder="yourname"></label>
        <label class="field"><span>Host Discord user ID (optional)</span><input name="hostDiscordUserId" value="${esc(ev.host.discordUserId)}" inputmode="numeric"><span class="hint">Makes the handle a link to your Discord profile.</span></label>
        <label class="field"><span>Discord server invite (optional)</span><input name="discordInvite" type="url" value="${esc(ev.discordInvite)}" placeholder="https://discord.gg/…"></label>
        <label class="field full"><span>How to submit (shown on the site)</span><textarea name="submission" rows="3">${esc(ev.submission)}</textarea></label>
        <label class="field full"><span>Rules (one per line)</span><textarea name="rules" rows="6">${esc((ev.rules || []).join('\n'))}</textarea></label>
        <label class="check full"><input type="checkbox" name="showIcons"${ev.showIcons !== false ? ' checked' : ''}> Show item icons on the public site (loaded as plain images from the OSRS Wiki or your icons/ folder)</label>
      </div>
      <div class="row end"><button type="submit" class="btn primary">Save event settings</button></div>
    </form>`;
  }

  function saveEventForm(f) {
    const g = (n) => String(f.elements[n].value || '').trim();
    const zone = g('timezone') || B.DEFAULT_TZ;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); } catch (e) { toast('Unknown time zone: ' + zone); return; }
    const start = B.zonedInputToIso(g('start'), zone);
    const end = B.zonedInputToIso(g('end'), zone);
    if (start && end && Date.parse(end) <= Date.parse(start)) { toast('End must be after start'); return; }
    mutate('Edit event settings', () => {
      Object.assign(ws.event, {
        name: g('name') || 'Tile race',
        description: g('description'),
        start, end, timezone: zone,
        keyword: g('keyword'),
        host: { name: g('hostName'), discord: g('hostDiscord'), discordUserId: g('hostDiscordUserId') },
        discordInvite: g('discordInvite'),
        submission: g('submission'),
        rules: g('rules').split('\n').map((s) => s.trim()).filter(Boolean),
        showIcons: f.elements.showIcons.checked,
      });
      if (start && end) ws.generator.days = round1((Date.parse(end) - Date.parse(start)) / 86400000);
    });
    toast('Event settings saved');
  }

  // ----- Teams tab -----
  function viewTeams() {
    const rows = ws.teams.map((t, i) => {
      const n = t.members.length;
      const warn = n < 5 || n > 6 ? ` <span class="badge" style="color:var(--accent)">${n} members</span>` : ` <span class="muted">${n} members</span>`;
      return `<li class="tile-row" style="grid-template-columns:auto 1fr auto">
        ${swatch(t)}
        <div class="main"><div class="t">${esc(t.name)}${warn}</div><div class="s">${esc(t.members.map((m) => m.rsn).join(', ')) || 'No members yet'}</div></div>
        <div class="acts">
          <button class="btn small icon" type="button" data-action="team-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn small icon" type="button" data-action="team-down" data-i="${i}" ${i === ws.teams.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn small" type="button" data-action="team-edit" data-i="${i}">Edit</button>
          <button class="btn small danger" type="button" data-action="team-del" data-i="${i}">Delete</button>
        </div>
      </li>`;
    }).join('');
    return `<div class="card stack">
      <div class="row"><h2>Teams</h2><span class="spacer" style="flex:1"></span><button class="btn primary" type="button" data-action="team-add">+ Add team</button></div>
      <p class="muted" style="margin:0">Teams of 5–6 are expected. Team order here is only for display; the leaderboard ranks by progress.</p>
      ${ws.teams.length ? `<ul class="tile-rows">${rows}</ul>` : '<p class="muted">No teams yet.</p>'}
    </div>`;
  }

  function editTeam(i) {
    const isNew = i == null;
    const t = isNew ? { id: B.newId('team'), name: '', colour: TEAM_COLOURS[ws.teams.length % TEAM_COLOURS.length], members: [], currentTile: 0, progress: { count: 0, items: [] }, completions: [], finishedAt: null } : ws.teams[i];
    openModal(isNew ? 'New team' : 'Edit team', `<div class="form-grid">
        <label class="field"><span>Team name</span><input name="name" required maxlength="40" value="${esc(t.name)}"></label>
        <label class="field"><span>Colour</span><input type="color" name="colour" value="${esc(t.colour)}"></label>
        <label class="field full"><span>Members — one RSN per line</span><textarea name="members" rows="7">${esc(t.members.map((m) => m.rsn).join('\n'))}</textarea></label>
      </div>`, (f) => {
      const name = f.elements.name.value.trim();
      if (!name) return false;
      const members = f.elements.members.value.split('\n').map((s) => s.trim()).filter(Boolean).map((rsn) => ({ rsn }));
      mutate(isNew ? 'Add team' : 'Edit team', () => {
        const nt = Object.assign({}, t, { name, colour: f.elements.colour.value, members });
        if (isNew) ws.teams.push(nt); else ws.teams[i] = nt;
      });
      if (members.length < 5 || members.length > 6) toast(`Saved — note: ${members.length} members (expected 5–6)`);
    }, isNew ? 'Add team' : 'Save team');
  }

  // ----- Board tab -----
  function viewBoard() {
    const total = ws.board.length;
    const hours = totalHours(ws.board);
    const gs = ws.generator;
    const cap = gs.teamSize * gs.hoursPerDay * gs.days;
    const locked = lockedCount();
    const reveal = revealCount();
    const showIc = ws.prefs.showIcons;
    const bar = total && hours
      ? `<div class="tierbar" title="Each block is a tile, sized by estimated hours and coloured by tier">${ws.board.map((t) => `<span style="flex:${Math.max(0.2, Number(t.estHours) || 0.2)};background:var(--tier-${esc(t.tier)});border-right:1px solid var(--panel)"></span>`).join('')}</div>`
      : '';
    const rows = ws.board.map((t, i) => {
      const isLocked = i < locked;
      const here = ws.teams.filter((tm) => tm.currentTile === i && !tm.finishedAt);
      return `<li class="tile-row${i < reveal ? ' revealed' : ''}" data-i="${i}" draggable="${isLocked ? 'false' : 'true'}">
        <span class="handle" title="${isLocked ? 'Locked — a team has reached this tile' : 'Drag to reorder'}">${isLocked ? '🔒' : '⋮⋮'}</span>
        <span class="idx">${i + 1}</span>
        <span class="ic">${showIc ? B.iconHtml(t.icon, 'tile-icon sm') : ''}</span>
        <div class="main">
          <div class="t">${esc(t.title)}</div>
          <div class="s">${tierBadge(t.tier)} ${catBadge(t.category)} · ${t.items ? `${t.items.length} items` : `qty ${esc(qty(t, t.quantity))}`} · ~${esc(round1(Number(t.estHours) || 0))} team-h${t.requirements ? ` · ${esc(t.requirements)}` : ''}${i < reveal ? ' · <span class="status-ok">public</span>' : ''}${here.length ? ` · ${here.map((tm) => swatch(tm) + ' ' + esc(tm.name)).join(', ')}` : ''}</div>
        </div>
        <div class="acts">
          <button class="btn small icon" type="button" data-action="tile-up" data-i="${i}" ${isLocked || i <= locked ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn small icon" type="button" data-action="tile-down" data-i="${i}" ${isLocked || i === total - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn small" type="button" data-action="tile-edit" data-i="${i}">Edit</button>
          <button class="btn small" type="button" data-action="tile-dup" data-i="${i}">Duplicate</button>
          <button class="btn small danger" type="button" data-action="tile-del" data-i="${i}" ${isLocked ? 'disabled' : ''}>Delete</button>
        </div>
      </li>`;
    }).join('');
    const tierCounts = [1, 2, 3, 4, 5].map((n) => `${B.TIERS[n]} ${ws.board.filter((t) => Number(t.tier) === n).length}`).join(' · ');
    return `<div class="card stack">
      <div class="row"><h2>Board</h2><span style="flex:1"></span>
        <button class="btn primary" type="button" data-action="tile-add">+ New tile</button>
        <button class="btn" type="button" data-action="goto" data-tab="library">Add from library</button>
        <button class="btn" type="button" data-action="goto" data-tab="generator">Generate a board</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${total}</b><span>tiles</span></div>
        <div class="stat"><b>${round1(hours)}</b><span>est. team-hours</span></div>
        <div class="stat"><b>${round1(cap)}</b><span>team capacity (${esc(gs.teamSize)} × ${esc(gs.hoursPerDay)}h × ${esc(gs.days)}d)</span></div>
        <div class="stat"><b>${cap ? Math.round((hours / cap) * 100) : 0}%</b><span>of capacity</span></div>
      </div>
      ${bar}
      <div class="muted" style="font-size:.85rem">${tierCounts}. Capacity uses the Generator tab’s settings.</div>
      ${locked ? `<div class="warn">Tiles 1–${locked} are locked because a team has reached them. You can still edit their text, but not move or delete them.</div>` : ''}
      <div class="row">
        <label class="check" style="font-size:.88rem"><input type="checkbox" data-action="admin-icons"${showIc ? ' checked' : ''}> Show icons here (loads images from the Wiki)</label>
        <span style="flex:1"></span>
        ${total > locked ? `<button class="btn small danger" type="button" data-action="board-clear">Clear ${locked ? 'unlocked tiles' : 'board'}</button>` : ''}
      </div>
      ${total ? `<ol class="tile-rows" id="tile-rows">${rows}</ol>` : '<p class="muted">No tiles yet. Add tiles manually, pick them from the library, or use the generator.</p>'}
    </div>`;
  }

  function moveTile(from, to) {
    const locked = lockedCount();
    if (from < locked || to < locked || to < 0 || to >= ws.board.length || from === to) return;
    mutate('Reorder tiles', () => {
      const [t] = ws.board.splice(from, 1);
      ws.board.splice(to, 0, t);
    });
  }

  function wireDrag() {
    const list = $('tile-rows');
    if (!list) return;
    let from = null;
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.tile-row');
      if (!li || li.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
      from = Number(li.dataset.i);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(from)); } catch (err) { /* ignore */ }
    });
    list.addEventListener('dragend', () => {
      from = null;
      list.querySelectorAll('.tile-row').forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    list.addEventListener('dragover', (e) => {
      if (from == null) return;
      const li = e.target.closest('.tile-row');
      if (!li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      list.querySelectorAll('.tile-row').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      li.classList.add(after ? 'drop-after' : 'drop-before');
    });
    list.addEventListener('drop', (e) => {
      if (from == null) return;
      const li = e.target.closest('.tile-row');
      if (!li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      let to = Number(li.dataset.i) + (after ? 1 : 0);
      if (to > from) to -= 1;
      const f = from;
      from = null;
      moveTile(f, to);
    });
  }

  // ----- Library tab -----
  function viewLibrary() {
    const cats = B.CATEGORIES.map((c) => `<option value="${c.id}"${libQ.cat === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
    const tiers = [1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String(libQ.tier) === String(n) ? ' selected' : ''}>${B.TIERS[n]}</option>`).join('');
    return `<div class="card stack">
      <div class="row"><h2>Challenge library</h2><span style="flex:1"></span>
        <button class="btn primary" type="button" data-action="lib-new">+ New library challenge</button></div>
      <p class="muted" style="margin:0">${LIB.length} built-in challenges plus your own. Edits and hidden entries are saved in your workspace. Scalable challenges (marked ↕) have their quantity adjusted by the generator. <strong>Hour estimates are rough assumptions — tune them.</strong></p>
      <div class="row">
        <input type="search" placeholder="Search…" data-lib="q" value="${esc(libQ.q)}" style="flex:1;min-width:160px">
        <select data-lib="cat"><option value="">All categories</option>${cats}</select>
        <select data-lib="tier"><option value="">All tiers</option>${tiers}</select>
        <label class="check" style="font-size:.88rem"><input type="checkbox" data-lib="iron"${libQ.iron ? ' checked' : ''}> Iron-friendly only</label>
        <label class="check" style="font-size:.88rem"><input type="checkbox" data-lib="showHidden"${libQ.showHidden ? ' checked' : ''}> Show hidden</label>
      </div>
      <div id="lib-results">${libraryTable()}</div>
    </div>`;
  }

  function libraryTable() {
    const q = libQ.q.toLowerCase();
    const list = libraryEntries(libQ.showHidden).filter((e) =>
      (!libQ.cat || e.category === libQ.cat) &&
      (!libQ.tier || String(e.tier) === String(libQ.tier)) &&
      (!libQ.iron || e.ironOk !== false) &&
      (!q || `${e.title} ${e.description} ${e.requirements}`.toLowerCase().includes(q)));
    if (!list.length) return '<p class="muted">No challenges match.</p>';
    const rows = list.map((e) => `<tr class="${e._hidden ? 'is-hidden' : ''}">
      <td><strong>${esc(libDisplayTitle(e))}</strong>${e.scale ? ' <span title="Scalable — the generator adjusts the quantity">↕</span>' : ''}${e._custom ? ' <span class="badge">custom</span>' : ''}${e._edited ? ' <span class="badge">edited</span>' : ''}
        <div class="muted" style="font-size:.8rem">${esc(e.requirements || '')}${e.ironOk === false ? `${e.requirements ? ' · ' : ''}not iron-friendly` : ''}</div></td>
      <td class="hide-sm">${catBadge(e.category)}</td>
      <td>${tierBadge(e.tier)}</td>
      <td class="num">${esc(round1(e.estHours))}h</td>
      <td><div class="row" style="gap:3px;flex-wrap:nowrap">
        <button class="btn small primary" type="button" data-action="lib-add" data-id="${esc(e.id)}">Add</button>
        <button class="btn small" type="button" data-action="lib-edit" data-id="${esc(e.id)}">Edit</button>
        <button class="btn small" type="button" data-action="lib-hide" data-id="${esc(e.id)}">${e._hidden ? 'Unhide' : 'Hide'}</button>
        ${e._edited ? `<button class="btn small" type="button" data-action="lib-reset" data-id="${esc(e.id)}">Reset</button>` : ''}
        ${e._custom ? `<button class="btn small danger" type="button" data-action="lib-del" data-id="${esc(e.id)}">Delete</button>` : ''}
      </div></td>
    </tr>`).join('');
    return `<div class="muted" style="font-size:.85rem;margin-bottom:6px">${list.length} shown</div>
      <div class="table-wrap"><table class="lib-table"><thead><tr><th>Challenge</th><th class="hide-sm">Category</th><th>Tier</th><th>Est.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ----- Generator tab -----
  function viewGenerator() {
    const g = ws.generator;
    const cats = B.CATEGORIES.map((c) => `<label class="check" style="font-size:.9rem"><input type="checkbox" name="cat" value="${c.id}"${g.categories.includes(c.id) ? ' checked' : ''}> ${esc(c.label)}</label>`).join('');
    const { capacity, budget } = G.budgetFor(g);
    const locked = lockedCount();
    let results = '';
    if (gen) {
      const rows = gen.items.map((it, i) => `<li class="tile-row" style="grid-template-columns:34px 1fr auto">
        <span class="idx">${locked + i + 1}</span>
        <div class="main"><div class="t">${esc(it.tile.title)}</div>
          <div class="s">${tierBadge(it.tile.tier)} ${catBadge(it.tile.category)} · ~${esc(it.tile.estHours)} team-h <span class="muted">(target ${esc(round1(it.target))})</span>${it.tile.requirements ? ' · ' + esc(it.tile.requirements) : ''}</div></div>
        <div class="acts"><button class="btn small" type="button" data-action="gen-reroll" data-i="${i}">↻ Re-roll</button><button class="btn small danger" type="button" data-action="gen-remove" data-i="${i}">Remove</button></div>
      </li>`).join('');
      const tierCounts = [1, 2, 3, 4, 5].map((n) => `${B.TIERS[n]} ${gen.tierCounts[n] || 0}`).join(' · ');
      results = `<div class="card stack">
        <div class="row"><h2>Suggested board</h2><span style="flex:1"></span>
          <button class="btn" type="button" data-action="gen-run">↻ Re-roll all</button>
          <button class="btn primary" type="button" data-action="gen-apply" data-mode="replace">${locked ? `Replace tiles after ${locked}` : 'Replace board'}</button>
          <button class="btn" type="button" data-action="gen-apply" data-mode="append">Append to board</button>
        </div>
        <div class="stats">
          <div class="stat"><b>${gen.items.length}</b><span>tiles</span></div>
          <div class="stat"><b>${round1(gen.totalHours)}</b><span>est. team-hours</span></div>
          <div class="stat"><b>${round1(gen.budget)}</b><span>budget${locked ? ` for tiles ${locked + 1}+` : ''} (${esc(g.fill)}% of ${round1(gen.capacity)} overall)</span></div>
          <div class="stat"><b>${gen.capacity ? Math.round((gen.totalHours / gen.capacity) * 100) : 0}%</b><span>of team capacity</span></div>
        </div>
        <div class="tierbar">${gen.items.map((it) => `<span style="flex:${Math.max(0.2, it.tile.estHours)};background:var(--tier-${it.tile.tier});border-right:1px solid var(--panel)"></span>`).join('')}</div>
        <div class="muted" style="font-size:.85rem">${tierCounts} · drawn from ${gen.pool} eligible challenges. Everything goes into the normal editable board, so you can tweak or mix in manual tiles afterwards.</div>
        <ol class="tile-rows">${rows}</ol>
      </div>`;
    }
    return `<form class="card stack" data-form="generator">
      <h2>Board generator</h2>
      <p class="muted" style="margin:0">Builds a board whose estimated hours ramp up and roughly fill the event. Budget = team size × hours per player per day × days × fill%. Estimates are assumptions — check them against your clan’s pace.</p>
      <div class="form-grid">
        <label class="field"><span>Number of tiles</span><input type="number" name="tiles" min="3" max="100" value="${esc(g.tiles)}"></label>
        <label class="field"><span>Team size</span><input type="number" name="teamSize" min="1" max="20" value="${esc(g.teamSize)}"></label>
        <label class="field"><span>Event length (days)</span><input type="number" name="days" min="1" max="60" step="0.5" value="${esc(g.days)}"></label>
        <label class="field"><span>Active hours per player per day</span><input type="number" name="hoursPerDay" min="0.25" max="16" step="0.25" value="${esc(g.hoursPerDay)}"></label>
        <label class="field"><span>Fill % of capacity</span><input type="number" name="fill" min="20" max="150" step="5" value="${esc(g.fill)}"><span class="hint">Below 100% leaves slack for bad luck and downtime.</span></label>
        <label class="field"><span>Difficulty ramp</span><input type="number" name="ramp" min="1" max="30" step="0.5" value="${esc(g.ramp)}"><span class="hint">Last tile ≈ this many times longer than the first.</span></label>
        <label class="check full"><input type="checkbox" name="ironmen"${g.ironmen ? ' checked' : ''}> Ironmen are taking part (skip tiles that need the Grand Exchange or trading)</label>
        <div class="field full"><span>Categories to include</span><div class="row">${cats}</div></div>
      </div>
      <div class="row"><span class="muted" style="font-size:.88rem">Capacity ${round1(capacity)} team-hours → budget ${round1(budget)}${locked ? ` · tiles 1–${locked} are locked and kept; the generator fills tiles ${locked + 1}–${esc(g.tiles)}` : ''}</span><span style="flex:1"></span>
        <button type="submit" class="btn primary">Generate board</button></div>
    </form>${results}`;
  }

  function readGeneratorForm(f) {
    const n = (name, def) => { const v = parseFloat(f.elements[name].value); return isFinite(v) ? v : def; };
    const cats = [...f.querySelectorAll('input[name="cat"]:checked')].map((x) => x.value);
    return {
      tiles: Math.max(1, Math.min(100, Math.round(n('tiles', 25)))),
      teamSize: Math.max(1, n('teamSize', 5)),
      days: Math.max(0.5, n('days', 14)),
      hoursPerDay: Math.max(0.25, n('hoursPerDay', 2.5)),
      fill: Math.max(10, n('fill', 85)),
      ramp: Math.max(1, n('ramp', 8)),
      ironmen: f.elements.ironmen.checked,
      categories: cats.length ? cats : B.CATEGORIES.map((c) => c.id),
    };
  }

  /** Generator options; tiles teams have already reached are kept, so only the rest is generated. */
  function genOpts() {
    const locked = lockedCount();
    return Object.assign({}, ws.generator, { offset: Math.min(locked, Math.max(0, ws.generator.tiles - 1)) });
  }

  function runGenerator() {
    const pool = libraryEntries(false);
    gen = G.generate(pool, genOpts());
    if (!gen.items.length) toast('No eligible challenges — include more categories');
    render();
  }

  // ----- Progress tab -----
  function viewProgress() {
    if (!ws.teams.length) return '<div class="card">Add teams first (Teams tab).</div>';
    if (!ws.board.length) return '<div class="card">Build the board first (Board tab).</div>';
    const total = ws.board.length;
    const ranked = B.rankTeams(ws.teams);
    const cards = ranked.map(({ team: t, rank }) => {
      const cur = t.currentTile || 0;
      const tile = ws.board[cur];
      const done = t.completions || [];
      let body;
      if (t.finishedAt || cur >= total) {
        body = `<div class="finished-banner">Finished · ${esc(B.fmtDate(t.finishedAt, tz()))}</div>`;
      } else {
        const req = B.requiredFor(tile);
        const got = B.progressFor(t, tile);
        const progressControl = tile.items && tile.items.length
          ? `<div class="stack" style="gap:4px">${tile.items.map((it, k) => `<label class="check"><input type="checkbox" name="item" value="${k}"${(t.progress.items || []).includes(it) ? ' checked' : ''}> ${esc(it)}</label>`).join('')}</div>`
          : `<label class="field"><span>Official count (of ${esc(qty(tile, req))})</span><input type="number" name="count" min="0" max="${req}" value="${esc(Math.min(t.progress.count || 0, req))}"></label>`;
        const memberOpts = t.members.map((m) => `<option>${esc(m.rsn)}</option>`).join('');
        body = `<div class="tile-block"><div class="ic-box">${ws.prefs.showIcons ? B.iconHtml(tile.icon) : ''}</div>
            <div class="tile-main"><div><span class="muted">Tile ${cur + 1}/${total}</span> <strong>${esc(tile.title)}</strong></div>
            <div>${tierBadge(tile.tier)} ${catBadge(tile.category)} <span class="muted">· ${esc(qty(tile, got))}/${esc(qty(tile, req))}</span></div></div></div>
          <div class="grid2">
            <form class="card stack" data-form="progress" data-team="${esc(t.id)}">
              <h3>Partial progress</h3>
              ${progressControl}
              <label class="check" style="font-size:.88rem"><input type="checkbox" name="post" checked> Post to activity feed</label>
              <div class="row end"><button class="btn" type="submit">Save progress</button></div>
            </form>
            <form class="card stack" data-form="complete" data-team="${esc(t.id)}">
              <h3>Complete tile ${cur + 1}</h3>
              <label class="field"><span>Obtained by</span><select name="by"><option value="">— not recorded —</option>${memberOpts}<option value="__other">Other…</option></select></label>
              <label class="field hidden" data-other><span>Other RSN</span><input name="byOther"></label>
              <label class="field"><span>Completed at (${esc(tz())})</span><input type="datetime-local" name="at" value="${esc(nowInput())}"><span class="hint">Use the time of the submission, not when you verified it.</span></label>
              <label class="field"><span>Private note (optional)</span><input name="note"></label>
              <div class="row end"><button class="btn primary" type="submit">✔ Mark complete</button></div>
            </form>
          </div>`;
      }
      const recent = done.slice(-4).reverse().map((c) => `<li><span>${c.tileIndex + 1}. ${esc((ws.board[c.tileIndex] || {}).title || c.title || '')}${c.by ? ` — ${esc(c.by)}` : ''}</span><span class="when">${esc(B.fmtDate(c.at, tz()))}</span></li>`).join('');
      return `<div class="card team-admin stack" style="--c:${esc(t.colour)}">
        <div class="row">${swatch(t)}<h2 style="color:var(--text)">${esc(t.name)}</h2><span class="muted">${B.ordinal(rank)}</span><span style="flex:1"></span>
          ${done.length ? `<button class="btn small" type="button" data-action="revert" data-team="${esc(t.id)}">↩ Revert last completion</button>` : ''}
          <button class="btn small ghost" type="button" data-action="set-tile" data-team="${esc(t.id)}">Set tile…</button>
        </div>
        ${body}
        ${recent ? `<details><summary>Recent completions (${done.length} total)</summary><ul class="done-list">${recent}</ul></details>` : ''}
      </div>`;
    }).join('');

    const acts = ws.activity.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const shown = showAllActivity ? acts : acts.slice(0, 25);
    const teamOpts = ws.teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    const feed = shown.map((a) => {
      const t = teamById(a.teamId);
      return `<li><span class="when">${esc(B.fmtDate(a.at, tz()))}</span><span class="row" style="flex-wrap:nowrap;align-items:flex-start">${t ? swatch(t) : ''}<span style="flex:1">${esc(a.text)}</span><button class="btn small ghost" type="button" data-action="act-del" data-id="${esc(a.id)}" aria-label="Delete entry">✕</button></span></li>`;
    }).join('');
    return `${cards}
      <div class="card stack">
        <h2>Activity feed</h2>
        <form class="row" data-form="note">
          <select name="team"><option value="">No team</option>${teamOpts}</select>
          <input name="text" placeholder="Add an announcement or note…" style="flex:1;min-width:200px" required>
          <button class="btn" type="submit">Post</button>
        </form>
        ${acts.length ? `<ul class="feed">${feed}</ul>` : '<p class="muted">Nothing yet.</p>'}
        ${acts.length > 25 ? `<div><button class="btn small" type="button" data-action="act-more">${showAllActivity ? 'Show fewer' : `Show all ${acts.length}`}</button></div>` : ''}
      </div>`;
  }

  function saveProgress(f) {
    const t = teamById(f.dataset.team);
    const tile = t && ws.board[t.currentTile];
    if (!tile) return;
    const post = f.elements.post.checked;
    mutate('Update progress', () => {
      let text;
      if (tile.items && tile.items.length) {
        const idx = [...f.querySelectorAll('input[name="item"]:checked')].map((x) => Number(x.value));
        t.progress = { count: idx.length, items: idx.map((k) => tile.items[k]) };
        text = `${t.name}: ${t.progress.items.length ? 'got ' + t.progress.items.join(', ') : 'no items yet'} (${idx.length}/${tile.items.length}) on ${tile.title}`;
      } else {
        const req = B.requiredFor(tile);
        const n = Math.max(0, Math.min(req, parseInt(f.elements.count.value, 10) || 0));
        t.progress = { count: n, items: [] };
        text = `${t.name}: ${qty(tile, n)}/${qty(tile, req)} on ${tile.title}`;
      }
      if (post) {
        // Replace this team's previous progress post for the same tile, to keep the feed tidy.
        ws.activity = ws.activity.filter((a) => !(a.type === 'progress' && a.teamId === t.id && a.tileIndex === t.currentTile));
        addActivity({ teamId: t.id, type: 'progress', tileIndex: t.currentTile, text });
      }
    });
    toast('Progress saved');
  }

  function completeTile(f) {
    const t = teamById(f.dataset.team);
    if (!t) return;
    const idx = t.currentTile;
    const tile = ws.board[idx];
    if (!tile) return;
    let by = f.elements.by.value;
    if (by === '__other') by = f.elements.byOther.value.trim();
    const at = B.zonedInputToIso(f.elements.at.value, tz()) || new Date().toISOString();
    const note = f.elements.note.value.trim();
    mutate(`Complete tile ${idx + 1} for ${t.name}`, () => {
      const c = { id: B.newId('c'), tileIndex: idx, tileId: tile.id, title: tile.title, at, by: by || null, note };
      t.completions.push(c);
      t.completions.sort((a, b) => a.tileIndex - b.tileIndex);
      t.currentTile = idx + 1;
      t.progress = { count: 0, items: [] };
      ws.activity = ws.activity.filter((a) => !(a.type === 'progress' && a.teamId === t.id && a.tileIndex === idx));
      addActivity({ at, teamId: t.id, type: 'complete', tileIndex: idx, ref: c.id, text: `${t.name} completed tile ${idx + 1}: ${tile.title}${by ? ` (${by})` : ''}` });
      if (t.currentTile >= ws.board.length) {
        t.finishedAt = at;
        addActivity({ at, teamId: t.id, type: 'finish', ref: c.id, text: `${t.name} completed the final tile and finished the board!` });
      }
    });
    toast(`${t.name} → tile ${Math.min(t.currentTile + 1, ws.board.length)}${ws.live ? ' (remember to publish)' : ''}`);
  }

  function revertLast(teamId) {
    const t = teamById(teamId);
    if (!t || !t.completions.length) return;
    const c = t.completions[t.completions.length - 1];
    if (!confirm(`Revert ${t.name}'s completion of tile ${c.tileIndex + 1}? They go back to that tile.`)) return;
    mutate(`Revert completion for ${t.name}`, () => {
      t.completions.pop();
      t.currentTile = c.tileIndex;
      t.finishedAt = null;
      t.progress = { count: 0, items: [] };
      ws.activity = ws.activity.filter((a) => a.ref !== c.id);
    });
  }

  function setTileManually(teamId) {
    const t = teamById(teamId);
    if (!t) return;
    const total = ws.board.length;
    const f = openModal(`Set ${t.name}'s position`, `<div class="stack">
        <p class="muted" style="margin:0">Manual correction. Moving back removes later completions; moving forward records the skipped tiles as completed now.</p>
        <label class="field"><span>Current tile (1–${total}, or ${total + 1} = finished)</span><input type="number" name="tile" min="1" max="${total + 1}" value="${t.currentTile + 1}"></label>
      </div>`, (form) => {
      const n = Math.max(0, Math.min(total, (parseInt(form.elements.tile.value, 10) || 1) - 1));
      if (n === t.currentTile) return;
      mutate(`Set ${t.name} to tile ${n + 1}`, () => {
        const now = new Date().toISOString();
        if (n < t.currentTile) {
          const removed = t.completions.filter((c) => c.tileIndex >= n);
          const ids = new Set(removed.map((c) => c.id));
          t.completions = t.completions.filter((c) => c.tileIndex < n);
          ws.activity = ws.activity.filter((a) => !ids.has(a.ref));
        } else {
          for (let i = t.currentTile; i < n; i++) {
            t.completions.push({ id: B.newId('c'), tileIndex: i, tileId: ws.board[i].id, title: ws.board[i].title, at: now, by: null, note: 'Manual adjustment' });
          }
        }
        t.currentTile = n;
        t.progress = { count: 0, items: [] };
        t.finishedAt = n >= total ? now : null;
        addActivity({ at: now, teamId: t.id, type: 'note', text: `Host set ${t.name} to ${n >= total ? 'finished' : 'tile ' + (n + 1)}` });
      });
    }, 'Set position');
    f.elements.tile.select();
  }

  // ----- Publish tab -----
  function publicTile(t) {
    return {
      id: t.id, title: t.title, description: t.description || '', tier: Number(t.tier) || 1, category: t.category,
      quantity: B.requiredFor(t), items: t.items && t.items.length ? t.items : null, format: t.format || null,
      proof: t.proof || '', requirements: t.requirements || '', icon: t.icon || '',
    };
  }

  function buildPublic() {
    const ev = ws.event;
    const total = ws.board.length;
    const reveal = revealCount();
    return {
      schemaVersion: 1,
      lastUpdated: new Date().toISOString(),
      live: !!ws.live,
      event: {
        name: ev.name, description: ev.description, start: ev.start, end: ev.end, timezone: tz(),
        keyword: ws.live ? (ev.keyword || null) : null,
        host: { name: ev.host.name || '', discord: ev.host.discord || '', discordUserId: ev.host.discordUserId || '' },
        discordInvite: ev.discordInvite || '', submission: ev.submission || '', rules: ev.rules || [],
        showIcons: ev.showIcons !== false,
      },
      totalTiles: total,
      tiles: ws.board.slice(0, reveal).map(publicTile),
      teams: ws.teams.map((t) => ({
        id: t.id, name: t.name, colour: t.colour,
        members: t.members.map((m) => ({ rsn: m.rsn })),
        currentTile: Math.min(t.currentTile || 0, total),
        progress: { count: (t.progress && t.progress.count) || 0, items: (t.progress && t.progress.items) || [] },
        completions: (t.completions || []).map((c) => ({ tileIndex: c.tileIndex, tileId: c.tileId, at: c.at, by: c.by || null })),
        finishedAt: t.finishedAt || null,
      })),
      activity: ws.activity.slice()
        .filter((a) => a.tileIndex == null || a.tileIndex < Math.max(reveal, 0) || a.type === 'note')
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 300)
        .map((a) => ({ at: a.at, teamId: a.teamId || null, type: a.type, tileIndex: a.tileIndex != null ? a.tileIndex : null, text: a.text })),
    };
  }

  function checks() {
    const out = [];
    const ev = ws.event;
    const total = ws.board.length;
    if (!total) out.push(['bad', 'The board has no tiles.']);
    if (ws.teams.length < 2) out.push(['warn', `Only ${ws.teams.length} team(s) set up.`]);
    ws.teams.forEach((t) => {
      if (t.members.length < 5 || t.members.length > 6) out.push(['warn', `${t.name} has ${t.members.length} members (expected 5–6).`]);
    });
    if (!ev.start || !ev.end) out.push(['warn', 'Start and end dates aren’t set — the site will show “Dates TBC”.']);
    if (!ev.host.discord && !ev.host.name) out.push(['warn', 'No host Discord handle — players won’t know where to DM proof.']);
    ws.board.forEach((t, i) => { if (!String(t.title || '').trim()) out.push(['bad', `Tile ${i + 1} has no title.`]); });
    if (ws.live && !ev.keyword) out.push(['bad', 'The board is live but there’s no event keyword.']);
    if (!ws.live) out.push(['warn', 'Board is NOT live: the file will contain no tiles and no keyword (good for announcing teams before the start).']);
    else out.push(['good', `Tiles 1–${revealCount()} of ${total} will be public; ${total - revealCount()} stay hidden.`]);
    return out;
  }

  function viewPublish() {
    const pub = buildPublic();
    const json = JSON.stringify(pub, null, 2);
    const repo = ws.prefs.repo.trim();
    const branch = ws.prefs.branch.trim() || 'main';
    const uploadUrl = `https://github.com/${repo}/upload/${branch}/data`;
    const editUrl = `https://github.com/${repo}/edit/${branch}/data/event.json`;
    const actionsUrl = `https://github.com/${repo}/actions`;
    return `<div class="card stack">
        <h2>Publish</h2>
        <label class="check"><input type="checkbox" data-action="live-toggle"${ws.live ? ' checked' : ''}> <strong>Board is live</strong> — publish revealed tiles and the keyword</label>
        <ul class="warns">${checks().map(([lvl, msg]) => `<li class="warn ${lvl === 'bad' ? 'bad' : lvl === 'good' ? 'good' : ''}">${esc(msg)}</li>`).join('')}</ul>
        <div class="row">
          <button class="btn" type="button" data-action="preview">Preview public site</button>
          <button class="btn primary" type="button" data-action="download">⬇ Download event.json</button>
          <button class="btn" type="button" data-action="copy">Copy JSON</button>
          <span class="muted" style="font-size:.85rem">${(json.length / 1024).toFixed(1)} KB</span>
        </div>
        <h3>Committing it on GitHub</h3>
        <ol class="steps">
          <li><strong>Upload:</strong> click <em>Download event.json</em>, open <a href="${esc(uploadUrl)}" target="_blank" rel="noopener">${esc(repo)} › upload to /data</a>, drag the file in (it replaces the old one) and press <em>Commit changes</em>.</li>
          <li><strong>Or paste:</strong> click <em>Copy JSON</em>, open <a href="${esc(editUrl)}" target="_blank" rel="noopener">data/event.json in the web editor</a>, select everything (Ctrl+A), paste (Ctrl+V) and press <em>Commit changes</em>.</li>
          <li>GitHub Pages redeploys in about a minute (progress under <a href="${esc(actionsUrl)}" target="_blank" rel="noopener">Actions</a>). The public site re-checks every 5 minutes, or players can press Refresh.</li>
        </ol>
        <div class="form-grid">
          <label class="field"><span>GitHub repo (owner/name)</span><input data-pref="repo" value="${esc(repo)}"></label>
          <label class="field"><span>Branch</span><input data-pref="branch" value="${esc(branch)}"></label>
        </div>
        <details><summary>Show generated JSON</summary><pre class="json">${esc(json)}</pre></details>
      </div>
      <div class="card stack">
        <h2>Backup &amp; restore</h2>
        <p class="muted" style="margin:0">Your workspace (full board, hidden tiles, notes, library edits) exists only in this browser. Export a backup after every session, and to move to another computer.</p>
        <div class="row">
          <button class="btn primary" type="button" data-action="export">⬇ Export workspace backup</button>
          <label class="btn">⬆ Import backup<input type="file" accept="application/json,.json" data-action="import" hidden></label>
          <button class="btn" type="button" data-action="import-live">Load teams &amp; progress from live event.json</button>
          <button class="btn danger" type="button" data-action="reset">Reset workspace</button>
        </div>
        <p class="muted" style="margin:0;font-size:.85rem"><em>Load from live event.json</em> copies event settings, teams, progress and activity from the published file, keeping your local board. Handy on a new computer (the published file never contains hidden tiles, so restore a backup for those) or to try the admin with the sample data.</p>
      </div>`;
  }

  function preview() {
    const payload = buildPublic();
    B.store.set('preview', payload);
    const w = window.open('index.html?preview=1', 'bingus-preview');
    const handler = (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'bingus-preview-ready') return;
      try { (w || e.source).postMessage({ type: 'bingus-preview', payload }, location.origin); } catch (err) { /* ignore */ }
    };
    window.addEventListener('message', handler);
    setTimeout(() => window.removeEventListener('message', handler), 60000);
    if (!w) toast('Pop-up blocked — allow pop-ups for this site to preview');
  }

  async function importLive() {
    let d;
    try {
      const res = await fetch('data/event.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      d = await res.json();
    } catch (e) {
      toast('Could not load data/event.json: ' + e.message);
      return;
    }
    if (!confirm('Replace event settings, teams, progress and activity with the published event.json? Your local board is kept (published tiles missing from it are added).')) return;
    mutate('Load from live event.json', () => {
      ws.event = migrate({ event: d.event }).event;
      if (!ws.event.rules || !ws.event.rules.length) ws.event.rules = DEFAULT_RULES.slice();
      ws.live = !!d.live;
      ws.teams = (d.teams || []).map((t) => Object.assign({}, t, {
        completions: (t.completions || []).map((c) => Object.assign({ id: B.newId('c') }, c)),
        progress: t.progress || { count: 0, items: [] },
      }));
      ws.activity = (d.activity || []).map((a) => Object.assign({ id: B.newId('a') }, a));
      // Link activity to completions so "revert" can remove them.
      for (const a of ws.activity) {
        if (a.type !== 'complete' && a.type !== 'finish') continue;
        const t = teamById(a.teamId);
        const c = t && t.completions.find((x) => (a.type === 'finish' ? x.tileIndex === t.completions.length - 1 : x.tileIndex === a.tileIndex));
        if (c) a.ref = c.id;
      }
      (d.tiles || []).forEach((pt, i) => {
        if (ws.board.some((t) => t.id === pt.id)) return;
        const tile = Object.assign({ estHours: 0, notes: '' }, pt, { items: pt.items && pt.items.length ? pt.items : null });
        ws.board.splice(Math.min(i, ws.board.length), 0, tile);
      });
      if (d.totalTiles && ws.board.length < d.totalTiles) {
        toast(`Note: the published board has ${d.totalTiles} tiles but only ${d.tiles.length} are public. Restore a backup or add the rest.`);
      }
    });
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast('That file isn’t valid JSON'); return; }
      const w = obj && obj.type === 'bingus-workspace' ? obj.workspace : obj;
      if (!w || !Array.isArray(w.board) || !w.event) { toast('That doesn’t look like a workspace backup'); return; }
      if (!confirm('Replace your current workspace with this backup? (You can undo.)')) return;
      mutate('Import backup', () => { ws = migrate(w); });
      toast('Backup restored');
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  function afterRender() {
    if (tab === 'board') wireDrag();
  }

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    B.store.set('adminTab', tab);
    render();
  });

  const actions = {
    goto: (el) => { tab = el.dataset.tab; B.store.set('adminTab', tab); render(); },
    'team-add': () => editTeam(null),
    'team-edit': (el) => editTeam(Number(el.dataset.i)),
    'team-del': (el) => {
      const t = ws.teams[Number(el.dataset.i)];
      if (!confirm(`Delete team "${t.name}" and its progress?`)) return;
      mutate('Delete team', () => {
        ws.teams.splice(Number(el.dataset.i), 1);
        ws.activity = ws.activity.filter((a) => a.teamId !== t.id);
      });
    },
    'team-up': (el) => { const i = Number(el.dataset.i); mutate('Reorder teams', () => { const [t] = ws.teams.splice(i, 1); ws.teams.splice(i - 1, 0, t); }); },
    'team-down': (el) => { const i = Number(el.dataset.i); mutate('Reorder teams', () => { const [t] = ws.teams.splice(i, 1); ws.teams.splice(i + 1, 0, t); }); },
    'tile-add': () => editBoardTile(null),
    'tile-edit': (el) => editBoardTile(Number(el.dataset.i)),
    'tile-up': (el) => moveTile(Number(el.dataset.i), Number(el.dataset.i) - 1),
    'tile-down': (el) => moveTile(Number(el.dataset.i), Number(el.dataset.i) + 1),
    'tile-dup': (el) => {
      const i = Number(el.dataset.i);
      mutate('Duplicate tile', () => {
        const copy = JSON.parse(JSON.stringify(ws.board[i]));
        copy.id = B.newId('t');
        ws.board.splice(Math.max(i + 1, lockedCount()), 0, copy);
      });
    },
    'tile-del': (el) => {
      const i = Number(el.dataset.i);
      if (i < lockedCount()) return;
      mutate(`Delete tile ${i + 1}`, () => { ws.board.splice(i, 1); });
    },
    'board-clear': () => {
      const locked = lockedCount();
      if (!confirm(locked ? `Delete tiles ${locked + 1}–${ws.board.length}?` : 'Delete every tile on the board?')) return;
      mutate('Clear board', () => { ws.board.splice(locked); });
    },
    'admin-icons': (el) => mutate('Toggle admin icons', () => { ws.prefs.showIcons = el.checked; }),
    'lib-new': () => editLibraryEntry(null),
    'lib-edit': (el) => editLibraryEntry(el.dataset.id),
    'lib-add': (el) => {
      const e = libraryEntries(true).find((x) => x.id === el.dataset.id);
      if (!e) return;
      mutate('Add tile from library', () => { ws.board.push(G.libToTile(e)); });
      toast(`Added “${libDisplayTitle(e)}” as tile ${ws.board.length}`);
    },
    'lib-hide': (el) => {
      const id = el.dataset.id;
      mutate('Hide/unhide challenge', () => {
        const h = new Set(ws.library.hidden);
        if (h.has(id)) h.delete(id); else h.add(id);
        ws.library.hidden = [...h];
      });
    },
    'lib-reset': (el) => mutate('Reset challenge', () => { delete ws.library.overrides[el.dataset.id]; }),
    'lib-del': (el) => {
      if (!confirm('Delete this custom challenge from your library?')) return;
      mutate('Delete custom challenge', () => { ws.library.custom = ws.library.custom.filter((x) => x.id !== el.dataset.id); });
    },
    'gen-run': () => runGenerator(),
    'gen-reroll': (el) => {
      if (!G.reroll(libraryEntries(false), gen, Number(el.dataset.i), genOpts())) toast('No other suitable challenge found');
      render();
    },
    'gen-remove': (el) => { gen.items.splice(Number(el.dataset.i), 1); G.summarise(gen, genOpts()); render(); },
    'gen-apply': (el) => {
      if (!gen || !gen.items.length) return;
      const locked = lockedCount();
      const replace = el.dataset.mode === 'replace';
      if (replace && ws.board.length > locked && !confirm(`Replace ${ws.board.length - locked} existing tile(s) with the ${gen.items.length} suggested tiles?`)) return;
      mutate(replace ? 'Apply generated board' : 'Append generated tiles', () => {
        if (replace) ws.board.splice(locked);
        ws.board.push(...gen.items.map((it) => Object.assign({}, it.tile, { id: B.newId('t') })));
      });
      toast('Board updated');
      tab = 'board';
      B.store.set('adminTab', tab);
      render();
    },
    revert: (el) => revertLast(el.dataset.team),
    'set-tile': (el) => setTileManually(el.dataset.team),
    'act-del': (el) => mutate('Delete activity entry', () => { ws.activity = ws.activity.filter((a) => a.id !== el.dataset.id); }),
    'act-more': () => { showAllActivity = !showAllActivity; render(); },
    'live-toggle': (el) => {
      if (el.checked && !ws.event.keyword && !confirm('No event keyword is set yet. Go live anyway?')) { el.checked = false; return; }
      mutate(el.checked ? 'Set board live' : 'Set board not live', () => { ws.live = el.checked; });
    },
    preview: () => preview(),
    download: () => { download('event.json', JSON.stringify(buildPublic(), null, 2) + '\n'); toast('event.json downloaded — now commit it to /data'); },
    copy: async () => { toast((await copyText(JSON.stringify(buildPublic(), null, 2) + '\n')) ? 'JSON copied' : 'Copy failed — use Download instead'); },
    export: () => {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      download(`bingus-workspace-${stamp}.json`, JSON.stringify({ type: 'bingus-workspace', version: 1, exportedAt: new Date().toISOString(), workspace: ws }, null, 2));
      toast('Backup downloaded');
    },
    'import-live': () => importLive(),
    reset: () => {
      if (!confirm('Reset the workspace to empty? Export a backup first if you might need it. (You can undo until you close this tab.)')) return;
      mutate('Reset workspace', () => { ws = defaults(); });
    },
  };

  $('view').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el);
  });

  $('view').addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('input[type="checkbox"][data-action]')) { const fn = actions[el.dataset.action]; if (fn) fn(el); return; }
    if (el.matches('input[type="file"][data-action="import"]')) { if (el.files[0]) importBackup(el.files[0]); el.value = ''; return; }
    if (el.matches('select[name="by"]')) {
      const other = el.closest('form').querySelector('[data-other]');
      other.classList.toggle('hidden', el.value !== '__other');
      return;
    }
    if (el.matches('[data-pref]')) {
      mutate('Change GitHub settings', () => { ws.prefs[el.dataset.pref] = el.value.trim(); });
      return;
    }
    if (el.matches('[data-lib]')) { updateLibFilter(el); }
  });

  $('view').addEventListener('input', (e) => {
    if (e.target.matches('input[type="search"][data-lib]')) updateLibFilter(e.target);
  });

  function updateLibFilter(el) {
    const k = el.dataset.lib;
    libQ[k] = el.type === 'checkbox' ? el.checked : el.value;
    const box = $('lib-results');
    if (box) box.innerHTML = libraryTable();
  }

  $('view').addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.form;
    if (kind === 'event') saveEventForm(f);
    else if (kind === 'progress') saveProgress(f);
    else if (kind === 'complete') completeTile(f);
    else if (kind === 'note') {
      const text = f.elements.text.value.trim();
      if (!text) return;
      mutate('Post note', () => addActivity({ teamId: f.elements.team.value || null, type: 'note', text }));
    } else if (kind === 'generator') {
      const opts = readGeneratorForm(f);
      ws.generator = opts;
      save();
      runGenerator();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || $('modal').open) return;
      e.preventDefault();
      undo();
    }
  });

  $('undo').addEventListener('click', undo);

  const sharedPrefs = () => Object.assign({ theme: 'dark' }, B.store.get('prefs', {}));
  function syncThemeButton() { $('theme').textContent = sharedPrefs().theme === 'light' ? 'Dark mode' : 'Light mode'; }
  $('theme').addEventListener('click', () => {
    const p = sharedPrefs();
    p.theme = p.theme === 'light' ? 'dark' : 'light';
    B.store.set('prefs', p);
    B.applyTheme(p.theme);
    syncThemeButton();
  });
  syncThemeButton();

  window.addEventListener('beforeunload', (e) => {
    if ((!STORAGE_OK || saveFailed) && undoStack.length) { e.preventDefault(); e.returnValue = ''; }
  });

  setInterval(renderStatus, 30000);
  render();
})();
