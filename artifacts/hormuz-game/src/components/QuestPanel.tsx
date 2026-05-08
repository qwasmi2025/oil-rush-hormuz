import { DAILY_QUESTS, type Quest, type QuestState } from "@/game/quests";

interface Props {
  questState: QuestState;
  onClaim: (quest: Quest) => void;
  onClose: () => void;
}

export default function QuestPanel({ questState, onClaim, onClose }: Props) {
  return (
    <div className="absolute top-16 right-4 z-30 w-72 bg-[#0a1f3a]/97 border border-white/15 rounded-2xl shadow-2xl font-mono backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <div className="text-yellow-400 font-bold tracking-widest text-[11px]">📋 DAILY QUESTS</div>
          <div className="text-white/30 text-[9px] mt-0.5">مهام يومية — Resets at midnight</div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 text-base leading-none">✕</button>
      </div>
      <div className="p-3 space-y-2.5">
        {DAILY_QUESTS.map(q => {
          const prog = questState.progress[q.id] ?? 0;
          const done = questState.completed[q.id] ?? false;
          const claimed = questState.claimed[q.id] ?? false;
          const pct = Math.min(1, prog / q.target);

          return (
            <div key={q.id}
              className={`rounded-xl border p-3 transition-all ${
                claimed ? "border-white/8 bg-white/3 opacity-50"
                : done   ? "border-green-400/40 bg-green-900/20"
                         : "border-white/10 bg-white/4"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{q.icon}</span>
                  <div>
                    <div className="text-white text-[11px] font-bold leading-tight">{q.title}</div>
                    <div className="text-white/30 text-[9px]">{q.titleAr}</div>
                  </div>
                </div>
                {done && !claimed && (
                  <button
                    onClick={() => onClaim(q)}
                    className="shrink-0 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded-lg px-2 py-1 font-bold transition-colors"
                  >
                    Claim!
                  </button>
                )}
                {claimed && (
                  <span className="shrink-0 text-white/25 text-[10px]">✓ Done</span>
                )}
              </div>
              <div className="text-white/40 text-[10px] mb-1.5">{q.description}</div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(pct * 100)}%`,
                    backgroundColor: done ? "#4ade80" : "#38bdf8",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-white/30">{Math.min(prog, q.target)}/{q.target}</span>
                <span className="text-cyan-400">
                  +{q.xpReward} XP{q.moneyReward > 0 ? ` · +$${q.moneyReward}` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
