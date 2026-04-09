# IPL Match Preview Report — Generation Playbook

## Purpose

Generate a comprehensive, dark-themed HTML venue report for an upcoming IPL match. The report shows **venue-specific player stats** (batting & bowling) for all probable playing XI members, split into IPL and International columns, along with venue profile and pitch analysis.

**Output:** A single self-contained `.html` file (no external dependencies except optional CDN fonts). Named `{team1}-vs-{team2}-report.html`.

**Reference implementation:** `rr-vs-mi-report.html` (RR vs MI, Match 13, Barsapara, April 7 2026).

---

## Inputs Required

The user provides:
- **Team 1** and **Team 2** (e.g., RR vs MI)
- **Match date** (to identify the specific fixture)
- Optionally: venue name (if not, derive from schedule)

---

## Step-by-Step Data Collection

### Phase 1 — Match Identification

1. **Search for IPL 2026 schedule** to confirm:
   - Match number (e.g., Match 13)
   - Venue / stadium name and city
   - Date and start time (IST)
   - Which team is "home" at this venue

   Search queries:
   - `"IPL 2026 schedule {team1} vs {team2}"`
   - `"IPL 2026 fixtures April"` (or relevant month)

2. **Get probable playing XIs** for both teams:
   - Search: `"{team1} vs {team2} probable playing XI IPL 2026"` — pick the first reliable source
   - Note recent injuries, squad changes, team announcements
   - List exactly 11 players per team with roles (C, WK, etc.)

### Phase 2 — Player Venue Stats (IPL)

**⏱️ SPEED RULE: Use ONE stat site per player. Do NOT cross-reference multiple databases. Do NOT launch background agents — use direct parallel web searches.**

3. **Classify the venue**, then decide approach:

   **Big venue** (≥ 5 IPL matches per season, e.g., Wankhede, Chinnaswamy, Arun Jaitley, Eden Gardens):
   - Look back **2 seasons** only
   - **For each of the 22 players**, do ONE web search:
     - `"{player name} IPL stats at {stadium name}"` — AdvanceCricket or FantasyKhiladi will return M, Runs, Avg, SR, Wkts, Econ, and match-by-match scores
   - Show only **last 4–5 innings/spells** per player (most recent first, prioritise vs-opponent)
   - **Do NOT fetch ESPN scorecards.** The stat sites already have per-match breakdowns.

   **Small venue** (< 5 IPL matches per season, e.g., Barsapara, Dharamsala):
   - Look back **4–5 seasons**
   - Fetch scorecards for every match at the venue (small dataset)
   - Show ALL individual innings/spells

   **Execution:** Batch all 22 player searches into 4–5 parallel web_search calls (4–5 players per call). This completes in 2–3 rounds, not 20 minutes.

   **Skip players early:** If a stat site returns no data, move on. Don't retry with other sites.

### Phase 3 — International Stats (Optional, Quick)

4. **Search for recent international T20Is/ODIs at this venue** — ONE search:
   - `"international T20I matches at {stadium name} {year range}"`
   - Only fetch scorecards if a match exists AND players from the 22 are in it
   - For each relevant scorecard, extract only the 22 players' lines — skip everything else

### Phase 4 — Venue Profile

5. **ONE search** for venue stats:
   - `"{stadium name} IPL pitch report records stats"`
   - Extract: total matches, bat/chase split, avg 1st innings, highest/lowest, boundary size, pitch type, dew factor
   - **Validate par score** against actual highest/lowest totals

### Phase 5 — Generate HTML

6. Compile all data and generate the report. No further searches needed.

---

## Report Structure (HTML Sections)

The HTML report follows this section order:

### 1. Header
- Team logos/colors in gradient banner
- Match number, tournament, date, time, venue

### 2. Venue Profile Card
- Stat grid: Total matches, Bat-first wins, Chase wins, Avg 1st inn score, Highest total, Boundary size
- Pitch characteristics bar (batting % vs bowling %)
- Notes list: Pitch type, seam/spin windows, dew, par score, team1-vs-team2 record at venue

### 3. Team 1 — Batting Stats Table
- Two-section header: IPL at Venue | International at Venue
- Columns per section: M, Innings (last 4–5 inline score chips), Runs, Avg, SR
- Note column for context
- **Only include players who have data** — skip players with zero venue appearances

### 4. Team 1 — Bowling Stats Table
- Same split: IPL | International
- Columns per section: M, Spells (last 4–5 inline chips), Wkts, Econ
- Note column

### 5. Team 2 — Batting Stats Table
- Same structure as Team 1

### 6. Team 2 — Bowling Stats Table
- Same structure

### 7. Footer
- Data sources and generation date

---

## HTML Template & Styling

### Color Scheme (Dark Theme)
```css
--bg: #0f1117;          /* Page background */
--card: #1a1d27;        /* Card background */
--card-alt: #22252f;    /* Alternating/header bg */
--text: #e4e6eb;        /* Primary text */
--muted: #9ca3af;       /* Secondary text */
--green: #22c55e;       /* Good/highlight */
--red: #ef4444;         /* Bad/warning */
--amber: #f59e0b;       /* Caution/neutral */
--border: #2d3040;      /* Borders */
```

### Team Colors
Each IPL team has primary + light colors for badges and section headers:
```
CSK:  #ffc107 (yellow)      MI:   #004ba0 (blue)
RCB:  #d4213d (red)         DC:   #004c93 (blue)
KKR:  #3b215d (purple)      SRH:  #ff822a (orange)
RR:   #e74690 (pink)        PBKS: #d71920 (red)
GT:   #1c3c5a (navy)        LSG:  #004f91 (blue)
```

