import type { DetectedNote } from "@/lib/performance-scoring";
export type AlignmentPoint = { baselineTime: number; performanceTime: number };
export type NoteFinding = { kind: "wrong" | "octave" | "missed" | "extra"; baselineTime: number; performanceTime: number; expected?: number; played?: number };
export type NoteComparison = { matched: number; wrong: number; missed: number; extra: number; octaveErrors: number; total: number; accuracy: number; findings: NoteFinding[] };
export function alignmentMap(points: readonly AlignmentPoint[]) {
  const groups = new Map<number, number[]>();
  for (const p of points) { const group = groups.get(p.baselineTime) ?? []; group.push(p.performanceTime); groups.set(p.baselineTime, group); }
  const sorted = [...groups].map(([x, ys]) => ({ x, y: ys.reduce((a, b) => a + b, 0) / ys.length })).sort((a, b) => a.x - b.x);
  return (time: number) => {
    const first = sorted[0], last = sorted.at(-1);
    if (!first || !last) return time;
    if (time <= first.x) return first.y + time - first.x;
    if (time >= last.x) return last.y + time - last.x;
    const i = sorted.findIndex((p) => p.x >= time), a = sorted[i - 1], b = sorted[i];
    if (!a || !b) return time;
    return a.y + (b.y - a.y) * (time - a.x) / (b.x - a.x);
  };
}
export function usableNotes(notes: readonly DetectedNote[]) {
  return notes.filter((n) => Number.isFinite(n.midi + n.start + n.duration + n.amplitude) && n.duration >= 0.08 && n.amplitude >= 0.1).sort((a, b) => a.start - b.start);
}
/** Exact pitch first across each onset cluster prevents chord voices stealing one another's matches. */
export function compareNotes(reference: readonly DetectedNote[], performance: readonly DetectedNote[], alignment: readonly AlignmentPoint[], tolerance = 0.2): NoteComparison {
  const a = usableNotes(reference), b = usableNotes(performance), map = alignmentMap(alignment);
  const used = new Set<number>(), paired = new Set<number>(), findings: NoteFinding[] = [];
  let matched = 0, wrong = 0, octaveErrors = 0;
  const candidates = (n: DetectedNote) => b.map((v, index) => ({ v, index, distance: Math.abs(v.start - map(n.start)) })).filter((c) => !used.has(c.index) && c.distance <= tolerance).sort((x, y) => x.distance - y.distance);
  for (const [i, n] of a.entries()) {
    const hit = candidates(n).find((c) => c.v.midi === n.midi);
    if (hit) { used.add(hit.index); paired.add(i); matched++; }
  }
  for (const [i, n] of a.entries()) {
    if (paired.has(i)) continue;
    const possible = candidates(n), hit = possible.find((c) => Math.abs(c.v.midi - n.midi) % 12 === 0) ?? possible[0];
    if (hit) {
      used.add(hit.index); paired.add(i); wrong++;
      const octave = Math.abs(hit.v.midi - n.midi) % 12 === 0; if (octave) octaveErrors++;
      findings.push({ kind: octave ? "octave" : "wrong", baselineTime: n.start, performanceTime: hit.v.start, expected: n.midi, played: hit.v.midi });
    } else findings.push({ kind: "missed", baselineTime: n.start, performanceTime: map(n.start), expected: n.midi });
  }
  const inverse = alignmentMap(alignment.map((p) => ({ baselineTime: p.performanceTime, performanceTime: p.baselineTime })));
  for (const [i, n] of b.entries()) if (!used.has(i)) findings.push({ kind: "extra", baselineTime: inverse(n.start), performanceTime: n.start, played: n.midi });
  const extra = b.length - used.size;
  return { matched, wrong, missed: a.length - paired.size, extra, octaveErrors, total: a.length, accuracy: a.length ? Math.round(100 * matched / (a.length + extra)) : 0, findings: findings.sort((x, y) => x.baselineTime - y.baselineTime) };
}