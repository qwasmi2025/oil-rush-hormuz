#!/usr/bin/env node
/**
 * Push workspace source files to GitHub via the Git Data API.
 * Uses @replit/connectors-sdk ReplitConnectors to proxy authenticated GitHub requests.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const OWNER  = "qwasmi2025";
const REPO   = "oil-rush-hormuz";
const BRANCH = "main";
const ROOT   = "/home/runner/workspace";

const SKIP_DIRS = new Set([
  "node_modules",".git",".cache","dist","build",".turbo",
  "attached_assets","__pycache__",".local",
]);
const SKIP_EXTS = new Set([
  ".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",
  ".woff",".woff2",".ttf",".eot",".map",
]);
const MAX_BYTES = 90_000;

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") && entry !== ".replit") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) results.push(...collectFiles(full));
    } else if (st.isFile()) {
      if (SKIP_EXTS.has(extname(entry).toLowerCase())) continue;
      if (st.size > MAX_BYTES) continue;
      results.push(full);
    }
  }
  return results;
}

// ── GitHub proxy via ReplitConnectors ────────────────────────────────────────
const { ReplitConnectors } = require("@replit/connectors-sdk");
const rc = new ReplitConnectors();
const proxyFetch = rc.createProxyFetch("github");

async function gh(path, opts = {}) {
  const url = `https://api.github.com${path}`;
  const res = await proxyFetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub ${opts.method ?? "GET"} ${path} → ${res.status}: ${txt.slice(0,300)}`);
  }
  return res.json();
}

async function createBlob(b64) {
  const r = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST", body: { content: b64, encoding: "base64" },
  });
  return r.sha;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
const parentSha = ref.object.sha;
console.log("Parent commit:", parentSha);

console.log("Collecting files…");
const files = collectFiles(ROOT);
console.log(`  ${files.length} files to push`);

const treeEntries = [];
const BATCH = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(async fpath => {
    const rel = relative(ROOT, fpath);
    const b64 = readFileSync(fpath).toString("base64");
    const sha = await createBlob(b64);
    return { path: rel, mode: "100644", type: "blob", sha };
  }));
  treeEntries.push(...results);
  process.stdout.write(`  blobs: ${Math.min(i + BATCH, files.length)}/${files.length}\r`);
  await sleep(600);
}

console.log("\nCreating tree…");
const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
  method: "POST",
  body: { base_tree: parentSha, tree: treeEntries },
});

console.log("Creating commit…");
const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
  method: "POST",
  body: {
    message: "feat: slow ships, chat fuel request, level/reputation system\n\n- Ship physics: MAX_SPEED 0.90→0.18 px/frame, crossing takes ~5 min\n- BOT_SPEED 1.4→0.9 px/tick (bots now match player pace)\n- Fuel request moved to chat: ⛽ button or /fuel command, requests nearest player\n- Blinking ⛽ icon above ships with fuel <30% visible to all players\n- Level system: 8 levels Recruit→Fleet Admiral with Arabic titles + badges\n- XP bar in HUD: +50 transit, +30 oil delivery, +20 fuel given\n- Reputation (سمعة) tracked alongside XP, saved to Firestore\n- Level-up announcements in-game",
    tree: tree.sha,
    parents: [parentSha],
  },
});

console.log("Updating branch ref…");
await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
  method: "PATCH",
  body: { sha: commit.sha, force: false },
});

console.log(`\n✅ Pushed! https://github.com/${OWNER}/${REPO}`);
