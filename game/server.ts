import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import fs from 'fs';

const pathFilename = typeof __filename !== 'undefined'
  ? __filename
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : '');
const pathDirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(pathFilename);

const app = express();
const PORT = 3000;
const EVENT_DAYS = ['2026-07-27', '2026-07-28', '2026-07-29'];

app.use(express.json());

// In-Memory Fallback Databases
let delegates: any[] = [
  { name: "Sathya Narayanan", phone: "9876543210", committee: "UNSC", portfolio: "USA", cls: "12", section: "A" },
  { name: "Tobi Madara", phone: "9999988888", committee: "AIPPM", portfolio: "Amit Shah", cls: "11", section: "B" },
  { name: "Kunal Sharma", phone: "9812345678", committee: "UNHRC", portfolio: "United Kingdom", cls: "10", section: "C" },
  { name: "Riya Sen", phone: "9823456789", committee: "WHO", portfolio: "India", cls: "12", section: "B" },
  { name: "Aarav Gupta", phone: "9834567890", committee: "UNCSW", portfolio: "France", cls: "11", section: "A" },
  { name: "Ananya Iyer", phone: "9845678901", committee: "IPL", portfolio: "MS Dhoni", cls: "12", section: "C" },
  { name: "Kabir Mehra", phone: "9856789012", committee: "The Fame Files", portfolio: "Robert Downey Jr", cls: "10", section: "A" },
  { name: "Siddharth Roy", phone: "9867890123", committee: "UNGA", portfolio: "Canada", cls: "11", section: "C" },
  { name: "Meera Nair", phone: "9878901234", committee: "IP", portfolio: "Press Reporter", cls: "12", section: "D" },
  { name: "Ishaan Malhotra", phone: "9889012345", committee: "WHO Beginners", portfolio: "Brazil", cls: "9", section: "A" }
];

let attendance: Record<string, any> = {
  "9876543210": { "Day 1 In": "09:12 AM", "Day 1 Out": "04:30 PM", "Day 2 In": "09:05 AM" },
  "9999988888": { "Day 1 In": "09:20 AM", "Day 1 Out": "04:45 PM" }
};

let roomAllotments: Record<string, string[]> = {
  "UNSC": ["Room 101", "Room 101", "Room 101"],
  "AIPPM": ["Auditorium", "Auditorium", "Room 102"],
  "UNHRC": ["Room 202", "Room 202", "Room 202"],
  "UNCSW": ["Room 303", "Room 303", "Room 303"],
  "WHO": ["Room 204", "Room 204", "Room 204"],
  "WHO Beginners": ["Room 205", "Room 205", "Room 205"],
  "IPL": ["Sports Room", "Sports Room", "Sports Room"],
  "The Fame Files": ["AV Hall", "AV Hall", "AV Hall"],
  "UNGA": ["Room 104", "Room 104", "Room 104"],
  "IP": ["Press Room", "Press Room", "Press Room"]
};

let announcements: any[] = [
  {
    id: "ann_1",
    type: "Update",
    title: "Opening Ceremony",
    body: "Welcome to SPSMUN 3.0! The opening ceremony starts at 9:30 AM in the main auditorium. Please be seated by 9:15 AM.",
    ts: "2026-07-27 08:30"
  },
  {
    id: "ann_2",
    type: "Agenda",
    title: "Day 1 High Tea & Debate Slots",
    body: "First committee session starts at 11:00 AM. High tea will be served at 1:15 PM in the lawn area.",
    ts: "2026-07-27 10:45"
  },
  {
    id: "ann_3",
    type: "Poll",
    title: "Best Food Stall on Campus?",
    body: "Vote for your favorite food stall so we can declare the SPSMUN Gastronomy Winner!",
    ts: "2026-07-27 12:00",
    options: ["Pizza Hub", "Chaotic Chat", "Waffle Wonder", "Noodle Box"],
    votes: [
      { text: "Pizza Hub", count: 24 },
      { text: "Chaotic Chat", count: 18 },
      { text: "Waffle Wonder", count: 32 },
      { text: "Noodle Box", count: 15 }
    ],
    total: 89
  }
];

// Active Game Lobby & Multiplayer Battles
let onlinePlayers: Record<string, { name: string; phone: string; lastSeen: number; committee: string }> = {};
let battleInvites: any[] = []; // { id, fromPhone, fromName, toPhone, status: 'pending'|'accepted'|'declined' }
let activeBattles: Record<string, any> = {};
let gameLeaderboard: Record<string, { wins: number; losses: number; name: string; committee: string }> = {};

let battleHistory: any[] = [];
let sheetsConfig = {
  spreadsheetId: "",
  spreadsheetUrl: "",
  accessToken: "",
  tokenExpiry: 0,
  adminEmail: "",
  lastSynced: ""
};

// Database persistence file setup
const DB_FILE = path.join(pathDirname, 'battle_records_db.json');
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.gameLeaderboard) {
      gameLeaderboard = parsed.gameLeaderboard;
    }
    if (parsed.battleHistory) {
      battleHistory = parsed.battleHistory;
    }
    if (parsed.sheetsConfig) {
      sheetsConfig = parsed.sheetsConfig;
    }
    
    // Ensure the two test trainer entries are completely removed
    delete gameLeaderboard["9876543210"];
    delete gameLeaderboard["9999988888"];
    battleHistory = battleHistory.filter(b => 
      b.player1Phone !== "9876543210" && 
      b.player1Phone !== "9999988888" && 
      b.player2Phone !== "9876543210" && 
      b.player2Phone !== "9999988888"
    );
    
    console.log("[Persistence] Loaded game records and sheets config successfully. Excluded test users.");
  } else {
    console.log("[Persistence] No existing record DB found. Initializing fresh.");
  }
} catch (err) {
  console.error("[Persistence] Error loading database file:", err);
}

function savePersistence() {
  try {
    const data = { gameLeaderboard, battleHistory, sheetsConfig };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("[Persistence] Error saving database file:", err);
  }
}

