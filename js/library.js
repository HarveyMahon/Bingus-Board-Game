/*
 * library.js — built-in challenge library used by the admin page and the board generator.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ALL TIME ESTIMATES HERE ARE ASSUMPTIONS TO TUNE.                         │
 * │ estHours = estimated TEAM-HOURS: the total player-hours (summed across   │
 * │ the team) that a competent mid-to-high level team needs on average,      │
 * │ based on approximate drop rates and kill/XP rates. Luck varies wildly.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Entry fields
 *   id            unique, stable id
 *   category      boss | kc | xp | clues | skilling | minigame | clog | other
 *   title         may contain {qty} for scalable entries
 *   description   may contain {qty}
 *   tier          1–5 (Easy → Master); for scalable entries it is recalculated from hours
 *   quantity      how many are needed (for "items" tiles = number of items)
 *   items         optional list of specific things that each need ticking off
 *   estHours      estimated team-hours for `quantity`
 *   scale         optional { perUnit, min, max, step } — the generator picks a quantity that
 *                 fits its time budget; perUnit = team-hours per 1 unit (kill, XP point, clue…)
 *   format        'xp' or 'gp' for big numbers (1.5M)
 *   requirements  notable requirements (quests, levels) — shown to players
 *   ironOk        false if the tile relies on the Grand Exchange / trading (excluded when
 *                 ironmen are allowed). Defaults to true.
 *   icon          OSRS Wiki item/file name (turned into a static image URL, never an API call)
 *   group         optional: entries sharing a group are not both picked by the generator
 */
