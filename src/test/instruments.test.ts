import { describe, expect, it } from "vitest";
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, getInstrument, isInstrumentId, resolveInstrumentId } from "@/lib/instruments";

describe("instrument registry", () => {
  it("has unique ids and labels, and a factory for each", () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(INSTRUMENTS.length);
    expect(new Set(INSTRUMENTS.map((i) => i.label)).size).toBe(INSTRUMENTS.length);
    for (const i of INSTRUMENTS) { expect(i.label.length).toBeGreaterThan(0); expect(typeof i.create).toBe("function"); }
  });
  it("offers at least the five voices the player expects", () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(5);
  });
  it("has a default that exists, and it is the original piano sound", () => {
    expect(isInstrumentId(DEFAULT_INSTRUMENT_ID)).toBe(true);
    expect(DEFAULT_INSTRUMENT_ID).toBe("soft-piano");
  });
  it("falls back to the default for unknown or missing stored values", () => {
    expect(resolveInstrumentId("kazoo")).toBe(DEFAULT_INSTRUMENT_ID);
    expect(resolveInstrumentId(null)).toBe(DEFAULT_INSTRUMENT_ID);
    expect(resolveInstrumentId(undefined)).toBe(DEFAULT_INSTRUMENT_ID);
    expect(resolveInstrumentId(42)).toBe(DEFAULT_INSTRUMENT_ID);
  });
  it("keeps a valid stored value", () => {
    expect(resolveInstrumentId("organ")).toBe("organ");
  });
  it("looks instruments up by id, with the default for unknown ids", () => {
    expect(getInstrument("strings").id).toBe("strings");
    expect(getInstrument("nope").id).toBe(DEFAULT_INSTRUMENT_ID);
  });
});

// A stand-in for Tone that records every node an instrument creates, so we can check
// each voice plays and that dispose() frees everything it built (including filters).
function fakeTone() {
  const nodes: { disposed: boolean; played: number; options: unknown }[] = [];
  const track = (options: unknown) => { const n = { disposed: false, played: 0, options }; nodes.push(n); return n; };
  class PolySynth {
    node: ReturnType<typeof track>;
    volume = { value: 0 };
    constructor(_voice: unknown, options: unknown) { this.node = track(options); }
    toDestination() { return this; }
    connect() { return this; }
    triggerAttackRelease() { this.node.played++; }
    dispose() { this.node.disposed = true; }
  }
  class Filter {
    node: ReturnType<typeof track>;
    constructor(frequency: number, type: string) { this.node = track({ frequency, type }); }
    toDestination() { return this; }
    dispose() { this.node.disposed = true; }
  }
  const Tone = { PolySynth, Filter, Synth: class {}, FMSynth: class {}, AMSynth: class {} };
  return { Tone: Tone as never, nodes };
}

describe("instrument voices", () => {
  for (const instrument of INSTRUMENTS) {
    it(`${instrument.label} plays a note and disposes every node it created`, () => {
      const { Tone, nodes } = fakeTone();
      const voice = instrument.create(Tone);
      expect(nodes.length).toBeGreaterThan(0);
      voice.triggerAttackRelease("C4", 0.5, 0);
      expect(nodes.some((n) => n.played > 0)).toBe(true);
      expect(nodes.every((n) => !n.disposed)).toBe(true);
      voice.dispose();
      expect(nodes.every((n) => n.disposed)).toBe(true);
    });
  }
  it("the default voice keeps the original piano settings", () => {
    const { Tone, nodes } = fakeTone();
    INSTRUMENTS.find((i) => i.id === DEFAULT_INSTRUMENT_ID)!.create(Tone);
    expect(nodes[0]!.options).toEqual({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.8 } });
  });
});
