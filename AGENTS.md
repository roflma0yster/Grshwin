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
- Pieces without a MusicXML file fall back to a generated demo excerpt (`src/lib/music.ts`) so the player always works.
- Uploaded scores use authenticated server validation, private owner-scoped storage, and `user_pieces`; never place uploads into the shared catalog.
- Learning exercises use curated browser-safe data and persist user-owned progress; audio is initiated by user gestures.
- Performance scores measure the fixed on-screen/MIDI exercise, not microphone recognition or arbitrary repertoire; this keeps feedback based on captured notes.
