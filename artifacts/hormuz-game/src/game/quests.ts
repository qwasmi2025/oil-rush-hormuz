export type QuestType = "transit" | "oil_deliver" | "fuel_give" | "money_earn";

export interface Quest {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  target: number;
  xpReward: number;
  moneyReward: number;
  icon: string;
  type: QuestType;
}

export const DAILY_QUESTS: Quest[] = [
  {
    id: "daily_transit",
    title: "Sea Lanes Open",
    titleAr: "افتح الممرات",
    description: "Complete 3 transits through the strait",
    target: 3, xpReward: 150, moneyReward: 800, icon: "🚢", type: "transit",
  },
  {
    id: "daily_oil",
    title: "Oil Baron",
    titleAr: "بارون النفط",
    description: "Deliver 1 oil cargo from east to west",
    target: 1, xpReward: 80, moneyReward: 1000, icon: "🛢", type: "oil_deliver",
  },
  {
    id: "daily_fuel",
    title: "Brotherhood of the Sea",
    titleAr: "أخوة البحر",
    description: "Give fuel to another player in need",
    target: 1, xpReward: 60, moneyReward: 0, icon: "⛽", type: "fuel_give",
  },
  {
    id: "daily_money",
    title: "Merchant Prince",
    titleAr: "أمير التجار",
    description: "Earn $5,000 in earnings",
    target: 5000, xpReward: 100, moneyReward: 500, icon: "💰", type: "money_earn",
  },
];

export interface QuestState {
  date: string;
  progress: Record<string, number>;
  completed: Record<string, boolean>;
  claimed: Record<string, boolean>;
}

const STORAGE_KEY = "oilrush_quests_v1";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadQuestState(): QuestState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuestState;
      if (parsed.date === todayStr()) return parsed;
    }
  } catch { /* ignore */ }
  return { date: todayStr(), progress: {}, completed: {}, claimed: {} };
}

export function saveQuestState(state: QuestState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function updateQuestProgress(
  state: QuestState,
  type: QuestType,
  amount = 1
): { newState: QuestState; newlyCompleted: Quest[] } {
  const progress = { ...state.progress };
  const completed = { ...state.completed };
  const newlyCompleted: Quest[] = [];
  for (const q of DAILY_QUESTS.filter(q => q.type === type)) {
    if (completed[q.id]) continue;
    progress[q.id] = (progress[q.id] ?? 0) + amount;
    if (progress[q.id] >= q.target) {
      completed[q.id] = true;
      newlyCompleted.push(q);
    }
  }
  return { newState: { ...state, progress, completed }, newlyCompleted };
}
