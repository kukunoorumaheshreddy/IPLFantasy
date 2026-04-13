// ============================================================
// IPL Fantasy League — Master Data Updater v3
// ============================================================
// Uses overall-get API + targeted gamedayplayers fetch for
// booster matches only. Calculates booster-attributed points.
//
// Outputs: ipl-fantasy-v2-master-gdN.json
//
// HOW TO USE:
//   1. Go to fantasy.iplt20.com and LOG IN
//   2. Open DevTools (F12) → Console
//   3. Paste this entire script → Enter
//   4. Script fetches data, uploads to GitHub Gist, and repeats every 4 min
//   5. Dashboard auto-reads from Gist on refresh
//   6. Close the tab to stop polling
//
// FIRST RUN: You'll be prompted for your GitHub PAT (stored in localStorage).
// To reset: localStorage.removeItem('github_pat')
// ============================================================

(async () => {
  const LEAGUE_ID = 6200104;
  const BASE = "https://fantasy.iplt20.com/classic/api/";
  const HEADERS = { "entity": "d3tR0!t5m@sh" };
  const DELAY_MS = 300;
  const PHASE_ID = 1;
  const POLL_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
  const REVIEW_MODE = false; // true = download JSON for review, defer upload; false = upload directly

  // ── GitHub Gist config ──
  const GIST_ID = "6c5971610305a9860560f135da03629b";
  const GIST_FILENAME = "ipl-fantasy-data.json";
  const GIST_API = `https://api.github.com/gists/${GIST_ID}`;
  let GITHUB_PAT = localStorage.getItem("github_pat");
  if (!GITHUB_PAT) {
    GITHUB_PAT = prompt("Enter your GitHub PAT with gist scope (one-time setup):");
    if (GITHUB_PAT) localStorage.setItem("github_pat", GITHUB_PAT);
    else { console.error("No GitHub PAT provided. Aborting."); return; }
  }

  const log = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #6c5ce7; font-weight: bold;");
  const ok = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #00b894; font-weight: bold;");
  const warn = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #fdcb6e; font-weight: bold;");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function apiFetch(path) {
    const r = await fetch(BASE + path, { headers: HEADERS, credentials: "include" });
    return r.json();
  }


  async function uploadToGist(data) {
    const payload = JSON.stringify(data);
    const sizeKB = (payload.length / 1024).toFixed(1);
    log(`Gist payload size: ${sizeKB} KB`);
    const resp = await fetch(GIST_API, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${GITHUB_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: payload } } }),
    });
    if (!resp.ok) throw new Error(`Gist upload failed: ${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  // ── Booster definitions ──
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ BOOSTER POINT INTERPRETATION: B (All qualifying player points)     │
  // │                                                                     │
  // │ "Master of Boosters" prize = total booster-attributed points.       │
  // │ These are calculated SEPARATELY from league standings points.       │
  // │                                                                     │
  // │ Current interpretation (B):                                         │
  // │   FREE_HIT:        Total match gamedayPoints (squad flexibility)    │
  // │   WILD_CARD:       Total match gamedayPoints (squad flexibility)    │
  // │   DOUBLE_POWER:    All players' points × 2 (full doubled amount)   │
  // │   TRIPLE_CAPTAIN:  Captain base pts × 3 (full tripled amount)      │
  // │   FOREIGN_STARS:   Foreign players' effective pts × 2 only         │
  // │                    (Indian players NOT counted)                      │
  // │   INDIAN_WARRIORS: Indian players' effective pts × 2 only          │
  // │                    (Foreign players NOT counted)                     │
  // │                                                                     │
  // │ Alternative interpretation (A — extra only):                        │
  // │   To switch, change calculations to subtract normal points:         │
  // │   DOUBLE_POWER:    gdPts (the extra copy, not 2x)                  │
  // │   TRIPLE_CAPTAIN:  captain base × 1 (extra 1x beyond normal 2x)   │
  // │   FOREIGN_STARS:   sum of foreign effective pts × 1 (the extra)    │
  // │   INDIAN_WARRIORS: sum of indian effective pts × 1 (the extra)     │
  // │   FREE_HIT/WILD_CARD: same in both interpretations                 │
  // └─────────────────────────────────────────────────────────────────────┘
  //
  // Booster IDs are mapped as discovered. Unknown IDs fall back to total match points.
  const BOOSTER_TYPE = {
    3: 'DOUBLE_POWER',
    9: 'FOREIGN_STARS',
    10: 'INDIAN_WARRIORS',
    11: 'FREE_HIT',
    12: 'TRIPLE_CAPTAIN',
    // WILD_CARD: ID not yet seen (1 use available)
  };

  const WHOLE_TEAM_BOOSTERS = ['FREE_HIT', 'WILD_CARD', 'DOUBLE_POWER'];

  // ── Main extraction function (called each poll cycle) ──
  async function runExtraction() {

  // ── 0. Load existing data from Gist (for cached player data) ──
  let cachedPlayerData = {}; // gd -> { playerId -> { name, gdPoints, isOverseas, teamId } }
  try {
    log("Loading existing data from Gist for player cache...");
    const existing = await fetch(`https://gist.githubusercontent.com/kukunoorumaheshreddy/${GIST_ID}/raw/${GIST_FILENAME}?t=${Date.now()}`).then(r => r.json());
    if (existing && existing.playerDataCache) {
      cachedPlayerData = existing.playerDataCache;
      log(`  Loaded cached player data for ${Object.keys(cachedPlayerData).length} gamedays`);
    } else {
      log("  No cached player data found, will fetch all.");
    }
  } catch (e) {
    log("  Could not load existing data, will fetch all: " + e.message);
  }

  // ── 1. Get fixtures ──
  log("Fetching fixtures...");
  const fixtures = await apiFetch("feed/tour-fixtures");
  const allMatches = fixtures?.Data?.Value || [];
  const completedOrLive = allMatches
    .filter(m => m.MatchStatus === 2 || m.MatchStatus === 1 || m.MatchStatus === 3 || m.MatchStatus === 5)
    .sort((a, b) => a.TourGamedayId - b.TourGamedayId);
  const gamedayIds = [...new Set(completedOrLive.map(m => m.TourGamedayId))].sort((a, b) => a - b);
  log(`Found ${gamedayIds.length} completed/live matches: GD ${gamedayIds.join(", ")}`);

  if (gamedayIds.length === 0) {
    warn("No completed matches found. Make sure you're logged in!");
    return;
  }

  // Build match info lookup
  const matchInfo = {};
  completedOrLive.forEach(m => {
    matchInfo[m.TourGamedayId] = {
      matchName: `${m.HomeTeamShortName} vs ${m.AwayTeamShortName}`,
      matchDate: m.Matchdate?.split("T")[0] || null,
      isLive: m.MatchStatus === 1,
      isAbandoned: m.MatchStatus === 5 || m.IsGDAbandoned === "1",
      phaseId: m.PhaseId || null,
      homeTeamId: m.HomeTeamId,
      awayTeamId: m.AwayTeamId,
    };
  });

  // ── 2. Get league members ──
  log("Fetching league members...");
  const latestGd = gamedayIds[gamedayIds.length - 1];
  const lb = await apiFetch(
    `user/leagues/live/${LEAGUE_ID}/leaderboard?optType=1&gamedayId=${latestGd}&phaseId=${PHASE_ID}&pageNo=1&topNo=500&pageChunk=500&pageOneChunk=500&minCount=50&leagueId=${LEAGUE_ID}`
  );
  const rawMembers = lb?.Data?.Value?.Members || lb?.Data?.Value || [];
  const members = rawMembers.map(m => ({
    teamName: m.temname || m.teamName,
    teamId: m.temid || m.teamId,
    socialId: m.usrscoid || m.userId,
    apiTotalPoints: m.points || m.totalPoints || 0,
  }));
  log(`Found ${members.length} members`);
  await sleep(DELAY_MS);

  // ── 3. Fetch overall-get for each member ──
  const gdIdList = gamedayIds.join(",");
  const teamData = {};

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    log(`Fetching overall for ${m.teamName} [${i + 1}/${members.length}]...`);

    const resp = await apiFetch(
      `user/guid/lb-team/overall-get?optType=2&teamgamedayId=${latestGd}&arrtourGamedayId=${gdIdList}&phaseId=${PHASE_ID}&teamId=${m.teamId}&SocialId=${m.socialId}`
    );
    const val = resp?.Data?.Value;

    if (!val) {
      warn(`  ${m.teamName}: no data returned!`);
      teamData[m.teamName] = { perMatch: {}, gdPtsMap: {}, overallPts: 0, boosterCount: 0 };
      await sleep(DELAY_MS);
      continue;
    }

    const gdPtsMap = {};
    (val.gdpts || []).forEach(g => { gdPtsMap[g.gdid] = parseFloat(g.gdpts) || 0; });

    const perMatch = {};
    (val.teams || []).forEach(t => {
      perMatch[t.gdid] = {
        captainId: t.mcapt,
        captain: t.mcaptnm || String(t.mcapt),
        viceCaptainId: t.vcapt,
        viceCaptain: t.vcaptnm || String(t.vcapt),
        boosterId: t.boosterid && t.boosterid !== 0 ? t.boosterid : null,
        subsUsed: t.subusr ?? null,
        subsLeft: t.subleft ?? null,
        subsThisMatch: t.subtotal ?? null,
        squad: t.plyid || [],
      };
    });

    // Derive subsTotal from earliest gameday's subleft (no subs used yet = full allowance)
    const firstGdKey = gamedayIds.find(g => perMatch[g]);
    const subsTotal = firstGdKey ? (perMatch[firstGdKey].subsLeft ?? null) : null;

    teamData[m.teamName] = {
      perMatch,
      gdPtsMap,
      overallPts: val.ovpts ? parseFloat(val.ovpts) : null,
      boosterCount: val.userbstcnt || 0,
      subsTotal,
    };

    log(`  ${m.teamName}: ${Object.keys(perMatch).length} matches, boosters=${val.userbstcnt || 0}`);
    await sleep(DELAY_MS);
  }

  // ── 3b. Fallback: calculate live match scores using v1 approach ──
  // Find gamedays that are live/recent but have no points from overall-get
  const playerDataByGd = {}; // gd -> { playerId -> { name, gdPoints, isOverseas, teamId } }
  const liveGds = gamedayIds.filter(gd => matchInfo[gd]?.isLive);
  const missingPtsGds = gamedayIds.filter(gd => {
    // Check if ANY member is missing points for this gameday
    return members.some(m => {
      const td = teamData[m.teamName];
      return td?.perMatch?.[gd] && (td?.gdPtsMap?.[gd] === undefined || td?.gdPtsMap?.[gd] === 0);
    });
  });
  const fallbackGds = [...new Set([...liveGds, ...missingPtsGds])].filter(gd => {
    // Only fallback for GDs where points are actually missing
    return members.every(m => !teamData[m.teamName]?.gdPtsMap?.[gd]);
  });

  const fallbackTimestamps = {}; // gd -> ISO timestamp of when live data was fetched

  if (fallbackGds.length > 0) {
    log(`\n── Live/missing score fallback for GD: ${fallbackGds.join(', ')} ──`);

    for (const gd of fallbackGds) {
      log(`Fetching live player points for GD${gd}...`);
      const playersResp = await apiFetch(
        `feed/live/gamedayplayers?lang=en&tourgamedayId=${gd}&teamgamedayId=${gd}&liveVersion=999`
      );
      const allPlayers = playersResp?.Data?.Value?.Players || [];
      if (allPlayers.length === 0) {
        warn(`  GD${gd}: no player data available yet, skipping.`);
        continue;
      }

      fallbackTimestamps[gd] = new Date().toISOString();

      // Filter: only use points for players whose IPL team is playing in this fixture
      // The gamedayplayers API returns ALL players with combined points across all live matches
      const mi = matchInfo[gd];
      const matchTeamIds = new Set();
      if (mi?.homeTeamId) matchTeamIds.add(mi.homeTeamId);
      if (mi?.awayTeamId) matchTeamIds.add(mi.awayTeamId);

      const playerMap = {};
      allPlayers.forEach(p => {
        const playsInThisMatch = matchTeamIds.size === 0 || matchTeamIds.has(p.TeamId);
        playerMap[p.Id] = {
          name: p.Name,
          gdPoints: playsInThisMatch ? (p.GamedayPoints || 0) : 0,
          isOverseas: p.IS_FP === 1 || p.IS_FP === '1' || p.Is_FP === 1 || p.is_fp === 1,
          teamId: p.TeamId,
          isAnnounced: p.IsAnnounced || 0,
        };
      });
      // Save for transfer efficiency (step 5b will skip this GD since it's already populated)
      playerDataByGd[gd] = playerMap;
      log(`  ${allPlayers.length} players loaded for GD${gd} (${mi?.matchName}), filtered to teams: ${[...matchTeamIds].join(', ')}`);

      for (const m of members) {
        const td = teamData[m.teamName];
        const pm = td?.perMatch?.[gd];
        if (!pm || td.gdPtsMap[gd]) continue;

        let total = 0;
        (pm.squad || []).forEach(pid => {
          const p = playerMap[pid];
          const base = p ? p.gdPoints : 0;
          let mult = 1;
          if (pid === pm.captainId) mult = 2;
          else if (pid === pm.viceCaptainId) mult = 1.5;
          total += base * mult;
        });
        total = Math.round(total * 100) / 100;
        td.gdPtsMap[gd] = total;
        log(`  ${m.teamName} GD${gd}: ${total} pts (calculated from live player data)`);
      }
      await sleep(DELAY_MS);
    }
  }

  // ── 4. Identify booster matches and fetch player data for them ──
  log("\n── Identifying booster matches ──");
  const boosterMatches = []; // { teamName, gd, boosterId, boosterType }
  const boosterGds = new Set();

  for (const m of members) {
    const td = teamData[m.teamName];
    for (const gd of gamedayIds) {
      const pm = td?.perMatch?.[gd];
      if (pm?.boosterId) {
        let bType = BOOSTER_TYPE[pm.boosterId];
        if (!bType) {
          // All other IDs are mapped — any unknown must be WILD_CARD
          bType = 'WILD_CARD';
          BOOSTER_TYPE[pm.boosterId] = 'WILD_CARD';
          ok(`  🃏 Discovered WILD_CARD! Booster ID ${pm.boosterId} auto-mapped.`);
        }
        boosterMatches.push({ teamName: m.teamName, gd, boosterId: pm.boosterId, boosterType: bType });
        boosterGds.add(gd);
        log(`  ${m.teamName} used booster ${pm.boosterId} (${bType}) in GD${gd}`);
      }
    }
  }

  if (boosterMatches.length === 0) {
    log("  No boosters used yet.");
  }

  // Fetch player data ONLY for gamedays where boosters were used (that we don't already have)
  const needsPlayerData = [...boosterGds].filter(gd => {
    // Only need player-level data for boosters that aren't whole-team types
    return boosterMatches.some(bm =>
      bm.gd === gd && !WHOLE_TEAM_BOOSTERS.includes(bm.boosterType)
    );
  });

  // Fetch for booster GDs that we don't already have player data for
  for (const gd of boosterGds) {
    if (playerDataByGd[gd]) {
      log(`  GD${gd}: reusing player data from step 3b`);
      continue;
    }
    log(`Fetching player data for booster GD${gd}...`);
    const playersResp = await apiFetch(
      `feed/live/gamedayplayers?lang=en&tourgamedayId=${gd}&teamgamedayId=${gd}&liveVersion=999`
    );
    const allPlayers = playersResp?.Data?.Value?.Players || [];

    // Filter player points by match teams (prevents cross-match point bleed)
    const mi = matchInfo[gd];
    const matchTeamIds = new Set();
    if (mi?.homeTeamId) matchTeamIds.add(mi.homeTeamId);
    if (mi?.awayTeamId) matchTeamIds.add(mi.awayTeamId);

    const pmap = {};
    allPlayers.forEach(p => {
      const playsInThisMatch = matchTeamIds.size === 0 || matchTeamIds.has(p.TeamId);
      pmap[p.Id] = {
        name: p.Name,
        gdPoints: playsInThisMatch ? (p.GamedayPoints || 0) : 0,
        isOverseas: p.IS_FP === 1 || p.IS_FP === '1' || p.Is_FP === 1 || p.is_fp === 1,
        countryCode: p.CountryCode || p.Nationality || null,
        skillId: p.SkillId || p.Skill || null,
        teamId: p.TeamId,
        isAnnounced: p.IsAnnounced || 0,
      };
    });
    playerDataByGd[gd] = pmap;
    log(`  ${allPlayers.length} players loaded for GD${gd} (filtered to ${mi?.matchName})`);

    if ([...boosterGds][0] === gd && allPlayers.length > 0) {
      log(`  Sample player keys: ${Object.keys(allPlayers[0]).join(', ')}`);
    }
    await sleep(DELAY_MS);
  }

  // ── 5. Calculate booster-attributed points ──
  log("\n── Calculating booster points ──");
  const boosterPointsMap = {}; // teamName -> [ { gd, boosterId, boosterType, boosterPoints, details } ]

  for (const bm of boosterMatches) {
    const td = teamData[bm.teamName];
    const pm = td.perMatch[bm.gd];
    const gdPts = td.gdPtsMap[bm.gd] || 0;
    const players = playerDataByGd[bm.gd] || {};

    let boosterPoints = 0;
    let details = '';

    // Interpretation B: All points scored by qualifying players (at their boosted rate)
    if (bm.boosterType === 'FREE_HIT' || bm.boosterType === 'WILD_CARD') {
      // Entire match points count (whole team qualifies)
      boosterPoints = gdPts;
      details = `Total match pts: ${gdPts}`;

    } else if (bm.boosterType === 'DOUBLE_POWER') {
      // Entire team doubled — all players' doubled points
      boosterPoints = gdPts * 2;
      details = `Double power (all players 2x): ${gdPts} × 2 = ${gdPts * 2}`;

    } else if (bm.boosterType === 'TRIPLE_CAPTAIN') {
      // Captain gets 3x — booster pts = captain's full boosted amount (base × 3)
      const captainPlayer = players[pm.captainId];
      if (captainPlayer) {
        boosterPoints = captainPlayer.gdPoints * 3;
        details = `Triple captain (${captainPlayer.name}): ${captainPlayer.gdPoints} × 3 = ${boosterPoints}`;
      } else {
        boosterPoints = 0;
        details = `Captain player data not found (ID: ${pm.captainId})`;
      }

    } else if (bm.boosterType === 'FOREIGN_STARS') {
      // Foreign players get 2x — booster pts = all foreign players' doubled points
      let foreignPts = 0;
      const foreignDetails = [];
      pm.squad.forEach(pid => {
        const p = players[pid];
        if (p && p.isOverseas) {
          let baseMult = 1;
          if (pid === pm.captainId) baseMult = 2;
          else if (pid === pm.viceCaptainId) baseMult = 1.5;
          const boosted = p.gdPoints * baseMult * 2;
          foreignPts += boosted;
          foreignDetails.push(`${p.name}: ${p.gdPoints}×${baseMult}×2=${boosted}`);
        }
      });
      boosterPoints = foreignPts;
      details = `Foreign players (doubled): ${foreignDetails.join(', ')} = ${foreignPts}`;

    } else if (bm.boosterType === 'INDIAN_WARRIORS') {
      // Indian players get 2x — booster pts = all Indian players' doubled points
      let indianPts = 0;
      const indianDetails = [];
      pm.squad.forEach(pid => {
        const p = players[pid];
        if (p && !p.isOverseas) {
          let baseMult = 1;
          if (pid === pm.captainId) baseMult = 2;
          else if (pid === pm.viceCaptainId) baseMult = 1.5;
          const boosted = p.gdPoints * baseMult * 2;
          indianPts += boosted;
          indianDetails.push(`${p.name}: ${p.gdPoints}×${baseMult}×2=${boosted}`);
        }
      });
      boosterPoints = indianPts;
      details = `Indian players (doubled): ${indianDetails.join(', ')} = ${indianPts}`;

    } else {
      // Unknown booster — fall back to total match points
      boosterPoints = gdPts;
      details = `Unknown booster #${bm.boosterId}, using total match pts: ${gdPts}`;
      warn(`  ⚠️ Unknown booster ID ${bm.boosterId} for ${bm.teamName} in GD${bm.gd}. Using total match points as fallback.`);
    }

    if (!boosterPointsMap[bm.teamName]) boosterPointsMap[bm.teamName] = [];
    boosterPointsMap[bm.teamName].push({
      gd: bm.gd,
      boosterId: bm.boosterId,
      boosterType: bm.boosterType,
      boosterPoints: Math.round(boosterPoints * 100) / 100,
      matchPoints: gdPts,
      details,
    });

    log(`  ${bm.teamName} GD${bm.gd} (${bm.boosterType}): ${boosterPoints} booster pts (match total: ${gdPts})`);

    // For live/estimated matches, the fallback only calculated base score.
    // The API's gdpts for completed matches already includes booster effects,
    // so we need to apply boosters to live match scores too.
    if (fallbackGds.includes(bm.gd)) {
      const td = teamData[bm.teamName];
      const basePts = td.gdPtsMap[bm.gd] || 0;
      let boostedTotal = basePts;

      if (bm.boosterType === 'DOUBLE_POWER') {
        boostedTotal = basePts * 2;
      } else if (bm.boosterType === 'TRIPLE_CAPTAIN') {
        // Captain already counted as x2 in base; add extra x1 for triple
        const captainPlayer = players[pm.captainId];
        if (captainPlayer) boostedTotal = basePts + captainPlayer.gdPoints;
      } else if (bm.boosterType === 'FOREIGN_STARS') {
        // Add extra copy of foreign players' effective pts
        let foreignExtra = 0;
        pm.squad.forEach(pid => {
          const p = players[pid];
          if (p && p.isOverseas) {
            let baseMult = pid === pm.captainId ? 2 : pid === pm.viceCaptainId ? 1.5 : 1;
            foreignExtra += p.gdPoints * baseMult;
          }
        });
        boostedTotal = basePts + foreignExtra;
      } else if (bm.boosterType === 'INDIAN_WARRIORS') {
        // Add extra copy of Indian players' effective pts
        let indianExtra = 0;
        pm.squad.forEach(pid => {
          const p = players[pid];
          if (p && !p.isOverseas) {
            let baseMult = pid === pm.captainId ? 2 : pid === pm.viceCaptainId ? 1.5 : 1;
            indianExtra += p.gdPoints * baseMult;
          }
        });
        boostedTotal = basePts + indianExtra;
      }
      // FREE_HIT / WILD_CARD: no score multiplier, base stays as-is

      boostedTotal = Math.round(boostedTotal * 100) / 100;
      if (boostedTotal !== basePts) {
        td.gdPtsMap[bm.gd] = boostedTotal;
        log(`    ↳ Live booster applied: ${basePts} → ${boostedTotal}`);
      }
    }
  }

  // ── 5b. Fetch player data for transfer efficiency ──
  // Merge step 3b's live player data and step 4's booster player data into playerDataByGd
  // Then fetch remaining gamedays from cache or API
  log("\n── Fetching player data for transfer efficiency ──");

  // Step 3b saves to local playerMap — we need to also save those
  // (Already in playerDataByGd from step 4 for booster GDs)

  // Identify which GDs still need player data
  const gdsNeedingPlayerData = gamedayIds.filter(gd => !playerDataByGd[gd]);
  const gdsFromCache = [];
  const gdsToFetch = [];

  for (const gd of gdsNeedingPlayerData) {
    if (cachedPlayerData[gd] && !matchInfo[gd]?.isLive) {
      // Use cached data for completed, non-live gamedays
      playerDataByGd[gd] = cachedPlayerData[gd];
      gdsFromCache.push(gd);
    } else {
      gdsToFetch.push(gd);
    }
  }

  if (gdsFromCache.length > 0) log(`  Using cached player data for GDs: ${gdsFromCache.join(', ')}`);
  if (gdsToFetch.length > 0) log(`  Fetching player data for GDs: ${gdsToFetch.join(', ')}`);

  for (const gd of gdsToFetch) {
    const playersResp = await apiFetch(
      `feed/live/gamedayplayers?lang=en&tourgamedayId=${gd}&teamgamedayId=${gd}&liveVersion=999`
    );
    const allPlayers = playersResp?.Data?.Value?.Players || [];
    if (allPlayers.length === 0) {
      log(`  GD${gd}: no player data, skipping.`);
      continue;
    }

    const mi = matchInfo[gd];
    const matchTeamIds = new Set();
    if (mi?.homeTeamId) matchTeamIds.add(mi.homeTeamId);
    if (mi?.awayTeamId) matchTeamIds.add(mi.awayTeamId);

    const pmap = {};
    allPlayers.forEach(p => {
      const playsInThisMatch = matchTeamIds.size === 0 || matchTeamIds.has(p.TeamId);
      pmap[p.Id] = {
        name: p.Name,
        gdPoints: playsInThisMatch ? (p.GamedayPoints || 0) : 0,
        isOverseas: p.IS_FP === 1 || p.IS_FP === '1' || p.Is_FP === 1 || p.is_fp === 1,
        teamId: p.TeamId,
        isAnnounced: p.IsAnnounced || 0,
      };
    });
    playerDataByGd[gd] = pmap;
    log(`  GD${gd} (${mi?.matchName}): ${allPlayers.length} players loaded`);
    await sleep(DELAY_MS);
  }

  log(`  Player data available for ${Object.keys(playerDataByGd).length}/${gamedayIds.length} gamedays`);

  // ── 6. Build cumulative rankings per gameday ──
  log("\n── Building cumulative rankings ──");
  const cumulative = {};
  members.forEach(m => { cumulative[m.teamName] = 0; });

  // Track "last real squad" per team for transfer efficiency
  // FREE_HIT squads revert after the match — skip lastRealSquad update
  // WILD_CARD squads persist — update lastRealSquad, but skip transfer diff (changes are free)
  const lastRealSquad = {}; // teamName -> Set of player IDs
  members.forEach(m => { lastRealSquad[m.teamName] = null; });

  const output = {
    leagueId: LEAGUE_ID,
    leagueName: "Big Blue Championship",
    extractedAt: new Date().toISOString(),
    dataVersion: 3,
    totalGamedays: gamedayIds.length,
    members: members.map(m => ({
      teamName: m.teamName,
      teamId: m.teamId,
      socialId: m.socialId,
      boosterCount: teamData[m.teamName]?.boosterCount || 0,
      boosterDetails: boosterPointsMap[m.teamName] || [],
      totalBoosterPoints: (boosterPointsMap[m.teamName] || []).reduce((s, b) => s + b.boosterPoints, 0),
    })),
    gamedays: [],
    // Cache player data for completed gamedays (avoid re-fetching)
    playerDataCache: Object.fromEntries(
      Object.entries(playerDataByGd).filter(([gd]) => {
        const gdNum = parseInt(gd);
        return !matchInfo[gdNum]?.isLive && !fallbackGds.includes(gdNum);
      })
    ),
  };

  // Determine which gamedays include per-player details (C/VC pts, active players)
  // Rule: last completed match + all live matches
  const liveGdSet = new Set(gamedayIds.filter(g => matchInfo[g]?.isLive));
  const completedGdList = gamedayIds.filter(g => !matchInfo[g]?.isLive);
  const lastCompleted = liveGdSet.size > 0
    ? completedGdList.slice(-1)   // 1 completed when live matches exist
    : completedGdList.slice(-2);  // 2 completed when nothing is live
  const playerDetailGds = new Set([...liveGdSet, ...lastCompleted]);
  log(`Including player details for GDs: ${[...playerDetailGds].join(', ')}`);

  for (const gd of gamedayIds) {
    const mi = matchInfo[gd] || { matchName: `Match ${gd}`, matchDate: null, isLive: false, isAbandoned: false };
    const matchTeamIds = new Set();
    if (mi.homeTeamId) matchTeamIds.add(mi.homeTeamId);
    if (mi.awayTeamId) matchTeamIds.add(mi.awayTeamId);

    members.forEach(m => {
      cumulative[m.teamName] += teamData[m.teamName]?.gdPtsMap?.[gd] || 0;
    });

    const ranked = members
      .map(m => {
        const td = teamData[m.teamName]?.perMatch?.[gd] || {};
        const gdPts = teamData[m.teamName]?.gdPtsMap?.[gd] || 0;
        const bm = (boosterPointsMap[m.teamName] || []).find(b => b.gd === gd);

        // Transfer efficiency: compare current squad to last real squad
        const currentSquad = new Set(td.squad || []);
        const prevSquad = lastRealSquad[m.teamName];
        const boosterType = td.boosterId ? (BOOSTER_TYPE[td.boosterId] || null) : null;
        // FREE_HIT/WILD_CARD: no paid transfers — skip diff calculation
        // But only FREE_HIT reverts the squad; WILD_CARD changes are permanent
        const isFreeSquadChange = boosterType === 'FREE_HIT' || boosterType === 'WILD_CARD';

        let transfersIn = [];
        let transfersOut = [];
        let transferInPts = 0;

        if (prevSquad && currentSquad.size > 0 && !isFreeSquadChange) {
          currentSquad.forEach(pid => { if (!prevSquad.has(pid)) transfersIn.push(pid); });
          prevSquad.forEach(pid => { if (!currentSquad.has(pid)) transfersOut.push(pid); });

          // Calculate boosted points for transferred-in players
          const playerData = playerDataByGd[gd] || {};
          const pmi = matchInfo[gd] || {};
          const mTeamIds = new Set();
          if (pmi.homeTeamId) mTeamIds.add(pmi.homeTeamId);
          if (pmi.awayTeamId) mTeamIds.add(pmi.awayTeamId);

          transfersIn.forEach(pid => {
            const p = playerData[pid];
            const inMatch = p ? mTeamIds.has(p.teamId) : false;
            const pts = inMatch ? (p ? p.gdPoints : 0) : 0;
            const mult = pid === td.captainId ? 2 : pid === td.viceCaptainId ? 1.5 : 1;
            let boosterMult = 1;
            if (boosterType === 'DOUBLE_POWER') boosterMult = 2;
            else if (boosterType === 'INDIAN_WARRIORS' && p && !p.isOverseas) boosterMult = 2;
            else if (boosterType === 'FOREIGN_STARS' && p && p.isOverseas) boosterMult = 2;
            else if (boosterType === 'TRIPLE_CAPTAIN' && pid === td.captainId) boosterMult = 1.5;
            transferInPts += pts * mult * boosterMult;
          });
        }

        const transferCount = transfersIn.length;
        const transferEfficiency = gdPts > 0 ? Math.round(transferInPts / gdPts * 1000) / 10 : 0;
        const transferAvg = transferCount > 0 ? Math.round(transferInPts / transferCount * 10) / 10 : 0;

        // Update last real squad:
        // FREE_HIT reverts → skip (keep previous lastRealSquad)
        // WILD_CARD persists → update lastRealSquad even though transfers are free
        if (boosterType !== 'FREE_HIT' && currentSquad.size > 0) {
          lastRealSquad[m.teamName] = currentSquad;
        }

        // Determine captain/VC playing status from player data (not overall-get which is context-dependent)
        const gdPlayerData = playerDataByGd[gd] || {};

        function getPlayerStatus(playerId) {
          const p = gdPlayerData[playerId];
          if (!p || matchTeamIds.size === 0) return "playing";
          if (!matchTeamIds.has(p.teamId)) return "not_playing";
          if (p.isAnnounced === "S" || p.isAnnounced === 2) return "impact";
          return "playing";
        }

        // Include per-player points for last completed match + all live matches
        const includePlayerDetails = playerDetailGds.has(gd);

        // Calculate captain/VC effective points
        const capPlayer = gdPlayerData[td.captainId];
        const vcPlayer = gdPlayerData[td.viceCaptainId];
        function calcPlayerPts(p, isCaptain, isVC) {
          if (!includePlayerDetails || !p) return null;
          const base = p.gdPoints || 0;
          const roleMult = isCaptain ? 2 : isVC ? 1.5 : 1;
          let boosterMult = 1;
          if (boosterType === 'DOUBLE_POWER') boosterMult = 2;
          else if (boosterType === 'TRIPLE_CAPTAIN' && isCaptain) boosterMult = 1.5;
          else if (boosterType === 'INDIAN_WARRIORS' && !p.isOverseas) boosterMult = 2;
          else if (boosterType === 'FOREIGN_STARS' && p.isOverseas) boosterMult = 2;
          return Math.round(base * roleMult * boosterMult * 100) / 100;
        }

        return {
          teamName: m.teamName,
          teamId: m.teamId,
          userId: m.socialId,
          gamedayPoints: gdPts,
          totalPoints: cumulative[m.teamName],
          captain: td.captain || null,
          captainStatus: getPlayerStatus(td.captainId),
          captainPts: calcPlayerPts(capPlayer, true, false),
          viceCaptain: td.viceCaptain || null,
          viceCaptainStatus: getPlayerStatus(td.viceCaptainId),
          viceCaptainPts: calcPlayerPts(vcPlayer, false, true),
          activePlayers: includePlayerDetails ? (td.squad || [])
            .filter(pid => pid !== td.captainId && pid !== td.viceCaptainId)
            .filter(pid => { const p = gdPlayerData[pid]; return p && matchTeamIds.has(p.teamId); })
            .map(pid => {
              const p = gdPlayerData[pid];
              if (!p) return null;
              const base = p.gdPoints || 0;
              let boosterMult = 1;
              if (boosterType === 'DOUBLE_POWER') boosterMult = 2;
              else if (boosterType === 'INDIAN_WARRIORS' && !p.isOverseas) boosterMult = 2;
              else if (boosterType === 'FOREIGN_STARS' && p.isOverseas) boosterMult = 2;
              return { name: p.name, pts: Math.round(base * boosterMult * 100) / 100 };
            })
            .filter(Boolean) : undefined,
          boosterId: td.boosterId || null,
          boosterPoints: bm ? bm.boosterPoints : null,
          subsUsed: td.subsUsed ?? null,
          subsLeft: td.subsLeft ?? null,
          subsThisMatch: td.subsThisMatch ?? null,
          subsTotal: teamData[m.teamName]?.subsTotal ?? null,
          transferCount,
          transferInPts: Math.round(transferInPts * 100) / 100,
          transferEfficiency,
          transferAvg,
          isFreeSquadChange,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    ranked.forEach((e, i) => {
      e.rank = (i > 0 && e.totalPoints === ranked[i - 1].totalPoints) ? ranked[i - 1].rank : i + 1;
    });

    // Collect announced match playing XI names ("P" = playing, "S" = sub/impact)
    const matchPlayingXI = Object.values(playerDataByGd[gd] || {})
      .filter(p => (p.isAnnounced === "P" || p.isAnnounced === "S") && matchTeamIds.has(p.teamId))
      .map(p => p.name);

    output.gamedays.push({
      gamedayId: gd,
      matchName: mi.matchName,
      matchDate: mi.matchDate,
      isLive: mi.isLive,
      isAbandoned: mi.isAbandoned || false,
      isEstimated: fallbackGds.includes(gd),
      scoresAsOf: fallbackTimestamps[gd] || null,
      matchPlayingXI,
      leaderboard: ranked,
    });

    log(`GD ${gd} ${mi.matchName}: #1 ${ranked[0].teamName} (${ranked[0].totalPoints} pts)`);
  }

  // ── 7. Validation ──
  log("\n── Validation ──");
  members.forEach(m => {
    const computed = cumulative[m.teamName];
    const api = m.apiTotalPoints;
    const diff = Math.abs(computed - api);
    const icon = diff < 1 ? "✅" : diff < 100 ? "⚠️" : "❌";
    log(`  ${icon} ${m.teamName}: Computed=${computed}, API=${api}, Diff=${diff.toFixed(1)}`);
  });

  // ── 8. Prize standings summary ──
  log("\n── Prize Standings ──");
  const sortedByTotal = [...output.members].sort((a, b) => {
    const ptsA = cumulative[a.teamName] || 0;
    const ptsB = cumulative[b.teamName] || 0;
    return ptsB - ptsA;
  });
  log("  🏆 Supreme Sovereign (Top 3):");
  sortedByTotal.slice(0, 3).forEach((m, i) => {
    log(`    ${i + 1}. ${m.teamName}: ${cumulative[m.teamName]} pts`);
  });

  const sortedByBooster = [...output.members].sort((a, b) => b.totalBoosterPoints - a.totalBoosterPoints);
  log("  🔥 Master of Boosters (Top 3):");
  sortedByBooster.slice(0, 3).forEach((m, i) => {
    log(`    ${i + 1}. ${m.teamName}: ${m.totalBoosterPoints} booster pts (${m.boosterCount} boosters used)`);
  });

  // ── 9. Upload to Gist (or download for review if REVIEW_MODE) ──
  const latestGdId = gamedayIds[gamedayIds.length - 1];
  const apiCalls = 2 + members.length + boosterGds.size;

  // Strip playerDataCache from the payload (dashboard doesn't need it, saves ~360KB)
  const { playerDataCache, ...uploadPayload } = output;

  if (REVIEW_MODE) {
    // Download locally for review, defer upload
    const filename = `ipl-fantasy-v2-master-gd${latestGdId}.json`;
    log(`Downloading ${filename} for review...`);
    const blob = new Blob([JSON.stringify(uploadPayload, null, 2)], { type: "application/json" });
    const dlUrl = URL.createObjectURL(blob);
    const dlA = document.createElement("a");
    dlA.href = dlUrl; dlA.download = filename; dlA.click();
    URL.revokeObjectURL(dlUrl);
    ok(`📥 Downloaded ${filename} — review it, then type uploadNow() to push to Gist.`);

    window._pendingUpload = uploadPayload;
    window.uploadNow = async () => {
      if (!window._pendingUpload) { warn("Nothing to upload."); return; }
      try {
        log("Uploading to Gist...");
        await uploadToGist(window._pendingUpload);
        ok(`✅ Uploaded to Gist successfully!`);
        window._pendingUpload = null;
      } catch (e) {
        warn(`Upload failed: ${e.message}`);
      }
    };

    ok(`\n✅ Done! ${gamedayIds.length} matches, ${members.length} members, ${boosterMatches.length} booster usages`);
    ok(`   ${apiCalls} API calls (${boosterGds.size} extra for booster player data)`);
    ok(`   ⚠️ Data NOT uploaded yet. Type uploadNow() after reviewing the downloaded file.`);
  } else {
    // Upload directly
    try {
      log("Uploading to Gist...");
      await uploadToGist(uploadPayload);
      ok(`✅ Uploaded to Gist successfully!`);
    } catch (e) {
      warn(`Upload failed: ${e.message}`);
    }

    ok(`\n✅ Done! ${gamedayIds.length} matches, ${members.length} members, ${boosterMatches.length} booster usages`);
    ok(`   ${apiCalls} API calls (${boosterGds.size} extra for booster player data)`);
  }

  return output;
  } // end runExtraction

  // ── Polling loop ──
  let runCount = 0;
  async function poll() {
    runCount++;
    log(`\n${"═".repeat(50)}`);
    log(`🔄 Run #${runCount} — ${new Date().toLocaleTimeString()}`);
    log(`${"═".repeat(50)}`);
    try {
      window._lastOutput = await runExtraction();
    } catch (e) {
      warn(`❌ Run #${runCount} failed: ${e.message}`);
      console.error(e);
    }
    const nextTime = new Date(Date.now() + POLL_INTERVAL_MS);
    ok(`⏳ Next update at ${nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Close tab to stop.`);
    ok(`   Tip: Type stopPolling() to stop without closing the tab.`);
    window._pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  // Allow manual stop
  window.stopPolling = () => { clearTimeout(window._pollTimer); ok("🛑 Polling stopped."); };
  // Allow manual file download of last data
  window.downloadLastData = () => {
    const data = window._lastOutput;
    if (!data) { warn("No data yet."); return; }
    const gdId = data.gamedays[data.gamedays.length - 1]?.gamedayId || "unknown";
    const fname = `ipl-fantasy-v2-master-gd${gdId}.json`;
    const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = fname; a.click();
    URL.revokeObjectURL(u);
    ok(`Downloaded ${fname}`);
  };

  // First run immediately, then poll
  const firstResult = await runExtraction().catch(e => { warn(`First run failed: ${e.message}`); console.error(e); });
  window._lastOutput = firstResult;

  const nextTime = new Date(Date.now() + POLL_INTERVAL_MS);
  ok(`⏳ Next update at ${nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Close tab to stop.`);
  ok(`   Type uploadNow() to push to Gist, stopPolling() to stop, downloadLastData() to save file.`);
  window._pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
})();
