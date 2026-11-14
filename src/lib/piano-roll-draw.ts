// Draws the falling-notes view onto a 2D canvas context. No React, no timers, no DOM:
// everything is a function of (model, frame), so the same code can be tested in a real browser
// and the component only has to call it once per animation frame.
import type { ChordSymbol, PlayNote } from "@/lib/music";
import {
  beatToY, buildKeyboard, fitRange, gemAlpha, gemScale, groupRollChords, keyboardWhiteKeys, longestDuration, notesInRange, practiceRange,
  soundingKeys, tailBeats, toRollNotes, windowStart, type ChordGroup, type KeyInfo, type RollNote,
} from "@/lib/piano-roll";

/** Two hands, two colours that stay apart for common colour-blindness, plus different shapes (rounded square vs hexagon). */
export const HAND_COLORS = { right: "#f08a4b", left: "#4ea1ff" } as const;
export const isRightHand = (staff: number) => staff === 1;
const colourOf = (staff: number) => (isRightHand(staff) ? HAND_COLORS.right : HAND_COLORS.left);

export type RollModel = {
  notes: RollNote[]; // rebased so beat 0 is the start of the practice range, sorted by onset
  chordGroups: ChordGroup[];
  chords: ChordSymbol[];
  bars: { beat: number; number: number }[];
  span: number; // length of the practice range in beats
  keys: KeyInfo[];
  keyByMidi: Map<number, KeyInfo>;
  totalWhite: number;
  maxDuration: number;
};

type ParsedForRoll = { notes: PlayNote[]; measureStarts: number[]; chords?: ChordSymbol[] };

/** Everything that depends on the score and the practice range, computed once (not per frame). */
export function buildRollModel(parsed: ParsedForRoll, loop: boolean, from: number, to: number): RollModel {
  const range = practiceRange(parsed.measureStarts, loop, from, to);
  const all = toRollNotes(parsed.notes);
  const notes = notesInRange(all, range.t0, range.t1);
  const { low, high } = fitRange(parsed.notes);
  const keys = buildKeyboard(low, high);
  const bars: RollModel["bars"] = [];
  for (let bar = range.startBar; bar < range.endBar; bar++) {
    const start = parsed.measureStarts[bar];
    if (start !== undefined) bars.push({ beat: start - range.t0, number: bar + 1 });
  }
  const chords = (parsed.chords ?? []).filter((c) => c.beat >= range.t0 && c.beat < range.t1).map((c) => ({ beat: c.beat - range.t0, label: c.label }));
  return {
    notes, chordGroups: groupRollChords(notes), chords, bars, span: range.span, keys,
    keyByMidi: new Map(keys.map((k) => [k.midi, k])), totalWhite: keyboardWhiteKeys(keys), maxDuration: longestDuration(notes),
  };
}

export type RollFrame = {
  width: number;
  height: number;
  dpr: number;
  /** Beats from the start of the practice range; negative during the count-in. */
  position: number;
  /** How many beats ahead the roll shows. */
  lookAhead: number;
  /** First visible white key, in white-key units (fractional while scrolling). */
  windowStart: number;
  /** How many white keys fit across the roll. */
  whiteCapacity: number;
  /** Staffs (hands) the player plays, drawn bright. null means everything is bright (Watch mode). */
  yourStaffs: ReadonlySet<number> | null;
  reducedMotion: boolean;
};

export function rollLayout(width: number, height: number, visibleWhite: number) {
  const gutter = Math.max(40, Math.min(64, width * 0.055));
  const pad = 10;
  const whiteW = (width - gutter - pad) / Math.max(1, visibleWhite);
  const kbTop = Math.round(height * 0.8);
  return { gutter, pad, whiteW, blackW: whiteW * 0.6, kbTop, kbH: height - kbTop, strikeY: kbTop - 6 };
}

