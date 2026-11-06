// Instrument voices for score playback. Everything is synthesised with Tone.js built-ins,
// so nothing is downloaded. Tone itself is passed in by the caller, which loads it
// dynamically after a user gesture (see AGENTS.md).
type ToneModule = typeof import("tone");

/** The few methods playback needs, so voices with extra nodes (filters) can clean up after themselves. */
export type Voice = {
  triggerAttackRelease: (note: string, duration: number, time: number) => void;
  dispose: () => void;
};

export type Instrument = { id: string; label: string; create: (Tone: ToneModule) => Voice };

export const DEFAULT_INSTRUMENT_ID = "soft-piano";
export const INSTRUMENT_STORAGE_KEY = "grshwin.instrument";

export const INSTRUMENTS = [
  {
    // The sound the app has always used.
    id: "soft-piano", label: "Soft piano",
    create: (Tone) => {
      const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.8 } }).toDestination();
      synth.volume.value = -8;
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => synth.dispose() };
    },
  },
  {
    id: "electric-piano", label: "Electric piano",
    create: (Tone) => {
      const synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3, modulationIndex: 1.4, oscillator: { type: "sine" },
        envelope: { attack: 0.005, decay: 0.7, sustain: 0.2, release: 0.8 },
        modulation: { type: "sine" }, modulationEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.5 },
      }).toDestination();
      synth.volume.value = -12;
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => synth.dispose() };
    },
  },
  {
    id: "organ", label: "Organ",
    create: (Tone) => {
      const synth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2, oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.25 },
        modulation: { type: "square" }, modulationEnvelope: { attack: 0.02, decay: 0.1, sustain: 1, release: 0.25 },
      }).toDestination();
      synth.volume.value = -16; // sustains at full level, so it needs more headroom
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => synth.dispose() };
    },
  },
  {
    id: "music-box", label: "Music box",
    create: (Tone) => {
      const synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 8, modulationIndex: 2, oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1 },
        modulation: { type: "square" }, modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      }).toDestination();
      synth.volume.value = -14;
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => synth.dispose() };
    },
  },
  {
    id: "strings", label: "Strings",
    create: (Tone) => {
      const filter = new Tone.Filter(1800, "lowpass").toDestination();
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
        envelope: { attack: 0.25, decay: 0.2, sustain: 0.8, release: 1.2 },
      }).connect(filter);
      synth.volume.value = -18;
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => { synth.dispose(); filter.dispose(); } };
    },
  },
  {
    id: "harpsichord", label: "Harpsichord",
    create: (Tone) => {
      const filter = new Tone.Filter(3500, "lowpass").toDestination();
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.05, release: 0.3 },
      }).connect(filter);
      synth.volume.value = -16;
      return { triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t), dispose: () => { synth.dispose(); filter.dispose(); } };
    },
  },
] as const satisfies readonly Instrument[];

export type InstrumentId = (typeof INSTRUMENTS)[number]["id"];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((i) => i.id === value);
}

/** Anything unknown (an old or edited stored value) falls back to the default sound. */
export function resolveInstrumentId(value: unknown): InstrumentId {
  return isInstrumentId(value) ? value : DEFAULT_INSTRUMENT_ID;
}

export function getInstrument(id: unknown): Instrument {
  return INSTRUMENTS.find((i) => i.id === resolveInstrumentId(id))!;
}
