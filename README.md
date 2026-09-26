# Bingus Board Game

A static website for an Old School RuneScape **tile race**: teams of 5–6 players work through a board of challenges in order, each tile unlocking the next, over two weeks. The first team to finish wins.

- **Public site** (`index.html`) shows a countdown, a race track, the leaderboard, each team's current tile and official progress, the revealed tiles, an activity feed and how to submit proof.
- **Admin page** (`admin.html`) is where you build the board (manually, from a 200-challenge library, or with the generator), manage teams, record progress and generate the file you publish.
- There is **no backend**. Shared data is one JSON file in the repo (`data/event.json`). Everything personal lives in the visitor's own browser.

## Files

```
index.html          public site
admin.html          admin page (not linked from the public site)
css/style.css       theme (dark by default, light mode toggle)
js/common.js        shared helpers: storage wrapper, time zones, ranking, icons
js/public.js        public site
js/admin.js         admin workspace
js/library.js       built-in challenge library (201 challenges, time estimates to tune)
js/generator.js     board generator
data/event.json     the published event (currently SAMPLE data: 4 teams mid-race)
icons/              optional self-hosted icons (see below)
.nojekyll           tells GitHub Pages to serve files as-is
```

## OSRS Wiki usage (no API calls)

The site **never calls the OSRS Wiki API**. The only network request it makes to load data is for its own `data/event.json`. (The admin page also talks to the GitHub API, but only if you set up one-click publishing.)

Item icons are plain `<img>` tags pointing at the Wiki's static image path (for example `https://oldschool.runescape.wiki/images/Dragon_pickaxe.png`). They load lazily and only for tiles on screen. Visitors' browsers cache them, and only revealed tiles (usually about 10–25 images) are ever shown. An icon name that doesn't match a Wiki file is simply hidden.

To reduce Wiki traffic further:

- **Turn icons off:** on the admin Event tab, untick *Show item icons on the public site*. In the admin page itself, icons are off by default (there's a checkbox on the Board tab), and the library list never loads images.
- **Self-host icons for zero Wiki requests:** save the PNGs into `icons/` and set a tile's icon to `icons/Dragon_pickaxe.png`. Any icon value containing a `/` is used as-is.

## Test locally

Browsers block `fetch()` from `file://` pages, so serve the folder:

```bash
cd Bingus-Board-Game
python -m http.server 8000
```

Then open http://localhost:8000/ (public site) and http://localhost:8000/admin.html (admin).

To try the admin with the sample data, go to **Publish & backup → Load teams & progress from live event.json**.

## Deploy to GitHub Pages

1. Put these files at the root of `HarveyMahon/Bingus-Board-Game` on the `main` branch. Either push them with git, or use **Add file → Upload files** on GitHub and drag in the folder contents.
2. In the repo, go to **Settings → Pages → Build and deployment**. Set **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, then save.
3. After a minute the site is live at `https://harveymahon.github.io/Bingus-Board-Game/`. The admin page is `…/admin.html`.

Each later commit to `data/event.json` redeploys automatically in about a minute. You can watch progress under the repo's **Actions** tab.

## Running an event, start to finish

### 1. Before the event (any time)

1. Open `admin.html` on the computer you'll run the event from.
2. On the **Event** tab, set the name, description, dates (leave them blank until decided; the site shows "Dates TBC"), your Discord handle, submission instructions and rules. Set the keyword now or later.
3. On the **Teams** tab, add each team with a colour and one RSN per line. You'll be warned if a team isn't 5–6 players.
4. Build the board on the **Board** tab. You can mix three ways:
   - **Generator:** enter the number of tiles, team size, event length, hours per player per day, whether ironmen are playing and which categories to include. Re-roll single tiles or everything, then *Replace board* or *Append*.
   - **Library:** search and filter the 201 built-in challenges, and *Add* any to the board. You can edit or hide library entries, or create your own reusable challenges.
   - **New tile:** the manual form (title, description, tier, category, quantity or specific items, estimated team-hours, proof, requirements, icon, private notes).

   Reorder by dragging the ⋮⋮ handle or with the ↑ ↓ buttons.
5. On **Publish & backup**, leave **Board is live** unticked and click **Download event.json**, then commit it (see "Publishing" below). This announces the event, teams and dates without revealing any tiles.
6. Click **Export workspace backup**. Do this after every session.

### 2. When the event starts

1. Set the keyword if you haven't already, and tick **Board is live**.
2. Publish. Tile 1 and the keyword now appear on the site.

### 3. During the event

1. Players DM you screenshots (with the keyword in the chatbox).
2. On the **Progress** tab, for each team:
   - **Partial progress:** set the official count (or tick the specific items) and *Save progress*. This can post to the activity feed.
   - **Complete tile:** choose who got it and set **Completed at** to the time of the submission (not when you verified it, because ties are decided by time), then *Mark complete*. The team moves to its next tile.
   - Mistakes: use **Undo** (Ctrl+Z), **Revert last completion**, or **Set tile…** for manual corrections.
3. Publish: press **Publish now** in the top bar, or let auto-publish do it. It's fine to batch several updates into one publish.

### 4. Revealing tiles

This is automatic. The published file only ever contains tiles up to the furthest tile any team has reached, plus the total tile count so progress bars still work. Hidden tiles never leave your browser. Once a team has reached a tile, that tile is locked in the admin: you can edit its text, but you can't move or delete it.

### 5. The end

Publish the final state. The leaderboard ranks teams by:

1. teams that finished the board, earliest finish first;
2. otherwise the furthest tile;
3. ties go to whoever reached that tile first, i.e. the earlier time of their last completion.

### Publishing

**One-click (recommended).** Connect the admin page to GitHub once and it commits `data/event.json` for you:

1. On GitHub, create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):
   - **Repository access:** Only select repositories → *Bingus-Board-Game*.
   - **Repository permissions → Contents:** Read and write. Nothing else is needed.
   - Set an expiry that covers the event.