let matchmakingQueue: { phone: string; name: string; team: any[]; joinedAt: number }[] = [];
let matchedBattles: Record<string, { battleId: string; opponentName: string }> = {};
let customRooms: Record<string, {
  code: string;
  hostPhone: string;
  hostName: string;
  hostTeam: any[];
  guestPhone?: string;
  guestName?: string;
  guestTeam?: any[];
  battleId?: string;
  createdAt: number;
}> = {};

// Cleanup inactive players & expired invites
setInterval(() => {
  const now = Date.now();
  for (const phone in onlinePlayers) {
    if (now - onlinePlayers[phone].lastSeen > 15000) {
      delete onlinePlayers[phone];
    }
  }
  battleInvites = battleInvites.filter(inv => now - parseInt(inv.id) < 60000);

  // Clean matchmaking queue entries older than 45 seconds
  matchmakingQueue = matchmakingQueue.filter(p => now - p.joinedAt < 45000);

  // Clean custom rooms older than 1 hour
  for (const code in customRooms) {
    if (now - customRooms[code].createdAt > 3600000) {
      delete customRooms[code];
    }
  }
}, 5000);

// Helper for type advantages in Pokémon Showdown
function getTypeMultiplier(attackType: string, defenderTypes: string[]): number {
  const chart: Record<string, Record<string, number>> = {
    Electric: { Water: 2, Flying: 2, Electric: 0.5 },
    Fire: { Steel: 2, Fire: 0.5, Water: 0.5 },
    Water: { Fire: 2, Water: 0.5 },
    Flying: { Fighting: 2, Steel: 0.5 },
    Psychic: { Fighting: 2, Psychic: 0.5, Steel: 0.5 },
    Fighting: { Steel: 2, Flying: 0.5, Psychic: 0.5, Ghost: 0 },
    Steel: { Steel: 0.5, Fire: 0.5, Water: 0.5 },
    Ghost: { Ghost: 2, Psychic: 2 },
    Poison: { Ghost: 0.5, Poison: 0.5, Steel: 0 }
  };

  let mult = 1;
  const attackMap = chart[attackType];
  if (attackMap) {
    for (const dt of defenderTypes) {
      if (attackMap[dt] !== undefined) {
        mult *= attackMap[dt];
      }
    }
  }
  return mult;
}

// REST API for Live Apps Script proxy (with local fallback!)
app.all("/api/proxy", async (req: any, res) => {
  const params = { ...req.query, ...req.body };
  const action = params.action;
  const pUrl = params.apiUrl || "";

  // If user passes a custom URL, proxy to Google Apps Script
  if (pUrl && pUrl.startsWith("http")) {
    try {
      const urlWithParams = new URL(pUrl);
      Object.keys(params).forEach(k => {
        if (k !== "apiUrl") urlWithParams.searchParams.set(k, params[k]);
      });
      const response = await fetch(urlWithParams.toString());
      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      console.error("Apps Script Proxy Error, falling back to local DB:", err.message);
    }
  }

  // Pure Local Database Resolution
  if (action === "lookup") {
    const { phone, name } = params;
    const cleanPhone = String(phone).replace(/\D/g, "");
    const del = delegates.find(d => d.phone === cleanPhone && d.name.toLowerCase() === String(name).toLowerCase());
    if (del) {
      return res.json({
        ok: true,
        delegate: del,
        attendance: attendance[cleanPhone] || {},
        rooms: roomAllotments[del.committee] || ["", "", ""],
        today: detectDay(),
        agenda: `Committee agenda for ${del.committee} discussion.`
      });
    } else {
      return res.json({ ok: false, error: "Name and phone number do not match." });
    }
  }

  if (action === "search") {
    const q = String(params.q || "").toLowerCase();
    const results = delegates
      .filter(d => d.name.toLowerCase().includes(q) || d.phone.includes(q))
      .map(d => ({
        name: d.name,
        phone: d.phone,
        masked: "***-***-" + d.phone.slice(-4),
        committee: d.committee
      }));
    return res.json({ ok: true, results });
  }

  if (action === "getcommittees") {
    const comList = Array.from(new Set(delegates.map(d => d.committee))).map(name => ({
      committee: name,
      rooms: roomAllotments[name] || ["TBA", "TBA", "TBA"]
    }));
    return res.json({ ok: true, committees: comList });
  }

  if (action === "setroom") {
    const { committee, day, room } = params;
    if (!roomAllotments[committee]) roomAllotments[committee] = ["", "", ""];
    roomAllotments[committee][parseInt(day, 10) - 1] = room;
    return res.json({ ok: true });
  }

  if (action === "adminsearch") {
    const q = String(params.q || "").toLowerCase();
    const results = delegates
      .filter(d => d.name.toLowerCase().includes(q) || d.phone.includes(q))
      .map(d => ({
        ...d,
        attendance: attendance[d.phone] || {}
      }));
    return res.json({ ok: true, results, today: detectDay() });
  }

  if (action === "stats") {
    const dActive = detectDay();
    let cIn = 0, cOut = 0;
    Object.values(attendance).forEach(a => {
      if (a[`Day ${dActive} In`]) cIn++;
      if (a[`Day ${dActive} Out`]) cOut++;
    });
    return res.json({
      ok: true,
      today: dActive,
      checkedInToday: cIn,
      checkedOutToday: cOut,
      totalDelegates: delegates.length
    });
  }

  if (action === "checkin") {
    const { phone, day } = params;
    if (!attendance[phone]) attendance[phone] = {};
    const tStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    attendance[phone][`Day ${day} In`] = tStr;
    return res.json({ ok: true, attendance: attendance[phone], time: tStr });
  }

  if (action === "checkout") {
    const { phone, day } = params;
    if (!attendance[phone]) attendance[phone] = {};
    const tStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    attendance[phone][`Day ${day} Out`] = tStr;
    return res.json({ ok: true, attendance: attendance[phone], time: tStr });
  }

  if (action === "announcements") {
    const { phone } = params;
    const mapped = announcements.map(a => {
      const myChoice = ""; // Local state logic if any
      return { ...a, myChoice };
    });
    return res.json({ ok: true, announcements: mapped });
  }

  if (action === "postann") {
    const { type, title, body, options } = params;
    const newAnn = {
      id: "ann_" + Date.now(),
      type,
      title,
      body,
      ts: new Date().toISOString().slice(0, 16).replace("T", " "),
      options: options ? options.split("|") : undefined,
      votes: options ? options.split("|").map((o: string) => ({ text: o, count: 0 })) : undefined,
      total: options ? 0 : undefined
    };
    announcements.unshift(newAnn);
    return res.json({ ok: true });
  }

  if (action === "delann") {
    const { id } = params;
    announcements = announcements.filter(a => a.id !== id);
    return res.json({ ok: true });
  }

  if (action === "vote") {
    const { pollId, option } = params;
    const ann = announcements.find(a => a.id === pollId);
    if (ann && ann.votes) {
      const optItem = ann.votes.find((v: any) => v.text === option);
      if (optItem) {
        optItem.count++;
        ann.total = (ann.total || 0) + 1;
      }
    }
    return res.json({ ok: true });
  }

  return res.json({ ok: false, error: "Action not found." });
});

