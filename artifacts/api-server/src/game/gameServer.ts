import { Server, Socket } from "socket.io";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlayerState {
  id: string; uid: string;
  x: number; y: number; rotation: number; vx: number; vy: number;
  name: string; photoURL: string | null;
  transits: number; color: string; flag: string;
  frozen: boolean; frozenUntil: number;
}
interface BotState {
  id: string; name: string; flag: string; color: string;
  x: number; y: number; rotation: number;
  waypointIdx: number; direction: 1 | -1;
  frozen: boolean; frozenUntil: number; yOff: number;
}
interface Mine { id: string; x: number; y: number; defused: boolean; }
interface CoastGuard { x: number; y: number; rotation: number; direction: 1 | -1; }
interface GameEvent { type: "fuel_crisis" | "storm" | "oil_spike"; expiresAt: number; }
interface FuelRequest { id: string; fromSocketId: string; fromName: string; fromFlag: string; toSocketId: string; expiresAt: number; }

// ── Constants ─────────────────────────────────────────────────────────────────
const TICK_MS        = 100;
const BOT_SPEED      = 1.4;
const CG_SPEED       = 1.1;
const MINE_RADIUS    = 22;
const CG_RADIUS      = 38;
const MINE_FREEZE_MS = 10_000;
const CG_FREEZE_MS   = 24_000;
const EVENT_INTERVAL = 70_000;
const EVENT_DURATION = 28_000;
const FUEL_REQ_EXPIRY = 20_000;
const FUEL_AMOUNT    = 30;
const FUEL_COST      = 150; // $ deducted from requester, paid to sender

// Updated waypoints matching new map geography (through the strait channel)
const WAYPOINTS: [number, number][] = [
  [100, 740],  [350, 728],  [600, 715],  [900, 702],  [1200, 688],
  [1450, 672], [1700, 657], [1900, 648], [2100, 638], [2350, 645],
  [2600, 660], [2900, 680], [3150, 700],
];

// ── State ─────────────────────────────────────────────────────────────────────
const players = new Map<string, PlayerState>();

const bots: BotState[] = [
  { id:"bot_0", name:"MV Olympia",    flag:"🏳️", color:"#ff8c00", yOff:-32, waypointIdx:0,  direction:1,  x:WAYPOINTS[0][0],  y:WAYPOINTS[0][1]-32,  rotation:0, frozen:false, frozenUntil:0 },
  { id:"bot_1", name:"SS Horizon",    flag:"🏴", color:"#e05c00", yOff: 28, waypointIdx:4,  direction:1,  x:WAYPOINTS[4][0],  y:WAYPOINTS[4][1]+28,  rotation:0, frozen:false, frozenUntil:0 },
  { id:"bot_2", name:"MV Al-Khaleej", flag:"🏳️", color:"#ffd700", yOff: 55, waypointIdx:8,  direction:-1, x:WAYPOINTS[8][0],  y:WAYPOINTS[8][1]+55,  rotation:0, frozen:false, frozenUntil:0 },
];

// Updated mine positions matching new map's water channel
const mines: Mine[] = [
  { id:"m0", x:430,  y:742, defused:false },
  { id:"m1", x:682,  y:720, defused:false },
  { id:"m2", x:958,  y:705, defused:false },
  { id:"m3", x:1230, y:690, defused:false },
  { id:"m4", x:1480, y:673, defused:false },
  { id:"m5", x:1720, y:660, defused:false },
  { id:"m6", x:1960, y:649, defused:false },
  { id:"m7", x:2200, y:642, defused:false },
  { id:"m8", x:2470, y:655, defused:false },
  { id:"m9", x:2730, y:672, defused:false },
];

const coastGuard: CoastGuard = { x:1400, y:650, rotation:0, direction:1 };
let currentEvent: GameEvent | null = null;
const fuelRequests = new Map<string, FuelRequest>();

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitData() {
  return {
    mines: mines.filter(m => !m.defused).map(({ id, x, y }) => ({ id, x, y })),
    bots: bots.map(({ id, name, flag, x, y, rotation, color, frozen }) => ({ id, name, flag, x, y, rotation, color, frozen })),
    coastGuard: { x: coastGuard.x, y: coastGuard.y, rotation: coastGuard.rotation },
    event: currentEvent,
  };
}

