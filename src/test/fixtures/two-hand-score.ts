// A four-bar, two-hand piano score for tests: chords, finger numbers, held notes and chord symbols.
// 4/4, divisions = 2 per quarter note. Right hand is staff 1, left hand staff 2.
type Pitch = [step: string, octave: number, alter?: number];

const note = (step: string, octave: number, duration: number, type: string, staff: number, o: { chord?: boolean; alter?: number; fingering?: number } = {}) =>
  `<note>${o.chord ? "<chord/>" : ""}<pitch><step>${step}</step>${o.alter ? `<alter>${o.alter}</alter>` : ""}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff>${o.fingering ? `<notations><technical><fingering>${o.fingering}</fingering></technical></notations>` : ""}</note>`;

const chord = (pitches: Pitch[], duration: number, type: string, staff: number, fingers: number[]) =>
  pitches.map(([step, octave, alter], i) => note(step, octave, duration, type, staff, { chord: i > 0, alter, fingering: fingers[i] })).join("");

const harmony = (step: string, kind: string, text?: string) =>
  `<harmony><root><root-step>${step}</root-step></root><kind${text ? ` text="${text}"` : ""}>${kind}</kind></harmony>`;

const attributes = "<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>";
const measure = (n: number, h: string, rightHand: string, leftHand: string, extra = "") => `<measure number="${n}">${extra}${h}${rightHand}<backup><duration>8</duration></backup>${leftHand}</measure>`;

const C7: Pitch[] = [["C", 4], ["E", 4], ["G", 4], ["B", 4]];
const F7: Pitch[] = [["F", 4], ["A", 4], ["C", 5], ["E", 5, -1]];
const E7: Pitch[] = [["E", 4], ["G", 4], ["B", 4], ["D", 5]];
const FINGERS = [1, 2, 3, 5];

const bar1Right = ([["G", 4], ["A", 4], ["B", 4], ["C", 5]] as Pitch[]).map(([s, o], i) => note(s, o, 1, "eighth", 1, { fingering: [1, 2, 3, 1][i] })).join("") + note("D", 5, 2, "quarter", 1, { fingering: 2 }) + note("E", 5, 2, "quarter", 1, { fingering: 3 });
const bar1Left = ([["G", 2, 5], ["A", 2, 5], ["B", 2, 4], ["D", 3, 2]] as const).map(([s, o, f]) => note(s, o, 2, "quarter", 2, { fingering: f })).join("");

export const TWO_HAND_SCORE = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">` +
  measure(1, harmony("G", "major"), bar1Right, bar1Left, attributes) +
  measure(2, harmony("C", "major-seventh", "maj7"), chord(C7, 2, "quarter", 1, FINGERS) + chord(C7, 2, "quarter", 1, FINGERS) + chord(C7, 4, "half", 1, FINGERS), note("C", 2, 4, "half", 2, { fingering: 5 }) + note("G", 2, 2, "quarter", 2, { fingering: 4 }) + note("C", 3, 1, "eighth", 2, { fingering: 2 }) + note("E", 3, 1, "eighth", 2, { fingering: 1 })) +
  measure(3, harmony("F", "dominant"), [0, 1, 2, 3].map(() => chord(F7, 2, "quarter", 1, FINGERS)).join(""), note("F", 2, 3, "quarter", 2, { fingering: 5 }) + note("C", 3, 1, "eighth", 2, { fingering: 2 }) + note("A", 2, 2, "quarter", 2, { fingering: 3 }) + note("F", 2, 2, "quarter", 2, { fingering: 5 })) +
  measure(4, harmony("E", "minor-seventh"), chord(E7, 4, "half", 1, FINGERS) + chord(E7, 2, "quarter", 1, FINGERS) + chord(E7, 1, "eighth", 1, FINGERS) + chord(E7, 1, "eighth", 1, FINGERS), note("E", 2, 4, "half", 2, { fingering: 5 }) + note("B", 2, 2, "quarter", 2, { fingering: 4 }) + note("E", 3, 1, "eighth", 2, { fingering: 2 }) + note("G", 3, 1, "eighth", 2, { fingering: 1 })) +
  `</part></score-partwise>`;
