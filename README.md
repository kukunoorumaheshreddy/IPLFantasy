# 🏏 Big Blue Championship — IPL Fantasy 2026

A live visualization dashboard for our IPL Fantasy league (League #6200104, 12 teams).

**👉 [View the Dashboard](https://kukunoorumaheshreddy.github.io/IPLFantasy/dashboard.html)**

## Features

- **Standings** — current rankings with rank change from Match 1
- **Prizes** — Top 3 Overall, Master of Boosters, Playoff Champion
- **Per-Match Leaderboard** — drill into any individual match (including live)
- **Rank Progression** — line chart showing rank over time
- **Points Race** — animated bar chart race + line drawing animation (synced, side-by-side)
- **Rank Heatmap** — color-coded rank grid across all matches

> ⚠️ **Live matches** are only shown in the **Per-Match Leaderboard** tab. Standings, Prizes, Rank Progression, Points Race, and Heatmap use **completed matches only** — this avoids skewing aggregates with partial/estimated scores.

---

## How to Update Scores (The Only Required Step)

Run this **once when a match starts** (or any time during a match). The script auto-updates every 5 minutes — no need to re-run.

### Step 1: Log in to the fantasy site

Open [fantasy.iplt20.com](https://fantasy.iplt20.com/classic/home) in Chrome/Edge. Make sure you're **logged in**.

### Step 2: Open the browser console

Press `F12` (or right-click → Inspect), then click the **Console** tab.

> 💡 If Chrome warns "Don't paste code you don't understand" — type `allow pasting` and press Enter first.

### Step 3: Paste the extraction script

Open [`update-data.js`](https://github.com/kukunoorumaheshreddy/IPLFantasy/blob/main/update-data.js), copy the **entire file**, paste it into the console, and press **Enter**.

### Step 4: Enter your GitHub PAT (first time only)

On your first run, a prompt will ask for a **GitHub Personal Access Token** with `gist` scope. Paste the token (ask Mahesh if you don't have one). It's saved in your browser's localStorage — you won't be asked again.

> To reset: type `localStorage.removeItem('github_pat')` in the console.

### Step 5: Leave the tab open

The script will:
1. Fetch data for all 12 league members across all matches (~30-60 seconds)
2. **Upload to GitHub Gist** automatically (no file download needed!)
3. **Repeat every 5 minutes** until you close the tab

You'll see a log like:
```
✅ Uploaded to Gist successfully!
⏳ Next update at 4:25:30 PM. Close tab to stop.
```

The dashboard auto-refreshes every 60 seconds and picks up the latest data from the Gist. **No git push needed!**

### Console commands

| Command | What it does |
|---------|-------------|
| `stopPolling()` | Stop auto-updates without closing the tab |
| `downloadLastData()` | Download the latest JSON as a file (backup) |

---

## Quick Reference

| When | What | How | Required? |
|------|------|-----|-----------|
| Match starts | Start live updates | Paste `update-data.js` in console, leave tab open | ✅ Yes |
| Any time | View dashboard | [Open dashboard](https://kukunoorumaheshreddy.github.io/IPLFantasy/dashboard.html) | — |

---

## Troubleshooting

### "No completed gamedays" or empty data
You're not logged in. Go to [fantasy.iplt20.com](https://fantasy.iplt20.com/classic/home), log in, then run the script again **in the same tab**.

### Chrome says "Don't paste code you don't understand"
Type `allow pasting` in the console and press Enter. Then paste the script.

### Upload failed / Gist error
Check the console for the error. Most likely your GitHub PAT is wrong or expired — type `localStorage.removeItem('github_pat')` and re-run the script to re-enter it.

### Script stops updating / red errors after a while
Your fantasy session expired. Refresh the page, log in again, and re-paste the script.

### Dashboard shows "No data loaded"
No one has run the script recently. Either run `update-data.js` yourself, or check if there are snapshot files in `master-snapshots/` (the dashboard falls back to these).

### Points look slightly different from the fantasy app
Live match scores are estimated from player data. Once a match is finalized, the official scores replace the estimates automatically on the next script run.

---

## How It Works

### update-data.js
1. Fetches the IPL match schedule to find all completed and live matches
2. For each league member: calls the `overall-get` API to get all match data in one shot
3. For live matches: calculates scores from player data, filtering by teams playing in each fixture
4. Detects booster usage (FREE_HIT, DOUBLE_POWER, etc.) and calculates bonus points
5. Builds cumulative rankings, transfer usage, and per-match breakdowns
6. **Uploads the JSON to a GitHub Gist** (cloud storage) — no file download needed
7. **Repeats every 5 minutes** until the tab is closed

### Booster Calculation

Each team gets **6 booster types (10 total uses)** across the tournament. When a booster is activated for a match, bonus points are calculated on top of normal scoring.

**The 6 Boosters:**

| Booster | What It Does | Uses |
|---------|-------------|------|
| 🎯 **FREE_HIT** | Change your entire team for one match (reverts after) | 1 |
| 🃏 **WILD_CARD** | Same as Free Hit — change team freely for one match | 1 |
| ⚡ **DOUBLE_POWER** | Full team doubled (similar to Free Hit) | 2 |
| 👑 **TRIPLE_CAPTAIN** | Your captain scores ×3 instead of the usual ×2 | 2 |
| 🌍 **FOREIGN_STARS** | All overseas players in your team score double | 2 |
| 🇮🇳 **INDIAN_WARRIORS** | All Indian players in your team score double | 2 |

**Base scoring** (without boosters):
- Captain: points × 2
- Vice-Captain: points × 1.5
- Regular players: points × 1

**Booster types and how bonus points are calculated:**

| Booster | Effect | Bonus Calculation |
|---------|--------|-------------------|
| **FREE_HIT** | Change entire team for one match | Total match gamedayPoints (squad flexibility benefit) |
| **WILD_CARD** | Same as FREE_HIT | Same as FREE_HIT |
| **DOUBLE_POWER** | Entire team scores double | All players' effective pts × 2 |
| **TRIPLE_CAPTAIN** | Captain scores triple instead of double | Captain's pts × 3 (instead of × 2) |
| **FOREIGN_STARS** | Foreign players score double | Each foreign player's effective pts × 2 |
| **INDIAN_WARRIORS** | Indian players score double | Each Indian player's effective pts × 2 |

> "Effective pts" means the player's match points already multiplied by their role (captain × 2, VC × 1.5, regular × 1). The booster then doubles that.

### Foreign vs Indian Player Detection

The IPL Fantasy API provides an `IS_FP` (Is Foreign Player) field in the live player data feed. The script checks this flag:
- `IS_FP = 1` → **Foreign/Overseas** player
- `IS_FP = 0` or absent → **Indian** player

This is used by the FOREIGN_STARS and INDIAN_WARRIORS boosters to determine which players get doubled. The script fetches the player data feed only for matches where these nationality-based boosters were activated (to minimize API calls).

### Dashboard
Pure HTML + JavaScript — no server, no install. Hosted free on GitHub Pages. Auto-loads data from a GitHub Gist (live cloud data), falls back to `master-snapshots/` repo files if the Gist is unavailable. **Auto-refreshes every 60 seconds** during live matches.

---

## Known Limitations & What to Watch For

### Not all booster IDs are mapped yet

The IPL Fantasy API uses numeric IDs for boosters (e.g., `11` = FREE_HIT). We've only confirmed **one ID so far** — the rest will be discovered as league members use them throughout the tournament.

**What happens with an unknown booster:**
- The script **won't break** — it falls back to using total match points as an approximation
- You'll see a yellow warning in the console: `⚠️ Unknown booster ID 14 for TeamName in GD9`
- The bonus points for that match will be slightly off until the ID is mapped

**What to do:**
1. If you see the warning, note the **booster ID number** and **which team used it**
2. Share it with Mahesh — he'll update the `BOOSTER_TYPE` mapping in `update-data.js`
3. Re-run the script after the fix to get accurate booster points

**Currently mapped:**

| Booster ID | Type |
|-----------|------|
| 3 | DOUBLE_POWER ✅ |
| 9 | FOREIGN_STARS ✅ |
| 10 | INDIAN_WARRIORS ✅ |
| 11 | FREE_HIT ✅ |
| 12 | TRIPLE_CAPTAIN ✅ |
| ? | WILD_CARD (not yet seen) |

Only WILD_CARD remains unmapped — it has 1 use and no one has activated it yet.

---

*Built for the Big Blue Championship 🏏 • IPL Fantasy 2026*