2. In the admin page, go to **Publish & backup → One-click publishing**, paste the token and press **Connect**.
3. From then on, the top bar shows **● Unpublished changes** and a **Publish now** button. Optionally tick **Publish automatically** to publish 20 seconds after your last change, so marking a tile complete is all you need to do. When the admin page is opened from GitHub Pages, it watches for the new version and shows **✔ Live on the site** once it's being served (usually about a minute).

The token is stored only in that browser (`bingus.ghToken`). It is never published, and never included in workspace backups. It can only change this one repo's files, and you can revoke it on GitHub at any time. Press **Disconnect** on shared computers.

**Manual publishing** still works without a token. On **Publish & backup** you have two options:

- **Upload:** click *Download event.json*, open the upload link shown (`github.com/<repo>/upload/main/data`), drag the file in and click **Commit changes**. It replaces the old file.
- **Paste:** click *Copy JSON*, open the web-editor link (`github.com/<repo>/edit/main/data/event.json`), select all, paste and click **Commit changes**.

Use *Preview public site* first to check the draft in a new tab. The public site re-checks for new data every 5 minutes, and players can press **Refresh**. Give teams a heads-up that the board lags a minute or two behind approvals.

## The admin page and security

A static site can't have real password protection, so `admin.html` is simply not linked anywhere (and is marked `noindex`). This is harmless if someone finds it: the page only reads and writes **your own browser's** storage, so they'd see an empty workspace. The live site only changes when you commit to the repo.

Your workspace (the full board including hidden tiles, notes and library edits) exists **only in that browser**. Clearing site data wipes it, so **export backups**. To move to another computer, import the backup there. *Load teams & progress from live event.json* can rebuild teams and progress from the published file, but not the hidden tiles.

## Browser storage used

All access goes through a try/catch wrapper, and the site works without storage (preferences just won't persist).

| Key | Page | Contents |
| --- | --- | --- |
| `bingus.prefs` | both | theme, followed team, collapsed sections |
| `bingus.check.<team>.<tile>` | public | a player's private, unofficial checklist for their team's current tile |
| `bingus.workspace` | admin | the whole admin workspace |
| `bingus.adminTab`, `bingus.preview` | admin | last open tab, draft data for preview |
| `bingus.ghToken` | admin | GitHub token for one-click publishing (optional; never exported) |

## `data/event.json` schema

```jsonc
{
  "schemaVersion": 1,
  "lastUpdated": "ISO timestamp",
  "live": true,                       // false → no tiles and no keyword are published
  "sample": true,                     // only in the sample file; shows a banner
  "event": {
    "name": "", "description": "",
    "start": "ISO or null", "end": "ISO or null", "timezone": "Europe/London",
    "keyword": "only when live",
    "host": { "name": "", "discord": "", "discordUserId": "" },
    "discordInvite": "", "submission": "", "rules": ["…"], "showIcons": true
  },
  "totalTiles": 25,
  "tiles": [                          // only tiles 0..(furthest team's current tile)
    { "id": "", "title": "", "description": "", "tier": 1, "category": "boss",
      "quantity": 1, "items": ["…"] /* or null */, "format": "xp|gp|null",
      "proof": "", "requirements": "", "icon": "Item name, URL or icons/file.png" }
  ],
  "teams": [
    { "id": "", "name": "", "colour": "#e0a126", "members": [{ "rsn": "" }],
      "currentTile": 9,               // 0-based; equals totalTiles when finished
      "progress": { "count": 0, "items": [] },
      "completions": [{ "tileIndex": 0, "tileId": "", "at": "ISO", "by": "RSN or null" }],
      "finishedAt": null }
  ],
  "activity": [{ "at": "ISO", "teamId": "", "type": "complete|progress|finish|note", "tileIndex": 0, "text": "" }]
}
```

Categories: `boss` (boss drop), `kc`, `xp`, `clues`, `skilling`, `minigame`, `clog` (collection log), `other`. Tiers: 1 Easy, 2 Medium, 3 Hard, 4 Elite, 5 Master.

## Tuning the time estimates

**Every hour figure is an assumption.** "Estimated team-hours" means the total player-hours (summed across the team) that a competent mid-to-high level team needs on average, based on approximate drop rates and kill or XP rates. Luck swings these enormously.

- Per-challenge estimates live in `js/library.js`. Scalable challenges (kill counts, XP, clues, etc.) have a `perUnit` rate that the generator uses to pick quantities.
- The generator's budget is *team size × hours per player per day × days × fill %*. The difficulty ramp sets how much longer the last tile is than the first.
- Tier labels come from hours: under 2 is Easy, under 6 Medium, under 15 Hard, under 35 Elite, and anything above is Master (`TIER_HOUR_LIMITS` in `js/common.js`).
- You can also edit estimates from the admin **Library** tab without touching code (saved in your workspace).

Run a mock event with a couple of test teams before the real one, and compare actual completion times with the estimates.

## Credits

Item icons are from the [Old School RuneScape Wiki](https://oldschool.runescape.wiki/) (CC BY-NC-SA 3.0). This is a fan-made community event, not affiliated with or endorsed by Jagex. Old School RuneScape is a trademark of Jagex Ltd.