function mix(hex: string, amount: number, toward: "white" | "black"): string {
  const n = parseInt(hex.slice(1), 16);
  const target = toward === "white" ? 255 : 0;
  const f = (c: number) => Math.round(c + (target - c) * amount);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const x = cx + (Math.cos(a) * w) / 2, y = cy + (Math.sin(a) * h) / 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** One gem: right hand = rounded square, left hand = hexagon. `glow` is off for backing notes and reduced motion. */
function drawGem(ctx: CanvasRenderingContext2D, staff: number, cx: number, cy: number, w: number, alpha: number, glow: boolean, scale: number, fingering?: number) {
  const colour = colourOf(staff), h = w * 0.8;
  ctx.save();
  ctx.globalAlpha = alpha;
  const fill = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  fill.addColorStop(0, mix(colour, 0.55, "white")); fill.addColorStop(0.45, colour); fill.addColorStop(1, mix(colour, 0.4, "black"));
  ctx.fillStyle = fill;
  ctx.shadowColor = colour; ctx.shadowBlur = glow ? 16 * scale : 0;
  if (isRightHand(staff)) {
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.34); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.strokeStyle = mix(colour, 0.5, "black"); ctx.stroke();
  } else {
    hexagon(ctx, cx, cy, w * 0.98, h * 1.02);
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, 5 * scale); ctx.strokeStyle = colour; ctx.stroke(); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.strokeStyle = mix(colour, 0.5, "black"); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  const gloss = ctx.createLinearGradient(0, cy - h / 2, 0, cy);
  gloss.addColorStop(0, "rgba(255,255,255,.55)"); gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss; ctx.beginPath(); ctx.ellipse(cx - w * 0.04, cy - h * 0.2, w * 0.32, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  if (fingering && w >= 20) {
    ctx.fillStyle = "rgba(10,6,4,.85)"; ctx.font = `700 ${Math.round(w * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(fingering), cx, cy + h * 0.05);
  }
  ctx.restore();
}

/** Beats of a hit flash, and the shortest time a key stays lit. */
const FLASH_BEATS = 0.3;

export function drawRoll(ctx: CanvasRenderingContext2D, m: RollModel, f: RollFrame): void {
  const visibleWhite = Math.min(m.totalWhite, f.whiteCapacity);
  const L = rollLayout(f.width, f.height, visibleWhite);
  const pos = f.position, look = Math.max(1, f.lookAhead);
  const laneX = (k: KeyInfo) => L.gutter + (k.x - f.windowStart + k.width / 2) * L.whiteW;
  const laneW = (k: KeyInfo) => (k.black ? 0.78 : 0.94) * L.whiteW;
  const yOf = (beat: number) => L.strikeY * (1 - beatToY(beat, pos, look));
  const pxPerBeat = L.strikeY / look;
  const mine = (staff: number) => f.yourStaffs === null || f.yourStaffs.has(staff);
  const glowOn = !f.reducedMotion;

  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);
  const visibleKeys = m.keys.filter((k) => k.x + k.width > f.windowStart - 0.5 && k.x < f.windowStart + visibleWhite + 0.5);

  // highway background, with the black-key lanes a little darker and faint white-key boundaries
  const bg = ctx.createLinearGradient(0, 0, 0, L.kbTop); bg.addColorStop(0, "#0b0807"); bg.addColorStop(1, "#1b1310");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, f.width, L.kbTop);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  for (const k of visibleKeys) if (k.black) ctx.fillRect(laneX(k) - L.blackW / 2, 0, L.blackW, L.kbTop);
  ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
  for (let i = 0; i <= visibleWhite + 1; i++) {
    const x = Math.round(L.gutter + (Math.ceil(f.windowStart) + i - f.windowStart) * L.whiteW) + 0.5;
    if (x < L.gutter - 1 || x > f.width) continue;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L.kbTop); ctx.stroke();
  }

  // beat lines, bar lines, bar numbers; chord symbols sit in the left gutter beside their beat
  const firstBeat = Math.max(0, Math.floor(pos)), lastBeat = Math.min(Math.ceil(m.span), Math.ceil(pos + look) + 1);
  const barStarts = new Map(m.bars.map((b) => [Math.round(b.beat * 1000), b.number]));
  for (let b = firstBeat; b <= lastBeat; b++) {
    const y = yOf(b);
    if (y < -2 || y > L.strikeY + 2) continue;
    const barNumber = barStarts.get(b * 1000);
    ctx.strokeStyle = barNumber ? "rgba(255,235,220,.22)" : "rgba(255,255,255,.06)"; ctx.lineWidth = barNumber ? 1.4 : 1;
    ctx.beginPath(); ctx.moveTo(barNumber ? 8 : L.gutter, y); ctx.lineTo(f.width - 6, y); ctx.stroke();
    if (barNumber) { ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(255,235,220,.55)"; ctx.font = "600 12px Georgia, serif"; ctx.fillText(String(barNumber), 10, y - 24); }
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "700 13px system-ui, sans-serif"; ctx.fillStyle = "#f6c9a8";
  for (const c of m.chords) {
    const y = yOf(c.beat);
    if (y > 10 && y < L.strikeY + 2) ctx.fillText(c.label, 10, y - 8, L.gutter - 12);
  }

  // notes are clipped to the lanes, so on a narrow screen a note outside the keyboard window never spills into the margin
  ctx.save(); ctx.beginPath(); ctx.rect(L.gutter, 0, f.width - L.gutter - L.pad + 1, L.strikeY + 40); ctx.clip();

  // chord connectors: a thin bar joining same-hand notes that start together
  for (const g of m.chordGroups) {
    if (g.beat < pos) continue;
    if (g.beat > pos + look + 0.5) break;
    const y = yOf(g.beat), s = gemScale(beatToY(g.beat, pos, look));
    let lo = Infinity, hi = -Infinity;
    for (const midi of g.midis) { const k = m.keyByMidi.get(midi); if (!k) continue; const x = laneX(k); if (x < lo) lo = x; if (x > hi) hi = x; }
    if (hi <= lo) continue;
    ctx.save(); ctx.globalAlpha = (mine(g.staff) ? 0.5 : 0.18) * gemAlpha(beatToY(g.beat, pos, look)); ctx.fillStyle = colourOf(g.staff);
    roundedRect(ctx, lo, y - 3 * s, hi - lo, 6 * s, 3 * s); ctx.fill(); ctx.restore();
  }

  // tails: thin, behind the gems. Upcoming notes show the whole tail; a sounding note shows what is left of it.
  const first = windowStart(m.notes, pos, m.maxDuration);
  const lastIndex = (() => { let i = first; while (i < m.notes.length && (m.notes[i]?.start ?? 0) <= pos + look + 0.5) i++; return i; })();
  for (let i = first; i < lastIndex; i++) {
    const n = m.notes[i]!, key = m.keyByMidi.get(n.midi), tb = tailBeats(n.duration);
    if (!key || !tb) continue;
    const x = laneX(key), colour = colourOf(n.staff), own = mine(n.staff);
    const baseW = laneW(key) * 0.2 * (own ? 1 : 0.7);
    let yBottom: number, yTop: number, scale: number, alpha: number;
    if (n.start >= pos) { const ny = beatToY(n.start, pos, look); yBottom = yOf(n.start); yTop = yBottom - tb * pxPerBeat; scale = gemScale(ny); alpha = 0.7 * gemAlpha(ny); }
    else {
      const left = 1 - (pos - n.start) / n.duration;
      if (left <= 0) continue;
      yBottom = L.strikeY; yTop = L.strikeY - tb * left * pxPerBeat; scale = 1; alpha = 0.95;
    }
    if (yTop > L.strikeY + 4) continue;
    const w = baseW * scale, grad = ctx.createLinearGradient(0, yBottom, 0, yTop);
    grad.addColorStop(0, colour); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalAlpha = (own ? 1 : 0.45) * alpha;
    if (n.start < pos && glowOn) { ctx.shadowColor = colour; ctx.shadowBlur = 12; }
    ctx.fillStyle = grad; roundedRect(ctx, x - w / 2, yTop, w, yBottom - yTop, w / 2); ctx.fill(); ctx.restore();
  }

  // strike line
  const zone = ctx.createLinearGradient(0, L.strikeY - 26, 0, L.strikeY + 8); zone.addColorStop(0, "rgba(240,138,75,0)"); zone.addColorStop(1, "rgba(240,138,75,.22)");
  ctx.fillStyle = zone; ctx.fillRect(L.gutter - 20, L.strikeY - 26, f.width, 34);
  const line = ctx.createLinearGradient(L.gutter - 20, 0, f.width - 6, 0);
  line.addColorStop(0, "rgba(255,190,140,0)"); line.addColorStop(0.1, "rgba(255,205,160,.95)"); line.addColorStop(0.9, "rgba(255,205,160,.95)"); line.addColorStop(1, "rgba(255,190,140,0)");
  ctx.save(); if (glowOn) { ctx.shadowColor = "rgba(255,170,110,.9)"; ctx.shadowBlur = 14; }
  ctx.fillStyle = line; ctx.fillRect(L.gutter - 20, L.strikeY - 1.5, f.width - L.gutter, 3); ctx.restore();

  // gems on their way down, and the flash as each one reaches the line
  for (let i = first; i < lastIndex; i++) {
    const n = m.notes[i]!, key = m.keyByMidi.get(n.midi);
    if (!key) continue;
    const x = laneX(key), own = mine(n.staff), lane = laneW(key);
    if (n.start >= pos) {
      const ny = beatToY(n.start, pos, look), y = yOf(n.start);
      if (y < -30) continue;
      const scale = gemScale(ny);
      drawGem(ctx, n.staff, x, y, lane * scale * (own ? 1 : 0.68), (own ? 1 : 0.4) * gemAlpha(ny), own && glowOn, scale, own ? n.fingering : undefined);
    } else if (glowOn) {
      const p = (pos - n.start) / FLASH_BEATS;
      if (p < 0 || p >= 1) continue;
      const a = (1 - p) * (own ? 1 : 0.35), radius = lane * (0.7 + 1.8 * p);
      const halo = ctx.createRadialGradient(x, L.strikeY, 2, x, L.strikeY, radius); halo.addColorStop(0, colourOf(n.staff)); halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save(); ctx.globalAlpha = a * 0.85; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, L.strikeY, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      drawGem(ctx, n.staff, x, L.strikeY, lane * (1 + 0.3 * p) * (own ? 1 : 0.68), a, false, 1);
    }
  }

  ctx.restore();

  // soft fade at the top so gems ease in
  const fade = ctx.createLinearGradient(0, 0, 0, 70); fade.addColorStop(0, "rgba(11,8,7,.95)"); fade.addColorStop(1, "rgba(11,8,7,0)");
  ctx.fillStyle = fade; ctx.fillRect(0, 0, f.width, 70);

  // keyboard, with keys lit in the hand's colour while their note sounds
  const down = soundingKeys(m.notes, Math.max(0, pos), m.maxDuration, FLASH_BEATS);
  ctx.fillStyle = "#0c0908"; ctx.fillRect(0, L.kbTop, f.width, L.kbH);
  ctx.save(); ctx.beginPath(); ctx.rect(L.gutter, L.kbTop, f.width - L.gutter - L.pad + 1, L.kbH); ctx.clip();
  for (const k of visibleKeys) {
    if (k.black) continue;
    const x = L.gutter + (k.x - f.windowStart) * L.whiteW, staff = pos >= 0 ? down.get(k.midi) : undefined;
    const g = ctx.createLinearGradient(0, L.kbTop, 0, f.height);
    if (staff !== undefined) { g.addColorStop(0, colourOf(staff)); g.addColorStop(1, mix(colourOf(staff), 0.55, "white")); }
    else { g.addColorStop(0, "#f4efe9"); g.addColorStop(1, "#cfc7be"); }
    ctx.fillStyle = g; roundedRect(ctx, x + 1, L.kbTop + 2, L.whiteW - 2, L.kbH - 4, 4); ctx.fill();
    if (k.midi % 12 === 0 && L.whiteW >= 18) { ctx.fillStyle = "rgba(40,30,25,.6)"; ctx.font = "600 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(`C${k.midi / 12 - 1}`, x + L.whiteW / 2, f.height - 8); }
  }
  for (const k of visibleKeys) {
    if (!k.black) continue;
    const staff = pos >= 0 ? down.get(k.midi) : undefined, cx = laneX(k), g = ctx.createLinearGradient(0, L.kbTop, 0, L.kbTop + L.kbH * 0.62);
    if (staff !== undefined) { g.addColorStop(0, mix(colourOf(staff), 0.2, "black")); g.addColorStop(1, colourOf(staff)); }
    else { g.addColorStop(0, "#2a2420"); g.addColorStop(1, "#0d0a09"); }
    ctx.fillStyle = g; roundedRect(ctx, cx - L.blackW / 2, L.kbTop + 2, L.blackW, L.kbH * 0.62, 3); ctx.fill();
  }
  ctx.restore();

  // count-in: a big number over the roll
  if (pos < 0) {
    const n = Math.ceil(-pos);
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,235,220,.9)";
    ctx.font = `700 ${Math.round(Math.min(f.width, L.strikeY) * 0.28)}px Georgia, serif`; ctx.fillText(String(n), f.width / 2, L.strikeY * 0.45);
    ctx.font = "600 13px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,235,220,.6)"; ctx.fillText("Count-in", f.width / 2, L.strikeY * 0.45 + Math.min(f.width, L.strikeY) * 0.2);
    ctx.restore();
  }
}
