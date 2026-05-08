import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { User } from "firebase/auth";
import { signOutUser } from "@/firebase/auth";
import {
  savePlayerState, loadPlayerState, subscribeToAllPlayers,
  colorFromUid, type PlayerDoc,
} from "@/firebase/gameState";
import { detectNation, type Nation } from "./nations";
import Chat from "@/components/Chat";
import { getLevelInfo, type ComputedLevel, XP_TRANSIT, XP_OIL, XP_FUEL_GIVEN, REP_TRANSIT, REP_OIL, REP_FUEL_GIVEN } from "./levels";
import {
  MAP_WIDTH, MAP_HEIGHT, SHIP_LENGTH, SHIP_WIDTH,
  MAX_SPEED, REVERSE_SPEED, ACCELERATION, DRAG,
  ROTATION_SPEED, ANGULAR_DRAG, SYNC_RATE_MS,
  START_ZONE, FINISH_ZONE, CAMERA_LERP,
  ZOOM_MAX, ZOOM_DEFAULT, ZOOM_STEP, ZOOM_MIN,
  FINISH_COLOR, FINISH_BORDER_COLOR, START_COLOR, START_BORDER_COLOR,
  OIL_LOAD_ZONE, OIL_DELIVER_ZONE, FUEL_STATION_EAST, FUEL_STATION_WEST,
  MINE_RADIUS, HOVER_RADIUS, FUEL_CAPACITY, FUEL_DRAIN,
  OIL_CARGO_MAX, OIL_BASE_PRICE, FUEL_BASE_PRICE, STARTING_MONEY,
  OIL_COLOR, OIL_BORDER_COLOR, FUEL_COLOR, FUEL_BORDER_COLOR,
  FUEL_REQUEST_RANGE, FUEL_TRANSFER_AMOUNT, FUEL_TRANSFER_COST,
  PX_TO_KM,
} from "./constants";
import { drawMap, isOnLand } from "./mapData";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LivePlayer {
  id: string; uid: string; flag?: string;
  x: number; y: number; rotation: number; vx: number; vy: number;
  name: string; transits: number; color: string; photoURL?: string | null;
}
interface RemotePlayer extends LivePlayer {
  targetX: number; targetY: number; targetRotation: number;
  wake: { x: number; y: number; age: number }[];
}
interface BotState { id: string; name: string; flag: string; x: number; y: number; rotation: number; color: string; frozen: boolean; }
interface MineState { id: string; x: number; y: number; alive: boolean; }
interface CoastGuardState { x: number; y: number; rotation: number; }
interface GameEvent { type: "fuel_crisis" | "storm" | "oil_spike"; expiresAt: number; }
interface HoverInfo {
  name: string; color: string; flag: string; transits: number;
  uid?: string; photoURL?: string | null; isBot?: boolean; isSelf?: boolean;
  money?: number; fuel?: number; bonus?: string; canRequestFuel?: boolean;
}
interface Announcement { id: number; text: string; expiry: number; }
interface IncomingFuelReq { requestId: string; fromName: string; fromFlag: string; }
interface OutgoingFuelReq { requestId: string; toName: string; }
interface Props { user: User; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const lighten = (hex: string, n: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`;
};
const darken = (hex: string, n: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-n)},${Math.max(0,g-n)},${Math.max(0,b-n)})`;
};
const dist2 = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax-bx)**2+(ay-by)**2);
const inZone = (x: number, y: number, z: {x:number;y:number;w:number;h:number}) =>
  x>=z.x && x<=z.x+z.w && y>=z.y && y<=z.y+z.h;