// MULTIPLAYER GAME PLATFORM ENDPOINTS

// Join matchmaking queue
app.post("/api/game/matchmake/join", (req, res) => {
  const { phone, name, team } = req.body;
  if (!phone || !name || !team || team.length < 3) {
    return res.status(400).json({ error: "Missing identity or team." });
  }

  // Remove existing entry for this player
  matchmakingQueue = matchmakingQueue.filter(p => p.phone !== phone);
  delete matchedBattles[phone];

  // Look for another available player in queue (joined within last 45 seconds)
  const now = Date.now();
  const opponent = matchmakingQueue.find(p => p.phone !== phone && (now - p.joinedAt) < 45000);

  if (opponent) {
    // Match found!
    // Remove opponent from queue
    matchmakingQueue = matchmakingQueue.filter(p => p.phone !== opponent.phone);

    const battleId = "battle_match_" + phone + "_" + opponent.phone + "_" + Date.now();

    // Create the battle state
    activeBattles[battleId] = {
      id: battleId,
      player1Phone: opponent.phone,
      player1Name: opponent.name,
      player1Team: opponent.team,
      player1ActiveIndex: 0,
      player2Phone: phone,
      player2Name: name,
      player2Team: team,
      player2ActiveIndex: 0,
      turn: 1,
      player1MoveName: null,
      player2MoveName: null,
      log: [`Online Matchmaking Battle started!`, `${opponent.name} vs ${name}!`],
      winnerPhone: null,
      status: 'active'
    };

    // Store match info
    matchedBattles[phone] = { battleId, opponentName: opponent.name };
    matchedBattles[opponent.phone] = { battleId, opponentName: name };

    return res.json({ ok: true, matched: true, battleId, opponentName: opponent.name });
  } else {
    // No opponent yet, put us in queue
    matchmakingQueue.push({ phone, name, team, joinedAt: now });
    return res.json({ ok: true, matched: false });
  }
});

// Check matchmaking status
app.post("/api/game/matchmake/status", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Missing phone." });

  const match = matchedBattles[phone];
  if (match) {
    return res.json({ ok: true, matched: true, battleId: match.battleId, opponentName: match.opponentName });
  }

  // Check if player is still in queue and hasn't timed out (30 seconds)
  const entry = matchmakingQueue.find(p => p.phone === phone);
  if (entry) {
    if (Date.now() - entry.joinedAt > 30000) {
      // Timeout
      matchmakingQueue = matchmakingQueue.filter(p => p.phone !== phone);
      return res.json({ ok: true, matched: false, timeout: true });
    }
    return res.json({ ok: true, matched: false });
  }

  return res.json({ ok: true, matched: false, timeout: true });
});

// Cancel matchmaking
app.post("/api/game/matchmake/cancel", (req, res) => {
  const { phone } = req.body;
  if (phone) {
    matchmakingQueue = matchmakingQueue.filter(p => p.phone !== phone);
  }
  return res.json({ ok: true });
});

// Create custom room
app.post("/api/game/room/create", (req, res) => {
  const { phone, name, team } = req.body;
  if (!phone || !name || !team || team.length < 3) {
    return res.status(400).json({ error: "Missing room host details." });
  }

  // Generate a random 4-digit code that is not currently in use
  let code = "";
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (customRooms[code]);

  customRooms[code] = {
    code,
    hostPhone: phone,
    hostName: name,
    hostTeam: team,
    createdAt: Date.now()
  };

  return res.json({ ok: true, code });
});

// Join custom room
app.post("/api/game/room/join", (req, res) => {
  const { code, phone, name, team } = req.body;
  if (!code || !phone || !name || !team || team.length < 3) {
    return res.status(400).json({ error: "Missing room join details." });
  }

  const room = customRooms[code];
  if (!room) {
    return res.json({ ok: false, error: "Room not found. Check your code!" });
  }

  if (room.hostPhone === phone) {
    // Host is checking back in
    return res.json({ ok: true, isHost: true, battleId: room.battleId });
  }

  if (room.guestPhone && room.guestPhone !== phone) {
    return res.json({ ok: false, error: "This room is already full!" });
  }

  // Join the room as guest
  room.guestPhone = phone;
  room.guestName = name;
  room.guestTeam = team;

  // Create battle
  const battleId = "battle_room_" + code;
  room.battleId = battleId;

  activeBattles[battleId] = {
    id: battleId,
    player1Phone: room.hostPhone,
    player1Name: room.hostName,
    player1Team: room.hostTeam,
    player1ActiveIndex: 0,
    player2Phone: room.guestPhone,
    player2Name: room.guestName,
    player2Team: room.guestTeam,
    player2ActiveIndex: 0,
    turn: 1,
    player1MoveName: null,
    player2MoveName: null,
    log: [`Room Battle started!`, `Host ${room.hostName} vs Guest ${room.guestName}!`],
    winnerPhone: null,
    status: 'active'
  };

  return res.json({ ok: true, battleId });
});

// Check room status
app.post("/api/game/room/status", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Missing room code." });
  const room = customRooms[code];
  if (!room) {
    return res.json({ ok: false, error: "Room expired or closed." });
  }
  return res.json({ ok: true, room });
});

