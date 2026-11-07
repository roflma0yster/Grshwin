import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoredComparison, Finding } from "@/lib/comparison-feedback";
export const timestamp = (time: number) => { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };
export function ComparisonFeedback({ result, onPlay }: { result: StoredComparison; onPlay: (finding: Finding) => void }) {
  return <section aria-label="Audio comparison results" className="space-y-5 border-y py-6">
    {result.version === 2 ? <>
      <p className="text-sm text-muted-foreground">Transcription-based feedback · Confidence {result.confidence}% · Acoustic pitch similarity {result.similarity}% · Relative tempo {result.tempoRatio.toFixed(2)}×</p>
      {result.noteFeedback && <p className="text-sm">{result.noteFeedback.matched} matched · {result.noteFeedback.wrong} wrong · {result.noteFeedback.missed} missed · {result.noteFeedback.extra} extra · {result.noteFeedback.octaveErrors} octave errors · {result.noteFeedback.accuracy}% transcription-based accuracy</p>}
      <div className="grid items-start gap-4 lg:grid-cols-3">{(["pitch", "tempo", "dynamics"] as const).map((kind) => {
        const card = result[kind];
        return <article key={kind} className="min-w-0 rounded-md border bg-card p-4"><h3 className="font-semibold capitalize">{kind}{kind === "pitch" && !result.noteFeedback ? " · acoustic only" : ""}</h3><p className="my-2 font-display text-3xl">{card.score}<span className="ml-1 text-sm text-muted-foreground">/100</span></p><p className="text-sm">{card.sentence}</p><ul className="mt-4 space-y-4">{card.findings.map((f, i) => <li key={i} className="text-sm"><p><span className="font-semibold">{timestamp(f.baselineTime)}{f.end !== undefined ? `–${timestamp(f.end)}` : ""}</span> · {f.text}</p><Button variant="ghost" size="sm" className="mt-1" aria-label={`Play ${kind} finding ${i + 1} from here`} onClick={() => onPlay(f)}><Play className="h-4 w-4" />Play from here</Button></li>)}</ul></article>;
      })}</div>
      <div><h3 className="font-semibold">What to practise first</h3><ol className="mt-2 list-inside list-decimal space-y-1 text-sm">{result.coaching.map((text) => <li key={text}>{text}</li>)}</ol></div>
      <ul className="space-y-1 text-sm text-muted-foreground">{result.confidenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    </> : <><p className="text-sm text-muted-foreground">This saved comparison uses version 1. Detailed feedback needs a new comparison.</p><div className="grid gap-4 sm:grid-cols-3"><p>Pitch-pattern similarity: <strong>{result.similarity}%</strong></p><p>Relative tempo: <strong>{result.tempoRatio.toFixed(2)}×</strong></p><p>Alignment variation: <strong>{result.timingDeviationMs} ms</strong></p></div></>}
    {result.noteUnavailable && <p className="text-sm text-muted-foreground">Note-level feedback unavailable: {result.noteUnavailable}</p>}
    <ul className="space-y-1 text-sm text-muted-foreground">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
  </section>;
}