function updateBots(io: Server, now: number) {
  for (const bot of bots) {
    if (bot.frozen) { if (now > bot.frozenUntil) bot.frozen = false; else continue; }
    const wp = WAYPOINTS[bot.waypointIdx];
    const tx = wp[0], ty = wp[1] + bot.yOff;
    const dx = tx - bot.x, dy = ty - bot.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 15) {
      const next = bot.waypointIdx + bot.direction;
      if (next < 0 || next >= WAYPOINTS.length) bot.direction = bot.direction === 1 ? -1 : 1;
      else bot.waypointIdx = next;
    } else {
      const angle = Math.atan2(dy, dx);
      bot.rotation = angle; bot.x += Math.cos(angle)*BOT_SPEED; bot.y += Math.sin(angle)*BOT_SPEED;
    }
    for (const m of mines) {
      if (m.defused) continue;
      if (Math.sqrt((bot.x-m.x)**2+(bot.y-m.y)**2) < MINE_RADIUS) {
        m.defused = true; bot.frozen = true; bot.frozenUntil = now + MINE_FREEZE_MS;
        io.emit("mine:exploded", { mineId: m.id, botId: bot.id }); break;
      }
    }
  }
  io.emit("bots:update", bots.map(({ id,x,y,rotation,frozen }) => ({ id,x,y,rotation,frozen })));
}

function updateCoastGuard(io: Server) {
  const MIN_X=400, MAX_X=2850;
  coastGuard.x += CG_SPEED * coastGuard.direction;
  if (coastGuard.x > MAX_X) coastGuard.direction = -1;
  if (coastGuard.x < MIN_X) coastGuard.direction = 1;
  coastGuard.y = 648 + Math.sin(coastGuard.x / 280) * 42;
  coastGuard.rotation = coastGuard.direction === 1 ? 0 : Math.PI;
  io.emit("coastguard:update", { x: coastGuard.x, y: coastGuard.y, rotation: coastGuard.rotation });
}

function checkCoastGuardPlayers(io: Server, now: number) {
  for (const [, p] of players) {
    if (p.frozen) { if (now > p.frozenUntil) p.frozen = false; else continue; }
    if (Math.sqrt((p.x-coastGuard.x)**2+(p.y-coastGuard.y)**2) < CG_RADIUS) {
      p.frozen = true; p.frozenUntil = now + CG_FREEZE_MS;
      io.to(p.id).emit("player:arrested", { duration: CG_FREEZE_MS });
    }
  }
}

function scheduleEvents(io: Server) {
  const TYPES: GameEvent["type"][] = ["fuel_crisis","storm","oil_spike"];
  setInterval(() => {
    const type = TYPES[Math.floor(Math.random()*TYPES.length)];
    currentEvent = { type, expiresAt: Date.now() + EVENT_DURATION };
    io.emit("game:event", currentEvent);
    setTimeout(() => { currentEvent = null; io.emit("game:event", null); }, EVENT_DURATION);
  }, EVENT_INTERVAL);
}

function startTick(io: Server) {
  let tick = 0;
  setInterval(() => {
    const now = Date.now();
    tick++;
    updateBots(io, now);
    if (tick % 3 === 0) { updateCoastGuard(io); checkCoastGuardPlayers(io, now); }
  }, TICK_MS);
}