(function () {
  'use strict';

  const H = (x) => Math.round(x * 100) / 100;

  /** Scalable entry. range = [min, max, step, base] */
  function scaled(category, id, title, description, perUnit, range, extra) {
    const [min, max, step, base] = range;
    return Object.assign({
      id, category, title, description,
      quantity: base,
      estHours: H(base * perUnit),
      scale: { perUnit, min, max, step },
    }, extra || {});
  }

  /** Fixed entry. */
  function fixed(category, id, tier, estHours, title, description, extra) {
    return Object.assign({ id, category, tier, estHours, title, description, quantity: 1 }, extra || {});
  }

  // ---------------------------------------------------------------------------
  // Kill count (scalable). perUnit = team-hours per kill (group content counts every player).
  // ---------------------------------------------------------------------------
  const kc = (id, boss, perUnit, range, extra) => scaled('kc', 'kc-' + id,
    `Get {qty} ${boss} kills`,
    `Team total of {qty} ${boss} kills gained during the event.`,
    perUnit, range, Object.assign({ group: id }, extra || {}));

  const KC = [
    kc('zulrah', 'Zulrah', 0.03, [25, 400, 25, 100], { requirements: 'Regicide', icon: "Zulrah's scales" }),
    kc('vorkath', 'Vorkath', 0.04, [25, 400, 25, 75], { requirements: 'Dragon Slayer II', icon: "Vorkath's head" }),
    kc('mole', 'Giant Mole', 0.025, [20, 300, 10, 50], { icon: 'Mole claw' }),
    kc('sarachnis', 'Sarachnis', 0.025, [20, 300, 10, 50], { icon: 'Sarachnis cudgel' }),
    kc('kbd', 'King Black Dragon', 0.025, [20, 300, 10, 50], { icon: 'KBD heads' }),
    kc('kq', 'Kalphite Queen', 0.05, [10, 200, 5, 25], { icon: 'KQ head' }),
    kc('scurrius', 'Scurrius', 0.02, [20, 300, 10, 50], { icon: 'Scurrius spine' }),
    kc('dks', 'Dagannoth King (any)', 0.04, [30, 600, 30, 90], { icon: 'Berserker ring' }),
    kc('gwd', 'God Wars Dungeon general (any)', 0.08, [10, 300, 10, 40], { icon: 'Bandos chestplate' }),
    kc('cerberus', 'Cerberus', 0.025, [20, 400, 10, 50], { requirements: '91 Slayer', icon: 'Primordial crystal' }),
    kc('hydra', 'Alchemical Hydra', 0.04, [20, 300, 10, 50], { requirements: '95 Slayer', icon: "Hydra's claw" }),
    kc('kraken', 'Kraken', 0.012, [50, 800, 50, 150], { requirements: '87 Slayer', icon: 'Kraken tentacle' }),
    kc('thermy', 'Thermonuclear smoke devil', 0.012, [50, 800, 50, 150], { requirements: '93 Slayer', icon: 'Occult necklace' }),
    kc('sire', 'Abyssal Sire', 0.05, [10, 200, 10, 30], { requirements: '85 Slayer', icon: 'Unsired' }),
    kc('gg', 'Grotesque Guardians', 0.033, [20, 300, 10, 50], { requirements: '75 Slayer', icon: 'Granite gloves' }),
    kc('muspah', 'Phantom Muspah', 0.055, [10, 200, 10, 30], { requirements: 'Secrets of the North', icon: 'Venator shard' }),
    kc('wildy', 'Wilderness boss (Callisto/Artio, Vet’ion/Calvar’ion, Venenatis/Spindel)', 0.025, [20, 400, 10, 50], { icon: 'Claws of callisto', requirements: 'Wilderness — bring only what you can lose' }),
    kc('chaosele', 'Chaos Elemental', 0.025, [20, 300, 10, 50], { icon: 'Dragon pickaxe', requirements: 'Wilderness' }),
    kc('corp', 'Corporeal Beast', 0.6, [3, 60, 1, 10], { icon: 'Spirit shield', requirements: 'Summer’s End not required; best done as a group' }),
    kc('nex', 'Nex', 0.5, [3, 60, 1, 10], { icon: 'Zaryte vambraces', requirements: 'The Frozen Door; high combat stats; group' }),
    kc('zalcano', 'Zalcano', 0.05, [10, 300, 10, 50], { requirements: 'Song of the Elves', icon: 'Crystal tool seed' }),
    kc('gauntlet', 'Gauntlet', 0.13, [5, 100, 5, 15], { requirements: 'Song of the Elves', icon: 'Crystal armour seed', title: 'Complete the Gauntlet {qty} times', description: 'Team total of {qty} (normal) Gauntlet completions.' }),
    kc('cg', 'Corrupted Gauntlet', 0.18, [3, 80, 1, 10], { requirements: 'Song of the Elves; high stats', icon: 'Enhanced crystal weapon seed', title: 'Complete the Corrupted Gauntlet {qty} times', description: 'Team total of {qty} Corrupted Gauntlet completions.' }),
    kc('cox', 'Chambers of Xeric', 1.2, [1, 40, 1, 6], { icon: 'Dexterous prayer scroll', requirements: 'Raids knowledge', title: 'Complete {qty} Chambers of Xeric raid{s}', description: 'Team total of {qty} Chambers of Xeric completions (each player in a raid counts it once per raid).' }),
    kc('toa', 'Tombs of Amascut', 1.0, [1, 40, 1, 8], { icon: "Osmumten's fang", requirements: 'Beneath Cursed Sands', title: 'Complete {qty} Tombs of Amascut raid{s} (150+ invocation)', description: 'Team total of {qty} ToA completions at 150 invocation or higher.' }),
    kc('tob', 'Theatre of Blood', 1.8, [1, 30, 1, 4], { icon: 'Avernic defender hilt', requirements: 'High stats; 3–5 player group', title: 'Complete {qty} Theatre of Blood raid{s}', description: 'Team total of {qty} Theatre of Blood completions.' }),
    kc('dt2', 'Desert Treasure II boss (any, non-awakened)', 0.05, [10, 300, 10, 30], { requirements: 'Desert Treasure II', icon: 'Chromium ingot' }),
    kc('moons', 'Moons of Peril', 0.25, [5, 100, 5, 15], { requirements: 'Perilous Moons', icon: 'Blood moon chestplate', title: 'Loot {qty} Moons of Peril reward chests', description: 'Team total of {qty} Moons of Peril reward chests.' }),
    kc('td', 'Tormented Demon', 0.02, [25, 500, 25, 100], { requirements: 'While Guthix Sleeps', icon: 'Tormented synapse' }),
    kc('araxxor', 'Araxxor', 0.05, [10, 300, 10, 30], { requirements: '92 Slayer', icon: 'Araxyte fang' }),
    kc('hueycoatl', 'Hueycoatl', 0.1, [5, 150, 5, 20], { requirements: 'The Heart of Darkness', icon: 'Hueycoatl hide' }),
    kc('shamans', 'Lizardman shaman', 0.005, [100, 5000, 100, 500], { icon: 'Dragon warhammer' }),
    kc('barrows', 'Barrows', 0.17, [5, 150, 5, 20], { icon: "Dharok's helm", title: 'Loot {qty} Barrows chests', description: 'Team total of {qty} Barrows chests looted.' }),
    kc('fightcaves', 'Fight Caves (TzTok-Jad)', 1.5, [1, 15, 1, 3], { icon: 'Fire cape', title: 'Complete the Fight Caves {qty} time{s}', description: 'Team total of {qty} Fight Caves completions (fire capes).' }),
    kc('obor', 'Obor', 0.15, [3, 50, 1, 5], { icon: 'Hill giant club', requirements: 'Giant keys (from Hill Giants)' }),
    kc('bryophyta', 'Bryophyta', 0.15, [3, 50, 1, 5], { icon: "Bryophyta's essence", requirements: 'Mossy keys (from Moss giants)' }),
  ];

  // ---------------------------------------------------------------------------
  // XP (scalable). perM = team-hours per 1,000,000 XP at typical efficient methods.
  // ---------------------------------------------------------------------------
  const xp = (id, skill, perM, extra) => scaled('xp', 'xp-' + id,
    `Gain {qty} ${skill} XP`,
    `Team total of {qty} ${skill} XP gained during the event.`,
    perM / 1e6, [250000, 20000000, 250000, 1000000], Object.assign({ format: 'xp', group: 'xp-' + id }, extra || {}));

  const XP = [
    xp('melee', 'melee', 10, { icon: 'Attack icon', title: 'Gain {qty} melee XP', description: 'Team total of {qty} Attack, Strength and Defence XP gained during the event.' }),
    xp('ranged', 'Ranged', 8, { icon: 'Ranged icon' }),
    xp('magic', 'Magic', 6, { icon: 'Magic icon' }),
    xp('prayer', 'Prayer', 1.5, { icon: 'Prayer icon', ironOk: false }),
    xp('slayer', 'Slayer', 20, { icon: 'Slayer icon' }),
    xp('woodcutting', 'Woodcutting', 11, { icon: 'Woodcutting icon' }),
    xp('fishing', 'Fishing', 14, { icon: 'Fishing icon' }),
    xp('mining', 'Mining', 13, { icon: 'Mining icon' }),
    xp('agility', 'Agility', 16, { icon: 'Agility icon' }),
    xp('thieving', 'Thieving', 5, { icon: 'Thieving icon' }),
    xp('crafting', 'Crafting', 3.5, { icon: 'Crafting icon', ironOk: false }),
    xp('fletching', 'Fletching', 3, { icon: 'Fletching icon', ironOk: false }),
    xp('cooking', 'Cooking', 2.5, { icon: 'Cooking icon' }),
    xp('herblore', 'Herblore', 2.5, { icon: 'Herblore icon', ironOk: false }),
    xp('construction', 'Construction', 2, { icon: 'Construction icon', ironOk: false }),
    xp('smithing', 'Smithing', 4.5, { icon: 'Smithing icon' }),
    xp('runecraft', 'Runecraft', 15, { icon: 'Runecraft icon' }),
    xp('hunter', 'Hunter', 7, { icon: 'Hunter icon' }),
    xp('farming', 'Farming', 4, { icon: 'Farming icon' }),
    xp('firemaking', 'Firemaking', 3.5, { icon: 'Firemaking icon' }),
    xp('total', 'total', 5, { icon: 'Stats icon', description: 'Team total of {qty} XP across all skills gained during the event.' }),
  ];

  // ---------------------------------------------------------------------------
  // Clues
  // ---------------------------------------------------------------------------
  const clue = (id, tierName, perUnit, range, icon) => scaled('clues', 'clue-' + id,
    `Complete {qty} ${tierName} clue scroll{s}`,
    `Team total of {qty} ${tierName.toLowerCase()} clue scroll{s} completed during the event.`,
    perUnit, range, { icon, group: 'clue-' + id });

  const CLUES = [
    clue('beginner', 'Beginner', 0.15, [5, 60, 5, 10], 'Reward casket (beginner)'),
    clue('easy', 'Easy', 0.3, [5, 50, 5, 10], 'Reward casket (easy)'),
    clue('medium', 'Medium', 0.45, [3, 40, 1, 8], 'Reward casket (medium)'),
    clue('hard', 'Hard', 0.7, [3, 30, 1, 5], 'Reward casket (hard)'),
    clue('elite', 'Elite', 1.5, [1, 15, 1, 3], 'Reward casket (elite)'),
    clue('master', 'Master', 3, [1, 8, 1, 1], 'Reward casket (master)'),
    fixed('clues', 'clue-every-tier', 3, 8, 'One clue of every tier',
      'Complete one beginner, easy, medium, hard, elite and master clue scroll.',
      { items: ['Beginner', 'Easy', 'Medium', 'Hard', 'Elite', 'Master'], quantity: 6, icon: 'Clue scroll (master)' }),
    fixed('clues', 'clue-watson', 3, 6, 'Get a master clue from Watson',
      'Hand Watson an easy, medium, hard and elite clue scroll and receive a master clue.',
      { items: ['Easy clue', 'Medium clue', 'Hard clue', 'Elite clue'], quantity: 4, icon: 'Clue scroll (master)' }),
    fixed('clues', 'clue-elite-drop', 2, 2.5, 'Elite clue from a boss',
      'Receive an elite clue scroll as a drop from any boss.', { icon: 'Clue scroll (elite)' }),
    fixed('clues', 'clue-mimic', 4, 25, 'Defeat the Mimic',
      'Get a Mimic encounter from an elite or master casket and defeat it.', { icon: 'Mimic', group: 'clue-elite' }),
    fixed('clues', 'clue-3-new-slots', 3, 9, '3 new clue log slots',
      'Obtain 3 new collection log slots from any clue scroll rewards (team total).', { quantity: 3, icon: 'Collection log' }),
  ];

  // ---------------------------------------------------------------------------
  // Boss / PvM drops (fixed)
  // ---------------------------------------------------------------------------
  const b = (id, tier, hours, title, description, extra) => fixed('boss', 'drop-' + id, tier, hours, title, description, extra);

  const BOSS = [
    b('barrows-any', 2, 3, 'Any Barrows item', 'Obtain any Barrows equipment piece from the Barrows chest.', { icon: "Dharok's greataxe", group: 'barrows' }),
    b('barrows-3', 3, 8, '3 different Barrows items', 'Obtain 3 different Barrows equipment pieces (team total).', { quantity: 3, icon: "Ahrim's hood", group: 'barrows' }),
    b('dwh', 4, 30, 'Dragon warhammer', 'Obtain a Dragon warhammer from Lizardman shamans.', { icon: 'Dragon warhammer', group: 'shamans' }),
    b('zulrah', 3, 5, 'Any Zulrah unique', 'Tanzanite fang, Magic fang, Serpentine visage, Uncut onyx, a mutagen or Jar of swamp.', { requirements: 'Regicide', icon: 'Tanzanite fang', group: 'zulrah' }),
    b('vorkath-head', 2, 3, "Vorkath's head", "Obtain Vorkath's head.", { requirements: 'Dragon Slayer II', icon: "Vorkath's head", group: 'vorkath' }),
    b('vorkath-dbn', 4, 32, 'Dragonbone necklace', 'Obtain a Dragonbone necklace from Vorkath.', { requirements: 'Dragon Slayer II', icon: 'Dragonbone necklace', group: 'vorkath' }),
    b('kraken', 2, 3.5, 'Kraken tentacle or trident', 'Obtain a Kraken tentacle or Trident of the seas (full) from the Kraken boss.', { requirements: '87 Slayer', icon: 'Kraken tentacle', group: 'kraken' }),
    b('cerb', 3, 5, 'Any Cerberus crystal', 'Obtain a Primordial, Pegasian or Eternal crystal.', { requirements: '91 Slayer', icon: 'Pegasian crystal', group: 'cerberus' }),
    b('unsired', 3, 5, 'Unsired', 'Obtain an Unsired from the Abyssal Sire.', { requirements: '85 Slayer', icon: 'Unsired', group: 'sire' }),
    b('gg', 2, 3.5, 'Any Grotesque Guardians unique', 'Granite gloves, Granite ring, Granite hammer or Black tourmaline core.', { requirements: '75 Slayer', icon: 'Granite ring', group: 'gg' }),
    b('hydra-ring', 2, 3, 'Any Brimstone ring piece', "Obtain a Hydra's eye, fang or heart from Alchemical Hydra.", { requirements: '95 Slayer', icon: "Hydra's eye", group: 'hydra' }),
    b('hydra-rare', 3, 14, 'Hydra leather or Hydra’s claw', 'Obtain Hydra leather or a Hydra’s claw from Alchemical Hydra.', { requirements: '95 Slayer', icon: 'Hydra leather', group: 'hydra' }),
    b('thermy', 2, 3, 'Occult necklace or Smoke battlestaff', 'From the Thermonuclear smoke devil.', { requirements: '93 Slayer', icon: 'Occult necklace', group: 'thermy' }),
    b('gwd-any', 3, 10, 'Any God Wars Dungeon unique', 'Any armour, weapon, hilt or godsword shard from a GWD general (not Nex).', { icon: 'Armadyl helmet', group: 'gwd' }),
    b('gwd-hilt', 5, 55, 'Any godsword hilt', 'Obtain an Armadyl, Bandos, Saradomin or Zamorak hilt.', { icon: 'Bandos hilt', group: 'gwd' }),
    b('bandos-set', 5, 70, 'Full Bandos armour', 'Obtain a Bandos chestplate, Bandos tassets and Bandos boots.', { items: ['Bandos chestplate', 'Bandos tassets', 'Bandos boots'], quantity: 3, icon: 'Bandos tassets', group: 'gwd' }),
    b('kril', 3, 10, "Zamorakian spear or Staff of the dead", "From K'ril Tsutsaroth.", { icon: 'Zamorakian spear', group: 'gwd' }),
    b('nex', 4, 30, 'Any Nex unique', 'Nihil horn, Zaryte vambraces, Torva piece or Ancient hilt.', { requirements: 'The Frozen Door; group', icon: 'Nihil horn', group: 'nex' }),
    b('spirit-shield', 4, 30, 'Spirit shield', 'Obtain a Spirit shield from the Corporeal Beast.', { icon: 'Spirit shield', group: 'corp' }),
    b('dk-ring', 2, 2.5, 'Any Dagannoth King ring', 'Berserker, Archers, Seers or Warrior ring.', { icon: 'Archers ring', group: 'dks' }),
    b('dk-axe', 2, 5, 'Dragon axe from the Dagannoth Kings', 'Obtain a Dragon axe from any Dagannoth King.', { icon: 'Dragon axe', group: 'dks' }),
    b('kq', 2, 3, 'KQ head or Dragon chainbody', 'From the Kalphite Queen.', { icon: 'Dragon chainbody', group: 'kq' }),
    b('kbd', 2, 3, 'KBD heads', 'Obtain the King Black Dragon’s heads.', { icon: 'KBD heads', group: 'kbd' }),
    b('dpick', 3, 6.5, 'Dragon pickaxe from a Wilderness boss', 'From the Chaos Elemental or any Wilderness boss.', { requirements: 'Wilderness', icon: 'Dragon pickaxe', group: 'wildy' }),
    b('voidwaker', 3, 9, 'Any Voidwaker piece', 'Voidwaker hilt, blade or gem from the Wilderness bosses.', { requirements: 'Wilderness', icon: 'Voidwaker hilt', group: 'wildy' }),
    b('wildy-ring', 3, 13, 'Any Wilderness boss ring', 'Tyrannical ring, Treasonous ring or Ring of the gods.', { requirements: 'Wilderness', icon: 'Treasonous ring', group: 'wildy' }),
    b('scorpia', 2, 4, 'Any Scorpia shard', 'Odium shard 3 or Malediction shard 3 from Scorpia.', { requirements: 'Wilderness', icon: 'Odium shard 3', group: 'scorpia' }),
    b('sarachnis', 3, 10, 'Sarachnis cudgel', 'Obtain a Sarachnis cudgel.', { icon: 'Sarachnis cudgel', group: 'sarachnis' }),
    b('zalcano', 3, 10, 'Crystal tool seed', 'Obtain a Crystal tool seed from Zalcano.', { requirements: 'Song of the Elves', icon: 'Crystal tool seed', group: 'zalcano' }),
    b('cg-armour', 3, 9, 'Crystal armour seed (Corrupted Gauntlet)', 'Obtain a Crystal armour seed from the Corrupted Gauntlet.', { requirements: 'Song of the Elves', icon: 'Crystal armour seed', group: 'cg' }),
    b('cg-enhanced', 5, 70, 'Enhanced crystal weapon seed', 'Obtain an Enhanced crystal weapon seed from the Corrupted Gauntlet.', { requirements: 'Song of the Elves', icon: 'Enhanced crystal weapon seed', group: 'cg' }),
    b('muspah', 3, 6, 'Venator shard', 'Obtain a Venator shard from the Phantom Muspah.', { requirements: 'Secrets of the North', icon: 'Venator shard', group: 'muspah' }),
    b('moons-any', 2, 3, 'Any Moons of Peril armour or weapon', 'Any Blood, Blue or Eclipse moon equipment piece.', { requirements: 'Perilous Moons', icon: 'Eclipse moon helm', group: 'moons' }),
    b('moons-set', 4, 20, 'Full set of one moon', 'Helm, chestplate, tassets and weapon of any one moon (e.g. all four Blood moon pieces).', { quantity: 4, requirements: 'Perilous Moons', icon: 'Blood moon helm', group: 'moons' }),
    b('td', 2, 5, 'Burning claw or Tormented synapse', 'From Tormented Demons.', { requirements: 'While Guthix Sleeps', icon: 'Tormented synapse', group: 'td' }),
    b('araxxor', 4, 20, 'Any Araxxor unique', 'Araxyte fang, a Noxious halberd component or Araxyte head.', { requirements: '92 Slayer', icon: 'Araxyte fang', group: 'araxxor' }),
    b('dt2-ingot', 3, 6, 'Chromium ingot', 'Obtain a Chromium ingot from any Desert Treasure II boss.', { requirements: 'Desert Treasure II', icon: 'Chromium ingot', group: 'dt2' }),
    b('dt2-vestige', 5, 55, 'Any DT2 ring vestige', 'Bellator, Magus, Ultor or Venator vestige from a DT2 boss.', { requirements: 'Desert Treasure II', icon: 'Ultor vestige', group: 'dt2' }),
    b('whip', 2, 3.5, 'Abyssal whip', 'Obtain an Abyssal whip from Abyssal demons.', { requirements: '85 Slayer', icon: 'Abyssal whip', group: 'abyssals' }),
    b('dboots', 1, 1.5, 'Dragon boots', 'Obtain Dragon boots from Spiritual mages.', { requirements: '83 Slayer', icon: 'Dragon boots' }),
    b('black-mask', 2, 3.5, 'Black mask', 'Obtain a Black mask from Cave horrors.', { requirements: '58 Slayer; Cabin Fever', icon: 'Black mask' }),
    b('superior', 2, 2, 'Kill a superior slayer creature', 'Spawn and kill any superior slayer monster.', { requirements: 'Bigger and Badder unlock', icon: 'Imbued heart', group: 'superior' }),
    b('imbued-heart', 4, 30, 'Imbued heart or Eternal gem', 'From superior slayer creatures.', { requirements: 'Bigger and Badder unlock', icon: 'Imbued heart', group: 'superior' }),
    b('basilisk-jaw', 3, 14, 'Basilisk jaw', 'Obtain a Basilisk jaw from Basilisk Knights.', { requirements: '60 Slayer; The Fremennik Exiles', icon: 'Basilisk jaw' }),
    b('defender', 1, 1.5, 'Dragon defender', 'Obtain a Dragon defender in the Warriors’ Guild.', { requirements: '130 combined Attack + Strength', icon: 'Dragon defender' }),
    b('firecape', 2, 2.5, 'Fire cape', 'Complete the Fight Caves.', { icon: 'Fire cape', group: 'fightcaves' }),
    b('firecape-5', 3, 12.5, 'Five fire capes', 'Five different team members each complete the Fight Caves.', { quantity: 5, icon: 'Fire cape', group: 'fightcaves' }),
    b('infernal', 5, 45, 'Infernal cape', 'Complete the Inferno.', { requirements: 'High stats; Inferno experience', icon: 'Infernal cape' }),
    b('quiver', 5, 40, "Dizana's quiver", 'Complete the Fortis Colosseum.', { requirements: 'High stats; Colosseum experience', icon: "Dizana's quiver" }),
    b('obor', 1, 1, 'Kill Obor', 'Kill Obor (Hill Giant boss) once.', { requirements: 'Giant key', icon: 'Hill giant club', group: 'obor' }),
    b('bryophyta', 1, 1, 'Kill Bryophyta', 'Kill Bryophyta (Moss Giant boss) once.', { requirements: 'Mossy key', icon: "Bryophyta's essence", group: 'bryophyta' }),
    b('cox-purple', 5, 50, 'Any Chambers of Xeric purple', 'Receive any unique from the Chambers of Xeric.', { icon: 'Dexterous prayer scroll', group: 'cox' }),
    b('toa-purple', 5, 45, 'Any Tombs of Amascut purple', 'Receive any unique from the Tombs of Amascut.', { requirements: 'Beneath Cursed Sands', icon: "Osmumten's fang", group: 'toa' }),
    b('tob-purple', 5, 60, 'Any Theatre of Blood purple', 'Receive any unique from the Theatre of Blood.', { icon: 'Avernic defender hilt', group: 'tob' }),
    b('raid-purple', 5, 40, 'Any raids purple', 'Receive any unique from CoX, ToB or ToA.', { icon: 'Twisted bow', group: 'cox' }),
    b('nightmare', 5, 60, 'Any Nightmare unique', 'Any unique from The Nightmare or Phosani’s Nightmare.', { requirements: 'Priest in Peril; group', icon: 'Inquisitor’s mace', group: 'nightmare' }),
    b('larran', 1, 1.5, "Open Larran's big chest", "Get a Larran's key and open the big chest in the Wilderness.", { requirements: 'Krystilia slayer task', icon: "Larran's key" }),
  ];

  // ---------------------------------------------------------------------------
  // Skilling
  // ---------------------------------------------------------------------------
  const SKILLING = [
    scaled('skilling', 'sk-magic-logs', 'Chop {qty} Magic logs', 'Team total of {qty} Magic logs chopped.', 0.004, [100, 3000, 100, 500], { requirements: '75 Woodcutting', icon: 'Magic logs' }),
    scaled('skilling', 'sk-sharks', 'Catch {qty} Raw sharks', 'Team total of {qty} Raw sharks caught.', 0.007, [100, 3000, 100, 500], { requirements: '76 Fishing', icon: 'Raw shark' }),
    scaled('skilling', 'sk-anglers', 'Catch {qty} Raw anglerfish', 'Team total of {qty} Raw anglerfish caught.', 0.009, [100, 2000, 50, 300], { requirements: '82 Fishing', icon: 'Raw anglerfish' }),
    scaled('skilling', 'sk-karambwan', 'Catch {qty} Raw karambwan', 'Team total of {qty} Raw karambwan caught.', 0.0035, [200, 5000, 100, 800], { requirements: '65 Fishing; Tai Bwo Wannai Trio', icon: 'Raw karambwan' }),
    scaled('skilling', 'sk-runite', 'Mine {qty} Runite ore', 'Team total of {qty} Runite ore mined.', 0.05, [10, 200, 10, 40], { requirements: '85 Mining', icon: 'Runite ore' }),
    scaled('skilling', 'sk-amethyst', 'Mine {qty} Amethyst', 'Team total of {qty} Amethyst mined.', 0.0125, [50, 1500, 50, 200], { requirements: '92 Mining', icon: 'Amethyst' }),
    scaled('skilling', 'sk-chins', 'Catch {qty} Black chinchompas', 'Team total of {qty} Black chinchompas caught.', 0.0025, [100, 5000, 100, 500], { requirements: '73 Hunter; Wilderness', icon: 'Black chinchompa' }),
    scaled('skilling', 'sk-herbiboar', 'Harvest {qty} Herbiboars', 'Team total of {qty} Herbiboar hunts.', 0.03, [20, 500, 10, 50], { requirements: '80 Hunter; 31 Herblore; Bone Voyage', icon: 'Grimy ranarr weed' }),
    scaled('skilling', 'sk-marks', 'Collect {qty} Marks of grace', 'Team total of {qty} Marks of grace.', 0.05, [25, 500, 25, 100], { icon: 'Mark of grace' }),
    scaled('skilling', 'sk-blood-runes', 'Craft {qty} Blood runes', 'Team total of {qty} Blood runes crafted.', 0.0009, [500, 20000, 500, 2000], { requirements: '77 Runecraft', icon: 'Blood rune' }),
    scaled('skilling', 'sk-stardust', 'Mine {qty} Stardust', 'Team total of {qty} Stardust from Shooting Stars.', 0.004, [100, 5000, 100, 500], { icon: 'Stardust' }),
    scaled('skilling', 'sk-birdhouses', 'Complete {qty} birdhouse run{s}', 'Team total of {qty} full birdhouse runs (4 birdhouses each).', 0.1, [5, 60, 5, 10], { requirements: 'Bone Voyage', icon: 'Bird house' }),
    scaled('skilling', 'sk-herbs', 'Harvest {qty} herbs', 'Team total of {qty} herbs harvested from herb patches.', 0.004, [100, 3000, 100, 300], { icon: 'Grimy ranarr weed' }),
    fixed('skilling', 'sk-graceful', 3, 13, 'Full Graceful outfit', 'One team member obtains a full Graceful outfit during the event.', { icon: 'Graceful hood' }),
    fixed('skilling', 'sk-prospector', 3, 10, 'Full Prospector kit', 'Obtain all four Prospector kit pieces from the Motherlode Mine.', { items: ['Prospector helmet', 'Prospector jacket', 'Prospector legs', 'Prospector boots'], quantity: 4, requirements: '30 Mining', icon: 'Prospector helmet' }),
    fixed('skilling', 'sk-skilling-clue', 1, 1.5, 'Clue from skilling', 'Obtain a clue scroll from a clue geode, clue nest, clue bottle or scroll box while skilling.', { icon: 'Clue geode (easy)' }),
    fixed('skilling', 'sk-sceptre', 2, 4, "Pharaoh's sceptre", "Obtain a Pharaoh's sceptre from Pyramid Plunder.", { requirements: "Icthlarin's Little Helper; 71+ Thieving recommended", icon: "Pharaoh's sceptre" }),
    fixed('skilling', 'sk-hespori', 1, 1, 'Kill Hespori', 'Grow and defeat Hespori.', { requirements: '65 Farming; Hespori seed', icon: 'Hespori seed' }),
    fixed('skilling', 'sk-bird-nests', 2, 4, '5 bird nests', 'Obtain 5 bird nests of any kind while woodcutting.', { quantity: 5, icon: "Bird nest" }),
  ];

  // ---------------------------------------------------------------------------
  // Minigames
  // ---------------------------------------------------------------------------
  const MINIGAME = [
    scaled('minigame', 'mg-tempoross', 'Complete {qty} Tempoross games', 'Team total of {qty} Tempoross games (reward permits).', 0.17, [5, 100, 5, 20], { requirements: '35 Fishing', icon: 'Tackle box', group: 'tempoross' }),
    scaled('minigame', 'mg-wintertodt', 'Complete {qty} Wintertodt games', 'Team total of {qty} Wintertodt subdues with 500+ points.', 0.2, [5, 100, 5, 20], { requirements: '50 Firemaking', icon: 'Bruma torch', group: 'wintertodt' }),
    scaled('minigame', 'mg-gotr', 'Complete {qty} Guardians of the Rift games', 'Team total of {qty} successful Guardians of the Rift games.', 0.17, [5, 100, 5, 20], { requirements: 'Temple of the Eye; 27 Runecraft', icon: 'Abyssal lantern', group: 'gotr' }),
    scaled('minigame', 'mg-pc', 'Earn {qty} Pest Control points', 'Team total of {qty} Pest Control points.', 0.017, [50, 1500, 50, 150], { requirements: '40+ combat', icon: 'Void knight top', group: 'pc' }),
    scaled('minigame', 'mg-mahogany', 'Complete {qty} Mahogany Homes contracts', 'Team total of {qty} Mahogany Homes contracts.', 0.1, [10, 200, 10, 20], { icon: 'Plank sack', ironOk: true }),
    scaled('minigame', 'mg-foundry', 'Hand in {qty} Giants’ Foundry sword{s}', 'Team total of {qty} swords handed in to Kovac.', 0.12, [5, 100, 5, 15], { requirements: 'Sleeping Giants', icon: 'Colossal blade' }),
    scaled('minigame', 'mg-sepulchre', 'Complete {qty} Hallowed Sepulchre run{s}', 'Team total of {qty} runs reaching at least floor 4.', 0.2, [3, 60, 1, 10], { requirements: '72 Agility; Sins of the Father', icon: 'Hallowed mark', group: 'sepulchre' }),
    fixed('minigame', 'mg-tempoross-unique', 3, 7, 'Any Tempoross unique', 'Fish barrel, Tackle box, Big harpoonfish, Tome of water or Dragon harpoon.', { icon: 'Fish barrel', group: 'tempoross' }),
    fixed('minigame', 'mg-pyro-any', 1, 1, 'Any Pyromancer piece', 'Obtain any Pyromancer outfit piece from Wintertodt.', { icon: 'Pyromancer hood', group: 'wintertodt' }),
    fixed('minigame', 'mg-pyro-full', 3, 8, 'Full Pyromancer outfit', 'Obtain the Pyromancer hood, garb, robe and boots.', { items: ['Pyromancer hood', 'Pyromancer garb', 'Pyromancer robe', 'Pyromancer boots'], quantity: 4, icon: 'Pyromancer garb', group: 'wintertodt' }),
    fixed('minigame', 'mg-gotr-unique', 3, 6, 'Any Guardians of the Rift unique', 'Abyssal protector, Abyssal needle, Abyssal lantern or Catalytic talisman.', { icon: 'Abyssal needle', group: 'gotr' }),
    fixed('minigame', 'mg-ba-run', 2, 2.5, 'Full Barbarian Assault run', 'Complete waves 1–10 of Barbarian Assault as a team.', { icon: 'Fighter hat', group: 'ba' }),
    fixed('minigame', 'mg-torso', 3, 7, 'Fighter torso', 'A team member unlocks a Fighter torso from Barbarian Assault.', { icon: 'Fighter torso', group: 'ba' }),
    fixed('minigame', 'mg-angler-any', 1, 1.5, 'Any Angler outfit piece', 'Obtain any Angler outfit piece from Fishing Trawler.', { requirements: '15 Fishing', icon: 'Angler hat', group: 'trawler' }),
    fixed('minigame', 'mg-angler-full', 2, 4, 'Full Angler outfit', 'Obtain the Angler hat, top, waders and boots.', { items: ['Angler hat', 'Angler top', 'Angler waders', 'Angler boots'], quantity: 4, requirements: '15 Fishing', icon: 'Angler top', group: 'trawler' }),
    fixed('minigame', 'mg-void-top', 2, 5, 'Void knight top', 'Buy a Void knight top with Pest Control points.', { requirements: '42 in all combat skills, 22 Prayer', icon: 'Void knight top', group: 'pc' }),
    fixed('minigame', 'mg-void-set', 3, 13, 'Full Void knight set', 'Void knight top, robe, gloves and any Void helm.', { items: ['Void knight top', 'Void knight robe', 'Void knight gloves', 'Void helm (any)'], quantity: 4, requirements: '42 in all combat skills, 22 Prayer', icon: 'Void knight robe', group: 'pc' }),
    fixed('minigame', 'mg-cw-win', 1, 0.8, 'Win a Castle Wars game', 'A team member wins a game of Castle Wars.', { icon: 'Castle wars ticket' }),
    fixed('minigame', 'mg-sw-win', 1, 0.8, 'Win a Soul Wars game', 'A team member wins a game of Soul Wars.', { icon: 'Soul cape' }),
    fixed('minigame', 'mg-lms-win', 2, 3, 'Win Last Man Standing', 'A team member wins a game of Last Man Standing.', { icon: 'Deadman’s cape' }),
    fixed('minigame', 'mg-sepulchre-5', 2, 2, 'Hallowed Sepulchre floor 5', 'Complete floor 5 of the Hallowed Sepulchre.', { requirements: '92 Agility; Sins of the Father', icon: 'Hallowed mark', group: 'sepulchre' }),
    fixed('minigame', 'mg-master-wand', 3, 8, 'Master wand', 'A team member buys the Master wand from the Mage Training Arena.', { requirements: '33 Magic (higher is faster)', icon: 'Master wand' }),
    fixed('minigame', 'mg-farmer', 3, 8, "Full Farmer's outfit", "Buy the full Farmer's outfit from Tithe Farm.", { requirements: '34 Farming', icon: "Farmer's strawhat" }),
    fixed('minigame', 'mg-rogue', 2, 3, 'Full Rogue outfit', "Obtain the full Rogue outfit from the Rogues' Den.", { requirements: '50 Agility and Thieving', icon: 'Rogue mask' }),
    fixed('minigame', 'mg-toa-300', 3, 5, 'ToA at 300+ invocation', 'Complete a Tombs of Amascut raid at 300 invocation or higher.', { requirements: 'Beneath Cursed Sands; high stats', icon: 'Tumeken’s shadow', group: 'toa' }),
    fixed('minigame', 'mg-gauntlet', 1, 1.5, 'Complete the Gauntlet', 'Complete the (normal) Gauntlet.', { requirements: 'Song of the Elves', icon: 'Crystal shard', group: 'cg' }),
    fixed('minigame', 'mg-cg', 3, 5, 'Complete the Corrupted Gauntlet', 'Complete the Corrupted Gauntlet.', { requirements: 'Song of the Elves; high stats', icon: 'Blade of saeldor (c)', group: 'cg' }),
    fixed('minigame', 'mg-colosseum', 5, 35, 'Complete the Fortis Colosseum', 'Complete all 12 waves of the Fortis Colosseum.', { requirements: 'High stats', icon: "Dizana's quiver", group: 'colosseum' }),
  ];

  // ---------------------------------------------------------------------------
  // Collection log
  // ---------------------------------------------------------------------------
  const CLOG = [
    scaled('clog', 'cl-slots', 'Log {qty} new collection log slots', 'Team total of {qty} new collection log slots (new to that player).', 0.6, [5, 150, 5, 15], { icon: 'Collection log' }),
    fixed('clog', 'cl-pet', 5, 70, 'Any pet', 'Any team member receives any pet.', { icon: 'Pet rock' }),
    fixed('clog', 'cl-dk-rings', 4, 30, 'All four Dagannoth King rings', 'Obtain a Berserker, Archers, Seers and Warrior ring.', { items: ['Berserker ring', 'Archers ring', 'Seers ring', 'Warrior ring'], quantity: 4, icon: 'Seers ring', group: 'dks' }),
    fixed('clog', 'cl-cerb-all', 4, 24, 'All three Cerberus crystals', 'Obtain a Primordial, Pegasian and Eternal crystal.', { items: ['Primordial crystal', 'Pegasian crystal', 'Eternal crystal'], quantity: 3, requirements: '91 Slayer', icon: 'Eternal crystal', group: 'cerberus' }),
    fixed('clog', 'cl-hydra-ring', 3, 13, 'Complete a Brimstone ring', "Obtain Hydra's eye, Hydra's fang and Hydra's heart.", { items: ["Hydra's eye", "Hydra's fang", "Hydra's heart"], quantity: 3, requirements: '95 Slayer', icon: 'Brimstone ring', group: 'hydra' }),
    fixed('clog', 'cl-voidwaker-all', 4, 27, 'Complete a Voidwaker', 'Obtain the Voidwaker hilt, blade and gem.', { items: ['Voidwaker hilt', 'Voidwaker blade', 'Voidwaker gem'], quantity: 3, requirements: 'Wilderness', icon: 'Voidwaker', group: 'wildy' }),
    fixed('clog', 'cl-barrows-5', 3, 14, '5 different Barrows items', 'Obtain 5 different Barrows equipment pieces (team total).', { quantity: 5, icon: "Guthan's warspear", group: 'barrows' }),
    fixed('clog', 'cl-5-bosses', 3, 10, 'New log slot from 5 bosses', 'Obtain a new collection log slot from 5 different bosses (team total).', { quantity: 5, icon: 'Collection log' }),
    fixed('clog', 'cl-champion', 4, 30, 'Any Champion scroll', "Obtain any Champion's scroll.", { icon: 'Champion scroll (goblin)' }),
    fixed('clog', 'cl-page', 3, 10, 'Complete a collection log page', 'A team member completes a collection log page they had not finished before the event.', { icon: 'Collection log' }),
    fixed('clog', 'cl-slayer-3', 3, 8, '3 different Slayer log items', 'Obtain 3 different items from the Slayer collection log page (team total).', { quantity: 3, icon: 'Slayer helmet' }),
    fixed('clog', 'cl-misc-3', 2, 4, '3 Miscellaneous log items', 'Obtain 3 new items from the Miscellaneous collection log page (team total).', { quantity: 3, icon: 'Big shark' }),
    fixed('clog', 'cl-moons-2', 3, 9, 'Pieces from all three moons', 'Obtain at least one equipment piece from the Blood, Blue and Eclipse moons.', { items: ['Blood moon piece', 'Blue moon piece', 'Eclipse moon piece'], quantity: 3, requirements: 'Perilous Moons', icon: 'Blue moon helm', group: 'moons' }),
  ];

  // ---------------------------------------------------------------------------
  // Other
  // ---------------------------------------------------------------------------
  const OTHER = [
    fixed('other', 'o-photo', 1, 0.5, 'Team photo', 'Every team member in one screenshot, same world, standing together at a location of your choice.', { icon: 'Camera' }),
    fixed('other', 'o-photo-ge', 1, 0.5, 'Team photo at the Grand Exchange', 'Every team member together at the Grand Exchange in one screenshot.', { icon: 'Coins 10000', group: 'photo' }),
    fixed('other', 'o-photo-wildy', 1, 1, 'Team photo in deep Wilderness', 'Every team member together at level 30+ Wilderness in one screenshot.', { requirements: 'Wilderness — bring nothing you can’t lose', icon: 'Skull (status)', group: 'photo' }),
    fixed('other', 'o-fashion', 1, 0.5, 'Fashionscape', 'Every team member dressed in a theme chosen by the host, in one screenshot.', { icon: 'Top hat' }),
    fixed('other', 'o-random-event', 1, 1, 'Random event', 'Any team member gets and completes a random event.', { icon: 'Genie lamp' }),
    scaled('other', 'o-quests', 'Complete {qty} quest{s}', 'Team total of {qty} quest{s} completed during the event.', 1.5, [1, 20, 1, 3], { icon: 'Quest point icon' }),
    scaled('other', 'o-ca', 'Complete {qty} Combat Achievement task{s}', 'Team total of {qty} Combat Achievement tasks.', 0.7, [3, 60, 1, 10], { icon: "Ghommal's hilt 1" }),
    scaled('other', 'o-levels', 'Gain {qty} total levels', 'Team total of {qty} levels gained across all skills.', 1.0, [5, 100, 5, 10], { icon: 'Stats icon' }),
    scaled('other', 'o-gp', 'Earn {qty} of drops', 'Team total of {qty} in drop value (RuneLite loot tracker), during the event.', 1.5e-6, [2000000, 200000000, 1000000, 10000000], { format: 'gp', icon: 'Coins 10000' }),
    scaled('other', 'o-slayer', 'Complete {qty} Slayer task{s}', 'Team total of {qty} Slayer tasks completed.', 1.0, [5, 60, 5, 15], { icon: 'Slayer helmet' }),
    fixed('other', 'o-diary', 3, 6, 'Complete an Achievement Diary tier', 'A team member completes any hard or elite Achievement Diary tier they did not have before.', { icon: 'Achievement diary cape' }),
    fixed('other', 'o-elite-diary', 4, 20, 'Complete an elite Achievement Diary', 'A team member completes any elite Achievement Diary they did not have before.', { icon: 'Achievement diary cape (t)' }),
    fixed('other', 'o-5-bosses', 2, 3, 'Kill 5 different bosses', 'Team total: at least one kill of 5 different bosses.', { quantity: 5, icon: 'Skull (status)' }),
    fixed('other', 'o-10-bosses', 3, 7, 'Kill 10 different bosses', 'Team total: at least one kill of 10 different bosses.', { quantity: 10, icon: 'Skull (status)' }),
    fixed('other', 'o-god-cape', 3, 6, 'Imbued god cape', 'A team member completes Mage Arena II and imbues a god cape.', { requirements: '75 Magic', icon: 'Imbued saradomin cape' }),
    fixed('other', 'o-new-99', 5, 40, 'A new 99', 'Any team member reaches level 99 in a skill they did not have at the start.', { icon: 'Cape of Accomplishment' }),
  ];

  const ALL = [].concat(KC, XP, CLUES, BOSS, SKILLING, MINIGAME, CLOG, OTHER);

  // Fill defaults.
  const hoursToTier = (h) => (window.Bingus ? window.Bingus.hoursToTier(h) : 3);
  for (const e of ALL) {
    if (e.ironOk === undefined) e.ironOk = true;
    if (!e.tier) e.tier = hoursToTier(e.estHours);
    if (e.items && !e.quantity) e.quantity = e.items.length;
    if (!e.requirements) e.requirements = '';
    if (!e.group) e.group = null;
  }

  window.BINGUS_LIBRARY = ALL;
})();