app.post("/api/game/heartbeat", (req, res) => {
  const { phone, name, committee } = req.body;
  if (!phone || !name) return res.status(400).json({ error: "Missing identity info." });
  onlinePlayers[phone] = { name, phone, committee, lastSeen: Date.now() };

  // Fetch active battle invite where target is this phone
  const invite = battleInvites.find(inv => inv.toPhone === phone && inv.status === 'pending');
  return res.json({
    ok: true,
    onlinePlayers: Object.values(onlinePlayers).filter(p => p.phone !== phone),
    incomingInvite: invite || null
  });
});

app.post("/api/game/challenge", (req, res) => {
  const { fromPhone, fromName, toPhone, fromTeam } = req.body;
  if (!fromPhone || !toPhone) return res.status(400).json({ error: "Missing challenge info." });
  
  // Clear past invites between these players
  battleInvites = battleInvites.filter(inv => !(inv.fromPhone === fromPhone && inv.toPhone === toPhone));

  const newInvite = {
    id: String(Date.now()),
    fromPhone,
    fromName,
    toPhone,
    fromTeam: fromTeam || null,
    status: 'pending'
  };
  battleInvites.push(newInvite);
  return res.json({ ok: true, invite: newInvite });
});

app.post("/api/game/invite-status", (req, res) => {
  const { id } = req.body;
  const invite = battleInvites.find(inv => inv.id === id);
  if (!invite) return res.json({ ok: false, error: "Invite expired." });
  return res.json({ ok: true, status: invite.status, invite });
});

app.post("/api/game/accept-invite", (req, res) => {
  const { id, toTeam } = req.body;
  const invite = battleInvites.find(inv => inv.id === id);
  if (!invite) return res.json({ ok: false, error: "Invite expired." });
  invite.status = 'accepted';

  // Instantiate BattleState on Server
  const battleId = "battle_" + id;
  activeBattles[battleId] = {
    id: battleId,
    player1Phone: invite.fromPhone,
    player1Name: invite.fromName,
    player1Team: invite.fromTeam || null, // Immediately populate from invite!
    player1ActiveIndex: 0,
    player2Phone: invite.toPhone,
    player2Name: onlinePlayers[invite.toPhone]?.name || "Challenger",
    player2Team: toTeam,
    player2ActiveIndex: 0,
    turn: 1,
    player1MoveName: null,
    player2MoveName: null,
    log: ["Battle started between " + invite.fromName + " and " + (onlinePlayers[invite.toPhone]?.name || "Trainer") + "!"],
    winnerPhone: null,
    status: 'active'
  };

  return res.json({ ok: true, battleId });
});

app.post("/api/game/decline-invite", (req, res) => {
  const { id } = req.body;
  const invite = battleInvites.find(inv => inv.id === id);
  if (invite) invite.status = 'declined';
  return res.json({ ok: true });
});

app.post("/api/game/battle-state", (req, res) => {
  const { battleId, myPhone, myTeam } = req.body;
  const battle = activeBattles[battleId];
  if (!battle) return res.status(404).json({ error: "Battle not found." });

  // Lazily populate Player 1's team when they join
  if (myPhone === battle.player1Phone && !battle.player1Team) {
    battle.player1Team = myTeam;
  }

  return res.json({ ok: true, battle });
});

app.post("/api/game/battle-submit-move", (req, res) => {
  const { battleId, myPhone, moveName, aimLane, dodgeLane } = req.body;
  const battle = activeBattles[battleId];
  if (!battle) return res.status(404).json({ error: "Battle not found." });

  if (myPhone === battle.player1Phone) {
    battle.player1MoveName = moveName;
    battle.player1AimLane = aimLane !== undefined ? aimLane : 0;
    battle.player1DodgeLane = dodgeLane !== undefined ? dodgeLane : 0;
  } else if (myPhone === battle.player2Phone) {
    battle.player2MoveName = moveName;
    battle.player2AimLane = aimLane !== undefined ? aimLane : 0;
    battle.player2DodgeLane = dodgeLane !== undefined ? dodgeLane : 0;
  }

  // Turn Resolution: if BOTH have selected a move, resolve!
  if (battle.player1MoveName && battle.player2MoveName) {
    resolveTurn(battle);
  }

  return res.json({ ok: true, battle });
});

app.post("/api/game/battle-switch-fainted", (req, res) => {
  const { battleId, myPhone, nextIndex } = req.body;
  const battle = activeBattles[battleId];
  if (!battle) return res.status(404).json({ error: "Battle not found." });

  if (myPhone === battle.player1Phone) {
    const targetPk = battle.player1Team[nextIndex];
    if (targetPk && targetPk.hp > 0) {
      battle.player1ActiveIndex = nextIndex;
      battle.log.push(`${battle.player1Name} sent out ${battle.player1Team[nextIndex].name}!`);
    }
  } else if (myPhone === battle.player2Phone) {
    const targetPk = battle.player2Team[nextIndex];
    if (targetPk && targetPk.hp > 0) {
      battle.player2ActiveIndex = nextIndex;
      battle.log.push(`${battle.player2Name} sent out ${battle.player2Team[nextIndex].name}!`);
    }
  }

  return res.json({ ok: true, battle });
});

