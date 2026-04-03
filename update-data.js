// ============================================================
// IPL Fantasy League — Master Data Updater v3
// ============================================================
// Uses overall-get API + targeted gamedayplayers fetch for
// booster matches only. Calculates booster-attributed points.
//
// Downloads ONE file:
//   ipl-fantasy-v3-master-gdN.json
//
// HOW TO USE:
//   1. Go to fantasy.iplt20.com and LOG IN
//   2. Open DevTools (F12) → Console
//   3. Paste this entire script → Enter
//   4. Wait ~30-60 seconds
//   5. JSON file downloads automatically
//   6. Save to master-snapshots/ folder under v2/
// ============================================================

(async () => {
  const LEAGUE_ID = 6200104;
  const BASE = "https://fantasy.iplt20.com/classic/api/";
  const HEADERS = { "entity": "d3tR0!t5m@sh" };
  const DELAY_MS = 300;
  const PHASE_ID = 1;

  const log = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #6c5ce7; font-weight: bold;");
  const ok = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #00b894; font-weight: bold;");
  const warn = (msg) => console.log(`%c[Update-v3] ${msg}`, "color: #fdcb6e; font-weight: bold;");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function apiFetch(path) {
    const r = await fetch(BASE + path, { headers: HEADERS, credentials: "include" });
    return r.json();
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Booster definitions ──
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ BOOSTER POINT INTERPRETATION: B (All qualifying player points)     │
  // │                                                                     │
  // │ "Master of Boosters" prize = total booster-attributed points.       │
  // │ These are calculated SEPARATELY from league standings points.       │
  // │                                                                     │
  // │ Current interpretation (B):                                         │
  // │   FREE_HIT:        Total match gamedayPoints (whole team counts)    │
  // │   WILD_CARD:       Total match gamedayPoints (whole team counts)    │
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
    // 11: 'FREE_HIT',  ← confirmed
    // Others: update as discovered
  };
  // Start with what we know
  BOOSTER_TYPE[11] = 'FREE_HIT';

  const WHOLE_TEAM_BOOSTERS = ['FREE_HIT', 'WILD_CARD', 'DOUBLE_POWER'];

  // ── 1. Get fixtures ──
  log("Fetching fixtures...");
  const fixtures = await apiFetch("feed/tour-fixtures");
  const allMatches = fixtures?.Data?.Value || [];
  const completedOrLive = allMatches
    .filter(m => m.MatchStatus === 2 || m.MatchStatus === 1)
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
      phaseId: m.PhaseId || null,
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

  // ── 4. Identify booster matches and fetch player data for them ──
  log("\n── Identifying booster matches ──");
  const boosterMatches = []; // { teamName, gd, boosterId, boosterType }
  const boosterGds = new Set();

  for (const m of members) {
    const td = teamData[m.teamName];
    for (const gd of gamedayIds) {
      const pm = td?.perMatch?.[gd];
      if (pm?.boosterId) {
        const bType = BOOSTER_TYPE[pm.boosterId] || 'UNKNOWN';
        boosterMatches.push({ teamName: m.teamName, gd, boosterId: pm.boosterId, boosterType: bType });
        boosterGds.add(gd);
        log(`  ${m.teamName} used booster ${pm.boosterId} (${bType}) in GD${gd}`);
      }
    }
  }

  if (boosterMatches.length === 0) {
    log("  No boosters used yet.");
  }

  // Fetch player data ONLY for gamedays where boosters were used
  const playerDataByGd = {}; // gd -> { playerId -> { name, gdPoints, isOverseas } }
  const needsPlayerData = [...boosterGds].filter(gd => {
    // Only need player-level data for boosters that aren't whole-team types
    return boosterMatches.some(bm =>
      bm.gd === gd && !WHOLE_TEAM_BOOSTERS.includes(bm.boosterType)
    );
  });

  // Always fetch for booster GDs anyway so we can log player details
  for (const gd of boosterGds) {
    log(`Fetching player data for booster GD${gd}...`);
    const playersResp = await apiFetch(
      `feed/live/gamedayplayers?lang=en&tourgamedayId=${gd}&teamgamedayId=${gd}&liveVersion=999`
    );
    const allPlayers = playersResp?.Data?.Value?.Players || [];
    const pmap = {};
    allPlayers.forEach(p => {
      pmap[p.Id] = {
        name: p.Name,
        gdPoints: p.GamedayPoints || 0,
        isOverseas: p.IS_FP === 1 || p.IS_FP === '1' || p.Is_FP === 1 || p.is_fp === 1,
        countryCode: p.CountryCode || p.Nationality || null,
        skillId: p.SkillId || p.Skill || null,
      };
    });
    playerDataByGd[gd] = pmap;
    log(`  ${allPlayers.length} players loaded for GD${gd}`);

    // Log sample player to show available fields (first time only)
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
  }

  // ── 6. Build cumulative rankings per gameday ──
  log("\n── Building cumulative rankings ──");
  const cumulative = {};
  members.forEach(m => { cumulative[m.teamName] = 0; });

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
  };

  for (const gd of gamedayIds) {
    const mi = matchInfo[gd] || { matchName: `Match ${gd}`, matchDate: null, isLive: false };

    members.forEach(m => {
      cumulative[m.teamName] += teamData[m.teamName]?.gdPtsMap?.[gd] || 0;
    });

    const ranked = members
      .map(m => {
        const td = teamData[m.teamName]?.perMatch?.[gd] || {};
        const gdPts = teamData[m.teamName]?.gdPtsMap?.[gd] || 0;
        const bm = (boosterPointsMap[m.teamName] || []).find(b => b.gd === gd);
        return {
          teamName: m.teamName,
          teamId: m.teamId,
          userId: m.socialId,
          gamedayPoints: gdPts,
          totalPoints: cumulative[m.teamName],
          captain: td.captain || null,
          viceCaptain: td.viceCaptain || null,
          boosterId: td.boosterId || null,
          boosterPoints: bm ? bm.boosterPoints : null,
          subsUsed: td.subsUsed ?? null,
          subsLeft: td.subsLeft ?? null,
          subsThisMatch: td.subsThisMatch ?? null,
          subsTotal: teamData[m.teamName]?.subsTotal ?? null,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    ranked.forEach((e, i) => {
      e.rank = (i > 0 && e.totalPoints === ranked[i - 1].totalPoints) ? ranked[i - 1].rank : i + 1;
    });

    output.gamedays.push({
      gamedayId: gd,
      matchName: mi.matchName,
      matchDate: mi.matchDate,
      isLive: mi.isLive,
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

  // ── 9. Download ──
  const latestGdId = gamedayIds[gamedayIds.length - 1];
  const apiCalls = 2 + members.length + boosterGds.size;
  downloadJSON(output, `ipl-fantasy-v2-master-gd${latestGdId}.json`);

  ok(`\n✅ Done! Downloaded: ipl-fantasy-v3-master-gd${latestGdId}.json`);
  ok(`   ${gamedayIds.length} matches, ${members.length} members, ${boosterMatches.length} booster usages`);
  ok(`   ${apiCalls} API calls (${boosterGds.size} extra for booster player data)`);
  ok(`   Save to v2/master-snapshots/ and refresh dashboard.`);
})();
