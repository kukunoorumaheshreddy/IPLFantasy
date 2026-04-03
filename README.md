# 🏏 Big Blue Championship — IPL Fantasy 2026

A live visualization dashboard for our IPL Fantasy league (League #6200104, 12 teams).

**👉 [View the Dashboard](https://kukunoorumaheshreddy.github.io/IPLFantasy/dashboard.html)**

## Features

- **Standings** — current rankings with rank change from Match 1
- **Prizes** — Top 3 Overall, Master of Boosters, Playoff Champion
- **Per-Match Leaderboard** — drill into any individual match
- **Rank Progression** — line chart showing rank over time
- **Points Race** — animated bar chart race + line drawing animation (synced, side-by-side)
- **Rank Heatmap** — color-coded rank grid across all matches

---

## After Each Match (The Only Required Step)

Do this **once points are finalized** — usually 30–60 min after the match ends.

### Step 1: Log in to the fantasy site

Open [fantasy.iplt20.com](https://fantasy.iplt20.com/classic/home) in Chrome/Edge. Make sure you're **logged in**.

### Step 2: Open the browser console

Press `F12` (or right-click → Inspect), then click the **Console** tab.

> 💡 If Chrome warns "Don't paste code you don't understand" — type `allow pasting` and press Enter first.

### Step 3: Paste the extraction script

Open [`update-data.js`](https://github.com/kukunoorumaheshreddy/IPLFantasy/blob/main/update-data.js), copy the **entire file**, paste it into the console, and press **Enter**.

### Step 4: Wait ~30–60 seconds

The script fetches data for all 12 league members across all completed matches. You'll see progress in the console.

When done, a **Save File dialog** will appear with the filename `ipl-fantasy-v2-master-gd{N}.json`.

### Step 5: Save the file to the repo

Save (or move) the file directly into the `master-snapshots/` folder in your local clone of this repo. **Make sure the gameday number (gdN) in the filename is correct** — it should match the latest completed match.

Then push to GitHub:
```bash
git add master-snapshots/
git commit -m "Match N data"
git push
```

> 💡 If you don't have git access, just send the JSON file to Mahesh — he'll upload it.

---

## Quick Reference

| When | What | How | Required? |
|------|------|-----|-----------|
| After each match | Pull latest data | Paste `update-data.js` in console | ✅ Yes |
| After download | Save to repo | Save into `master-snapshots/` + git push | ✅ Yes |
| Any time | View dashboard | [Open dashboard](https://kukunoorumaheshreddy.github.io/IPLFantasy/dashboard.html) | — |

---

## Troubleshooting

### "No completed gamedays" or empty data
You're not logged in. Go to [fantasy.iplt20.com](https://fantasy.iplt20.com/classic/home), log in, then run the script again **in the same tab**.

### Chrome says "Don't paste code you don't understand"
Type `allow pasting` in the console and press Enter. Then paste the script.

### Script seems stuck / no download after 2 minutes
Check the console for red errors. Most likely your session expired — refresh the page, log in again, then re-paste the script.

### Dashboard shows "No data loaded"
The JSON file hasn't been pushed to the repo yet. Make sure the file is in the `master-snapshots/` folder and pushed to GitHub.

### Points look slightly different from the fantasy app
The script accounts for boosters (power-ups), but some edge cases may cause small differences. These are cosmetic and don't affect rankings.

---

## How It Works

### update-data.js
1. Fetches the IPL match schedule to find all completed matches
2. For each league member: calls the `overall-get` API to get all match data in one shot
3. Detects booster usage (FREE_HIT, DOUBLE_POWER, etc.) and calculates bonus points
4. Builds cumulative rankings, transfer usage, and per-match breakdowns
5. Downloads one self-contained JSON file with everything

### Booster Calculation

Each team gets **6 booster types (10 total uses)** across the tournament. When a booster is activated for a match, bonus points are calculated on top of normal scoring.

**The 6 Boosters:**

| Booster | What It Does | Uses |
|---------|-------------|------|
| 🎯 **FREE_HIT** | Your entire team's points are doubled for this match | 1 |
| 🃏 **WILD_CARD** | Same as Free Hit — full team doubled | 1 |
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
| **FREE_HIT** | Entire team scores double | All players' effective pts × 2 (total match doubled) |
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
Pure HTML + JavaScript — no server, no install. Hosted free on GitHub Pages. Auto-loads the latest JSON from the `master-snapshots/` folder.

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
| 11 | FREE_HIT ✅ |
| ? | WILD_CARD (not yet seen) |
| ? | DOUBLE_POWER (not yet seen) |
| ? | TRIPLE_CAPTAIN (not yet seen) |
| ? | FOREIGN_STARS (not yet seen) |
| ? | INDIAN_WARRIORS (not yet seen) |

This table will fill in as the tournament progresses and more boosters are used.

---

*Built for the Big Blue Championship 🏏 • IPL Fantasy 2026*