// Perform Pokémon battle move resolution
function resolveTurn(battle: any) {
  const p1 = battle.player1Team[battle.player1ActiveIndex];
  const p2 = battle.player2Team[battle.player2ActiveIndex];

  const m1 = p1.moves.find((m: any) => m.name === battle.player1MoveName);
  const m2 = p2.moves.find((m: any) => m.name === battle.player2MoveName);

  if (!m1 || !m2) return;

  // Save the state *before* this turn resolves so that clients can animate sequentially from these initial values!
  battle.lastTurnResolved = {
    turn: battle.turn,
    player1MoveName: battle.player1MoveName,
    player2MoveName: battle.player2MoveName,
    player1AimLane: battle.player1AimLane !== undefined ? battle.player1AimLane : 0,
    player2AimLane: battle.player2AimLane !== undefined ? battle.player2AimLane : 0,
    player1DodgeLane: battle.player1DodgeLane !== undefined ? battle.player1DodgeLane : 0,
    player2DodgeLane: battle.player2DodgeLane !== undefined ? battle.player2DodgeLane : 0,
    p1InitialHp: battle.player1Team.map((p: any) => p.hp),
    p1InitialStatus: battle.player1Team.map((p: any) => p.status),
    p2InitialHp: battle.player2Team.map((p: any) => p.hp),
    p2InitialStatus: battle.player2Team.map((p: any) => p.status)
  };

  // Decide who goes first based on Speed (higher goes first)
  const p1First = p1.speed >= p2.speed;
  const actors = p1First
    ? [
        { name: battle.player1Name, poke: p1, move: m1, opponent: p2, isP1: true },
        { name: battle.player2Name, poke: p2, move: m2, opponent: p1, isP1: false }
      ]
    : [
        { name: battle.player2Name, poke: p2, move: m2, opponent: p1, isP1: false },
        { name: battle.player1Name, poke: p1, move: m1, opponent: p2, isP1: true }
      ];

  battle.log.push(`\n--- Turn ${battle.turn} Resolution ---`);

  for (const act of actors) {
    if (act.poke.hp <= 0) continue; // Fainted, can't attack!

    // Handle paralyze status skip
    if (act.poke.status === 'Paralyzed' && Math.random() < 0.25) {
      battle.log.push(`${act.poke.name} is paralyzed! It can't move!`);
      continue;
    }

    battle.log.push(`${act.isP1 ? "Your" : "Opponent's"} ${act.poke.name} used ${act.move.name}!`);

    const isHeal = act.move.category === 'Status' && act.move.effect === 'heal';

    if (isHeal) {
      const amt = Math.floor(act.poke.maxHp * 0.5);
      act.poke.hp = Math.min(act.poke.maxHp, act.poke.hp + amt);
      battle.log.push(`${act.poke.name} recovered ${amt} HP!`);
      continue;
    }

    // Lane Dodging Logic:
    // If Player 1 is attacking, we check if Player 1's aim matches Player 2's dodge lane
    // If Player 2 is attacking, we check if Player 2's aim matches Player 1's dodge lane
    const attackerAimLane = act.isP1 ? battle.player1AimLane : battle.player2AimLane;
    const defenderDodgeLane = act.isP1 ? battle.player2DodgeLane : battle.player1DodgeLane;
    const isDodged = attackerAimLane !== defenderDodgeLane;

    if (isDodged) {
      const aimDirectionName = attackerAimLane === -1 ? 'Left' : attackerAimLane === 1 ? 'Right' : 'Middle';
      const targetLaneName = defenderDodgeLane === -1 ? 'Left' : defenderDodgeLane === 1 ? 'Right' : 'Middle';
      battle.log.push(`💨 ${act.opponent.name} dodged the attack! (Aimed: ${aimDirectionName} vs actual position: ${targetLaneName})`);
      continue;
    }

    // Check Accuracy
    if (Math.random() * 100 > act.move.accuracy) {
      battle.log.push(`The attack missed!`);
      continue;
    }

    // Damage Calculation
    let damage = Math.floor((act.move.power * (act.poke.spAtk / act.opponent.spDef)) / 5) + 5;
    if (act.poke.status === 'Burned') damage = Math.floor(damage * 0.5);

    // Apply multiplier
    const mult = getTypeMultiplier(act.move.type, act.opponent.type);
    damage = Math.floor(damage * mult);

    act.opponent.hp = Math.max(0, act.opponent.hp - damage);

    if (mult > 1) battle.log.push("It's super effective!");
    if (mult < 1 && mult > 0) battle.log.push("It's not very effective...");
    if (mult === 0) battle.log.push(`It doesn't affect ${act.opponent.name}...`);

    battle.log.push(`Dealt ${damage} damage to ${act.opponent.name}.`);

    // Draining move healing (e.g. Giga Drain)
    const isDrainMove = act.move.category !== 'Status' && act.move.effect === 'heal';
    if (isDrainMove) {
      const healAmt = Math.floor(damage * 0.5);
      act.poke.hp = Math.min(act.poke.maxHp, act.poke.hp + healAmt);
      battle.log.push(`${act.poke.name} absorbed nutrients and recovered ${healAmt} HP!`);
    }

    // Handle status infliction
    if (act.move.effect && act.opponent.hp > 0 && act.opponent.status === 'None') {
      if (act.move.effect === 'burn' && Math.random() < 0.3) {
        act.opponent.status = 'Burned';
        battle.log.push(`${act.opponent.name} was burned!`);
      } else if (act.move.effect === 'paralyze' && Math.random() < 0.3) {
        act.opponent.status = 'Paralyzed';
        battle.log.push(`${act.opponent.name} was paralyzed!`);
      }
    }

    if (act.opponent.hp <= 0) {
      battle.log.push(`${act.opponent.name} fainted!`);
    }
  }

  // Handle status damage at end of turn
  [p1, p2].forEach((p, idx) => {
    if (p.hp > 0 && p.status === 'Burned') {
      const burnDmg = Math.floor(p.maxHp * 0.08);
      p.hp = Math.max(0, p.hp - burnDmg);
      battle.log.push(`${p.name} took ${burnDmg} damage from its burn!`);
      if (p.hp <= 0) battle.log.push(`${p.name} fainted!`);
    }
  });

  // Check Game Over Conditions
  const p1Dead = battle.player1Team.every((p: any) => p.hp <= 0);
  const p2Dead = battle.player2Team.every((p: any) => p.hp <= 0);

  if (p1Dead || p2Dead) {
    battle.status = 'completed';
    if (p1Dead && p2Dead) {
      battle.log.push("The battle ended in a draw!");
      recordBattleFinished(battle, 'draw');
    } else if (p1Dead) {
      battle.winnerPhone = battle.player2Phone;
      battle.log.push(`${battle.player2Name} wins the battle! Congratulations!`);
      recordWin(battle.player2Phone, battle.player2Name, battle.player1Phone);
      recordBattleFinished(battle, 'p2_win');
    } else {
      battle.winnerPhone = battle.player1Phone;
      battle.log.push(`${battle.player1Name} wins the battle! Congratulations!`);
      recordWin(battle.player1Phone, battle.player1Name, battle.player2Phone);
      recordBattleFinished(battle, 'p1_win');
    }
  }

  // Advance turn, reset actions
  battle.turn++;
  battle.player1MoveName = null;
  battle.player2MoveName = null;
}

