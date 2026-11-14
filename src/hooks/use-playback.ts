import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getInstrument, type InstrumentId } from "@/lib/instruments";
import { practiceNotes, type PlaybackHands, type parseNotes } from "@/lib/music";
import { countInBeats, typicalBarBeats } from "@/lib/play-along";
import { barTransitions } from "@/lib/score-following";

export type ParsedScore = ReturnType<typeof parseNotes>;

export type PlayOptions = {
  tempo: number;
  hands: PlaybackHands;
  metronome: boolean;
  loop: boolean;
  /** 1-based bars, used when `loop` is on. */
  from: number;
  to: number;
  instrumentId: InstrumentId;
  /** What the app plays aloud. Defaults to `hands`; "none" plays only the click (Play along with both hands). */
  audible?: PlaybackHands | "none";
  /** Bars of count-in click before the first pass (0 to 2, default 0). The count-in is not repeated on loop. */
  countInBars?: number;
};

type Hooks = { onBar?: (bar: number) => void; onStart?: () => void };

/**
 * The one playback engine, shared by the catalog piece player and the uploaded-score player.
 * Tone is loaded here, inside the Play click, so audio always starts from a user gesture.
 * Tempo behaves as it always has: it is read when Play is pressed.
 */
export function usePlayback(parsed: ParsedScore | null, hooks: Hooks = {}) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [activeInstrument, setActiveInstrument] = useState<InstrumentId | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});
  /** Beats since the start of the practice range (negative during the count-in), or null when stopped. */
  const positionRef = useRef<(() => number | null) | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const bars = parsed ? Math.max(0, parsed.measureStarts.length - 1) : 0;

  const stop = useCallback(() => {
    generation.current++;
    stopRef.current(); stopRef.current = () => {}; positionRef.current = null;
    setPlaying(false); setCurrent(null); setActiveInstrument(null);
  }, []);
  /** Read this from an animation frame; it does not cause renders. */
  const position = useCallback(() => positionRef.current?.() ?? null, []);

  // A different score (or leaving the page) always stops playback and frees every audio node.
  useEffect(() => {
    setCurrent(null); setPlaying(false); setActiveInstrument(null);
    return () => { generation.current++; stopRef.current(); stopRef.current = () => {}; positionRef.current = null; };
  }, [parsed]);

  const play = useCallback(async (o: PlayOptions) => {
    if (!parsed || busyRef.current) return;
    const attempt = ++generation.current;
    busyRef.current = true; setBusy(true);
    try {
      const Tone = await import("tone");
      await Tone.start();
      if (attempt !== generation.current) return;
      const transport = Tone.getTransport();
      transport.stop(); transport.cancel(); transport.loop = false;
      const voice = getInstrument(o.instrumentId).create(Tone);
      const click = new Tone.MembraneSynth({ octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } }).toDestination();
      click.volume.value = -12;
      stopRef.current = () => {
        transport.stop(); transport.cancel(); transport.loop = false;
        voice.dispose(); click.dispose();
      };
      const startM = o.loop ? o.from - 1 : 0;
      const endM = o.loop ? o.to : bars;
      const t0 = parsed.measureStarts[startM] ?? 0;
      const t1 = parsed.measureStarts[endM] ?? 0;
      const beat = 60 / o.tempo;
      if (t1 <= t0) { stop(); return; }
      const lead = countInBeats(parsed.measureStarts, o.countInBars ?? 0); // beats of count-in before the music
      const offset = lead * beat; // seconds
      const audible = o.audible ?? o.hands;
      if (audible !== "none") practiceNotes(parsed.notes, t0, t1, audible).forEach((n) =>
        transport.schedule((time) => voice.triggerAttackRelease(n.pitch, Math.max(0.05, n.duration * beat * 0.95), time), n.start * beat + offset));
      barTransitions(parsed.measureStarts, startM, endM, o.tempo).forEach(({ bar, seconds }) => {
        transport.schedule((time) => Tone.getDraw().schedule(() => {
          if (attempt === generation.current) { setCurrent(bar); hooksRef.current.onBar?.(bar); }
        }, time), seconds + offset);
      });
      // count-in clicks: an accented first click for each bar, then the rest of the beats
      const barBeats = typicalBarBeats(parsed.measureStarts);
      for (let i = 0; i < Math.ceil(lead); i++) {
        transport.schedule((time) => click.triggerAttackRelease(i % barBeats === 0 ? "C3" : "G2", "32n", time), i * beat);
      }
      if (o.metronome) for (let b = 0; b < t1 - t0; b++) {
        transport.schedule((time) => click.triggerAttackRelease(parsed.measureStarts.includes(t0 + b) ? "C3" : "G2", "32n", time), b * beat + offset);
      }
      // the loop starts after the count-in, so the count-in plays once
      if (o.loop) { transport.loop = true; transport.loopStart = offset; transport.loopEnd = offset + (t1 - t0) * beat; }
      else transport.schedule((time) => Tone.getDraw().schedule(() => { if (attempt === generation.current) stop(); }, time), offset + (t1 - t0) * beat + 0.5);
      positionRef.current = () => transport.seconds / beat - lead;
      hooksRef.current.onStart?.();
      transport.start("+0.1"); setPlaying(true); setActiveInstrument(o.instrumentId);
    } catch (error) {
      stop(); console.error("Score playback failed", error); toast.error("Playback could not start. Please try again.");
    } finally { busyRef.current = false; setBusy(false); }
  }, [parsed, bars, stop]);

  return { playing, busy, current, bars, activeInstrument, play, stop, position };
}
