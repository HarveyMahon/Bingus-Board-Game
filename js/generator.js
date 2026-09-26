/*
 * generator.js — builds a balanced board from the challenge library.
 *
 * How it works
 *   budget  = team size × active hours per player per day × days × fill%
 *   Each position i gets a target number of team-hours that ramps up along the board
 *   (weight 1 at the start → `ramp` at the end), and the targets add up to the budget.
 *   For each position the generator scores every unused library entry on:
 *     • how close its hours are to the target (scalable entries pick a fitting quantity)
 *     • how close its tier is to the tier implied by the target
 *     • avoiding the same category as the previous tiles, and overall category balance
 *     • avoiding the same "group" (e.g. Zulrah KC + Zulrah unique) twice on one board
 *   plus a little randomness, then picks the best.
 *
 * All hour figures are ASSUMPTIONS TO TUNE (see library.js).
 */
(function () {
  'use strict';
  const B = window.Bingus;

  const round1 = (x) => Math.round(x * 10) / 10;

  /** Best quantity and hours for an entry given a target number of team-hours. */
  function fit(entry, target) {
    if (entry.scale) {
      const s = entry.scale;
      const raw = target / s.perUnit;
      // Round to a "nice" granularity so quantities read well (e.g. 2,000 not 2,100).
      let g = s.step;
      const mults = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
      for (const m of mults) { g = s.step * m; if (raw / g <= 20) break; }
      let q = Math.round(raw / g) * g;
      q = Math.min(s.max, Math.max(s.min, q));
      return { qty: q, hours: q * s.perUnit };
    }
    return { qty: entry.quantity || 1, hours: entry.estHours };
  }

  /** Turn a library entry into a board tile. */
  function libToTile(entry, qty) {
    const scalable = !!entry.scale;
    const q = qty != null ? qty : entry.quantity;
    const hours = scalable ? q * entry.scale.perUnit : entry.estHours;
    const items = Array.isArray(entry.items) && entry.items.length ? entry.items.slice() : null;
    return {
      id: B.newId('t'),
      libraryId: entry.id,
      title: scalable ? B.renderTemplate(entry.title, q, entry.format) : entry.title,
      description: scalable ? B.renderTemplate(entry.description || '', q, entry.format) : (entry.description || ''),
      tier: scalable ? B.hoursToTier(hours) : entry.tier,
      category: entry.category,
      quantity: items ? items.length : q,
      items,
      format: entry.format || null,
      estHours: round1(hours),
      proof: entry.proof || B.DEFAULT_PROOF[entry.category] || '',
      requirements: entry.requirements || '',
      icon: entry.icon || '',
      notes: '',
      // Kept so the tile editor can re-scale the title/hours when the quantity changes.
      titleTemplate: scalable ? entry.title : null,
      descTemplate: scalable ? (entry.description || '') : null,
      perUnit: scalable ? entry.scale.perUnit : null,
    };
  }

  function budgetFor(opts) {
    const capacity = opts.teamSize * opts.hoursPerDay * opts.days;
    return { capacity, budget: capacity * (opts.fill / 100) };
  }

  function targetsFor(opts) {
    const n = Math.max(1, opts.tiles | 0);
    const { budget } = budgetFor(opts);
    const ramp = Math.max(1, Number(opts.ramp) || 1);
    const w = [];
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 1 : i / (n - 1);
      w.push(1 + (ramp - 1) * Math.pow(x, 1.4));
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((wi) => (budget * wi) / sum);
  }

  function filterPool(library, opts) {
    const cats = new Set(opts.categories && opts.categories.length ? opts.categories : B.CATEGORIES.map((c) => c.id));
    return library.filter((e) => cats.has(e.category) && (!opts.ironmen || e.ironOk !== false));
  }

  function scoreEntry(entry, ctx) {
    const { qty, hours } = fit(entry, ctx.target);
    if (!(hours > 0)) return null;
    const tier = entry.scale ? B.hoursToTier(hours) : entry.tier;
    let s = Math.abs(Math.log(hours / ctx.target));
    s += 0.25 * Math.abs(tier - B.hoursToTier(ctx.target));
    if (ctx.adjacent.includes(entry.category)) s += 3; // never side by side if avoidable
    s += 0.5 * ctx.near.filter((c) => c === entry.category).length; // soft: avoid clusters
    s += 0.8 * ((ctx.catCounts[entry.category] || 0) / ctx.fairShare); // overall balance
    if (entry.group && ctx.groups.has(entry.group)) s += 2.5;
    if (entry.scale) s += 0.3; // scalable tiles always fit; nudge toward fixed "get the drop" tiles
    s += Math.random() * 0.45; // variety
    return { entry, qty, hours, tier, score: s };
  }

  function pick(pool, ctx) {
    let best = null;
    for (const e of pool) {
      if (ctx.used.has(e.id)) continue;
      const r = scoreEntry(e, ctx);
      if (r && (!best || r.score < best.score)) best = r;
    }
    return best;
  }

  function contextFor(items, i, target, n, nCats) {
    const cat = (k) => (items[k] && items[k].tile ? items[k].tile.category : null);
    const used = new Set();
    const groups = new Set();
    const catCounts = {};
    items.forEach((it, k) => {
      if (!it || k === i) return;
      if (it.tile.libraryId) used.add(it.tile.libraryId);
      if (it.group) groups.add(it.group);
      catCounts[it.tile.category] = (catCounts[it.tile.category] || 0) + 1;
    });
    return {
      target,
      used,
      groups,
      catCounts,
      fairShare: Math.max(1, n / nCats),
      adjacent: [cat(i - 1), cat(i + 1)].filter(Boolean),
      near: [cat(i - 2), cat(i - 3), cat(i + 2), cat(i + 3)].filter(Boolean),
    };
  }

  /**
   * Generate a board.
   * opts: { tiles, teamSize, days, hoursPerDay, ironmen, categories[], fill (%), ramp, offset? }
   * Returns { items: [{ tile, target, group }], ...summary }
   */
  function generate(library, opts) {
    const pool = filterPool(library, opts);
    // opts.offset = number of tiles already fixed at the start of the board (e.g. tiles teams
    // have reached). Only the remaining positions of the full ramp are generated.
    const targets = targetsFor(opts).slice(Math.max(0, opts.offset | 0));
    const n = targets.length;
    const nCats = new Set(pool.map((e) => e.category)).size || 1;
    const items = [];
    for (let i = 0; i < n; i++) {
      const ctx = contextFor(items, i, targets[i], n, nCats);
      const r = pick(pool, ctx);
      if (!r) break; // library exhausted
      items.push({ tile: libToTile(r.entry, r.qty), target: targets[i], group: r.entry.group || null });
    }
    return summarise({ items, pool: pool.length }, opts);
  }

  /** Replace the tile at index i with a different suitable entry. */
  function reroll(library, result, i, opts) {
    const pool = filterPool(library, opts);
    const n = result.items.length;
    const nCats = new Set(pool.map((e) => e.category)).size || 1;
    const current = result.items[i];
    const ctx = contextFor(result.items, i, current.target, n, nCats);
    if (current.tile.libraryId) ctx.used.add(current.tile.libraryId);
    const r = pick(pool, ctx);
    if (!r) return false;
    result.items[i] = { tile: libToTile(r.entry, r.qty), target: current.target, group: r.entry.group || null };
    summarise(result, opts);
    return true;
  }

  function summarise(result, opts) {
    const { capacity, budget } = budgetFor(opts);
    result.capacity = capacity;
    result.budget = opts.offset ? targetsFor(opts).slice(opts.offset).reduce((a, b) => a + b, 0) : budget;
    result.totalHours = result.items.reduce((a, it) => a + (Number(it.tile.estHours) || 0), 0);
    result.tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result.catCounts = {};
    for (const it of result.items) {
      result.tierCounts[it.tile.tier] = (result.tierCounts[it.tile.tier] || 0) + 1;
      result.catCounts[it.tile.category] = (result.catCounts[it.tile.category] || 0) + 1;
    }
    return result;
  }

  window.BingusGenerator = { generate, reroll, libToTile, fit, targetsFor, budgetFor, summarise };
})();