// Update game leaderboard
function recordWin(winPhone: string, winName: string, losePhone: string) {
  // Update Winner
  if (!gameLeaderboard[winPhone]) {
    const d = delegates.find(x => x.phone === winPhone) || {};
    gameLeaderboard[winPhone] = { wins: 0, losses: 0, name: winName, committee: d.committee || "MUN" };
  }
  gameLeaderboard[winPhone].wins++;

  // Update Loser
  if (!gameLeaderboard[losePhone]) {
    const d2 = delegates.find(x => x.phone === losePhone) || {};
    gameLeaderboard[losePhone] = { wins: 0, losses: 0, name: d2.name || "Trainer", committee: d2.committee || "MUN" };
  }
  gameLeaderboard[losePhone].losses++;
  savePersistence();
}

// Coupon Reward calculation helper
function getCouponReward(gamesCount: number): string {
  if (gamesCount >= 5) return "POKE_GOLD_50 (50% Off)";
  if (gamesCount >= 3) return "POKE_SILVER_20 (20% Off)";
  if (gamesCount >= 1) return "POKE_BRONZE_10 (10% Off)";
  return "None (Play 1+ battles today!)";
}

// Get enriched leaderboard with ranks, today's played matches, and eligible coupons
function getEnrichedLeaderboard() {
  const currentDay = detectDay();
  
  const sorted = Object.keys(gameLeaderboard)
    .map(phone => {
      const basic = gameLeaderboard[phone];
      
      const trainerMatches = battleHistory.filter(b => b.player1Phone === phone || b.player2Phone === phone);
      const draws = trainerMatches.filter(b => b.winnerPhone === "Draw").length;
      const matchesPlayed = trainerMatches.length;
      const score = (basic.wins * 3) + (draws * 0) - (basic.losses * 1);

      // Calculate games played today (Day 1, 2, or 3)
      const playedToday = trainerMatches.filter(b => b.day === currentDay).length;

      return {
        phone,
        name: basic.name,
        committee: basic.committee,
        wins: basic.wins,
        losses: basic.losses,
        draws,
        matchesPlayed,
        score,
        playedToday,
        couponCode: getCouponReward(playedToday)
      };
    })
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses);

  return sorted;
}