// ── Main export ───────────────────────────────────────────────────────────────
export function initGameServer(io: Server): void {
  scheduleEvents(io);
  startTick(io);

  io.on("connection", (socket: Socket) => {
    const a = socket.handshake.auth as {
      uid?: string; name?: string; photoURL?: string;
      transits?: number; x?: number; y?: number; rotation?: number;
      color?: string; flag?: string;
    };

    const savedPos = (a.x != null && a.y != null)
      ? { x: a.x, y: a.y, rotation: a.rotation ?? 0, vx: 0, vy: 0 }
      : { x: 180, y: 700 + Math.random() * 200, rotation: 0, vx: 0, vy: 0 };

    const player: PlayerState = {
      id: socket.id, uid: a.uid ?? socket.id,
      name: a.name ?? `Navigator ${Math.floor(Math.random()*999)}`,
      photoURL: a.photoURL ?? null, color: a.color ?? "#4ade80",
      flag: a.flag ?? "🏳️", transits: a.transits ?? 0,
      frozen: false, frozenUntil: 0, ...savedPos,
    };
    players.set(socket.id, player);
    logger.info({ uid: player.uid, name: player.name, total: players.size }, "Player connected");

    socket.emit("players:init", { self: player, others: Array.from(players.values()).filter(p => p.id !== socket.id) });
    socket.emit("game:init", getInitData());
    socket.broadcast.emit("player:join", player);

    socket.on("player:update", (d: {x:number;y:number;rotation:number;vx:number;vy:number}) => {
      const p = players.get(socket.id);
      if (!p || p.frozen) return;
      p.x=d.x; p.y=d.y; p.rotation=d.rotation; p.vx=d.vx; p.vy=d.vy;
      socket.broadcast.emit("player:update", { id:socket.id, uid:p.uid, ...d });
    });

    socket.on("player:transit", () => {
      const p = players.get(socket.id);
      if (!p) return;
      p.transits++;
      const pos = { x:180, y:700+Math.random()*200, rotation:0, vx:0, vy:0 };
      Object.assign(p, pos);
      io.emit("player:transited", { id:socket.id, uid:p.uid, name:p.name, transits:p.transits });
      socket.emit("player:reset", pos);
    });

    socket.on("player:mine_hit", ({ mineId }: { mineId: string }) => {
      const mine = mines.find(m => m.id === mineId && !m.defused);
      if (!mine) return;
      mine.defused = true;
      io.emit("mine:exploded", { mineId, botId: null });
      const p = players.get(socket.id);
      if (p) { p.frozen=true; p.frozenUntil=Date.now()+MINE_FREEZE_MS; socket.emit("player:frozen", { duration:MINE_FREEZE_MS, reason:"mine" }); }
    });

    // ── Fuel transfer ─────────────────────────────────────────────────────────
    socket.on("fuel:request", ({ toUid }: { toUid: string }) => {
      const target = [...players.values()].find(p => p.uid === toUid && p.id !== socket.id);
      if (!target) { socket.emit("fuel:request_failed", { reason: "Player not found" }); return; }
      const reqId = `fr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const req: FuelRequest = { id:reqId, fromSocketId:socket.id, fromName:player.name, fromFlag:player.flag, toSocketId:target.id, expiresAt:Date.now()+FUEL_REQ_EXPIRY };
      fuelRequests.set(reqId, req);
      io.to(target.id).emit("fuel:request_incoming", { requestId:reqId, fromName:player.name, fromFlag:player.flag });
      socket.emit("fuel:request_sent", { requestId:reqId, toName:target.name });
      setTimeout(() => {
        if (fuelRequests.has(reqId)) {
          fuelRequests.delete(reqId);
          io.to(socket.id).emit("fuel:request_expired", { requestId:reqId });
        }
      }, FUEL_REQ_EXPIRY);
    });

    socket.on("fuel:respond", ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const req = fuelRequests.get(requestId);
      if (!req) return;
      fuelRequests.delete(requestId);
      if (accept) {
        io.to(req.fromSocketId).emit("fuel:transfer_complete", { amount:FUEL_AMOUNT, cost:FUEL_COST });
        socket.emit("fuel:transfer_sent", { amount:FUEL_AMOUNT, payment:FUEL_COST });
      } else {
        io.to(req.fromSocketId).emit("fuel:request_declined", { fromName:player.name });
      }
    });

    socket.on("chat:send", ({ text }: { text: string }) => {
      const p = players.get(socket.id);
      if (!p || !text?.trim()) return;
      io.emit("chat:message", { uid:p.uid, name:p.name, flag:p.flag, text:text.trim().slice(0,200), ts:Date.now() });
    });

    socket.on("disconnect", () => {
      players.delete(socket.id);
      io.emit("player:leave", { socketId:socket.id, uid:player.uid });
      logger.info({ socketId:socket.id, total:players.size }, "Player disconnected");
    });
  });
}
