export type BonusType = "oil_trader" | "maneuverer" | "superpower" | "neutral";

export interface Nation {
  code: string;
  name: string;
  flag: string;
  bonus: BonusType;
  bonusLabel: string;
  profitMult: number;
  fuelMult: number;
  speedMult: number;
}

const GULF_IRAN = ["SA","AE","QA","KW","BH","OM","IQ","IR","YE","PK","UAE"];
const COASTAL_MENA = ["JO","EG","LB","SY","TN","LY","DZ","MA","SO","DJ","ER","SD","IN","TR","TH","MY","ID","PH"];
const SUPERPOWERS = ["US","GB","CN","DE","FR","RU","CA","AU","JP","KR","IT","NL","ES","SG","SE","NO","BE","CH","BR"];

function toFlagEmoji(code: string): string {
  if (code === "XX") return "🏳️";
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

export function mapCountry(code: string, name: string): Nation {
  let bonus: BonusType;
  let bonusLabel: string;
  let profitMult: number;
  let fuelMult: number;
  let speedMult: number;

  if (GULF_IRAN.includes(code)) {
    bonus = "oil_trader";
    bonusLabel = "🛢 Oil Trader · +50% cargo profit";
    profitMult = 1.5; fuelMult = 1.0; speedMult = 1.0;
  } else if (COASTAL_MENA.includes(code)) {
    bonus = "maneuverer";
    bonusLabel = "🌊 Maneuverer · -30% fuel burn";
    profitMult = 1.0; fuelMult = 0.7; speedMult = 1.0;
  } else if (SUPERPOWERS.includes(code)) {
    bonus = "superpower";
    bonusLabel = "⚡ Superpower · +20% speed";
    profitMult = 1.0; fuelMult = 1.0; speedMult = 1.2;
  } else {
    bonus = "neutral";
    bonusLabel = "⚓ Navigator";
    profitMult = 1.0; fuelMult = 1.0; speedMult = 1.0;
  }

  return { code, name, flag: toFlagEmoji(code), bonus, bonusLabel, profitMult, fuelMult, speedMult };
}

export async function detectNation(): Promise<Nation> {
  try {
    const r = await fetch("https://ip-api.com/json?fields=countryCode,country", {
      signal: AbortSignal.timeout(4000),
    });
    const d = await r.json() as { countryCode?: string; country?: string };
    return mapCountry(d.countryCode ?? "XX", d.country ?? "Unknown");
  } catch {
    return mapCountry("XX", "Unknown");
  }
}