// Google Sheets Sync Helpers
async function syncBattleToGoogleSheets(record: any, token: string, spreadsheetId: string): Promise<boolean> {
  try {
    const range = 'Battle Records!A:L';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    
    const row = [
      record.id,
      record.timestamp,
      `Day ${record.day}`,
      record.player1Phone,
      record.player1Name,
      record.player1Committee,
      record.player2Phone,
      record.player2Name,
      record.player2Committee,
      record.winnerPhone,
      record.winnerName,
      record.result
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [row]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("[Sheets Sync] Append failed:", errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Sheets Sync] Exception in syncBattleToGoogleSheets:", err);
    return false;
  }
}

async function syncLeaderboardToGoogleSheets(leaderboardData: any[], token: string, spreadsheetId: string): Promise<boolean> {
  try {
    // Clear existing values in Leaderboard sheet to avoid leftovers (up to J column now)
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Leaderboard!A1:J1000:clear`;
    await fetch(clearUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const range = 'Leaderboard!A1';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    
    const rows = [
      ["Trainer Phone", "Trainer Name", "Committee", "Total Wins", "Total Losses", "Total Draws", "Matches Played", "Leaderboard Score", "Games Played Today", "Eligible Coupon Reward"]
    ];

    leaderboardData.forEach(item => {
      rows.push([
        item.phone,
        item.name,
        item.committee,
        item.wins.toString(),
        item.losses.toString(),
        (item.draws || 0).toString(),
        (item.matchesPlayed || 0).toString(),
        (item.score || 0).toString(),
        item.playedToday.toString(),
        item.couponCode
      ]);
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: rows
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Sheets Sync] Leaderboard write failed:", errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Sheets Sync] Exception in syncLeaderboardToGoogleSheets:", err);
    return false;
  }
}

// Record Battle Finished and push update to Google Sheets
function recordBattleFinished(battle: any, result: string) {
  const day = detectDay();
  const d1 = delegates.find(x => x.phone === battle.player1Phone) || {};
  const d2 = delegates.find(x => x.phone === battle.player2Phone) || {};

  const record = {
    id: battle.battleId || `battle_${Date.now()}`,
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    day: day,
    player1Phone: battle.player1Phone,
    player1Name: battle.player1Name,
    player1Committee: d1.committee || "MUN",
    player2Phone: battle.player2Phone,
    player2Name: battle.player2Name,
    player2Committee: d2.committee || "MUN",
    winnerPhone: battle.winnerPhone || "Draw",
    winnerName: battle.winnerPhone ? (battle.winnerPhone === battle.player1Phone ? battle.player1Name : battle.player2Name) : "Draw",
    result: result === 'draw' ? 'Draw' : (result === 'p1_win' ? `${battle.player1Name} Won` : `${battle.player2Name} Won`),
    synced: false
  };

  battleHistory.push(record);
  savePersistence();

  // Non-blocking auto-sync if credentials exist
  if (sheetsConfig.spreadsheetId && sheetsConfig.accessToken && sheetsConfig.tokenExpiry > Date.now()) {
    syncBattleToGoogleSheets(record, sheetsConfig.accessToken, sheetsConfig.spreadsheetId).then(success => {
      if (success) {
        record.synced = true;
        savePersistence();
        // Trigger non-blocking leaderboard sync
        const enriched = getEnrichedLeaderboard();
        syncLeaderboardToGoogleSheets(enriched, sheetsConfig.accessToken, sheetsConfig.spreadsheetId);
      }
    });
  }
}

// Fetch Leaderboard API (Modified to be highly dynamic & detailed)
app.get("/api/game/leaderboard", (req, res) => {
  const enriched = getEnrichedLeaderboard();
  const ranked = enriched.map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  return res.json({ ok: true, leaderboard: ranked });
});

// Fetch Single Trainer Statistics, Battles and Coupons
app.get("/api/game/trainer-records", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const phoneStr = phone.toString();
  const d = delegates.find(x => x.phone === phoneStr) || {};
  const stats = gameLeaderboard[phoneStr] || { wins: 0, losses: 0, name: d.name || "Trainer", committee: d.committee || "MUN" };
  
  // Get trainer battles history
  const history = battleHistory.filter(b => b.player1Phone === phoneStr || b.player2Phone === phoneStr);
  const currentDay = detectDay();
  const playedToday = history.filter(b => b.day === currentDay).length;

  return res.json({
    ok: true,
    stats: {
      phone: phoneStr,
      name: stats.name,
      committee: stats.committee,
      wins: stats.wins,
      losses: stats.losses,
      playedToday,
      couponCode: getCouponReward(playedToday)
    },
    history
  });
});

// Admin override/manual logging for trainers
app.post("/api/game/admin-override", (req, res) => {
  const { phone, name, committee, wins, losses, action } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });
  
  const phoneStr = phone.toString().trim();
  const d = delegates.find(x => x.phone === phoneStr) || {};
  
  if (!gameLeaderboard[phoneStr]) {
    gameLeaderboard[phoneStr] = { 
      wins: 0, 
      losses: 0, 
      name: name || d.name || "Trainer", 
      committee: committee || d.committee || "MUN" 
    };
  }
  
  const trainer = gameLeaderboard[phoneStr];
  if (name) trainer.name = name;
  if (committee) trainer.committee = committee;
  
  if (action === 'set') {
    trainer.wins = typeof wins === 'number' ? wins : trainer.wins;
    trainer.losses = typeof losses === 'number' ? losses : trainer.losses;
  } else if (action === 'win') {
    trainer.wins++;
    const record = {
      id: `manual_win_${Date.now()}`,
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      day: detectDay(),
      player1Phone: phoneStr,
      player1Name: trainer.name,
      player1Committee: trainer.committee,
      player2Phone: "manual_adjustment",
      player2Name: "Manual Adjustment (Admin)",
      player2Committee: "Admin Override",
      winnerPhone: phoneStr,
      winnerName: trainer.name,
      result: "Manual Victory Recorded",
      synced: false
    };
    battleHistory.push(record);
  } else if (action === 'loss') {
    trainer.losses++;
    const record = {
      id: `manual_loss_${Date.now()}`,
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      day: detectDay(),
      player1Phone: phoneStr,
      player1Name: trainer.name,
      player1Committee: trainer.committee,
      player2Phone: "manual_adjustment",
      player2Name: "Manual Adjustment (Admin)",
      player2Committee: "Admin Override",
      winnerPhone: "manual_adjustment",
      winnerName: "Manual Adjustment (Admin)",
      result: "Manual Defeat Recorded",
      synced: false
    };
    battleHistory.push(record);
  } else if (action === 'draw') {
    const record = {
      id: `manual_draw_${Date.now()}`,
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      day: detectDay(),
      player1Phone: phoneStr,
      player1Name: trainer.name,
      player1Committee: trainer.committee,
      player2Phone: "manual_adjustment",
      player2Name: "Manual Adjustment (Admin)",
      player2Committee: "Admin Override",
      winnerPhone: "Draw",
      winnerName: "Draw",
      result: "Manual Draw Recorded",
      synced: false
    };
    battleHistory.push(record);
  } else if (action === 'reset') {
    trainer.wins = 0;
    trainer.losses = 0;
  }
  
  savePersistence();
  
  // Sync to sheets if configured
  if (sheetsConfig.spreadsheetId && sheetsConfig.accessToken && sheetsConfig.tokenExpiry > Date.now()) {
    const enriched = getEnrichedLeaderboard();
    syncLeaderboardToGoogleSheets(enriched, sheetsConfig.accessToken, sheetsConfig.spreadsheetId);
  }
  
  return res.json({ ok: true, stats: trainer });
});

// Record a Local/Versus Battle Result (Win/Loss)
app.post("/api/game/record-local-result", (req, res) => {
  const { phone, name, result } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const phoneStr = phone.toString();
  if (!gameLeaderboard[phoneStr]) {
    const d = delegates.find(x => x.phone === phoneStr) || {};
    gameLeaderboard[phoneStr] = { wins: 0, losses: 0, name: name || d.name || "Trainer", committee: d.committee || "MUN" };
  }

  if (result === 'win') {
    gameLeaderboard[phoneStr].wins++;
  } else if (result === 'loss') {
    gameLeaderboard[phoneStr].losses++;
  }
  savePersistence();

  // Add to battle history for tracking and Sheets syncing
  const day = detectDay();
  const d1 = delegates.find(x => x.phone === phoneStr) || {};
  const record = {
    id: `local_${Date.now()}`,
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    day: day,
    player1Phone: phoneStr,
    player1Name: name || d1.name || "Trainer",
    player1Committee: d1.committee || "MUN",
    player2Phone: "local_friend",
    player2Name: "Friend (Local)",
    player2Committee: "Local PvP",
    winnerPhone: result === 'win' ? phoneStr : "local_friend",
    winnerName: result === 'win' ? (name || d1.name || "Trainer") : "Friend (Local)",
    result: result === 'win' ? `${name || d1.name || "Trainer"} Won` : "Friend Won",
    synced: false
  };
  battleHistory.push(record);
  savePersistence();

  // Sync to sheets if configured
  if (sheetsConfig.spreadsheetId && sheetsConfig.accessToken && sheetsConfig.tokenExpiry > Date.now()) {
    syncBattleToGoogleSheets(record, sheetsConfig.accessToken, sheetsConfig.spreadsheetId).then(success => {
      if (success) {
        record.synced = true;
        savePersistence();
        const enriched = getEnrichedLeaderboard();
        syncLeaderboardToGoogleSheets(enriched, sheetsConfig.accessToken, sheetsConfig.spreadsheetId);
      }
    });
  }

  return res.json({
    ok: true,
    stats: {
      phone: phoneStr,
      name: gameLeaderboard[phoneStr].name,
      committee: gameLeaderboard[phoneStr].committee,
      wins: gameLeaderboard[phoneStr].wins,
      losses: gameLeaderboard[phoneStr].losses,
      playedToday: battleHistory.filter(b => (b.player1Phone === phoneStr || b.player2Phone === phoneStr) && b.day === day).length,
      couponCode: getCouponReward(battleHistory.filter(b => (b.player1Phone === phoneStr || b.player2Phone === phoneStr) && b.day === day).length)
    }
  });
});

// Google Sheets API Endpoints
app.get("/api/sheets/config", (req, res) => {
  const isAuthorized = !!(sheetsConfig.accessToken && sheetsConfig.tokenExpiry > Date.now());
  return res.json({
    ok: true,
    spreadsheetId: sheetsConfig.spreadsheetId,
    spreadsheetUrl: sheetsConfig.spreadsheetUrl,
    isLinked: !!sheetsConfig.spreadsheetId,
    isAuthorized,
    adminEmail: sheetsConfig.adminEmail,
    lastSynced: sheetsConfig.lastSynced,
    pendingSyncCount: battleHistory.filter(b => !b.synced).length,
    totalBattles: battleHistory.length,
    history: battleHistory.slice().reverse() // Show latest first
  });
});

app.post("/api/sheets/setup", async (req, res) => {
  const { accessToken, spreadsheetId, email } = req.body;
  if (!accessToken) return res.status(400).json({ error: "Access token required" });

  sheetsConfig.accessToken = accessToken;
  sheetsConfig.tokenExpiry = Date.now() + 3500000; // ~58 minutes
  if (email) sheetsConfig.adminEmail = email;

  try {
    let sheetId = spreadsheetId;
    let sheetUrl = "";

    if (!sheetId) {
      // Create a brand new spreadsheet
      console.log("[Sheets API] Creating brand-new Battle Records spreadsheet...");
      const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            title: "SPSMUN 2026 - Pokémon Battle Records"
          },
          sheets: [
            { properties: { title: "Battle Records" } },
            { properties: { title: "Leaderboard" } }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[Sheets API] Create failed:", errText);
        return res.status(500).json({ error: `Failed to create Google Sheet: ${errText}` });
      }

      const data = await response.json();
      sheetId = data.spreadsheetId;
      sheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheetId}`;
    } else {
      // Use existing spreadsheet ID and verify permissions
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return res.status(400).json({ error: "Spreadsheet ID is invalid or inaccessible with this Google account." });
      }
      sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;

      // Create worksheets inside existing sheet
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            { addSheet: { properties: { title: "Battle Records" } } },
            { addSheet: { properties: { title: "Leaderboard" } } }
          ]
        })
      }).catch(err => {
        // Safe catch: worksheet probably already exists
      });
    }

    // Update config
    sheetsConfig.spreadsheetId = sheetId;
    sheetsConfig.spreadsheetUrl = sheetUrl;
    sheetsConfig.lastSynced = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    savePersistence();

    // Setup sheet headers
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Battle Records!A1:L1')}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        values: [[
          "Battle ID", "Timestamp", "Day", "Trainer 1 Phone", "Trainer 1 Name", "Trainer 1 Committee",
          "Trainer 2 Phone", "Trainer 2 Name", "Trainer 2 Committee", "Winner Phone", "Winner Name", "Result"
        ]]
      })
    });

    // Write any pending records
    let syncedCount = 0;
    for (const b of battleHistory) {
      if (!b.synced) {
        const success = await syncBattleToGoogleSheets(b, accessToken, sheetId);
        if (success) {
          b.synced = true;
          syncedCount++;
        }
      }
    }

    // Overwrite leaderboard sheet
    const enriched = getEnrichedLeaderboard();
    await syncLeaderboardToGoogleSheets(enriched, accessToken, sheetId);

    savePersistence();

    return res.json({
      ok: true,
      spreadsheetId: sheetId,
      spreadsheetUrl: sheetUrl,
      syncedCount,
      totalBattles: battleHistory.length
    });

  } catch (err: any) {
    console.error("[Sheets API] Setup failed:", err);
    return res.status(500).json({ error: err.message || "Failed to setup Google Sheets." });
  }
});

