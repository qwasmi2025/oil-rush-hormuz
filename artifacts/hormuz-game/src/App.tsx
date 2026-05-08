import { useEffect, useState } from "react";
import { onAuthChange, type User } from "@/firebase/auth";
import LoginScreen from "@/components/LoginScreen";
import GameCanvas from "@/game/GameCanvas";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // onAuthStateChanged fires once Firebase resolves the persisted session.
    // This is the single source of truth — no redirect result needed.
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  if (!authChecked) {
    return (
      <div className="w-screen h-screen bg-[#061629] flex items-center justify-center">
        <div className="text-white font-mono text-center">
          <div className="text-3xl mb-3 animate-pulse">⚓</div>
          <div className="text-yellow-400 font-bold tracking-widest text-sm">LOADING…</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <GameCanvas user={user} />;
}
