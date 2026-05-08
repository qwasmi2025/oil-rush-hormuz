import { MAP_HEIGHT, MAP_WIDTH } from "./constants";

export type Pt = [number, number];

// ─── North coast (Iran) — south edge of north land ───────────────────────────
export const northBasePoints: Pt[] = [
  [0,    178], [200,  183], [420,  190], [650,  198], [900,  210],
  [1100, 220], [1300, 233], [1480, 248], [1640, 264], [1780, 278],
  [1920, 294], [2040, 308], [2150, 316], [2260, 312],
  [2400, 296], [2580, 278], [2760, 261], [2960, 246], [3200, 230],
];

// ─── South land polygon WITH Musandam fjords ─────────────────────────────────
// Full polygon (ray-casting for collision). Clockwise from bottom-left.
export const southPolygon: Pt[] = [
  [0, MAP_HEIGHT], [0, 1302],
  // UAE coast rising NE
  [220, 1280], [460, 1250], [710, 1212], [960, 1166],
  [1160, 1114], [1330, 1050], [1510, 976], [1648, 898],
  // Approach to Musandam base
  [1714, 858], [1752, 832],

  // ─ WEST FACE OF MUSANDAM (fjords / khors) ─────────────────────────
  // The fjords (khors) cut northward into the peninsula from the strait.

  // Rocky outer promontory 1 →
  [1770, 810], [1785, 785], [1795, 758],
  // ← Khor 1 (water inlet) fills back in
  [1802, 764], [1812, 782], [1826, 800],
  // Ridge between khor 1 and 2
  [1840, 788], [1855, 766],
  // Rocky promontory 2 (taller finger) →
  [1870, 740], [1882, 718], [1890, 706],
  // ← Khor 2
  [1898, 714], [1912, 736], [1928, 758],
  // Short ridge
  [1940, 748], [1952, 734],
  // Main spine climbing to tip
  [1968, 720], [1988, 710], [2015, 703],

  // ─ MUSANDAM TIP ────────────────────────────────────────────────────
  [2052, 700], [2098, 706],

  // ─ EAST FACE OF MUSANDAM ───────────────────────────────────────────
  [2142, 722], [2182, 742],
  // Small khor on east face (Khor Fakkan direction)
  [2208, 752], [2230, 738], [2252, 726], [2268, 732], [2288, 750], [2310, 772],
  // Descending east coast
  [2368, 814], [2450, 860], [2542, 904],
  // Gulf of Oman coast
  [2648, 954], [2775, 1004], [2935, 1056],
  [3090, 1100], [3200, 1140],

  // Bottom-right → bottom-left
  [3200, MAP_HEIGHT], [0, MAP_HEIGHT],
];

// Simplified south edge for decorations (spikes, beach strip)
export const southBasePoints: Pt[] = [
  [0, 1302], [220, 1280], [460, 1250], [710, 1212], [960, 1166],
  [1160, 1114], [1330, 1050], [1510, 976], [1648, 898],
  [1714, 858], [1752, 832],
  // Simplified Musandam (no fjord detail)
  [1810, 784], [1872, 724], [1960, 710], [2052, 700],
  [2155, 728], [2295, 764], [2450, 860], [2542, 904],
  [2648, 954], [2775, 1004], [2935, 1056], [3090, 1100], [3200, 1140],
];

// ─── Islands ──────────────────────────────────────────────────────────────────
export interface Island {
  cx: number; cy: number; rx: number; ry: number; rotation: number; label?: string;
}
export const islands: Island[] = [
  { cx: 1705, cy: 418, rx: 298, ry: 72,  rotation: 0.07, label: "Qeshm" },
  { cx: 2252, cy: 384, rx:  48, ry: 24,  rotation: 0.10, label: "Hormuz" },
  { cx: 2058, cy: 378, rx:  38, ry: 20,  rotation: 0.05 },
  { cx: 1068, cy: 435, rx:  32, ry: 18,  rotation: 0.15, label: "Abu Musa" },
];