### Header Gradient
Use a gradient from Team1 color → purple midpoint → Team2 color:
```css
background: linear-gradient(135deg, var(--team1-color) 0%, #6b21a8 50%, var(--team2-color) 100%);
```

### Score Chip Styling
Individual scores are displayed as inline chips within a single table cell:
```html
<td class="scores">
  <span class="s">11(8) vs PBKS '23</span>
  <span class="s top">60(31) vs DC '23</span>   <!-- good score -->
  <span class="s bad">0(1) vs KKR '25</span>     <!-- duck -->
</td>
```

### Table Split Pattern
Each stat table uses a two-row header with `rowspan` and `colspan`:
```html
<tr>
  <th rowspan="2">Player</th>
  <th colspan="5" style="border-bottom:2px solid var(--team-color);">IPL at Venue</th>
  <th colspan="5" style="border-left:3px solid var(--border);">International at Venue</th>
  <th rowspan="2">Note</th>
</tr>
<tr>
  <th>M</th><th>Innings</th><th>Runs</th><th>Avg</th><th>SR</th>
  <th style="border-left:3px solid var(--border);">M</th><th>Innings</th><th>Runs</th><th>Avg</th><th>SR</th>
</tr>
```

### No-Data Cells
When a player has no data for a section, use colspan with "—" or "N/A (Country)" for overseas players who wouldn't play India internationals:
```html
<!-- No international data (Indian player) -->
<td class="dim" style="border-left:3px solid var(--border);">—</td>
<td class="dim" colspan="4">—</td>

<!-- No international data (overseas player) -->
<td class="dim" style="border-left:3px solid var(--border);">—</td>
<td class="dim" colspan="4">N/A (West Indies)</td>
```

---

## Important Notes & Edge Cases

### Player Movement Between Franchises
- Players frequently change teams via auction/trade. A player may have venue data from playing for a **different franchise** at this ground.
- Example: Trent Boult played for RR at Barsapara in 2023-24, but is now with MI in 2026.
- Example: Jadeja played for CSK at Barsapara in 2025, now with RR in 2026.
- **Always tag such scores** with `(for {old team})` in the score chip.

### Home Ground Exclusivity
- Some venues are used exclusively by one franchise:
  - Barsapara, Guwahati → RR only (since 2023)
  - Dharamsala → PBKS
  - Uppal, Hyderabad → SRH
- This means the away team will have **zero IPL data** at these venues. Their only venue data comes from internationals or playing for other teams.
- **Always add a warning note** for the team with no IPL venue history.

### International Match Filtering
- For international matches, players may have played for **any country**, not just India.
- NZ players (Boult, Santner, etc.) may have played at Indian venues in bilateral series.
- Always note the country context: `vs IND T20I '26 (for NZ)`

### Stat Calculation Gotchas
- **Batting Average:** Total runs ÷ number of dismissals. If a player was not out in every innings, avg = runs (marked with `*`).
- **Strike Rate:** (Total runs ÷ Total balls faced) × 100. Round to nearest integer.
- **Bowling Economy:** Total runs conceded ÷ Total overs bowled. Display to 2 decimal places.
- **Matches (M):** Count of innings batted (batting) or matches bowled (bowling). A player may bat but not bowl or vice versa — M may differ between batting and bowling tables.

### Par Score Validation
- **Never** claim "200+ needed to feel safe" if the highest total at the venue is under 200.
- Par score should be derived from actual average 1st innings scores ± 10 runs.

### Data Freshness
- IPL 2026 matches already played can be included as additional context in notes, but the structured tables should focus on historical data (previous seasons) for consistency.
- Mention current-season form in the "Note" column.

### Search Strategy
**One source per data type. Do not cross-validate.**
- **Player venue stats:** `"{player name} IPL stats at {stadium name}"` — AdvanceCricket or FantasyKhiladi (whichever returns first)
- **Venue profile/records:** `"{stadium name} IPL pitch report records"` — any cricket site
- **Playing XIs:** `"{team1} vs {team2} probable playing XI IPL 2026"` — first reliable result
- **International scorecards (if needed):** `"India T20I at {stadium name} {year} scorecard"` — ESPNcricinfo

### Lookback Rules
- **Big venue** (≥ 5 matches/season): 2 seasons back, last 4–5 scores per player
- **Small venue** (< 5 matches/season): 4–5 seasons back, all scores

---

## Quick Checklist

- [ ] Both playing XIs identified (11 each)
- [ ] Players with zero venue data excluded from tables
- [ ] Scores vs current opponent highlighted (`.top` class)
- [ ] Max 4–5 inline scores per player (big venues)
- [ ] "M" column reflects total matches, aggregates reflect career at venue
- [ ] Players who played for different teams are tagged (e.g., "(for GT)")
- [ ] Team colors match the correct franchise
- [ ] Par score consistent with actual data
- [ ] HTML is self-contained, renders in browser

---

## Example Invocation

> **User:** "Generate a match preview report for CSK vs RCB tomorrow"
>
> **Agent steps:**
> 1. Search IPL 2026 schedule → find CSK vs RCB, Match 22, Chepauk, Chennai, Apr 15
> 2. Search probable playing XIs for both teams
> 3. Find all IPL matches at Chepauk 2022-2025 (likely 15-20 matches — it's a major venue)
> 4. Find all internationals at Chepauk 2021-2026
> 5. Fetch each scorecard, extract player data for all 22 players
> 6. Compile stats, generate HTML using dark theme template
> 7. Save as `csk-vs-rcb-report.html`, open in browser to verify

---

*Last updated: 2026-04-07 · Based on RR vs MI Match 13 report generation session*
