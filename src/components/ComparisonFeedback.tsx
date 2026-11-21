import { useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FindingCategory } from "@/lib/finding-categories";
import type { DetailedComparison, FeedbackCard, Finding, StoredComparison } from "@/lib/comparison-feedback";

export const timestamp = (time: number) => { const seconds = Math.max(0, Math.floor(time)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };

const SHOW_FIRST = 5;

// Small inline icons, so each group has a shape as well as a colour and a label.
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">{children}</svg>;
const MistakeIcon = () => <Svg><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></Svg>;
const StyleIcon = () => <Svg><path d="M3 12c3-6 6 6 9 0s6 6 9 0" /></Svg>;
const UncertainIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><path d="M12 17h.01" /></Svg>;

const GROUPS: { key: FindingCategory; title: string; blurb?: string; tone: string; Icon: () => ReactNode }[] = [
  { key: "mistake", title: "Likely mistakes", tone: "text-amber-500", Icon: MistakeIcon },
  { key: "style", title: "Stylistic differences", blurb: "These differ from the reference but may be your interpretation. Change them only if you want to match the lesson.", tone: "text-sky-400", Icon: StyleIcon },
  { key: "uncertain", title: "Not sure (may be the recording)", blurb: "The app could not tell whether these are real differences or noise in the recording.", tone: "text-muted-foreground", Icon: UncertainIcon },
];

function FindingList({ findings, kind, category, onPlay }: { findings: Finding[]; kind: string; category: FindingCategory; onPlay: (finding: Finding) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? findings : findings.slice(0, SHOW_FIRST);
  return <>
    <ul className="space-y-3">{shown.map((f, i) => <li key={`${f.baselineTime}-${i}`} className="text-sm">
      <p><span className="font-semibold">{timestamp(f.baselineTime)}{f.end !== undefined ? `–${timestamp(f.end)}` : ""}</span> · {f.text}</p>
      <p className="text-xs text-muted-foreground">{f.reason}</p>
      <Button variant="ghost" size="sm" className="mt-1" aria-label={`Play ${kind} ${category} finding ${i + 1} from here`} onClick={() => onPlay(f)}><Play className="h-4 w-4" />Play from here</Button>
    </li>)}</ul>
    {findings.length > SHOW_FIRST && <Button variant="link" size="sm" className="px-0" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all (${findings.length})`}</Button>}
  </>;
}

/** The findings of one card in three groups: likely mistakes, stylistic differences, and not sure. */
function CardFindings({ kind, card, onPlay }: { kind: string; card: FeedbackCard; onPlay: (finding: Finding) => void }) {
  const noMistakes = card.counts.mistake === 0;
  return <div className="mt-4 space-y-3">{GROUPS.map((g) => {
    const total = card.counts[g.key];
    if (!total) return null;
    const items = card.findings.filter((f) => f.category === g.key);
    const heading = <span className={`inline-flex items-center gap-1.5 font-semibold ${g.tone}`}><g.Icon />{g.title} ({total})</span>;
    const list = <FindingList findings={items} kind={kind} category={g.key} onPlay={onPlay} />;
    const more = total > items.length ? <p className="mt-1 text-xs text-muted-foreground">Showing the first {items.length} of {total}.</p> : null;
    if (g.key === "mistake") return <section key={g.key}><h4 className="mb-2 text-sm">{heading}</h4>{list}{more}</section>;
    return <details key={g.key} open={g.key === "style" && noMistakes} className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm"><h4 className="inline">{heading}</h4></summary>
      <p className="mt-2 text-xs text-muted-foreground">{g.blurb}</p>
      <div className="mt-3">{list}{more}</div>
    </details>;
  })}</div>;
}

function Detailed({ result, onPlay }: { result: DetailedComparison; onPlay: (finding: Finding) => void }) {
  return <>
    <p className="text-sm text-muted-foreground">Transcription-based feedback · Confidence {result.confidence}% · Acoustic pitch similarity {result.similarity}% · Relative tempo {result.tempoRatio.toFixed(2)}×</p>
    {result.noteFeedback && <p className="text-sm">Note matching, before differences are sorted: {result.noteFeedback.matched} matched · {result.noteFeedback.wrong} wrong · {result.noteFeedback.missed} missed · {result.noteFeedback.extra} extra · {result.noteFeedback.octaveErrors} octave differences · {result.noteFeedback.accuracy}% transcription-based accuracy</p>}
    <div className="grid items-start gap-4 lg:grid-cols-3">{(["pitch", "tempo", "dynamics"] as const).map((kind) => {
      const card = result[kind];
      return <article key={kind} className="min-w-0 rounded-md border bg-card p-4">
        <h3 className="font-semibold capitalize">{kind}{kind === "pitch" && !result.noteFeedback ? " · acoustic only" : ""}</h3>
        <p className="my-2 font-display text-3xl">{card.score}<span className="ml-1 text-sm text-muted-foreground">/100</span></p>
        <p className="text-sm">{card.sentence}</p>
        {kind === "tempo" && <p className="mt-1 text-sm text-muted-foreground">{result.tempo.overall}</p>}
        <CardFindings kind={kind} card={card} onPlay={onPlay} />
      </article>;
    })}</div>
    <div>
      <h3 className="font-semibold">What to practise first</h3>
      {result.noMistakes
        ? <p className="mt-2 text-sm">No clear mistakes found. The differences below look stylistic.{result.styleSuggestion ? ` ${result.styleSuggestion}` : ""}</p>
        : <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">{result.coaching.map((text) => <li key={text}>{text}</li>)}</ol>}
    </div>
    <ul className="space-y-1 text-sm text-muted-foreground">{result.confidenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
  </>;
}

export function ComparisonFeedback({ result, onPlay }: { result: StoredComparison; onPlay: (finding: Finding) => void }) {
  return <section aria-label="Audio comparison results" className="space-y-5 border-y py-6">
    {result.version === 3 ? <Detailed result={result} onPlay={onPlay} />
    : result.version === 2 ? <>
      <p className="rounded-md border p-3 text-sm text-muted-foreground">This comparison was saved before differences were sorted into likely mistakes and stylistic differences, so everything is listed together. Run a new comparison to see them grouped.</p>
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
