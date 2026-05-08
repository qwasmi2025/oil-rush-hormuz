export interface LevelInfo {
  level: number;
  title: string;
  titleAr: string;
  minXP: number;
  badge: string;
  color: string;
}

export const LEVELS: LevelInfo[] = [
  { level:1, title:"Recruit",       titleAr:"مجنّد",          minXP:0,     badge:"⚓",  color:"#94a3b8" },
  { level:2, title:"Seaman",        titleAr:"بحّار",          minXP:100,   badge:"🚢",  color:"#60a5fa" },
  { level:3, title:"Navigator",     titleAr:"ملّاح",          minXP:300,   badge:"🧭",  color:"#34d399" },
  { level:4, title:"First Mate",    titleAr:"معاون أوّل",    minXP:700,   badge:"⭐",  color:"#facc15" },
  { level:5, title:"Captain",       titleAr:"ربّان",          minXP:1500,  badge:"🪙",  color:"#fb923c" },
  { level:6, title:"Commodore",     titleAr:"أمير البحر",    minXP:3000,  badge:"🎖️", color:"#e879f9" },
  { level:7, title:"Admiral",       titleAr:"أميرال",         minXP:6000,  badge:"🏆",  color:"#f87171" },
  { level:8, title:"Fleet Admiral", titleAr:"أميرال الأسطول", minXP:10000, badge:"👑",  color:"#fcd34d" },
];

export interface ComputedLevel extends LevelInfo {
  progress: number;
  xpToNext: number;
  xp: number;
}

export function getLevelInfo(xp: number): ComputedLevel {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXP) current = lvl;
    else break;
  }
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = LEVELS[nextIdx] ?? null;
  const xpToNext = next ? next.minXP - xp : 0;
  const progress = next ? (xp - current.minXP) / (next.minXP - current.minXP) : 1;
  return { ...current, xp, progress, xpToNext };
}

export const XP_TRANSIT    = 50;
export const XP_OIL        = 30;
export const XP_FUEL_GIVEN = 20;

export const REP_TRANSIT    = 10;
export const REP_OIL        =  5;
export const REP_FUEL_GIVEN = 15;
export const REP_MINE_HIT   = -10;
