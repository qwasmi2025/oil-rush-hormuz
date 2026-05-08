import { useState } from "react";
import { signInWithGoogle } from "@/firebase/auth";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // onAuthStateChanged in App.tsx will detect the new user and show GameCanvas
    } catch (e: unknown) {
      const fe = e as { code?: string; message?: string };
      const code = fe.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // user dismissed — no error
      } else if (code === "auth/unauthorized-domain") {
        setError(
          `Domain not authorized.\n\nIn Firebase Console go to:\nAuthentication → Settings → Authorized domains\nand add: "${window.location.hostname}"`,
        );
      } else if (code === "auth/popup-blocked") {
        setError(
          "Popup was blocked by your browser.\nPlease allow popups for this site and try again.",
        );
      } else {
        setError(code ? `${code}: ${fe.message ?? ""}` : "Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-[#061629] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background scan lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="absolute w-full h-px bg-blue-400" style={{ top: `${10 + i * 9}%` }} />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 bg-black/65 border border-white/15 rounded-2xl px-10 py-9 flex flex-col items-center gap-5 max-w-sm w-full mx-4 backdrop-blur-sm">
        <div className="text-5xl select-none">⚓</div>

        <div className="text-center">
          <div className="text-yellow-400 font-mono font-bold text-xl tracking-widest mb-1">
            HORMUZ STRAIT
          </div>
          <div className="text-white/35 font-mono text-xs tracking-widest">NAVIGATOR v1.0</div>
        </div>

        <div className="w-full h-px bg-white/10" />

        <p className="text-white/50 font-mono text-xs text-center leading-relaxed">
          Sign in with Google to save your position and transit count across sessions.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed text-gray-800 font-semibold text-sm rounded-lg px-5 py-3 transition-all shadow-md"
        >
          {loading ? (
            <>
              <span className="animate-spin text-base text-gray-500">⟳</span>
              Signing in…
            </>
          ) : (
            <>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <div className="w-full bg-red-950/60 border border-red-500/40 rounded-lg p-3">
            <p className="text-red-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
              {error}
            </p>
          </div>
        )}

        <p className="text-white/20 font-mono text-[10px] text-center">
          Your ship position and transits are saved automatically.
        </p>
      </div>
    </div>
  );
}
