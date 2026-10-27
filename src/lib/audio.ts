/** Browser-only audio, always loaded after a user gesture. */
export async function soundSequence(notes: { midi: number; at: number; duration?: number }[]) {
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" } }).toDestination();
  synth.volume.value = -12;
  const now = Tone.now() + 0.05;
  notes.forEach((n) => synth.triggerAttackRelease(Tone.Frequency(n.midi, "midi").toFrequency(), n.duration ?? 0.35, now + n.at));
  const length = Math.max(0, ...notes.map((n) => n.at + (n.duration ?? 0.35)));
  await new Promise((resolve) => window.setTimeout(resolve, (length + 0.3) * 1000));
  synth.dispose();
}