app.post("/api/sheets/sync", async (req, res) => {
  const { accessToken } = req.body;
  const token = accessToken || sheetsConfig.accessToken;
  const isAuthorized = token && (accessToken || sheetsConfig.tokenExpiry > Date.now());

  if (!isAuthorized) {
    return res.status(401).json({ error: "Google authorization required or token has expired." });
  }

  if (accessToken) {
    sheetsConfig.accessToken = accessToken;
    sheetsConfig.tokenExpiry = Date.now() + 3500000;
  }

  if (!sheetsConfig.spreadsheetId) {
    return res.status(400).json({ error: "No Google Spreadsheet linked yet." });
  }

  try {
    let syncedCount = 0;
    for (const b of battleHistory) {
      if (!b.synced) {
        const success = await syncBattleToGoogleSheets(b, token, sheetsConfig.spreadsheetId);
        if (success) {
          b.synced = true;
          syncedCount++;
        }
      }
    }

    // Rewrite Leaderboard
    const enriched = getEnrichedLeaderboard();
    await syncLeaderboardToGoogleSheets(enriched, token, sheetsConfig.spreadsheetId);

    sheetsConfig.lastSynced = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    savePersistence();

    return res.json({
      ok: true,
      syncedCount,
      totalBattles: battleHistory.length,
      lastSynced: sheetsConfig.lastSynced
    });
  } catch (err: any) {
    console.error("[Sheets API] Manual sync failed:", err);
    return res.status(500).json({ error: err.message || "Manual sync failed." });
  }
});

app.post("/api/sheets/disconnect", (req, res) => {
  sheetsConfig.spreadsheetId = "";
  sheetsConfig.spreadsheetUrl = "";
  sheetsConfig.accessToken = "";
  sheetsConfig.tokenExpiry = 0;
  sheetsConfig.lastSynced = "";
  savePersistence();
  return res.json({ ok: true });
});

function detectDay() {
  const t = new Date().toISOString().slice(0, 10);
  const idx = EVENT_DAYS.indexOf(t);
  return idx >= 0 ? idx + 1 : 1;
}

// Vite and Production asset handlers
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SPSMUN 2026 Portal Running on port ${PORT}`);
  });
}

startServer();
