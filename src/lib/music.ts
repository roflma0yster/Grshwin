// Demo score generator + minimal MusicXML note parser for playback.

const RH = ["E5", "D5", "C5", "D5", "E5", "E5", "E5", "R", "D5", "D5", "D5", "R", "E5", "G5", "G5", "R", "E5", "D5", "C5", "D5", "E5", "E5", "E5", "C5", "D5", "D5", "E5", "D5", "C5", "R", "R", "R"];
const LH = ["C3", "G3", "C3", "G3", "G2", "D3", "C3", "E3", "C3", "G3", "C3", "G3", "G2", "D3", "C3", "R"];

function noteXml(p: string, dur: number, type: string, staff: number) {
  if (p === "R") return `<note><rest/><duration>${dur}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff></note>`;
  const step = p[0];
  const octave = p.slice(1);
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${dur}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}

export function demoMusicXml(title: string) {
  let measures = "";
  for (let m = 0; m < 8; m++) {
    const attrs =
      m === 0
        ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`
        : "";
    const rh = RH.slice(m * 4, m * 4 + 4).map((p) => noteXml(p, 1, "quarter", 1)).join("");
    const lh = LH.slice(m * 2, m * 2 + 2).map((p) => noteXml(p, 2, "half", 2)).join("");
    measures += `<measure number="${m + 1}">${attrs}${rh}<backup><duration>4</duration></backup>${lh}</measure>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="3.1"><work><work-title>${title} (demo excerpt)</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export type PlayNote = { pitch: string; start: number; duration: number; staff: number; measure: number };

/** Times are in quarter-note beats. */
export function parseNotes(xml: string): { notes: PlayNote[]; measureStarts: number[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const part = doc.querySelector("part");
  const notes: PlayNote[] = [];
  const measureStarts: number[] = [];
  if (!part) return { notes, measureStarts };
  let divisions = 1;
  let measureStart = 0;
  part.querySelectorAll(":scope > measure").forEach((measure, mi) => {
    measureStarts.push(measureStart);
    let cursor = 0;
    let maxCursor = 0;
    let lastStart = 0;
    for (const el of Array.from(measure.children)) {
      if (el.tagName === "attributes") {
        const d = el.querySelector("divisions");
        if (d) divisions = Number(d.textContent) || 1;
      } else if (el.tagName === "backup") {
        cursor -= Number(el.querySelector("duration")?.textContent ?? 0) / divisions;
      } else if (el.tagName === "forward") {
        cursor += Number(el.querySelector("duration")?.textContent ?? 0) / divisions;
      } else if (el.tagName === "note") {
        if (el.querySelector("grace")) continue;
        const dur = Number(el.querySelector("duration")?.textContent ?? 0) / divisions;
        const isChord = !!el.querySelector("chord");
        const start = isChord ? lastStart : cursor;
        const pitchEl = el.querySelector("pitch");
        if (pitchEl && !el.querySelector("rest")) {
          const step = pitchEl.querySelector("step")?.textContent ?? "C";
          const alter = Number(pitchEl.querySelector("alter")?.textContent ?? 0);
          const octave = pitchEl.querySelector("octave")?.textContent ?? "4";
          const acc = alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(-alter) : "";
          notes.push({
            pitch: `${step}${acc}${octave}`,
            start: measureStart + start,
            duration: dur,
            staff: Number(el.querySelector("staff")?.textContent ?? 1),
            measure: mi,
          });
        }
        if (!isChord) {
          lastStart = cursor;
          cursor += dur;
        }
      }
      maxCursor = Math.max(maxCursor, cursor);
    }
    measureStart += maxCursor;
  });
  measureStarts.push(measureStart);
  return { notes, measureStarts };
}
