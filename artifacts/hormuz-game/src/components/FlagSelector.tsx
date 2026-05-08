interface Region {
  flag: string;
  name: string;
  code: string;
}

const REGIONS: Region[] = [
  { flag: "🇮🇷", name: "Iran",         code: "IR" },
  { flag: "🇴🇲", name: "Oman",         code: "OM" },
  { flag: "🇦🇪", name: "UAE",          code: "AE" },
  { flag: "🇸🇦", name: "Saudi Arabia", code: "SA" },
  { flag: "🇧🇭", name: "Bahrain",      code: "BH" },
  { flag: "🇶🇦", name: "Qatar",        code: "QA" },
  { flag: "🇰🇼", name: "Kuwait",       code: "KW" },
  { flag: "🇮🇶", name: "Iraq",         code: "IQ" },
  { flag: "🇾🇪", name: "Yemen",        code: "YE" },
  { flag: "🇵🇰", name: "Pakistan",     code: "PK" },
  { flag: "🇮🇳", name: "India",        code: "IN" },
  { flag: "🇹🇷", name: "Turkey",       code: "TR" },
  { flag: "🇪🇬", name: "Egypt",        code: "EG" },
  { flag: "🇺🇸", name: "USA",          code: "US" },
  { flag: "🇬🇧", name: "UK",           code: "GB" },
  { flag: "🇨🇳", name: "China",        code: "CN" },
  { flag: "🇯🇵", name: "Japan",        code: "JP" },
  { flag: "🇰🇷", name: "S. Korea",     code: "KR" },
  { flag: "🇷🇺", name: "Russia",       code: "RU" },
  { flag: "🇳🇴", name: "Norway",       code: "NO" },
  { flag: "🇬🇷", name: "Greece",       code: "GR" },
  { flag: "🇩🇪", name: "Germany",      code: "DE" },
  { flag: "🇫🇷", name: "France",       code: "FR" },
  { flag: "🇮🇹", name: "Italy",        code: "IT" },
  { flag: "🇳🇱", name: "Netherlands",  code: "NL" },
  { flag: "🇸🇬", name: "Singapore",    code: "SG" },
  { flag: "🇧🇷", name: "Brazil",       code: "BR" },
  { flag: "🇦🇺", name: "Australia",    code: "AU" },
  { flag: "🇨🇦", name: "Canada",       code: "CA" },
  { flag: "🏳️", name: "International", code: "XX" },
];

interface Props {
  currentFlag: string;
  onSelect: (flag: string, code: string) => void;
  onClose: () => void;
}

export default function FlagSelector({ currentFlag, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0a1f3a] border border-white/20 rounded-2xl p-5 w-[340px] max-h-[80vh] overflow-y-auto shadow-2xl font-mono"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-yellow-400 font-bold tracking-widest text-sm">🚩 SELECT FLAG</div>
            <div className="text-white/35 text-[10px] mt-0.5">اختر علمك — Changes your flag & bonus</div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-xl leading-none">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {REGIONS.map(r => (
            <button
              key={r.code}
              onClick={() => { onSelect(r.flag, r.code); onClose(); }}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:bg-white/10 ${
                currentFlag === r.flag
                  ? "border-yellow-400 bg-yellow-400/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <span className="text-2xl leading-none">{r.flag}</span>
              <span className="text-[9px] text-white/50 text-center leading-tight">{r.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
