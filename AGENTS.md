<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Rules
- Signed-in pages live under `src/routes/_authenticated/` and render inside `AppShell` (nav + onboarding redirect) — one place for the app chrome.
- AI calls live in `src/lib/ai/*.server.ts`, invoked from `*.functions.ts` server functions with `requireSupabaseAuth` — keeps keys and prompts server-side.
- Curriculum output is validated server-side so every `pieceId` exists in `pieces` — the AI must never invent repertoire.
- Sheet music (OpenSheetMusicDisplay) and audio (Tone.js) are dynamically imported in effects/handlers — both are browser-only.
- Library score following uses audio-clock Draw callbacks and OSMD graphical measure bounds through its page backend; manual scroll gestures suspend following without reacting to programmatic scroll events.
- Resolve automation-events to its native ES module — its legacy browser bundle breaks audio initialization when shared dependencies are bundled.
- Pieces without a MusicXML file fall back to a generated demo excerpt (`src/lib/music.ts`) so the player always works.
- MusicXML playback aligns all parts on shared bar boundaries, sustains ties, and clips notes to practice ranges — uploaded scores must preserve their musical timing.
- Uploaded scores use authenticated server validation, private owner-scoped storage, and `user_pieces`; never place uploads into the shared catalog.
- Learning exercises use curated browser-safe data and persist user-owned progress; audio is initiated by user gestures.
- Performance scoring methods are selectable (`src/lib/scoring-methods.ts`): Classic scores MIDI/on-screen input; Basic Pitch transcribes microphone audio. Every method scores the fixed exercise only, not arbitrary repertoire; this keeps feedback based on captured notes.
- Performance inputs are matched to beat slots, leaving skipped slots missed; save timing and note counts with the exercise so history retains the measured result.
- Learning writes use unique user/topic completion or stable attempt IDs for retries so repeated requests cannot double-count progress.
- Audio-file comparisons use normalized FFT pitch-class features and dynamic time warping in browser handlers; label acoustic similarity separately from exercise note accuracy because recordings are not transcribed.
- Comparison recordings and results are private owner-scoped data; save stable attempt IDs and owner-prefixed storage paths so retries cannot create duplicate history.
- Score playback has one engine, `src/hooks/use-playback.ts`, shared by the catalog piece player and the uploaded-score player; do not copy it into a screen. Tone is loaded inside the Play click and every node it creates is disposed on stop, unmount and score change.
- Playback instruments come from the registry in `src/lib/instruments.ts` (Tone.js built-in synths, nothing downloaded). Add a voice there, not in a screen; a changed choice applies on the next Play and is remembered on the device.
- Uploading a score starts from the Library page (`UploadScoreForm` in a dialog). `/upload` only redirects to `/library`; uploads stay private and owner-scoped.
- Level ratings are computed and stored only by server functions (`src/lib/rating.functions.ts`, `src/lib/level.server.ts`) using the service role; the browser sends evidence, never a rating. `player_ratings`, `rating_events`, `user_skills` and `user_skill_events` are read-only for signed-in users.
- Every piece of rating or skill evidence has a stable key (`rating_events` and `user_skill_events` are unique per user and key) so retries cannot double-count; insert the event first and undo it if the dependent write fails.
- Songs a player says they can play are unverified claims: they carry low weight, cannot lift the rating far above the onboarding or scored level, and never enter the shared `pieces` catalog. Uploads and their skill tags stay owner-scoped.
- Recommendations are ranked deterministically in `src/lib/recommend.ts`. Any AI step may only reword that result; it must not add, remove or reorder pieces, and every `pieceId` is checked against the ranked list.
- Skill tags come only from the `skills` taxonomy table; never create skills from model output or user text. Tags are written by migration or reviewed scripts, not at runtime.