// ── Component ─────────────────────────────────────────────────────────────────
export default function GameCanvas({ user }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const selfRef = useRef<LivePlayer | null>(null);
  const remotesRef = useRef<Map<string, RemotePlayer>>(new Map());
  const liveUidsRef = useRef<Set<string>>(new Set());
  const firestorePlayersRef = useRef<Map<string, PlayerDoc>>(new Map());
  const botsRef = useRef<BotState[]>([]);
  const minesRef = useRef<MineState[]>([]);
  const coastGuardRef = useRef<CoastGuardState | null>(null);
  const gameEventRef = useRef<GameEvent | null>(null);

  const keysRef = useRef<Set<string>>(new Set());
  const camRef = useRef({ x: MAP_WIDTH/2 - 640, y: MAP_HEIGHT/2 - 360 });
  const angularVelRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastSyncRef = useRef(0);
  const lastSaveRef = useRef(0);
  const prevPosRef = useRef({ x: 0, y: 0 });
  const transitCooldownRef = useRef(false);
  const zoomRef = useRef(ZOOM_DEFAULT);
  const targetZoomRef = useRef(ZOOM_DEFAULT);
  const selfWakeRef = useRef<{ x: number; y: number; age: number }[]>([]);
  const wakeTickRef = useRef(0);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const myColorRef = useRef(colorFromUid(user.uid));
  const nationRef = useRef<Nation | null>(null);
  const pinchDistRef = useRef(0);
  const xpRef = useRef(0);
  const reputationRef = useRef(0);
  const levelInfoRef = useRef<ComputedLevel>(getLevelInfo(0));
  // Set of remote player UIDs with low fuel (for canvas icon)
  const lowFuelUidsRef = useRef<Set<string>>(new Set());
  const fuelLowEmittedRef = useRef(false);

  // Economy refs
  const fuelRef = useRef<number>(FUEL_CAPACITY);
  const moneyRef = useRef<number>(STARTING_MONEY);
  const oilBarrelsRef = useRef<number>(0);
  const oilPriceRef = useRef<number>(OIL_BASE_PRICE);
  const fuelPriceRef = useRef<number>(FUEL_BASE_PRICE);
  const frozenUntilRef = useRef<number>(0);
  const loadingStartRef = useRef<number>(0);
  const stormRef = useRef(false);
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const mouseWorldRef = useRef({ x: 0, y: 0 });
  const mouseOnLandRef = useRef(false);
  const hoveredShipRef = useRef(false);
  const annIdRef = useRef(0);

  // React state (UI)
  const [playerCount, setPlayerCount] = useState(1);
  const [myTransits, setMyTransits] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [connected, setConnected] = useState(false);
  const [fuel, setFuel] = useState(FUEL_CAPACITY);
  const [money, setMoney] = useState(STARTING_MONEY);
  const [oilBarrels, setOilBarrels] = useState(0);
  const [oilPrice, setOilPrice] = useState(OIL_BASE_PRICE);
  const [fuelPrice, setFuelPrice] = useState(FUEL_BASE_PRICE);
  const [nation, setNation] = useState<Nation | null>(null);
  const [gameEvent, setGameEvent] = useState<GameEvent | null>(null);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [mapHover, setMapHover] = useState<{ distKm: number; eta: string; screenX: number; screenY: number } | null>(null);
  const [topPlayers, setTopPlayers] = useState<{ name: string; transits: number; color: string; xp: number }[]>([]);
  const [incomingFuelReq, setIncomingFuelReq] = useState<IncomingFuelReq | null>(null);
  const [outgoingFuelReq, setOutgoingFuelReq] = useState<OutgoingFuelReq | null>(null);
  const [incomingTimer, setIncomingTimer] = useState(0);
  const [xp, setXp] = useState(0);
  const [reputation, setReputation] = useState(0);
  const [levelInfo, setLevelInfo] = useState<ComputedLevel>(getLevelInfo(0));

  const addAnn = useCallback((text: string) => {
    const id = annIdRef.current++;
    setAnnouncements(p => [...p.slice(-4), { id, text, expiry: Date.now() + 5000 }]);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAnnouncements(p => p.filter(a => a.expiry > Date.now())), 500);
    return () => clearInterval(t);
  }, []);

  // Countdown timer for incoming fuel request
  useEffect(() => {
    if (!incomingFuelReq) return;
    setIncomingTimer(20);
    const t = setInterval(() => setIncomingTimer(v => { if (v <= 1) { setIncomingFuelReq(null); return 0; } return v - 1; }), 1000);
    return () => clearInterval(t);
  }, [incomingFuelReq]);

  // Nation detection
  useEffect(() => {
    detectNation().then(n => { nationRef.current = n; setNation(n); addAnn(`${n.flag} ${n.name} — ${n.bonusLabel}`); });
  }, [addAnn]);

  // Firestore ghost ships + leaderboard
  useEffect(() => {
    const unsub = subscribeToAllPlayers(players => {
      const map = new Map<string, PlayerDoc>();
      for (const p of players) map.set(p.uid, p);
      firestorePlayersRef.current = map;
      const sorted = [...players].sort((a, b) => (b.transits??0)-(a.transits??0)).slice(0,5);
      setTopPlayers(sorted.map(p => ({ name: p.displayName, transits: p.transits??0, color: p.color, xp: p.xp??0 })));
    });
    return unsub;
  }, []);

  // ── Canvas + socket init ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);

    // Offscreen map
    const offscreen = document.createElement("canvas");
    offscreen.width = MAP_WIDTH; offscreen.height = MAP_HEIGHT;
    const offCtx = offscreen.getContext("2d");
    if (offCtx) drawMap(offCtx);
    offscreenRef.current = offscreen;

    // Keyboard
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const isMove = ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k);
      if (isMove) {
        e.preventDefault();
        if (e.type === "keydown") { keysRef.current.add(k); clickTargetRef.current = null; }
        else keysRef.current.delete(k);
      }
      if (e.type === "keydown") {
        if (k==="="||k==="+"||k==="pageup") { targetZoomRef.current = Math.min(ZOOM_MAX, targetZoomRef.current+ZOOM_STEP); }
        if (k==="-"||k==="pagedown") { const minZ = getDynMinZoom(canvas); targetZoomRef.current = Math.max(minZ, targetZoomRef.current-ZOOM_STEP); }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // Mouse click-to-move
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left) / zoomRef.current + camRef.current.x;
      const wy = (e.clientY - rect.top)  / zoomRef.current + camRef.current.y;
      if (!isOnLand(wx, wy)) clickTargetRef.current = { x: wx, y: wy };
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    // Scroll wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const minZ = getDynMinZoom(canvas);
      targetZoomRef.current = Math.max(minZ, Math.min(ZOOM_MAX, targetZoomRef.current + (e.deltaY>0?-ZOOM_STEP:ZOOM_STEP)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Touch: single touch = click-to-move, two-finger pinch = zoom
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const wx = (t.clientX - rect.left) / zoomRef.current + camRef.current.x;
        const wy = (t.clientY - rect.top)  / zoomRef.current + camRef.current.y;
        if (!isOnLand(wx, wy)) clickTargetRef.current = { x: wx, y: wy };
        pinchDistRef.current = 0;
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDistRef.current = Math.sqrt(dx*dx+dy*dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchDistRef.current > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx*dx+dy*dy);
        const ratio = newDist / pinchDistRef.current;
        const minZ = getDynMinZoom(canvas);
        targetZoomRef.current = Math.max(minZ, Math.min(ZOOM_MAX, targetZoomRef.current * ratio));
        pinchDistRef.current = newDist;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length < 2) pinchDistRef.current = 0;
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,   { passive: false });

    // Hover (mouse)
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left) / zoomRef.current + camRef.current.x;
      const wy = (e.clientY - rect.top)  / zoomRef.current + camRef.current.y;
      mouseWorldRef.current = { x: wx, y: wy };

      const onLand = isOnLand(wx, wy);
      mouseOnLandRef.current = onLand;

      const s = selfRef.current;
      let found: HoverInfo | null = null;
      for (const r of remotesRef.current.values()) {
        if (dist2(r.x, r.y, wx, wy) < HOVER_RADIUS) {
          const proximity = s ? dist2(s.x, s.y, r.x, r.y) : 9999;
          found = {
            name: r.name, color: r.color, flag: r.flag??"🏳️",
            transits: r.transits, photoURL: r.photoURL, uid: r.uid,
            canRequestFuel: proximity < FUEL_REQUEST_RANGE,
          }; break;
        }
      }
      if (!found) for (const bot of botsRef.current) {
        if (dist2(bot.x, bot.y, wx, wy) < HOVER_RADIUS) {
          found = { name: bot.name, color: bot.color, flag: bot.flag, transits: 0, isBot: true }; break;
        }
      }
      if (!found && s && dist2(s.x, s.y, wx, wy) < HOVER_RADIUS) {
        found = {
          name: s.name, color: myColorRef.current, flag: nationRef.current?.flag??"🏳️",
          transits: s.transits, photoURL: user.photoURL, isSelf: true,
          money: moneyRef.current, fuel: Math.round(fuelRef.current), bonus: nationRef.current?.bonusLabel,
        };
      }
      hoveredShipRef.current = found !== null;
      setHoverInfo(found);
      if (found) setHoverPos({ x: e.clientX, y: e.clientY });

      // Map hover: distance + ETA for any water position
      if (!found && !onLand && s) {
        const d = dist2(s.x, s.y, wx, wy);
        const distKm = parseFloat((d * PX_TO_KM).toFixed(1));
        const curSpd = Math.sqrt(s.vx ** 2 + s.vy ** 2);
        // Use current speed if moving, otherwise estimate at cruise (70 % of max)
        const speedPxSec = Math.max(curSpd, MAX_SPEED * 0.7) * 60;
        const secs = Math.round(d / speedPxSec);
        const eta = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
        setMapHover({ distKm, eta, screenX: e.clientX, screenY: e.clientY });
      } else {
        setMapHover(null);
      }
    };
    canvas.addEventListener("mousemove", onMouseMove);

    const onUnload = () => {
      const s = selfRef.current; if (!s) return;
      savePlayerState(user.uid, { displayName:user.displayName??"", photoURL:user.photoURL, x:s.x, y:s.y, rotation:s.rotation, transits:s.transits, color:myColorRef.current, xp:xpRef.current, reputation:reputationRef.current });
    };
    window.addEventListener("beforeunload", onUnload);

    // Socket connection
    loadPlayerState(user.uid).then(saved => {
      if (saved?.color) myColorRef.current = saved.color;
      if (saved?.xp) { xpRef.current=saved.xp; setXp(saved.xp); const li=getLevelInfo(saved.xp); levelInfoRef.current=li; setLevelInfo(li); }
      if (saved?.reputation) { reputationRef.current=saved.reputation; setReputation(saved.reputation); }
      const socketAuth: Record<string, unknown> = {
        uid: user.uid, name: user.displayName??"Navigator",
        photoURL: user.photoURL??null, color: myColorRef.current,
        transits: saved?.transits??0, flag: nationRef.current?.flag??"🏳️",
      };
      if (saved) { socketAuth.x=saved.x; socketAuth.y=saved.y; socketAuth.rotation=saved.rotation; }

      const socket = io({ path: "/socket.io", auth: socketAuth });
      socketRef.current = socket;

      socket.on("connect",    () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));

      socket.on("players:init", (d: { self: LivePlayer; others: LivePlayer[] }) => {
        selfRef.current = { ...d.self };
        prevPosRef.current = { x: d.self.x, y: d.self.y };
        myColorRef.current = d.self.color;
        setMyTransits(d.self.transits);
        liveUidsRef.current = new Set([d.self.uid, ...d.others.map(p=>p.uid)]);
        remotesRef.current.clear();
        for (const p of d.others) remotesRef.current.set(p.id, { ...p, targetX:p.x, targetY:p.y, targetRotation:p.rotation, wake:[] });
        setPlayerCount(1 + d.others.length);
      });

      socket.on("game:init", (d: { mines:{id:string;x:number;y:number}[]; bots:BotState[]; coastGuard:CoastGuardState; event:GameEvent|null }) => {
        minesRef.current = d.mines.map(m => ({ ...m, alive: true }));
        botsRef.current  = d.bots;
        coastGuardRef.current = d.coastGuard;
        if (d.event) { gameEventRef.current=d.event; setGameEvent(d.event); applyEvent(d.event); }
      });

      socket.on("bots:update", (ups: {id:string;x:number;y:number;rotation:number;frozen:boolean}[]) => {
        for (const u of ups) { const b=botsRef.current.find(x=>x.id===u.id); if(b) Object.assign(b,u); }
      });
      socket.on("coastguard:update", (cg: CoastGuardState) => { coastGuardRef.current=cg; });

      socket.on("player:join", (p: LivePlayer) => {
        liveUidsRef.current.add(p.uid);
        remotesRef.current.set(p.id, { ...p, targetX:p.x, targetY:p.y, targetRotation:p.rotation, wake:[] });
        setPlayerCount(c=>c+1); addAnn(`${p.flag??"⚓"} ${p.name} entered the strait`);
      });
      socket.on("player:leave", (d: {socketId:string;uid?:string}) => {
        const r = remotesRef.current.get(d.socketId);
        if (r) { addAnn(`${r.name} left`); if(d.uid) liveUidsRef.current.delete(d.uid); }
        remotesRef.current.delete(d.socketId);
        setPlayerCount(c=>Math.max(1,c-1));
      });
      socket.on("player:update", (d: {id:string;uid:string;x:number;y:number;rotation:number;vx:number;vy:number}) => {
        const r = remotesRef.current.get(d.id);
        if (r) { r.targetX=d.x; r.targetY=d.y; r.targetRotation=d.rotation; }
      });
      socket.on("player:transited", (d: {id:string;uid:string;name:string;transits:number}) => {
        if (socket.id===d.id) {
          setMyTransits(d.transits);
          // Award XP + reputation for transit
          xpRef.current+=XP_TRANSIT; reputationRef.current+=REP_TRANSIT;
          setXp(xpRef.current); setReputation(reputationRef.current);
          const li=getLevelInfo(xpRef.current); const prevLvl=levelInfoRef.current.level;
          levelInfoRef.current=li; setLevelInfo(li);
          if (li.level>prevLvl) addAnn(`🎖️ Level Up! ${li.badge} ${li.title} (${li.titleAr})`);
          const s=selfRef.current; if(s) { s.transits=d.transits; savePlayerState(user.uid,{displayName:user.displayName??"",photoURL:user.photoURL,x:s.x,y:s.y,rotation:s.rotation,transits:d.transits,color:myColorRef.current,xp:xpRef.current,reputation:reputationRef.current}); }
        }
        addAnn(`✓ ${d.name} completed transit #${d.transits}! (+${XP_TRANSIT} XP)`);
      });
      socket.on("player:reset", (pos: {x:number;y:number;rotation:number}) => {
        const s=selfRef.current; if(!s) return;
        Object.assign(s, pos, {vx:0,vy:0});
        prevPosRef.current={x:pos.x,y:pos.y}; angularVelRef.current=0;
        selfWakeRef.current=[]; transitCooldownRef.current=false; clickTargetRef.current=null;
      });
      socket.on("mine:exploded", (d:{mineId:string;botId:string|null}) => {
        const m=minesRef.current.find(x=>x.id===d.mineId); if(m) m.alive=false;
        addAnn(d.botId?"💥 NPC hit a mine!":"💥 Mine detonated!");
      });
      socket.on("player:frozen", ({duration,reason}:{duration:number;reason:string}) => {
        frozenUntilRef.current=Date.now()+duration; setFrozenUntil(frozenUntilRef.current);
        if (reason==="mine") {
          moneyRef.current=Math.floor(moneyRef.current*0.5); setMoney(moneyRef.current);
          oilBarrelsRef.current=0; setOilBarrels(0);
          addAnn(`💥 Mine! Frozen ${duration/1000}s · Lost 50% money & cargo`);
        }
      });
      socket.on("player:arrested", ({duration}:{duration:number}) => {
        frozenUntilRef.current=Date.now()+duration; setFrozenUntil(frozenUntilRef.current);
        addAnn(`🚔 Coast Guard! Detained ${duration/1000}s`);
      });
      socket.on("game:event", (event:GameEvent|null) => {
        gameEventRef.current=event; setGameEvent(event);
        if (event) applyEvent(event); else clearEvent();
      });

      // ── Fuel transfer ──────────────────────────────────────────────────────
      // ── Fuel low indicators for remote ships ─────────────────────────────────
      socket.on("player:fuel_low", ({ uid }: { uid: string }) => { lowFuelUidsRef.current.add(uid); });
      socket.on("player:fuel_ok",  ({ uid }: { uid: string }) => { lowFuelUidsRef.current.delete(uid); });

      socket.on("fuel:request_incoming", (d: IncomingFuelReq) => {
        setIncomingFuelReq(d);
        addAnn(`⛽ ${d.fromFlag} ${d.fromName} requests fuel!`);
      });
      socket.on("fuel:request_sent", (d: OutgoingFuelReq) => {
        setOutgoingFuelReq(d);
        addAnn(`⛽ Fuel request sent to ${d.toName}…`);
      });
      socket.on("fuel:transfer_complete", ({ amount, cost }: { amount:number; cost:number }) => {
        fuelRef.current = Math.min(FUEL_CAPACITY, fuelRef.current + amount);
        setFuel(Math.round(fuelRef.current));
        moneyRef.current = Math.max(0, moneyRef.current - cost);
        setMoney(moneyRef.current);
        setOutgoingFuelReq(null);
        addAnn(`⛽ Received ${amount} fuel — paid $${cost}`);
      });
      socket.on("fuel:transfer_sent", ({ amount, payment }: { amount:number; payment:number }) => {
        fuelRef.current = Math.max(0, fuelRef.current - amount);
        setFuel(Math.round(fuelRef.current));
        moneyRef.current += payment;
        setMoney(moneyRef.current);
        setIncomingFuelReq(null);
        // Award XP + reputation for helping with fuel
        xpRef.current+=XP_FUEL_GIVEN; reputationRef.current+=REP_FUEL_GIVEN;
        setXp(xpRef.current); setReputation(reputationRef.current);
        const li=getLevelInfo(xpRef.current); const prevLvl=levelInfoRef.current.level;
        levelInfoRef.current=li; setLevelInfo(li);
        if (li.level>prevLvl) addAnn(`🎖️ Level Up! ${li.badge} ${li.title}`);
        addAnn(`⛽ Sent ${amount} fuel — earned $${payment} · +${XP_FUEL_GIVEN} XP`);
      });
      socket.on("fuel:request_declined",  () => { setOutgoingFuelReq(null); addAnn("⛽ Fuel request declined"); });
      socket.on("fuel:request_expired",   () => { setOutgoingFuelReq(null); addAnn("⛽ Fuel request expired"); });
      socket.on("fuel:request_failed",    (d?: {reason?:string}) => { setOutgoingFuelReq(null); addAnn(`⛽ ${d?.reason ?? "No players nearby"}`); });
    });

    function applyEvent(e: GameEvent) {
      if (e.type==="fuel_crisis") { fuelPriceRef.current=FUEL_BASE_PRICE*3; setFuelPrice(fuelPriceRef.current); addAnn(`⚠️ Fuel crisis! Price tripled`); }
      else if (e.type==="oil_spike") { oilPriceRef.current=OIL_BASE_PRICE*2.5; setOilPrice(oilPriceRef.current); addAnn(`📈 Oil spike! $${oilPriceRef.current}/bbl`); }
      else if (e.type==="storm") { stormRef.current=true; addAnn("🌊 Storm! Speed reduced"); }
    }
    function clearEvent() {
      oilPriceRef.current=OIL_BASE_PRICE; setOilPrice(OIL_BASE_PRICE);
      fuelPriceRef.current=FUEL_BASE_PRICE; setFuelPrice(FUEL_BASE_PRICE);
      stormRef.current=false; addAnn("✅ Conditions normal");
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup",   onKey);
      window.removeEventListener("beforeunload", onUnload);
      canvas.removeEventListener("click",       onClick);
      canvas.removeEventListener("wheel",       onWheel);
      canvas.removeEventListener("mousemove",   onMouseMove);
      canvas.removeEventListener("touchstart",  onTouchStart);
      canvas.removeEventListener("touchmove",   onTouchMove);
      canvas.removeEventListener("touchend",    onTouchEnd);
      socketRef.current?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, addAnn]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;

    // ── Drawing helpers ──────────────────────────────────────────────────────
    function drawWake(wake: {x:number;y:number;age:number}[]) {
      if (wake.length<2) return;
      for (let i=1;i<wake.length;i++) {
        const alpha=(1-wake[i].age/60)*0.30; if(alpha<=0) continue;
        ctx.beginPath();
        ctx.strokeStyle=`rgba(180,220,255,${alpha})`;
        ctx.lineWidth=2+(1-wake[i].age/60)*2.5;
        ctx.moveTo(wake[i-1].x,wake[i-1].y); ctx.lineTo(wake[i].x,wake[i].y); ctx.stroke();
      }
    }

    function drawShip(x:number,y:number,rot:number,color:string,name:string,transits:number,flag:string,isSelf:boolean,speed:number,frozen:boolean,levelBadge?:string,isLowFuel?:boolean) {
      const L=SHIP_LENGTH, W=SHIP_WIDTH;
      ctx.save(); ctx.translate(x,y); ctx.rotate(rot);
      if (frozen) ctx.globalAlpha=0.72;
      ctx.shadowColor="rgba(0,0,0,0.45)"; ctx.shadowBlur=8; ctx.shadowOffsetX=3; ctx.shadowOffsetY=3;
      ctx.beginPath();
      ctx.moveTo(L/2,0); ctx.lineTo(L/4,-W/2+2); ctx.lineTo(-L/2+5,-W/2);
      ctx.lineTo(-L/2,0); ctx.lineTo(-L/2+5,W/2); ctx.lineTo(L/4,W/2-2); ctx.closePath();
      const hg=ctx.createLinearGradient(-L/2,-W/2,L/2,W/2);
      hg.addColorStop(0,frozen?"#aad4f5":lighten(color,28));
      hg.addColorStop(0.5,frozen?"#6ab0e8":color);
      hg.addColorStop(1,frozen?"#3a85c2":darken(color,38));
      ctx.fillStyle=hg; ctx.fill();
      ctx.shadowColor="transparent"; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
      ctx.strokeStyle=isSelf?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.35)";
      ctx.lineWidth=isSelf?1.5:1; ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,0.14)";
      ctx.beginPath(); ctx.moveTo(L/2-1,0); ctx.lineTo(L/4,-W/4); ctx.lineTo(-L/4,-W/4); ctx.lineTo(-L/4,0); ctx.closePath(); ctx.fill();
      ctx.fillStyle="rgba(255,255,255,0.55)"; ctx.fillRect(-5,-1.5,13,3);
      if (speed>0.25&&!frozen) {
        ctx.save(); ctx.globalAlpha=Math.min(speed/MAX_SPEED,1)*0.42;
        ctx.strokeStyle="rgba(200,230,255,0.8)"; ctx.lineWidth=1.5;
        const ws=Math.min(speed*4,W*0.7), wl=Math.min(speed*14,L);
        ctx.beginPath(); ctx.moveTo(-L/2,0); ctx.lineTo(-L/2-wl,-ws); ctx.moveTo(-L/2,0); ctx.lineTo(-L/2-wl,ws); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha=1; ctx.restore();
      // Labels
      ctx.save(); ctx.font="bold 11px 'Courier New',monospace"; ctx.textAlign="center";
      ctx.fillStyle="rgba(0,0,0,0.45)"; ctx.fillText(name,x+1,y-L/2-8);
      ctx.fillStyle=isSelf?"rgba(255,255,200,0.95)":"rgba(200,230,255,0.85)"; ctx.fillText(name,x,y-L/2-9);
      if (flag&&flag!=="🏳️") { ctx.font="14px serif"; ctx.fillText(flag,x-12,y-L/2-23); }
      if (levelBadge) { ctx.font="12px serif"; ctx.fillText(levelBadge,x+(flag&&flag!=="🏳️"?4:0),y-L/2-22); }
      if (transits>0) { ctx.font="bold 10px monospace"; ctx.fillStyle="#4ade80"; ctx.fillText(`✓${transits}`,x+16,y-L/2-22); }
      // Fuel low indicator — blinking ⛽ above ship
      if (isLowFuel) {
        const blink = Math.sin(Date.now()/240)*0.5+0.6;
        ctx.globalAlpha=blink; ctx.font="13px serif"; ctx.fillText("⛽",x,y-L/2-37); ctx.globalAlpha=1;
      }
      if (isSelf) {
        ctx.beginPath(); ctx.arc(x,y,L/2+6,0,Math.PI*2);
        ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.lineWidth=1; ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (frozen) { ctx.font="bold 12px monospace"; ctx.fillStyle="#aad4ff"; ctx.fillText("❄️",x,y+L/2+14); }
      ctx.restore();
    }

    function drawGhostShip(x:number,y:number,rot:number,color:string,name:string,transits:number) {
      const L=SHIP_LENGTH, W=SHIP_WIDTH;
      ctx.save(); ctx.globalAlpha=0.30; ctx.translate(x,y); ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(L/2,0); ctx.lineTo(L/4,-W/2+2); ctx.lineTo(-L/2+5,-W/2);
      ctx.lineTo(-L/2,0); ctx.lineTo(-L/2+5,W/2); ctx.lineTo(L/4,W/2-2); ctx.closePath();
      ctx.fillStyle=color; ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.22)"; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalAlpha=0.36; ctx.font="bold 10px 'Courier New',monospace"; ctx.textAlign="center";
      ctx.fillStyle="#aac8e0"; ctx.fillText(name,x,y-L/2-8);
      ctx.fillStyle="#64b5d6"; ctx.font="9px monospace"; ctx.fillText("⚓ offline",x,y-L/2-20);
      if (transits>0) { ctx.fillStyle="#86efac"; ctx.fillText(`✓${transits}`,x,y-L/2-31); }
      ctx.restore();
    }

    function drawMine(x:number,y:number) {
      ctx.save(); ctx.translate(x,y);
      const g=ctx.createRadialGradient(-3,-3,0,0,0,11);
      g.addColorStop(0,"#ff6666"); g.addColorStop(1,"#990000");
      ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.strokeStyle="#cc2222"; ctx.lineWidth=1.5;
      for (let i=0;i<8;i++) {
        const a=(i/8)*Math.PI*2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*10,Math.sin(a)*10); ctx.lineTo(Math.cos(a)*16,Math.sin(a)*16); ctx.stroke();
      }
      ctx.font="9px serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="rgba(255,255,180,0.85)"; ctx.fillText("☠",0,0);
      ctx.restore();
    }

    function drawCoastGuard(cg:CoastGuardState) {
      const {x,y,rotation}=cg;
      ctx.save(); ctx.translate(x,y); ctx.rotate(rotation);
      ctx.beginPath(); ctx.moveTo(26,0); ctx.lineTo(-12,-11); ctx.lineTo(-12,11); ctx.closePath();
      ctx.fillStyle="#ff8c00"; ctx.strokeStyle="rgba(255,255,255,0.7)"; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-8,0,4,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,80,80,${0.6+0.4*Math.sin(Date.now()/180)})`; ctx.fill();
      ctx.restore();
      ctx.save(); ctx.font="bold 10px monospace"; ctx.textAlign="center";
      ctx.fillStyle="#ff8c00"; ctx.fillText("⚓ COAST GUARD",x,y-24); ctx.restore();
    }

    function drawZone(z:{x:number;y:number;w:number;h:number},fill:string,border:string,label:string,t:number) {
      ctx.fillStyle=fill; ctx.fillRect(z.x,z.y,z.w,z.h);
      const p=0.5+0.5*Math.sin(t*2);
      ctx.globalAlpha=0.6+0.4*p; ctx.strokeStyle=border; ctx.lineWidth=1.5+p;
      ctx.setLineDash([8,4]); ctx.strokeRect(z.x,z.y,z.w,z.h); ctx.setLineDash([]); ctx.globalAlpha=1;
      ctx.font="bold 13px 'Courier New',monospace"; ctx.textAlign="center";
      ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillText(label,z.x+z.w/2+1,z.y-7);
      ctx.fillStyle=border; ctx.fillText(label,z.x+z.w/2,z.y-8);
    }

    function drawClickTarget(cx:number,cy:number,t:number) {
      const r=10+Math.sin(t*6)*3;
      ctx.save(); ctx.globalAlpha=0.6;
      ctx.strokeStyle="#facc15"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-r*1.4,cy); ctx.lineTo(cx+r*1.4,cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy-r*1.4); ctx.lineTo(cx,cy+r*1.4); ctx.stroke();
      ctx.restore();
    }

    // ── Update physics ───────────────────────────────────────────────────────
    function update() {
      const s=selfRef.current; if(!s) return;
      const now=Date.now();
      const frozen=now<frozenUntilRef.current;
      const nat=nationRef.current;
      const speedMult=nat?.speedMult??1.0;
      const stormMult=stormRef.current?0.68:1.0;

      if (!frozen) {
        const k=keysRef.current;
        const fwd  = k.has("w")||k.has("arrowup")    ? 1 : k.has("s")||k.has("arrowdown")  ? -1 : 0;
        const turn = k.has("d")||k.has("arrowright")  ? 1 : k.has("a")||k.has("arrowleft") ? -1 :  0;
        const hasKeys = fwd!==0||turn!==0;

        if (hasKeys) {
          // Clear click target when using keyboard
          if (turn) {
            angularVelRef.current += turn * ROTATION_SPEED;
          }
          angularVelRef.current *= ANGULAR_DRAG;
          s.rotation += angularVelRef.current;

          if (fwd && fuelRef.current > 0) {
            const maxSpd = (fwd>0?MAX_SPEED:REVERSE_SPEED)*speedMult*stormMult;
            s.vx += Math.cos(s.rotation)*ACCELERATION*fwd;
            s.vy += Math.sin(s.rotation)*ACCELERATION*fwd;
            const spd=Math.sqrt(s.vx**2+s.vy**2);
            if (spd>maxSpd) { s.vx=(s.vx/spd)*maxSpd; s.vy=(s.vy/spd)*maxSpd; }
          }
        } else {
          // Click-to-move: realistic deceleration-aware approach
          const ct=clickTargetRef.current;
          if (ct) {
            const dx=ct.x-s.x, dy=ct.y-s.y;
            const d=Math.sqrt(dx*dx+dy*dy);
            const currentSpd=Math.sqrt(s.vx**2+s.vy**2);

            if (d < 18) {
              clickTargetRef.current=null;
              // Gentle braking: let drag handle it
            } else {
              // Steer toward target
              const ta=Math.atan2(dy,dx);
              let ad=ta-s.rotation;
              while(ad>Math.PI) ad-=Math.PI*2; while(ad<-Math.PI) ad+=Math.PI*2;
              // Proportional steering, gentle
              const steer=Math.sign(ad)*Math.min(Math.abs(ad)*0.28, ROTATION_SPEED*1.4);
              angularVelRef.current=lerp(angularVelRef.current, steer, 0.22);
              angularVelRef.current*=ANGULAR_DRAG;
              s.rotation+=angularVelRef.current;

              // Throttle: only apply when facing roughly target
              if (Math.abs(ad)<Math.PI*0.55 && fuelRef.current>0) {
                // Approach speed — slow down as we get close
                // Stopping distance at current speed: ~v / (1-DRAG) frames
                const stoppingDist = (currentSpd / (1-DRAG)) * 0.5;
                const targetSpd = d < stoppingDist*1.5
                  ? Math.max(0, currentSpd - ACCELERATION*2)  // decelerate
                  : Math.min(MAX_SPEED*speedMult*stormMult, d * 0.005); // proportional cruise
                if (currentSpd < targetSpd) {
                  s.vx+=Math.cos(s.rotation)*ACCELERATION;
                  s.vy+=Math.sin(s.rotation)*ACCELERATION;
                }
              }
            }
          } else {
            // No input: let angular velocity decay naturally
            angularVelRef.current*=ANGULAR_DRAG;
            s.rotation+=angularVelRef.current;
          }
        }
      } else {
        // Frozen: coast to stop
        angularVelRef.current*=0.65; s.rotation+=angularVelRef.current;
      }

      // Apply drag & move
      s.vx*=DRAG; s.vy*=DRAG;
      const nx=s.x+s.vx, ny=s.y+s.vy;
      const cosR=Math.cos(s.rotation), sinR=Math.sin(s.rotation), m=5;
      const corners:[number,number][]=[
        [nx+cosR*SHIP_LENGTH*0.5,ny+sinR*SHIP_LENGTH*0.5],
        [nx-cosR*SHIP_LENGTH*0.5,ny-sinR*SHIP_LENGTH*0.5],
        [nx+Math.cos(s.rotation+Math.PI/2)*(SHIP_WIDTH/2+m),ny+Math.sin(s.rotation+Math.PI/2)*(SHIP_WIDTH/2+m)],
        [nx+Math.cos(s.rotation-Math.PI/2)*(SHIP_WIDTH/2+m),ny+Math.sin(s.rotation-Math.PI/2)*(SHIP_WIDTH/2+m)],
      ];
      if (corners.some(([cx,cy])=>isOnLand(cx,cy))) {
        s.vx*=-0.22; s.vy*=-0.22; angularVelRef.current*=-0.38;
        s.x=prevPosRef.current.x; s.y=prevPosRef.current.y;
        clickTargetRef.current=null;
      } else {
        prevPosRef.current={x:s.x,y:s.y};
        s.x=Math.max(4,Math.min(MAP_WIDTH-4,nx));
        s.y=Math.max(4,Math.min(MAP_HEIGHT-4,ny));
      }

      const speed=Math.sqrt(s.vx**2+s.vy**2);

      // Fuel drain
      if (speed>0.2&&!frozen) {
        const drain=FUEL_DRAIN*(nat?.fuelMult??1.0)*(stormRef.current?1.45:1.0);
        fuelRef.current=Math.max(0,fuelRef.current-drain);
        setFuel(Math.round(fuelRef.current));
        // Broadcast fuel low/ok threshold to other players
        const isLow = fuelRef.current < 30;
        if (isLow && !fuelLowEmittedRef.current) { fuelLowEmittedRef.current=true; socketRef.current?.emit("player:fuel_low"); }
        if (!isLow && fuelLowEmittedRef.current) { fuelLowEmittedRef.current=false; socketRef.current?.emit("player:fuel_ok"); }
      }

      // Wake trail
      if (++wakeTickRef.current%3===0&&speed>0.15) {
        selfWakeRef.current.push({x:s.x,y:s.y,age:0});
        if (selfWakeRef.current.length>60) selfWakeRef.current.shift();
      }
      for (const w of selfWakeRef.current) w.age++;

      // Mine collision
      if (!frozen) {
        for (const mine of minesRef.current) {
          if (!mine.alive) continue;
          if (dist2(s.x,s.y,mine.x,mine.y)<MINE_RADIUS) {
            mine.alive=false; socketRef.current?.emit("player:mine_hit",{mineId:mine.id}); break;
          }
        }
      }

      // Oil loading
      const inLoad=inZone(s.x,s.y,OIL_LOAD_ZONE);
      if (inLoad&&oilBarrelsRef.current===0&&!frozen) {
        if (speed<0.7) {
          if (loadingStartRef.current===0) loadingStartRef.current=Date.now();
          const prog=Math.min(1,(Date.now()-loadingStartRef.current)/3500);
          setLoadProgress(prog);
          if (prog>=1) { oilBarrelsRef.current=OIL_CARGO_MAX; setOilBarrels(OIL_CARGO_MAX); loadingStartRef.current=0; setLoadProgress(0); addAnn(`🛢 ${OIL_CARGO_MAX} barrels loaded — head west to deliver`); }
        } else { loadingStartRef.current=0; setLoadProgress(0); }
      } else if (!inLoad&&loadingStartRef.current>0) { loadingStartRef.current=0; setLoadProgress(0); }

      // Oil delivery
      if (inZone(s.x,s.y,OIL_DELIVER_ZONE)&&oilBarrelsRef.current>0) {
        const earned=Math.floor(oilBarrelsRef.current*oilPriceRef.current*(nat?.profitMult??1.0));
        moneyRef.current+=earned; setMoney(moneyRef.current);
        oilBarrelsRef.current=0; setOilBarrels(0);
        // Award XP + reputation for delivery
        xpRef.current+=XP_OIL; reputationRef.current+=REP_OIL;
        setXp(xpRef.current); setReputation(reputationRef.current);
        const li=getLevelInfo(xpRef.current); const prevLvl=levelInfoRef.current.level;
        levelInfoRef.current=li; setLevelInfo(li);
        if (li.level>prevLvl) addAnn(`🎖️ Level Up! ${li.badge} ${li.title}`);
        addAnn(`💰 Delivered! +$${earned.toLocaleString()} · +${XP_OIL} XP`);
      }

      // Fuel stations
      if ((inZone(s.x,s.y,FUEL_STATION_EAST)||inZone(s.x,s.y,FUEL_STATION_WEST))&&fuelRef.current<99) {
        const needed=FUEL_CAPACITY-fuelRef.current;
        const cost=Math.ceil(needed*(fuelPriceRef.current*0.5));
        if (moneyRef.current>=cost||cost===0) {
          moneyRef.current=Math.max(0,moneyRef.current-cost); setMoney(moneyRef.current);
          fuelRef.current=FUEL_CAPACITY; setFuel(FUEL_CAPACITY);
          addAnn(`⛽ Refueled — cost $${cost}`);
        } else addAnn(`⛽ Need $${cost} to refuel (have $${moneyRef.current})`);
      }

      // Transit check
      if (!transitCooldownRef.current&&inZone(s.x,s.y,FINISH_ZONE)) {
        transitCooldownRef.current=true; socketRef.current?.emit("player:transit");
      }
      if (inZone(s.x,s.y,START_ZONE)) transitCooldownRef.current=false;

      // Network sync
      const nowMs=Date.now();
      if (nowMs-lastSyncRef.current>SYNC_RATE_MS) {
        lastSyncRef.current=nowMs;
        socketRef.current?.emit("player:update",{x:s.x,y:s.y,rotation:s.rotation,vx:s.vx,vy:s.vy});
      }
      if (nowMs-lastSaveRef.current>30000) {
        lastSaveRef.current=nowMs;
        savePlayerState(user.uid,{displayName:user.displayName??"",photoURL:user.photoURL,x:s.x,y:s.y,rotation:s.rotation,transits:s.transits,color:myColorRef.current,xp:xpRef.current,reputation:reputationRef.current});
      }

      // Lerp remotes
      for (const r of remotesRef.current.values()) {
        const px=r.x, py=r.y;
        r.x=lerp(r.x,r.targetX,0.14); r.y=lerp(r.y,r.targetY,0.14); r.rotation=lerpAngle(r.rotation,r.targetRotation,0.14);
        if (Math.sqrt((r.x-px)**2+(r.y-py)**2)>0.12) { r.wake.push({x:r.x,y:r.y,age:0}); if(r.wake.length>60) r.wake.shift(); }
        for (const w of r.wake) w.age++;
      }

      zoomRef.current=lerp(zoomRef.current,targetZoomRef.current,0.1);
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function render(t: number) {
      const s=selfRef.current;
      const W=canvas.width, H=canvas.height;
      const zoom=zoomRef.current;
      const viewW=W/zoom, viewH=H/zoom;

      // Dynamic zoom min — prevent going outside map
      const minZ=getDynMinZoom(canvas);
      if (targetZoomRef.current<minZ) targetZoomRef.current=minZ;

      const tcx=s?s.x-viewW/2:MAP_WIDTH/2-viewW/2;
      const tcy=s?s.y-viewH/2:MAP_HEIGHT/2-viewH/2;
      // Camera clamp (handle case where view > map dimension)
      const clampX=viewW>=MAP_WIDTH ? -(viewW-MAP_WIDTH)/2 : Math.max(0,Math.min(MAP_WIDTH-viewW,tcx));
      const clampY=viewH>=MAP_HEIGHT ? -(viewH-MAP_HEIGHT)/2 : Math.max(0,Math.min(MAP_HEIGHT-viewH,tcy));
      camRef.current.x=lerp(camRef.current.x,clampX,CAMERA_LERP);
      camRef.current.y=lerp(camRef.current.y,clampY,CAMERA_LERP);

      ctx.clearRect(0,0,W,H);
      ctx.save(); ctx.scale(zoom,zoom); ctx.translate(-camRef.current.x,-camRef.current.y);

      if (offscreenRef.current) ctx.drawImage(offscreenRef.current,0,0);

      // Animated wave shimmer
      ctx.save(); ctx.globalAlpha=0.048; ctx.strokeStyle="#5ab4ee"; ctx.lineWidth=1.4;
      for (let i=0;i<7;i++) {
        const wy=380+(i*(MAP_HEIGHT-760))/6, off=Math.sin(t*0.4+i*1.1)*10;
        ctx.beginPath(); ctx.moveTo(0,wy+off);
        for (let x=0;x<=MAP_WIDTH;x+=90) ctx.lineTo(x,wy+off+Math.sin(t*0.35+x*0.003+i*0.6)*5);
        ctx.stroke();
      }
      ctx.globalAlpha=1; ctx.restore();

      // Zones
      drawZone(START_ZONE,  START_COLOR,  START_BORDER_COLOR,  "START",     t);
      drawZone(FINISH_ZONE, FINISH_COLOR, FINISH_BORDER_COLOR, "FINISH",    t);
      drawZone(OIL_LOAD_ZONE,    OIL_COLOR,  OIL_BORDER_COLOR,  "🛢 OIL LOAD",  t);
      drawZone(OIL_DELIVER_ZONE, OIL_COLOR,  OIL_BORDER_COLOR,  "🛢 DELIVER",   t);
      for (const fs of [FUEL_STATION_EAST,FUEL_STATION_WEST]) {
        ctx.fillStyle=FUEL_COLOR; ctx.fillRect(fs.x,fs.y,fs.w,fs.h);
        ctx.save(); ctx.globalAlpha=0.8; ctx.strokeStyle=FUEL_BORDER_COLOR; ctx.lineWidth=1.5;
        ctx.setLineDash([4,4]); ctx.strokeRect(fs.x,fs.y,fs.w,fs.h); ctx.setLineDash([]); ctx.globalAlpha=1;
        ctx.font="bold 12px monospace"; ctx.textAlign="center"; ctx.fillStyle=FUEL_BORDER_COLOR;
        ctx.fillText("⛽ FUEL",fs.x+fs.w/2,fs.y-6); ctx.restore();
      }

      // Storm overlay
      if (stormRef.current) {
        ctx.save(); ctx.globalAlpha=0.07; ctx.fillStyle="#88ccff"; ctx.fillRect(0,0,MAP_WIDTH,MAP_HEIGHT);
        ctx.globalAlpha=1; ctx.restore();
      }

      // Map hover cursor — dashed line + pulsing ring at mouse world position
      const mw = mouseWorldRef.current;
      if (s && !hoveredShipRef.current && !mouseOnLandRef.current) {
        const d = dist2(s.x, s.y, mw.x, mw.y);
        if (d > 20) {
          // Dashed line from ship to cursor
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 7]);
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(mw.x, mw.y); ctx.stroke();
          ctx.setLineDash([]);
          // Pulsing outer ring
          const pulse = 0.55 + 0.35 * Math.sin(t * 5.5);
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(mw.x, mw.y, 9 + Math.sin(t * 5.5) * 2.5, 0, Math.PI * 2); ctx.stroke();
          // Inner dot
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = "#facc15";
          ctx.beginPath(); ctx.arc(mw.x, mw.y, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }

      // Click target indicator
      const ct=clickTargetRef.current;
      if (ct) drawClickTarget(ct.x,ct.y,t);

      // Mines
      for (const m of minesRef.current) if (m.alive) drawMine(m.x,m.y);

      // Ghost ships (offline players from Firestore)
      for (const [uid,ghost] of firestorePlayersRef.current) {
        if (liveUidsRef.current.has(uid)||uid===user.uid) continue;
        drawGhostShip(ghost.x,ghost.y,ghost.rotation,ghost.color,ghost.displayName,ghost.transits??0);
      }

      // NPC bots
      for (const bot of botsRef.current) {
        drawShip(bot.x,bot.y,bot.rotation,bot.color,bot.name,0,bot.flag,false,bot.frozen?0:1.2,bot.frozen);
        ctx.save(); ctx.font="8px monospace"; ctx.textAlign="center"; ctx.fillStyle="rgba(255,140,0,0.55)";
        ctx.fillText("NPC",bot.x,bot.y+SHIP_LENGTH/2+8); ctx.restore();
      }

      // Coast guard
      if (coastGuardRef.current) drawCoastGuard(coastGuardRef.current);

      // Remote players' wakes then ships
      for (const r of remotesRef.current.values()) drawWake(r.wake);
      drawWake(selfWakeRef.current);
      for (const r of remotesRef.current.values()) {
        const isRLowFuel = lowFuelUidsRef.current.has(r.uid);
        drawShip(r.x,r.y,r.rotation,r.color,r.name,r.transits,r.flag??"🏳️",false,Math.sqrt(r.vx**2+r.vy**2),false,undefined,isRLowFuel);
      }

      // Self ship
      if (s) {
        const frozen=Date.now()<frozenUntilRef.current;
        const selfLvlBadge=levelInfoRef.current.badge;
        const selfLowFuel=fuelRef.current<30;
        drawShip(s.x,s.y,s.rotation,myColorRef.current,s.name,s.transits,nationRef.current?.flag??"🏳️",true,Math.sqrt(s.vx**2+s.vy**2),frozen,selfLvlBadge,selfLowFuel);
        if (oilBarrelsRef.current>0) {
          ctx.save(); ctx.font="bold 11px monospace"; ctx.textAlign="center";
          ctx.fillStyle="#ca8a04"; ctx.fillText(`🛢${oilBarrelsRef.current}`,s.x,s.y-SHIP_LENGTH/2-38); ctx.restore();
        }
        if (loadProgress>0) {
          ctx.save(); ctx.strokeStyle="#ca8a04"; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(s.x,s.y,SHIP_LENGTH/2+12,-Math.PI/2,-Math.PI/2+loadProgress*Math.PI*2); ctx.stroke(); ctx.restore();
        }
      }

      ctx.restore(); // end zoom+camera
    }

    function loop(ts: number) { update(); render(ts/1000); rafRef.current=requestAnimationFrame(loop); }
    rafRef.current=requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadProgress]);

  // ── UI actions ─────────────────────────────────────────────────────────────
  const requestFuel = useCallback((targetUid: string) => {
    if (!targetUid||outgoingFuelReq) return;
    socketRef.current?.emit("fuel:request", { toUid: targetUid });
  }, [outgoingFuelReq]);

  const requestFuelNearest = useCallback(() => {
    if (outgoingFuelReq) { return; }
    socketRef.current?.emit("fuel:request_nearest");
  }, [outgoingFuelReq]);

  const respondFuel = useCallback((requestId: string, accept: boolean) => {
    socketRef.current?.emit("fuel:respond", { requestId, accept });
    setIncomingFuelReq(null);
  }, []);

  const fuelColor = fuel > 60 ? "#4ade80" : fuel > 25 ? "#facc15" : "#f87171";
  const frozenSecsLeft = Math.max(0, Math.ceil((frozenUntil - Date.now()) / 1000));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#061629]">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ cursor:"crosshair", touchAction:"none" }} />

      {/* ── Main HUD ── */}
      <div className="absolute top-3 left-3 bg-black/82 border border-white/15 rounded-lg px-4 py-3 text-white font-mono w-56 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          {user.photoURL && <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border-2 shrink-0" style={{borderColor:myColorRef.current}} />}
          <div>
            <div className="text-yellow-400 font-bold text-xs tracking-widest leading-none">HORMUZ · OIL RUSH</div>
            {nation && <div className="text-white/40 text-[10px] mt-0.5">{nation.flag} {nation.name}</div>}
          </div>
        </div>
        {nation && <div className="text-[10px] text-amber-400/80 mb-2 border border-amber-400/20 rounded px-2 py-1">{nation.bonusLabel}</div>}
        {/* Level badge */}
        <div className="flex items-center gap-2 mb-2 bg-white/5 rounded-lg px-2 py-1.5">
          <span className="text-xl leading-none">{levelInfo.badge}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold" style={{ color: levelInfo.color }}>{levelInfo.title}</div>
            <div className="text-[9px] text-white/35 truncate">{levelInfo.titleAr}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-cyan-300 font-bold">{xp} XP</div>
            <div className="text-[9px] text-white/30">⭐{reputation}</div>
          </div>
        </div>
        {/* XP progress bar */}
        {levelInfo.xpToNext > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-[9px] text-white/30 mb-0.5">
              <span>Level {levelInfo.level}</span>
              <span>{levelInfo.xpToNext} XP to next</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width:`${Math.round(levelInfo.progress*100)}%`, backgroundColor: levelInfo.color }} />
            </div>
          </div>
        )}
        <div className="text-xs space-y-1.5">
          {[
            {label:"CAPTAIN", value:user.displayName??"Navigator", cls:"text-cyan-300 truncate max-w-[110px]"},
            {label:"TRANSITS", value:myTransits, cls:"text-green-400 font-bold"},
            {label:"ONLINE",   value:playerCount, cls:"text-blue-300"},
            {label:"SIGNAL",   value:connected?"ONLINE":"OFFLINE", cls:connected?"text-green-400":"text-red-400"},
          ].map(({label,value,cls})=>(
            <div key={label} className="flex justify-between items-center gap-2">
              <span className="text-white/35 text-[10px] tracking-wider shrink-0">{label}</span>
              <span className={cls}>{String(value)}</span>
            </div>
          ))}
        </div>
        {/* Fuel bar */}
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-white/40">⛽ FUEL</span>
            <span style={{color:fuelColor}}>{fuel}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{width:`${fuel}%`,backgroundColor:fuelColor}} />
          </div>
          {fuel < 20 && (
            <div className="text-[10px] text-red-400 animate-pulse mt-1">⚠️ Low fuel — find ⛽ station or request from player</div>
          )}
        </div>
        {/* Economy */}
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          {[
            {label:"💰 MONEY",  value:`$${money.toLocaleString()}`,      cls:"text-yellow-300"},
            {label:"🛢 CARGO",  value:`${oilBarrels}/${OIL_CARGO_MAX}`,  cls:"text-amber-400"},
            {label:"📈 OIL $",  value:`$${oilPrice}/bbl`,                cls:oilPrice>OIL_BASE_PRICE?"text-green-400 font-bold":"text-white/60"},
            {label:"⛽ FUEL $", value:`$${fuelPrice}/u`,                 cls:fuelPrice>FUEL_BASE_PRICE?"text-red-400 font-bold":"text-white/60"},
          ].map(({label,value,cls})=>(
            <div key={label} className="flex justify-between text-[10px]">
              <span className="text-white/40">{label}</span><span className={cls}>{value}</span>
            </div>
          ))}
        </div>
        {outgoingFuelReq && (
          <div className="mt-2 pt-2 border-t border-cyan-500/30 text-[10px] text-cyan-400 animate-pulse">
            ⛽ Waiting for {outgoingFuelReq.toName}…
          </div>
        )}
        <button onClick={()=>signOutUser()} className="mt-2 w-full text-[10px] text-white/25 hover:text-white/55 border border-white/10 hover:border-white/25 rounded px-2 py-1 transition-colors">Sign Out</button>
      </div>

      {/* ── Controls ── */}
      <div className="absolute top-3 right-3 bg-black/82 border border-white/15 rounded-lg px-4 py-3 text-white font-mono text-xs backdrop-blur-sm hidden sm:block">
        <div className="text-yellow-400 font-bold mb-2 tracking-widest text-[11px]">CONTROLS</div>
        <div className="space-y-1.5 text-white/60">
          {[["Tap/Click","Move ship"],["W/↑","Forward"],["S/↓","Reverse"],["A D/←→","Turn"],["Scroll/Pinch","Zoom"]].map(([k,d])=>(
            <div key={k} className="flex gap-3 items-center"><span className="text-white/35 w-16 text-right shrink-0">{k}</span><span>{d}</span></div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-white/10 text-white/30 text-[10px]">Load 🛢 east → deliver west</div>
      </div>

      {/* ── Leaderboard ── */}
      {topPlayers.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/82 border border-white/15 rounded-lg px-4 py-3 text-white font-mono backdrop-blur-sm">
          <div className="text-yellow-400 font-bold text-[11px] tracking-widest mb-2 text-center">🏆 TOP NAVIGATORS</div>
          <div className="space-y-1">
            {topPlayers.map((p,i)=>(
              <div key={p.name} className="flex items-center gap-3 text-xs">
                <span className="text-white/30 w-4 text-right">{i+1}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:p.color}} />
                <span className="text-white/70 truncate max-w-[100px]">{p.name}</span>
                <span className="text-green-400 font-bold ml-auto">✓{p.transits}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Game event banner ── */}
      {gameEvent && (
        <div className={`absolute top-16 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full font-mono text-sm font-bold border animate-pulse backdrop-blur-sm
          ${gameEvent.type==="fuel_crisis"?"bg-red-900/80 border-red-500 text-red-300":
            gameEvent.type==="oil_spike"?"bg-green-900/80 border-green-500 text-green-300":
            "bg-blue-900/80 border-blue-400 text-blue-200"}`}>
          {gameEvent.type==="fuel_crisis"?"⚠️ FUEL CRISIS — Prices Tripled!":
           gameEvent.type==="oil_spike"?"📈 OIL PRICE SPIKE — Sell Now!":
           "🌊 STORM — Speed Reduced!"}
        </div>
      )}

      {/* ── Incoming fuel request modal ── */}
      {incomingFuelReq && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/94 border border-cyan-400/40 rounded-2xl px-8 py-6 font-mono text-white shadow-2xl backdrop-blur-sm z-50 text-center w-72">
          <div className="text-3xl mb-3">⛽</div>
          <div className="text-cyan-300 font-bold text-base mb-1">Fuel Request</div>
          <div className="text-white/70 text-sm mb-1">{incomingFuelReq.fromFlag} <span className="text-white font-bold">{incomingFuelReq.fromName}</span></div>
          <div className="text-white/50 text-xs mb-4">
            needs {FUEL_TRANSFER_AMOUNT} units<br/>
            you earn <span className="text-green-400 font-bold">${FUEL_TRANSFER_COST}</span>
          </div>
          <div className="text-white/30 text-[10px] mb-3">Auto-declines in {incomingTimer}s</div>
          <div className="flex gap-3">
            <button onClick={()=>respondFuel(incomingFuelReq.requestId,true)}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 font-bold text-sm transition-colors">
              ✓ Accept
            </button>
            <button onClick={()=>respondFuel(incomingFuelReq.requestId,false)}
              className="flex-1 bg-red-800/70 hover:bg-red-700 text-white/80 rounded-lg py-2 font-bold text-sm transition-colors">
              ✗ Decline
            </button>
          </div>
        </div>
      )}

      {/* ── Freeze overlay ── */}
      {frozenSecsLeft > 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-blue-900/80 border border-blue-400 rounded-2xl px-10 py-6 text-center font-mono backdrop-blur-sm">
            <div className="text-4xl mb-2">❄️</div>
            <div className="text-blue-200 font-bold text-xl">FROZEN</div>
            <div className="text-blue-300 text-3xl font-bold mt-1">{frozenSecsLeft}s</div>
          </div>
        </div>
      )}

      {/* ── Announcements ── */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none">
        {announcements.map(a=>(
          <div key={a.id} className="bg-black/85 border border-cyan-500/30 text-cyan-200 font-mono text-sm px-5 py-2 rounded-full whitespace-nowrap">
            {a.text}
          </div>
        ))}
      </div>

      {/* ── Map position hover tooltip (distance + ETA) ── */}
      {mapHover && !hoverInfo && (
        <div
          className="absolute pointer-events-none z-20 font-mono"
          style={{ left: Math.min(mapHover.screenX + 16, window.innerWidth - 180), top: Math.max(mapHover.screenY - 52, 8) }}
        >
          <div className="bg-black/80 border border-yellow-400/40 rounded-lg px-3 py-2 text-[11px] leading-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-yellow-300 font-bold mb-0.5">
              <span>📍</span>
              <span>Click to navigate</span>
            </div>
            <div className="flex gap-3 text-white/70">
              <span>⬛ <span className="text-white">{mapHover.distKm} km</span></span>
              <span>⏱ <span className="text-white">{mapHover.eta}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* ── Hover tooltip ── */}
      {hoverInfo && (
        <div className="absolute pointer-events-none z-30 bg-black/92 border border-white/20 rounded-xl p-3 w-56 font-mono shadow-2xl backdrop-blur-sm"
             style={{left:Math.min(hoverPos.x+14,window.innerWidth-232), top:Math.max(hoverPos.y-10,8)}}>
          <div className="flex items-center gap-2 mb-2">
            {hoverInfo.photoURL
              ? <img src={hoverInfo.photoURL} alt="" className="w-9 h-9 rounded-full border-2" style={{borderColor:hoverInfo.color}} />
              : <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg" style={{borderColor:hoverInfo.color,backgroundColor:hoverInfo.color+"33"}}>{hoverInfo.flag}</div>
            }
            <div>
              <div className="text-white text-xs font-bold leading-tight">{hoverInfo.flag} {hoverInfo.name}</div>
              {hoverInfo.isBot  && <div className="text-orange-400 text-[10px]">NPC Vessel</div>}
              {hoverInfo.isSelf && <div className="text-cyan-400 text-[10px]">You</div>}
            </div>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-white/40">Transits</span><span className="text-green-400 font-bold">✓ {hoverInfo.transits}</span></div>
            {hoverInfo.isSelf && hoverInfo.money!==undefined && <>
              <div className="flex justify-between"><span className="text-white/40">Money</span><span className="text-yellow-300">${hoverInfo.money.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Fuel</span><span style={{color:(hoverInfo.fuel??0)>50?"#4ade80":(hoverInfo.fuel??0)>25?"#facc15":"#f87171"}}>{hoverInfo.fuel}%</span></div>
              {hoverInfo.bonus && <div className="text-amber-400/80 text-[10px] pt-1 border-t border-white/10">{hoverInfo.bonus}</div>}
            </>}
            {/* Fuel request button for nearby players */}
            {!hoverInfo.isBot && !hoverInfo.isSelf && hoverInfo.uid && (
              <div className="pt-1 border-t border-white/10">
                {hoverInfo.canRequestFuel ? (
                  <button
                    className="pointer-events-auto w-full text-[11px] bg-cyan-700/60 hover:bg-cyan-600 text-cyan-200 rounded px-2 py-1.5 transition-colors font-bold"
                    onClick={() => requestFuel(hoverInfo.uid!)}
                    disabled={!!outgoingFuelReq}
                  >
                    {outgoingFuelReq ? "Waiting…" : `⛽ Request ${FUEL_TRANSFER_AMOUNT} fuel ($${FUEL_TRANSFER_COST})`}
                  </button>
                ) : (
                  <div className="text-white/25 text-[10px] text-center">Too far to request fuel</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile touch joystick hint ── */}
      <div className="absolute bottom-20 left-3 text-white/25 font-mono text-[10px] sm:hidden">
        Tap water to move · Pinch to zoom
      </div>

      {/* ── Chat ── */}
      <Chat
        socketRef={socketRef}
        playerName={user.displayName ?? "Navigator"}
        playerFlag={nation?.flag ?? "🏳️"}
        myUid={user.uid}
        onFuelRequestNearest={requestFuelNearest}
        onFuelRespond={respondFuel}
        incomingFuelReq={incomingFuelReq}
      />

      {/* ── Connecting overlay ── */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-sm pointer-events-none">
          <div className="text-white font-mono text-center">
            <div className="text-3xl mb-3 animate-pulse">⚓</div>
            <div className="text-xl font-bold text-yellow-400 mb-1">Connecting…</div>
            <div className="text-white/40 text-sm">Establishing navigation link</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dynamic minimum zoom — prevents going outside map bounds ──────────────────
function getDynMinZoom(canvas: HTMLCanvasElement): number {
  const byWidth  = canvas.width  / MAP_WIDTH;
  const byHeight = canvas.height / MAP_HEIGHT;
  // Use the larger of the two so the map always fills the screen in at least one dimension
  return Math.max(byWidth, byHeight, ZOOM_MIN) * 0.94;
}
