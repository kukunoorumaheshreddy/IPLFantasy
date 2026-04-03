// Live Match Polling Script — captures fantasy point snapshots every 10 minutes
// Stores snapshots in localStorage so they SURVIVE page refresh / re-login.
//
// Usage:
//   1. Paste this in browser console on fantasy.iplt20.com BEFORE or DURING a match
//   2. It auto-detects the live match and starts polling
//   3. If your session expires → re-login → paste this script again
//      It will RESUME from where it left off (snapshots are saved in localStorage)
//   4. To stop & download: type stopPolling() in the console
//   5. A single JSON file with all snapshots will download automatically
//
// The script also auto-stops and downloads when the match completes.
// To clear saved data without downloading: type clearPolling() in the console

(function () {
  const API = "/classic/api";
  const HEADERS = { entity: "d3tR0!t5m@sh" };
  const LEAGUE_ID = 6200104;
  const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes
  const PHASE_ID = 1;
  const STORAGE_KEY = "ipl_live_poll_data";

  let pollTimer = null;
  let snapshots = [];
  let currentGd = null;
  let matchName = "";
  let pollCount = 0;

  const log = (msg) => console.log(`%c[LivePoll] ${msg}`, "color: #00b894; font-weight: bold;");
  const warn = (msg) => console.log(`%c[LivePoll] ${msg}`, "color: #fdcb6e; font-weight: bold;");
  const err = (msg) => console.log(`%c[LivePoll] ${msg}`, "color: #e17055; font-weight: bold;");

  // ── LocalStorage persistence ──
  function saveToStorage() {
    const data = { currentGd, matchName, pollCount, snapshots, savedAt: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { warn("Could not save to localStorage: " + e.message); }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: "include", headers: HEADERS });
    if (res.status === 401 || res.status === 403 || res.redirected) {
      throw new Error("AUTH_EXPIRED");
    }
    const data = await res.json();
    if (data?.Meta?.RetVal === -2 || data?.Meta?.Message?.includes("unauthorized")) {
      throw new Error("AUTH_EXPIRED");
    }
    return data;
  }

  async function findLiveMatch() {
    const res = await fetchJSON(`${API}/feed/tour-fixtures`);
    const matches = res?.Data?.Value?.Fixtures || res?.Data?.Value || res?.Data;
    if (!Array.isArray(matches)) return null;
    return matches.find(m => m.MatchStatus === 1) || null;
  }

  async function getLeagueMembers(gdId) {
    const url = `${API}/user/leagues/live/${LEAGUE_ID}/leaderboard?optType=1&gamedayId=${gdId}&phaseId=${PHASE_ID}&pageNo=1&topNo=500&pageChunk=500&pageOneChunk=500&minCount=12&leagueId=${LEAGUE_ID}`;
    const res = await fetchJSON(url);
    return res?.Data?.Value?.Members || res?.Data?.Value || [];
  }

  async function getPlayerPoints(gdId) {
    const res = await fetchJSON(`${API}/feed/live/gamedayplayers?lang=en&tourgamedayId=${gdId}&teamgamedayId=${gdId}&liveVersion=999`);
    return res?.Data?.Value?.Players || [];
  }

  async function getTeamComposition(gdId, teamId, socialId) {
    const url = `${API}/user/live/guid/lb-team-get?optType=1&gamedayId=${gdId}&tourgamedayId=${gdId}&teamId=${teamId}&socialId=${socialId}`;
    const res = await fetchJSON(url);
    return res?.Data?.Value || null;
  }

  function calculateTeamScore(team, playerMap) {
    if (!team) return { total: 0 };
    let total = 0;
    const captain = team.mcapt, vc = team.vcapt;
    (team.plyid || []).forEach(pid => {
      const p = playerMap[pid];
      const base = p ? p.GamedayPoints || 0 : 0;
      let mult = 1;
      if (pid === captain) mult = 2;
      else if (pid === vc) mult = 1.5;
      total += base * mult;
    });
    return { total: Math.round(total * 100) / 100 };
  }

  async function captureSnapshot() {
    pollCount++;
    const timestamp = new Date().toISOString();
    log(`Snapshot #${pollCount} at ${new Date().toLocaleTimeString()}`);

    try {
      // Check if match is still live
      const fixture = await findLiveMatch();
      const isStillLive = fixture && fixture.TourGamedayId === currentGd;

      // Get current player points
      const players = await getPlayerPoints(currentGd);
      const playerMap = {};
      players.forEach(p => { playerMap[p.Id] = p; });

      const totalMatchPts = Math.round(players.reduce((s, p) => s + (p.GamedayPoints || 0), 0));
      const playersScored = players.filter(p => p.GamedayPoints !== 0).length;

      // Get each member's team and calculate score
      const members = await getLeagueMembers(currentGd);
      const teamScores = [];

      for (const member of members) {
        const teamId = member.temid || member.TeamId;
        const socialId = member.usrscoid || member.SocialId;
        const teamName = member.temname || member.TeamName;
        await new Promise(r => setTimeout(r, 200));
        const team = await getTeamComposition(currentGd, teamId, socialId);
        const score = calculateTeamScore(team, playerMap);
        teamScores.push({
          teamName, teamId,
          score: score.total,
          captain: team ? playerMap[team.mcapt]?.Name || '?' : '?',
          viceCaptain: team ? playerMap[team.vcapt]?.Name || '?' : '?',
        });
      }

      teamScores.sort((a, b) => b.score - a.score);
      teamScores.forEach((t, i) => { t.rank = i + 1; });

      const snapshot = {
        timestamp, pollNumber: pollCount,
        matchPtsTotal: totalMatchPts, playersScored, isLive: isStillLive,
        teams: teamScores,
      };
      snapshots.push(snapshot);
      saveToStorage();

      log(`  Match total: ${totalMatchPts} pts (${playersScored} players scored)`);
      log(`  Leader: ${teamScores[0]?.teamName} (${teamScores[0]?.score} pts)`);
      log(`  Snapshots saved: ${snapshots.length} (stored in localStorage ✓)`);

      // Auto-stop if match completed
      if (!isStillLive) {
        warn("Match completed! Downloading final data...");
        downloadData();
        clearInterval(pollTimer);
        pollTimer = null;
        return;
      }
    } catch (e) {
      if (e.message === "AUTH_EXPIRED") {
        err("⚠️ SESSION EXPIRED! Snapshots are safe in localStorage.");
        err("➡️ Re-login to fantasy.iplt20.com, then paste this script again.");
        err(`   ${snapshots.length} snapshots saved. They will be picked up automatically.`);
        clearInterval(pollTimer);
        pollTimer = null;

        // Visual alert
        try {
          document.title = "⚠️ SESSION EXPIRED — Re-login!";
          if (Notification.permission === "granted") {
            new Notification("IPL Live Poll", { body: "Session expired! Re-login and paste the script again." });
          }
        } catch {}
        return;
      }
      warn(`Error during snapshot: ${e.message}. Will retry next interval.`);
    }
  }

  function downloadData() {
    if (snapshots.length === 0) { warn("No snapshots to download."); return; }
    const output = {
      leagueId: LEAGUE_ID,
      gamedayId: currentGd,
      matchName: matchName,
      pollInterval: "10 minutes",
      snapshotCount: snapshots.length,
      firstSnapshot: snapshots[0]?.timestamp,
      lastSnapshot: snapshots[snapshots.length - 1]?.timestamp,
      extractedAt: new Date().toISOString(),
      snapshots: snapshots,
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10); // e.g. 2026-04-04
    a.download = `ipl-live-gd${currentGd}-${matchName.replace(/\s+/g, '')}-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log(`✅ Downloaded ${snapshots.length} snapshots to ${a.download}`);
    clearStorage();
  }

  // Global controls
  window.stopPolling = function () {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    downloadData();
    log("Polling stopped.");
  };

  window.clearPolling = function () {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    clearStorage();
    snapshots = [];
    log("All saved data cleared.");
  };

  // ── Start ──
  (async () => {
    // Check for saved data from a previous run
    const saved = loadFromStorage();
    if (saved && saved.snapshots && saved.snapshots.length > 0) {
      log(`🔄 Found ${saved.snapshots.length} saved snapshots from previous run!`);
      log(`   Match: GD ${saved.currentGd} — ${saved.matchName}`);
      log(`   Last saved: ${saved.savedAt}`);
      snapshots = saved.snapshots;
      pollCount = saved.pollCount || saved.snapshots.length;
      currentGd = saved.currentGd;
      matchName = saved.matchName;
    }

    log("Looking for a live match...");
    const match = await findLiveMatch();

    if (!match) {
      if (snapshots.length > 0) {
        warn("No live match found. The match may have ended.");
        warn(`You have ${snapshots.length} snapshots saved. Type stopPolling() to download them.`);
      } else {
        warn("No live match found! Start this script when a match is in progress.");
      }
      return;
    }

    const newGd = match.TourGamedayId;
    const newMatchName = `${match.HomeTeamShortName} vs ${match.AwayTeamShortName}`;

    // If resuming a different match, start fresh
    if (currentGd && currentGd !== newGd && snapshots.length > 0) {
      warn(`Previous data was for GD ${currentGd} but current match is GD ${newGd}.`);
      warn(`Downloading old snapshots first, then starting fresh.`);
      downloadData();
      snapshots = [];
      pollCount = 0;
    }

    currentGd = newGd;
    matchName = newMatchName;

    log(`✅ Match: GD ${currentGd} — ${matchName}`);
    log(`Polling every 10 minutes. Snapshots auto-saved to localStorage.`);
    log(`Commands: stopPolling() = stop & download | clearPolling() = discard data`);
    if (snapshots.length > 0) {
      log(`Resuming with ${snapshots.length} existing snapshots.`);
    }

    log(`Capturing snapshot now...`);
    await captureSnapshot();

    pollTimer = setInterval(captureSnapshot, POLL_INTERVAL);

    // Request notification permission for auth alerts
    try { if (Notification.permission === "default") Notification.requestPermission(); } catch {}
  })();
})();
