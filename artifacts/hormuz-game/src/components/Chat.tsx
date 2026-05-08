import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { saveChatMessage, loadRecentChat } from "@/firebase/gameState";

interface ChatMsg {
  uid: string; name: string; flag: string; text: string;
  ts?: unknown; isSystem?: boolean; isFuelRequest?: boolean; requestId?: string; fromName?: string;
}

interface Props {
  socketRef: React.RefObject<Socket | null>;
  playerName: string;
  playerFlag: string;
  myUid: string;
  onFuelRequestNearest: () => void;
  onFuelRespond: (requestId: string, accept: boolean) => void;
  incomingFuelReq: { requestId: string; fromName: string; fromFlag: string } | null;
}

const QUICK_EMOJIS = ["🚢","⚓","💰","⛽","☠️","🌊","📈","🔥","👋","💥","🏁","⚠️","🤝","❄️"];

export default function Chat({
  socketRef, playerName, playerFlag, myUid,
  onFuelRequestNearest, onFuelRespond, incomingFuelReq,
}: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show incoming fuel request as chat message
  useEffect(() => {
    if (!incomingFuelReq) return;
    const msg: ChatMsg = {
      uid: "system",
      name: "⛽ Fuel Request",
      flag: incomingFuelReq.fromFlag,
      text: `${incomingFuelReq.fromFlag} ${incomingFuelReq.fromName} needs fuel!`,
      isFuelRequest: true,
      requestId: incomingFuelReq.requestId,
    };
    setMessages(prev => [...prev.slice(-59), msg]);
    if (!open) setUnread(u => u + 1);
  }, [incomingFuelReq, open]);

  // Load historical messages from Firestore on first open
  useEffect(() => {
    if (open && !loaded) {
      setLoaded(true);
      loadRecentChat(40).then(history => {
        setMessages(prev => {
          const existingTs = new Set(prev.map(m => `${m.uid}_${String(m.ts)}`));
          const fresh = history.filter(m => !existingTs.has(`${m.uid}_${String(m.ts)}`));
          return [...fresh, ...prev];
        });
      });
    }
  }, [open, loaded]);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;
    const handler = (msg: ChatMsg) => {
      setMessages(prev => [...prev.slice(-59), msg]);
      if (!open) setUnread(u => u + 1);
    };
    sock.on("chat:message", handler);
    return () => { sock.off("chat:message", handler); };
  }, [socketRef, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, [open, messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !socketRef.current) return;
    // /fuel command → request fuel from nearest
    if (text === "/fuel") {
      onFuelRequestNearest();
      setInput("");
      return;
    }
    socketRef.current.emit("chat:send", { text });
    setInput("");
    inputRef.current?.focus();
    saveChatMessage({ uid: myUid, name: playerName, flag: playerFlag, text });
  }, [input, socketRef, myUid, playerName, playerFlag, onFuelRequestNearest]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
    e.stopPropagation();
  }, [send]);

  const stopKey = (e: React.KeyboardEvent | React.KeyboardEvent<HTMLInputElement>) => e.stopPropagation();

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-1 font-mono select-none">
      {open && (
        <div className="bg-black/90 border border-white/15 rounded-lg w-80 flex flex-col shadow-2xl backdrop-blur-sm overflow-hidden"
             style={{ maxHeight: "360px" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-yellow-400 text-xs font-bold tracking-wider">PUBLIC CHAT</span>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/70 text-xs">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" style={{ minHeight: "120px", maxHeight: "200px" }}>
            {messages.length === 0 && (
              <div className="text-white/25 text-[10px] text-center pt-4">
                No messages yet.<br/>
                <span className="text-cyan-400/60">Tip: click ⛽ to request fuel from nearest player</span>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-xs leading-snug break-words ${m.isSystem ? "opacity-80" : ""}`}>
                {m.isFuelRequest ? (
                  <div className="bg-amber-900/40 border border-amber-400/30 rounded-lg p-2 my-1">
                    <div className="text-amber-300 font-bold text-[11px] mb-1.5">
                      {m.flag} {m.fromName ?? m.name} needs fuel!
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onFuelRespond(m.requestId!, true)}
                        className="flex-1 bg-green-700 hover:bg-green-600 text-white text-[10px] rounded px-2 py-1 font-bold transition-colors"
                      >
                        ✓ Give Fuel (+$150)
                      </button>
                      <button
                        onClick={() => onFuelRespond(m.requestId!, false)}
                        className="bg-white/10 hover:bg-white/20 text-white/60 text-[10px] rounded px-2 py-1 transition-colors"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.isSystem ? (
                      <span className="text-amber-400/80 italic text-[10px]">{m.text}</span>
                    ) : (
                      <>
                        <span className="text-white/40">{m.flag} </span>
                        <span className={`font-bold ${m.uid === myUid ? "text-yellow-300" : "text-cyan-300"}`}>{m.name}: </span>
                        <span className="text-white/80">{m.text}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => setInput(p => p + e)} className="text-base leading-none hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>

          <div className="flex gap-2 px-3 py-2 border-t border-white/10">
            <button
              onClick={onFuelRequestNearest}
              title="Request fuel from nearest player (/fuel)"
              className="bg-amber-700/60 hover:bg-amber-600 text-amber-200 text-sm rounded px-2 py-1 transition-colors shrink-0"
            >
              ⛽
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={ev => setInput(ev.target.value)}
              onKeyDown={onKey}
              onKeyUp={stopKey}
              onKeyPress={stopKey}
              placeholder="Type or /fuel…"
              maxLength={200}
              className="flex-1 bg-white/10 text-white text-xs rounded px-2 py-1 outline-none border border-white/15 placeholder:text-white/25"
            />
            <button onClick={send} disabled={!input.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white text-xs rounded px-3 py-1 transition-colors">
              Send
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)}
        className="bg-black/82 border border-white/20 hover:border-white/40 text-white rounded-full px-4 py-2 text-xs font-bold transition-colors flex items-center gap-2 shadow-lg">
        💬 Chat
        {unread > 0 && !open && (
          <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{unread}</span>
        )}
      </button>
    </div>
  );
}
