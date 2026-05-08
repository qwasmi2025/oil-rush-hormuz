# Hormuz Strait Navigator

A real-time multiplayer top-down naval game where players navigate ships through the Strait of Hormuz. Sign in with Google, save your position and transit count to Firestore, and compete with other players online.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run dev` — run API server (port 8080)
- `pnpm --filter @workspace/hormuz-game run dev` — run game frontend (port 25865)

Required env vars:
- `FIREBASE_API_KEY` — Firebase web API key (injected into Vite build via `define`)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite + HTML5 Canvas (vanilla game loop) + Firebase SDK
- **Backend**: Express 5 + Socket.io (real-time multiplayer)
- **Auth**: Firebase Auth (Google Sign-In popup)
- **DB**: Firestore — `players/{uid}` stores position, transits, displayName, photoURL
- **TypeScript version**: 5.9

## Where things live

- `artifacts/hormuz-game/` — Game frontend
  - `src/game/GameCanvas.tsx` — Main game loop, socket client, Firebase save/load
  - `src/game/constants.ts` — Ship physics and map constants
  - `src/game/mapData.ts` — Redesigned coastlines matching real Strait of Hormuz geography
  - `src/firebase/config.ts` — Firebase app initialization
  - `src/firebase/auth.ts` — Google Sign-In helpers
  - `src/firebase/gameState.ts` — Firestore save/load for player state
  - `src/components/LoginScreen.tsx` — Google Sign-In UI
  - `src/App.tsx` — Auth state gate (shows LoginScreen or GameCanvas)
- `artifacts/api-server/` — Backend (Express + Socket.io game server)
  - `src/game/gameServer.ts` — Multiplayer state management (accepts name/photoURL/position from socket auth)
  - `src/index.ts` — HTTP server + Socket.io initialization

## Architecture decisions

- **Socket.io routed through proxy**: `/socket.io` path added to api-server's `artifact.toml` paths
- **Firebase API key injected via Vite `define`**: `FIREBASE_API_KEY` secret → `import.meta.env.VITE_FIREBASE_API_KEY` at build time (not a VITE_ prefixed secret)
- **Offscreen canvas for map**: Land polygons pre-rendered once, `drawImage`'d each frame
- **Collision via coast interpolation**: Piecewise-linear coast lines; no pixel sampling needed
- **Client-side physics, server-side relay**: Ship physics run locally; position broadcast ~30fps; remotes lerp-interpolated
- **Saved position restored on reconnect**: Socket `auth` handshake carries `x`, `y`, `rotation`, `transits` loaded from Firestore
- **Auto-save every 30s + on transit**: Firestore write is fire-and-forget; failures are silently ignored

## Product

- Google Sign-In required to play; player name and avatar pulled from Google account
- Real-time multiplayer ship navigation game
- Tank controls with rotational inertia and water drag
- Redesigned map matches real Strait of Hormuz geography (Musandam Peninsula, UAE diagonal coast, Bandar Abbas)
- Collision detection stops ships when they hit land or islands
- Finish zone triggers a "transit" — announced to all players; count saved to Firestore
- Last position and transit count restored on next login

## Gotchas

- `FIREBASE_API_KEY` is a Replit Secret (not env var) — exposed to Vite client via `define` in `vite.config.ts`
- Socket.io uses `/socket.io` path — must be listed in api-server's `artifact.toml` paths
- The offscreen canvas is rendered once in `useEffect` — map data must be stable across renders
- `angularVelRef` tracks rotational inertia separately from ship state

## Pointers

- `.local/skills/pnpm-workspace/references/server.md` — Express 5 + pino logging patterns
- `.local/skills/react-vite/SKILL.md` — React + Vite build conventions
