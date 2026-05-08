import {
  doc, setDoc, getDoc, serverTimestamp,
  collection, onSnapshot, addDoc, query, orderBy, limit, getDocs,
} from "firebase/firestore";
import { db } from "./config";

// ── Player document ───────────────────────────────────────────────────────────
export interface PlayerDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  x: number; y: number; rotation: number;
  transits: number; color: string;
  lastSeen?: unknown;
}

const COLORS = [
  "#4ade80","#60a5fa","#f472b6","#facc15",
  "#fb923c","#a78bfa","#34d399","#f87171",
  "#38bdf8","#e879f9","#fbbf24","#86efac",
];
export function colorFromUid(uid: string): string {
  let hash = 0;
  for (const c of uid) hash = (hash * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[hash % COLORS.length];
}

export async function loadPlayerState(uid: string): Promise<PlayerDoc | null> {
  try {
    const snap = await getDoc(doc(db, "players", uid));
    return snap.exists() ? ({ uid, ...snap.data() } as PlayerDoc) : null;
  } catch { return null; }
}

export async function savePlayerState(uid: string, state: Omit<PlayerDoc, "uid"|"lastSeen">): Promise<void> {
  try {
    await setDoc(doc(db, "players", uid), { ...state, lastSeen: serverTimestamp() }, { merge: true });
  } catch { /* offline */ }
}

export function subscribeToAllPlayers(callback: (players: PlayerDoc[]) => void): () => void {
  return onSnapshot(collection(db, "players"), snapshot => {
    const players: PlayerDoc[] = [];
    snapshot.forEach(d => players.push({ uid: d.id, ...d.data() } as PlayerDoc));
    callback(players);
  });
}

// ── Chat history (Firestore) ──────────────────────────────────────────────────
export interface ChatRecord {
  uid: string; name: string; flag: string; text: string; ts?: unknown;
}

export async function saveChatMessage(msg: Omit<ChatRecord, "ts">): Promise<void> {
  try {
    await addDoc(collection(db, "chat"), { ...msg, ts: serverTimestamp() });
  } catch { /* offline */ }
}

export async function loadRecentChat(count = 30): Promise<ChatRecord[]> {
  try {
    const q = query(collection(db, "chat"), orderBy("ts", "desc"), limit(count));
    const snap = await getDocs(q);
    const msgs: ChatRecord[] = [];
    snap.forEach(d => msgs.unshift(d.data() as ChatRecord));
    return msgs;
  } catch { return []; }
}