// ─── Interpolation (north coast) ──────────────────────────────────────────────
function interpCoast(pts: Pt[], x: number): number {
  const c = Math.max(pts[0][0], Math.min(pts[pts.length-1][0], x));
  for (let i=0;i<pts.length-1;i++) {
    const [x0,y0]=pts[i],[x1,y1]=pts[i+1];
    if (c>=x0&&c<=x1) return y0+(y1-y0)*(c-x0)/(x1-x0);
  }
  return pts[pts.length-1][1];
}
export function getNorthY(x: number): number { return interpCoast(northBasePoints, x); }
export function getSouthY(x: number): number { return interpCoast(southBasePoints, x); }

// ─── Collision ────────────────────────────────────────────────────────────────
function pointInPolygon(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if ((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function pointInEllipse(px:number,py:number,isl:Island): boolean {
  const cos=Math.cos(-isl.rotation),sin=Math.sin(-isl.rotation);
  const dx=px-isl.cx,dy=py-isl.cy;
  return ((dx*cos-dy*sin)/isl.rx)**2+((dx*sin+dy*cos)/isl.ry)**2<=1;
}
export function isOnLand(x: number, y: number): boolean {
  if (y <= getNorthY(x)) return true;
  if (pointInPolygon(x, y, southPolygon)) return true;
  return islands.some(isl => pointInEllipse(x, y, isl));
}

// ─── Colour palette (2D game art) ────────────────────────────────────────────
const C = {
  waterDeep:    "#0b6e96",
  waterMid:     "#1190be",
  waterShallow: "#2db8dc",
  waterBright:  "#4dd4f0",
  sandBeach:    "#e8d8a8",
  sandFlat:     "#d4b87c",
  sandDark:     "#b89058",
  rockLight:    "#a07848",
  rockMid:      "#886038",
  rockDark:     "#5e4028",
  mountainSnow: "#e0d4c0",
  coastEdge:    "rgba(230,205,148,0.85)",
  coastGlow:    "rgba(255,230,160,0.18)",
  supplyLine:   "rgba(80,54,28,0.32)",
  outpost:      "#e05020",
};

// ─── Main draw ────────────────────────────────────────────────────────────────
export function drawMap(ctx: CanvasRenderingContext2D): void {
  const W=MAP_WIDTH, H=MAP_HEIGHT;

  // ── Water background ────────────────────────────────────────────────────────
  const wg = ctx.createLinearGradient(0,0,W,H);
  wg.addColorStop(0,    C.waterMid);
  wg.addColorStop(0.35, C.waterDeep);
  wg.addColorStop(0.65, C.waterDeep);
  wg.addColorStop(1,    C.waterMid);
  ctx.fillStyle=wg; ctx.fillRect(0,0,W,H);

  // Depth shading — narrows are darker/deeper
  ctx.save();
  const dg=ctx.createRadialGradient(2060,700,60,2060,700,1300);
  dg.addColorStop(0,"rgba(4,30,52,0.5)"); dg.addColorStop(0.4,"rgba(4,30,52,0.15)"); dg.addColorStop(1,"rgba(4,30,52,0)");
  ctx.fillStyle=dg; ctx.fillRect(0,0,W,H);
  ctx.restore();

  // Shallow-water coast tint (bright ring near all shores)
  ctx.save(); ctx.globalAlpha=0.22;
  // North coast shallows
  ctx.beginPath();
  ctx.moveTo(0,getNorthY(0)+80); ctx.lineTo(W,getNorthY(W)+80); ctx.lineTo(W,getNorthY(W)); ctx.lineTo(0,getNorthY(0));
  ctx.closePath(); ctx.fillStyle=C.waterBright; ctx.fill();
  ctx.restore();

  // Horizon shimmer lines
  ctx.save(); ctx.globalAlpha=0.055; ctx.strokeStyle="#78e0f8"; ctx.lineWidth=1.4;
  for (let i=0;i<9;i++) {
    const wy=330+(i*(H-660))/8;
    ctx.beginPath(); ctx.moveTo(0,wy);
    for (let x=0;x<=W;x+=80) ctx.lineTo(x,wy+Math.sin(x*0.005+i*1.2)*4);
    ctx.stroke();
  }
  ctx.globalAlpha=1; ctx.restore();

  // ── North land (Iran) ───────────────────────────────────────────────────────
  drawNorthLand(ctx, W, H);

  // ── South land (UAE + Musandam polygon) ─────────────────────────────────────
  drawSouthLand(ctx, H);

  // ── Musandam khor highlights (shallow water in fjords) ──────────────────────
  drawFjordWater(ctx);

  // ── Islands ─────────────────────────────────────────────────────────────────
  for (const isl of islands) drawIsland(ctx, isl);

  // ── Decorative game elements ─────────────────────────────────────────────────
  drawSupplyLines(ctx, W, H);
  drawOutposts(ctx);

  // ── Labels & compass ────────────────────────────────────────────────────────
  drawLabels(ctx, W, H);
  drawCompassRose(ctx, W-155, H-155, 78);
}

// ─── North land ───────────────────────────────────────────────────────────────
function drawNorthLand(ctx: CanvasRenderingContext2D, W: number, _H: number) {
  // Fill polygon
  ctx.beginPath();
  ctx.moveTo(0,0); ctx.lineTo(W,0);
  for (let i=northBasePoints.length-1;i>=0;i--) ctx.lineTo(northBasePoints[i][0],northBasePoints[i][1]);
  ctx.closePath();
  const ng=ctx.createLinearGradient(0,0,0,350);
  ng.addColorStop(0, C.rockDark); ng.addColorStop(0.22,C.rockMid); ng.addColorStop(0.55,C.rockLight);
  ng.addColorStop(0.78,C.sandDark); ng.addColorStop(1,C.sandFlat);
  ctx.fillStyle=ng; ctx.fill();

  // Beach strip at coast
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(W,0);
  for (let i=northBasePoints.length-1;i>=0;i--) ctx.lineTo(northBasePoints[i][0],northBasePoints[i][1]);
  ctx.closePath(); ctx.clip();
  const bng=ctx.createLinearGradient(0,220,0,340);
  bng.addColorStop(0,"rgba(232,216,160,0)"); bng.addColorStop(0.5,"rgba(232,216,160,0.52)"); bng.addColorStop(1,"rgba(255,240,190,0.05)");
  ctx.fillStyle=bng; ctx.fillRect(0,200,W,150);
  ctx.restore();

  // Mountain ridges (jagged rows across north land)
  drawMountainRidges(ctx, northBasePoints, -1, W);

  // Coast edge — white crest
  ctx.beginPath();
  ctx.moveTo(northBasePoints[0][0],northBasePoints[0][1]);
  for (const [px,py] of northBasePoints) ctx.lineTo(px,py);
  ctx.strokeStyle=C.coastEdge; ctx.lineWidth=3; ctx.stroke();
  ctx.strokeStyle=C.coastGlow; ctx.lineWidth=8; ctx.stroke();

  // Hazard spikes
  drawSpikes(ctx, northBasePoints, "down");
}

// ─── South land ───────────────────────────────────────────────────────────────
function drawSouthLand(ctx: CanvasRenderingContext2D, H: number) {
  ctx.beginPath();
  ctx.moveTo(southPolygon[0][0],southPolygon[0][1]);
  for (const [x,y] of southPolygon) ctx.lineTo(x,y);
  ctx.closePath();

  const sg=ctx.createLinearGradient(0,680,0,H);
  sg.addColorStop(0,C.sandFlat); sg.addColorStop(0.12,C.sandDark); sg.addColorStop(0.3,C.rockLight);
  sg.addColorStop(0.55,C.rockMid); sg.addColorStop(0.8,C.rockDark); sg.addColorStop(1,"#2e1a08");
  ctx.fillStyle=sg; ctx.fill();

  // Beach strip at north (strait-facing) coast
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(southPolygon[0][0],southPolygon[0][1]);
  for (const [x,y] of southPolygon) ctx.lineTo(x,y);
  ctx.closePath(); ctx.clip();
  const bsg=ctx.createLinearGradient(0,H-420,0,H-280);
  bsg.addColorStop(0,"rgba(232,216,160,0)"); bsg.addColorStop(0.5,"rgba(232,216,160,0.48)"); bsg.addColorStop(1,"rgba(232,216,160,0)");
  ctx.fillStyle=bsg; ctx.fillRect(0,H-460,MAP_WIDTH,190);
  ctx.restore();

  // Musandam mountainous terrain highlight
  ctx.save(); ctx.globalAlpha=0.22;
  ctx.beginPath();
  // Shade the Musandam body (the rocky peninsula itself)
  ctx.moveTo(1720,H);
  for (let x=1720;x<=2500;x+=18) ctx.lineTo(x, getSouthY(x));
  ctx.lineTo(2500,H); ctx.closePath();
  ctx.fillStyle=C.rockMid; ctx.fill();
  ctx.globalAlpha=1; ctx.restore();

  // Mountain ridges on south land
  drawSouthMountainRidges(ctx, H);

  // Coast edge highlight
  ctx.beginPath();
  ctx.moveTo(southBasePoints[0][0],southBasePoints[0][1]);
  for (const [px,py] of southBasePoints) ctx.lineTo(px,py);
  ctx.strokeStyle=C.coastEdge; ctx.lineWidth=3; ctx.stroke();
  ctx.strokeStyle=C.coastGlow; ctx.lineWidth=8; ctx.stroke();

  // Fjord coastline highlight (just the jagged Musandam section)
  ctx.beginPath();
  // trace the jagged west face of the polygon
  const jaggStart = 11; // index of [1770, 810] in southPolygon
  const jaggEnd   = 31; // index after [2098, 706]
  ctx.moveTo(southPolygon[jaggStart][0],southPolygon[jaggStart][1]);
  for (let i=jaggStart;i<=jaggEnd;i++) ctx.lineTo(southPolygon[i][0],southPolygon[i][1]);
  ctx.strokeStyle=C.coastEdge; ctx.lineWidth=2.5; ctx.stroke();
  ctx.strokeStyle=C.coastGlow; ctx.lineWidth=6; ctx.stroke();

  drawSpikes(ctx, southBasePoints, "up");
}

// ─── Fjord water tinting (shallow bright water in the khors) ──────────────────
function drawFjordWater(ctx: CanvasRenderingContext2D) {
  // Paint bright turquoise in the fjord openings so they read clearly as water
  const fjords: [number,number,number,number][] = [
    // [x, y, width, height] approximate bounding boxes of each khor
    [1788, 695, 28, 68],   // Khor 1
    [1878, 690, 32, 62],   // Khor 2 (deeper)
    [2200, 700, 30, 52],   // East face inlet
  ];
  ctx.save(); ctx.globalAlpha=0.62;
  for (const [x,y,w,h] of fjords) {
    const fg=ctx.createLinearGradient(x,y,x,y+h);
    fg.addColorStop(0,C.waterShallow); fg.addColorStop(1,C.waterMid);
    ctx.fillStyle=fg; ctx.fillRect(x,y,w,h);
  }
  ctx.globalAlpha=1; ctx.restore();
}

// ─── Mountain ridges on north land ────────────────────────────────────────────
function drawMountainRidges(ctx: CanvasRenderingContext2D, base: Pt[], _dir: number, W: number) {
  // Draw stacked rows of mountain peaks set back from the coastline
  const rows = [
    { yOff: -28, hMult: 0.65, alpha: 0.38, hw: 26 },
    { yOff: -58, hMult: 1.0,  alpha: 0.55, hw: 30 },
    { yOff: -95, hMult: 1.3,  alpha: 0.62, hw: 34 },
    { yOff: -138,hMult: 1.5,  alpha: 0.52, hw: 32 },
  ];
  ctx.save();
  for (const row of rows) {
    ctx.globalAlpha=row.alpha;
    for (let x=18; x<=W; x+=44) {
      const baseY=interpCoast(base,x)+row.yOff;
      const h=(42+Math.sin(x*0.031)*22+Math.sin(x*0.073)*14)*row.hMult;
      const hw=row.hw+Math.sin(x*0.052)*8;
      ctx.beginPath();
      ctx.moveTo(x-hw,baseY); ctx.lineTo(x,baseY-h); ctx.lineTo(x+hw,baseY); ctx.closePath();
      const mg=ctx.createLinearGradient(x,baseY,x,baseY-h);
      mg.addColorStop(0,C.rockMid); mg.addColorStop(0.65,C.rockDark); mg.addColorStop(1,C.mountainSnow);
      ctx.fillStyle=mg; ctx.fill();
      // Snow cap
      if (h>55) {
        ctx.beginPath(); ctx.moveTo(x,baseY-h); ctx.lineTo(x-hw*0.18,baseY-h+h*0.24); ctx.lineTo(x+hw*0.18,baseY-h+h*0.24); ctx.closePath();
        ctx.fillStyle="rgba(228,210,175,0.38)"; ctx.fill();
      }
    }
  }
  ctx.globalAlpha=1; ctx.restore();
}

// ─── Mountain ridges on south land (Musandam spine) ───────────────────────────
function drawSouthMountainRidges(ctx: CanvasRenderingContext2D, H: number) {
  const rows = [
    { yOff:  28, hMult: 0.6,  alpha: 0.35, hw: 24 },
    { yOff:  58, hMult: 1.0,  alpha: 0.52, hw: 30 },
    { yOff:  95, hMult: 1.35, alpha: 0.60, hw: 34 },
    { yOff: 140, hMult: 1.5,  alpha: 0.48, hw: 32 },
  ];
  ctx.save();
  for (const row of rows) {
    ctx.globalAlpha=row.alpha;
    for (let x=18; x<=MAP_WIDTH; x+=44) {
      const by=getSouthY(x)+row.yOff;
      if (by>H-20) continue;
      const h=(40+Math.sin(x*0.028)*20+Math.sin(x*0.069)*14)*row.hMult;
      const hw=row.hw+Math.sin(x*0.055)*8;
      ctx.beginPath();
      ctx.moveTo(x-hw,by); ctx.lineTo(x,by+h); ctx.lineTo(x+hw,by); ctx.closePath();
      const mg=ctx.createLinearGradient(x,by,x,by+h);
      mg.addColorStop(0,C.rockMid); mg.addColorStop(1,C.rockDark);
      ctx.fillStyle=mg; ctx.fill();
    }
  }
  // Extra dense ridges on Musandam spine (x=1750-2300)
  ctx.globalAlpha=0.45;
  for (let x=1760; x<=2280; x+=22) {
    const by=getSouthY(x)+20;
    const h=28+Math.sin(x*0.045)*14+Math.sin(x*0.088)*10;
    const hw=16+Math.sin(x*0.06)*6;
    ctx.beginPath();
    ctx.moveTo(x-hw,by); ctx.lineTo(x,by+h); ctx.lineTo(x+hw,by); ctx.closePath();
    const mg=ctx.createLinearGradient(x,by,x,by+h);
    mg.addColorStop(0,C.rockDark); mg.addColorStop(1,"#3a2010");
    ctx.fillStyle=mg; ctx.fill();
  }
  ctx.globalAlpha=1; ctx.restore();
}

// ─── Hazard spikes ────────────────────────────────────────────────────────────
function drawSpikes(ctx: CanvasRenderingContext2D, base: Pt[], dir: "up"|"down") {
  const SW=14, SH=24, GAP=24;
  ctx.save();
  for (let x=0;x<=MAP_WIDTH;x+=GAP) {
    const by=dir==="down"?getNorthY(x):getSouthY(x);
    const tip=dir==="down"?by+SH:by-SH;
    const g=ctx.createLinearGradient(x,by,x,tip);
    g.addColorStop(0,"#e04000"); g.addColorStop(1,"#ff2000");
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.moveTo(x-SW/2,by); ctx.lineTo(x,tip); ctx.lineTo(x+SW/2,by); ctx.closePath();
    ctx.fill(); ctx.strokeStyle="rgba(255,120,0,0.38)"; ctx.lineWidth=0.7; ctx.stroke();
  }
  ctx.restore();
}

// ─── Island ───────────────────────────────────────────────────────────────────
function drawIsland(ctx: CanvasRenderingContext2D, isl: Island) {
  ctx.save(); ctx.translate(isl.cx,isl.cy); ctx.rotate(isl.rotation);
  // Shallow water ring around island
  ctx.beginPath(); ctx.ellipse(0,0,isl.rx+18,isl.ry+18,0,0,Math.PI*2);
  ctx.fillStyle="rgba(77,212,240,0.28)"; ctx.fill();
  // Island body
  ctx.beginPath(); ctx.ellipse(0,0,isl.rx,isl.ry,0,0,Math.PI*2);
  const ig=ctx.createRadialGradient(0,-isl.ry*0.2,0,0,0,Math.max(isl.rx,isl.ry));
  ig.addColorStop(0,C.sandBeach); ig.addColorStop(0.5,C.sandFlat); ig.addColorStop(0.85,C.sandDark); ig.addColorStop(1,C.rockLight);
  ctx.fillStyle=ig; ctx.fill();
  // Edge highlight
  ctx.strokeStyle="rgba(232,218,162,0.85)"; ctx.lineWidth=2; ctx.stroke();
  // Hazard ring
  ctx.setLineDash([5,6]); ctx.strokeStyle="rgba(255,70,0,0.48)"; ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.ellipse(0,0,isl.rx+10,isl.ry+10,0,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
  if (isl.label) {
    ctx.font="bold 11px 'Courier New',monospace"; ctx.textAlign="center";
    ctx.fillStyle="rgba(50,20,5,0.7)"; ctx.fillText(isl.label,isl.cx+1,isl.cy+isl.ry+16);
    ctx.fillStyle="rgba(232,210,155,0.95)"; ctx.fillText(isl.label,isl.cx,isl.cy+isl.ry+15);
  }
}

// ─── Supply lines ─────────────────────────────────────────────────────────────
// Thin grey routes on the land — purely decorative game-level detail
const SUPPLY_NORTH: [number,number][] = [
  [120,120],[400,115],[700,118],[1000,120],[1300,128],[1600,140],[1900,155],[2200,160],[2500,152],[2800,144],[3100,136],
];
const SUPPLY_SOUTH: [number,number][] = [
  [80,1220],[350,1188],[680,1148],[1020,1102],[1320,1030],[1560,950],[1720,880],
  [1820,840],[1900,780],[2000,754],[2100,740],
];
const SUPPLY_S2: [number,number][] = [
  [2120,780],[2300,820],[2520,868],[2780,930],[3050,990],[3180,1040],
];

function drawSupplyLines(ctx: CanvasRenderingContext2D, _W: number, _H: number) {
  ctx.save(); ctx.globalAlpha=0.48;
  ctx.strokeStyle=C.supplyLine; ctx.lineWidth=1.6;
  ctx.setLineDash([8,6]);

  // North supply road
  ctx.beginPath(); ctx.moveTo(SUPPLY_NORTH[0][0],SUPPLY_NORTH[0][1]);
  for (const [x,y] of SUPPLY_NORTH) ctx.lineTo(x,y);
  ctx.stroke();

  // South supply road (west UAE → Musandam)
  ctx.beginPath(); ctx.moveTo(SUPPLY_SOUTH[0][0],SUPPLY_SOUTH[0][1]);
  for (const [x,y] of SUPPLY_SOUTH) ctx.lineTo(x,y);
  ctx.stroke();

  // South supply road (east of Musandam → Gulf of Oman)
  ctx.beginPath(); ctx.moveTo(SUPPLY_S2[0][0],SUPPLY_S2[0][1]);
  for (const [x,y] of SUPPLY_S2) ctx.lineTo(x,y);
  ctx.stroke();

  // Cross-route on north land
  ctx.beginPath();
  ctx.moveTo(800,115); ctx.lineTo(800,160); ctx.lineTo(1500,185); ctx.lineTo(2200,175); ctx.lineTo(2200,130);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha=1; ctx.restore();
}

// ─── Outpost icons ────────────────────────────────────────────────────────────
const OUTPOSTS: [number,number,string][] = [
  [2100, 152, "⬡"],   // Bandar Abbas
  [1600, 142, "⬡"],   // Bandar Lengeh
  [800,  115, "⬡"],   // Persian Gulf port
  [2100, 740, "▲"],   // Musandam tip
  [1800, 870, "⬡"],   // RAK
  [1550, 950, "⬡"],   // Sharjah
  [300,  1240,"⬡"],   // Abu Dhabi
];

function drawOutposts(ctx: CanvasRenderingContext2D) {
  ctx.save();
  for (const [x,y,icon] of OUTPOSTS) {
    // Glow ring
    ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2);
    ctx.fillStyle="rgba(224,80,32,0.22)"; ctx.fill();
    // Dot
    ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2);
    ctx.fillStyle=C.outpost; ctx.fill();
    ctx.strokeStyle="rgba(255,210,160,0.7)"; ctx.lineWidth=1; ctx.stroke();
    // Icon
    ctx.font="10px serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillStyle="rgba(255,200,140,0.75)"; ctx.fillText(icon,x,y);
  }
  ctx.globalAlpha=1; ctx.restore();
}

// ─── Labels ───────────────────────────────────────────────────────────────────
function drawLabels(ctx: CanvasRenderingContext2D, _W: number, H: number) {
  ctx.save(); ctx.textAlign="center";

  // Water body labels
  ctx.font="bold 28px 'Courier New',monospace";
  ctx.fillStyle="rgba(200,245,255,0.14)"; ctx.fillText("PERSIAN GULF",480,820);

  ctx.font="bold 24px 'Courier New',monospace";
  ctx.fillStyle="rgba(200,245,255,0.14)"; ctx.fillText("GULF OF OMAN",2800,870);

  ctx.save(); ctx.translate(2060,640); ctx.rotate(-0.07);
  ctx.font="bold 20px 'Courier New',monospace";
  ctx.fillStyle="rgba(255,230,80,0.58)"; ctx.fillText("STRAIT OF HORMUZ",0,0);
  ctx.restore();

  // Land labels
  ctx.font="bold 24px 'Courier New',monospace";
  ctx.fillStyle="rgba(50,20,5,0.42)"; ctx.fillText("IRAN",1600+1,136+1);
  ctx.fillStyle="rgba(232,210,155,0.55)"; ctx.fillText("IRAN",1600,136);

  ctx.font="bold 13px 'Courier New',monospace";
  ctx.fillStyle="rgba(50,20,5,0.5)"; ctx.fillText("BANDAR ABBAS",2100,250);
  ctx.fillStyle="rgba(232,210,155,0.72)"; ctx.fillText("BANDAR ABBAS",2099,249);

  ctx.font="bold 13px 'Courier New',monospace";
  ctx.fillStyle="rgba(232,210,155,0.55)"; ctx.fillText("BANDAR LENGEH",1580,218);

  ctx.font="bold 18px 'Courier New',monospace";
  ctx.fillStyle="rgba(232,210,155,0.38)"; ctx.fillText("UNITED ARAB EMIRATES",570,H-148);

  ctx.font="bold 19px 'Courier New',monospace";
  ctx.fillStyle="rgba(232,210,155,0.38)"; ctx.fillText("OMAN",2870,H-130);

  ctx.save(); ctx.translate(2068,880); ctx.rotate(-0.48);
  ctx.font="bold 13px 'Courier New',monospace";
  ctx.fillStyle="rgba(232,210,155,0.62)"; ctx.fillText("MUSANDAM",0,0);
  ctx.restore();

  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="rgba(232,210,155,0.42)";
  ctx.fillText("RAS AL KHAIMAH",1660,H-218);
  ctx.fillText("FUJAIRAH",2740,H-178);
  ctx.fillText("DIBBA",2540,H-215);
  ctx.fillText("KHOR FAKKAN",2600,H-245);

  ctx.restore();
}

// ─── Compass rose ─────────────────────────────────────────────────────────────
function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save(); ctx.globalAlpha=0.58; ctx.translate(cx,cy);
  ctx.strokeStyle="#78d8f0"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(0,0,r*0.94,0,Math.PI*2); ctx.stroke();
  const dirs=[{a:-Math.PI/2,l:"N"},{a:0,l:"E"},{a:Math.PI/2,l:"S"},{a:Math.PI,l:"W"}];
  for (const {a,l} of dirs) {
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0,-r*0.84); ctx.lineTo(r*0.11,-r*0.2); ctx.lineTo(-r*0.11,-r*0.2); ctx.closePath();
    ctx.fillStyle=l==="N"?"#e04040":"#78d8f0"; ctx.fill(); ctx.restore();
    ctx.font=`bold ${Math.round(r*0.21)}px 'Courier New',monospace`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillStyle=l==="N"?"#f08080":"#b8f0ff";
    ctx.fillText(l,Math.cos(a)*r*0.58,Math.sin(a)*r*0.58);
  }
  ctx.beginPath(); ctx.arc(0,0,r*0.11,0,Math.PI*2); ctx.fillStyle="#b8f0ff"; ctx.fill();
  ctx.restore();
}

export const northCoastEdge = northBasePoints;
export const southCoastEdge = southBasePoints;
