export const LESSONS = [
  { id: "key-signatures", title: "Key signatures", summary: "Find your tonal home", paragraphs: ["A key signature sets the sharps or flats for the whole piece. Accidentals beside individual notes override it until the end of the bar.", "Sharps appear in this order: F, C, G, D, A, E, B. With sharps, the major key is one semitone above the last sharp. One sharp (F♯) means G major or its relative minor, E minor.", "For flats, the second-to-last flat names the major key. Two flats (B♭, E♭) mean B♭ major or G minor. One flat is the exception: F major."], question: "A score has F♯ and C♯ in its key signature. Which major key is it in?", choices: ["G major", "D major", "A major", "B♭ major"], answer: 1, explanation: "C♯ is the last sharp. One semitone above C♯ is D, so this is D major." },
  { id: "intervals", title: "Intervals", summary: "Recognise the distance between notes", paragraphs: ["An interval measures the distance between two notes. Count letter names inclusively: C to E spans C–D–E, so it is a third.", "Quality tells you the exact size. C to E is a major third (four semitones); C to E♭ is a minor third (three). C to G is a perfect fifth (seven).", "Learn the sound as well as the shape. Play each interval first one note at a time, then together. Listen for the bright major third, darker minor third, and open perfect fifth."], question: "How many semitones are in a perfect fifth?", choices: ["3", "4", "7", "12"], answer: 2, explanation: "A perfect fifth spans seven semitones, as in C to G." },
  { id: "chords", title: "Triads & inversions", summary: "Shape harmony under your hands", paragraphs: ["A triad contains a root, a third and a fifth. C major is C–E–G; C minor is C–E♭–G. Only the third changes.", "An inversion changes which chord tone is lowest. C–E–G is root position, E–G–C is first inversion, and G–C–E is second inversion.", "Inversions help your hands move smoothly between chords. Keep shared notes where they are and move the other notes by the smallest practical distance."], question: "Which notes make C major in first inversion?", choices: ["C–E–G", "E–G–C", "G–C–E", "C–E♭–G"], answer: 1, explanation: "First inversion places the third, E, in the bass." },
  { id: "rhythm", title: "Pulse & rhythm", summary: "Keep a steady inner beat", paragraphs: ["The lower number in a time signature tells you the beat unit. In 4/4, a quarter note gets one beat and there are four beats in each bar.", "Subdivide a beat to place shorter notes accurately. Count eighth notes as ‘1 and 2 and 3 and 4 and’. A dotted quarter lasts one and a half beats.", "In 6/8, six eighth notes usually group into two dotted-quarter pulses. Feel ‘ONE two three FOUR five six’ rather than six equally strong beats."], question: "How many quarter-note beats does a dotted quarter last?", choices: ["0.5", "1", "1.5", "2"], answer: 2, explanation: "The dot adds half the note’s original value: 1 + 0.5 = 1.5 beats." },
] as const;

export const INTERVALS = [
  { label: "Minor 3rd", semitones: 3 }, { label: "Major 3rd", semitones: 4 },
  { label: "Perfect 4th", semitones: 5 }, { label: "Perfect 5th", semitones: 7 },
  { label: "Octave", semitones: 12 },
] as const;
export const CHORDS = [
  { label: "Major", offsets: [0, 4, 7] }, { label: "Minor", offsets: [0, 3, 7] },
  { label: "Diminished", offsets: [0, 3, 6] },
] as const;
export const RHYTHMS = [
  { label: "♩ ♩ ♩ ♩", beats: [0, 1, 2, 3] },
  { label: "♫ ♩ ♩ ♩", beats: [0, 0.5, 1, 2, 3] },
  { label: "♩ ♩ ♫ ♩", beats: [0, 1, 2, 2.5, 3] },
] as const;

export function performanceAccuracy(correct: number, total: number) {
  return total > 0 ? Math.round(100 * correct / total) : 0;
}

export type PerformanceHit = { correct: boolean; offset: number };

/** Each beat has one note slot; skipped beats stay missed rather than shifting the melody. */
export function capturePerformanceHit(melody: readonly number[], hits: readonly (PerformanceHit | null)[], note: number, elapsed: number, beat: number) {
  const index = Math.round(elapsed / beat);
  if (elapsed < -beat / 2 || index < 0 || index >= melody.length || hits[index]) return null;
  return { index, hit: { correct: note === melody[index], offset: Math.round(elapsed - index * beat) } };
}