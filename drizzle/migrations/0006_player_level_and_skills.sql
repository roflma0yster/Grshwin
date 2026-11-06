-- Player level rating, skill taxonomy and piece skill tags.
-- Ratings, evidence and skill progress are written only by server functions (service role);
-- signed-in users can read their own rows but cannot write them.

ALTER TABLE public.pieces ADD COLUMN IF NOT EXISTS difficulty_rating integer;
UPDATE public.pieces SET difficulty_rating = CASE difficulty
  WHEN 'Beginner' THEN 500 WHEN 'Early Intermediate' THEN 900 WHEN 'Intermediate' THEN 1300
  WHEN 'Upper Intermediate' THEN 1700 WHEN 'Advanced' THEN 2100 ELSE 1000 END
WHERE difficulty_rating IS NULL;
ALTER TABLE public.pieces ALTER COLUMN difficulty_rating SET NOT NULL;
ALTER TABLE public.pieces ALTER COLUMN difficulty_rating SET DEFAULT 1000;
ALTER TABLE public.pieces ADD CONSTRAINT pieces_difficulty_rating_range CHECK (difficulty_rating BETWEEN 0 AND 2400);

-- Optional details for a user's private pieces so they can be recommended to that user only.
ALTER TABLE public.user_pieces ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE public.user_pieces ADD COLUMN IF NOT EXISTS difficulty_rating integer;
ALTER TABLE public.user_pieces ADD CONSTRAINT user_pieces_difficulty_rating_range CHECK (difficulty_rating IS NULL OR difficulty_rating BETWEEN 0 AND 2400);

CREATE TABLE public.skills (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('technique','rhythm','theory','reading','style','expression')),
  description text NOT NULL
);
CREATE TABLE public.piece_skills (
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  emphasis integer NOT NULL CHECK (emphasis BETWEEN 1 AND 3),
  note text NOT NULL,
  PRIMARY KEY (piece_id, skill_id)
);
CREATE TABLE public.user_piece_skills (
  user_piece_id uuid NOT NULL REFERENCES public.user_pieces(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emphasis integer NOT NULL CHECK (emphasis BETWEEN 1 AND 3),
  note text NOT NULL,
  PRIMARY KEY (user_piece_id, skill_id)
);

CREATE TABLE public.player_ratings (
  user_id uuid PRIMARY KEY,
  rating integer NOT NULL CHECK (rating BETWEEN 0 AND 2400),
  deviation numeric NOT NULL CHECK (deviation > 0),
  baseline integer NOT NULL,
  scored_ceiling integer,
  moved_today integer NOT NULL DEFAULT 0 CHECK (moved_today >= 0),
  moved_on date NOT NULL DEFAULT current_date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  evidence_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('self_report','scored_exercise','scored_sample')),
  piece_id uuid REFERENCES public.pieces(id) ON DELETE SET NULL,
  exercise_id text,
  label text,
  target_difficulty integer NOT NULL,
  outcome numeric NOT NULL CHECK (outcome BETWEEN 0 AND 1),
  rating_before integer NOT NULL,
  rating_after integer NOT NULL,
  deviation_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rating_events_unique_evidence UNIQUE (user_id, evidence_key)
);
CREATE INDEX rating_events_user_created ON public.rating_events (user_id, created_at DESC);

CREATE TABLE public.user_skills (
  user_id uuid NOT NULL,
  skill_id text NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level BETWEEN 0 AND 3),
  source text NOT NULL CHECK (source IN ('self_report','practice_session')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);
CREATE TABLE public.user_skill_events (
  user_id uuid NOT NULL,
  evidence_key text NOT NULL,
  skill_id text NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level_before integer NOT NULL,
  level_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, evidence_key, skill_id)
);

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['skills','piece_skills','user_piece_skills','player_ratings','rating_events','user_skills','user_skill_events'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
END LOOP; END $$;
CREATE POLICY "skills readable" ON public.skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "piece skills readable" ON public.piece_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "own piece skills" ON public.user_piece_skills FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own rating" ON public.player_ratings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own rating events" ON public.rating_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own skills" ON public.user_skills FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own skill events" ON public.user_skill_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Skill taxonomy. Written by an AI assistant: a teacher should review the names, categories and tags below.
INSERT INTO public.skills (id, name, category, description) VALUES
('hand-independence','Hand independence','technique','Playing a melody in one hand while the other keeps a different pattern.'),
('scale-passages','Scale passages','technique','Running scales smoothly with even fingering and thumb crossings.'),
('arpeggios-broken-chords','Arpeggios and broken chords','technique','Spreading chord tones across the keyboard evenly.'),
('hand-leaps','Hand leaps','technique','Jumping accurately between distant positions, such as a bass note then a chord.'),
('staccato-touch','Staccato touch','technique','Short, crisp notes with a light, quick release.'),
('ornaments','Ornaments','technique','Trills, turns and grace notes played cleanly and in time.'),
('legato-touch','Legato touch','expression','Connecting notes smoothly so the line sings.'),
('pedalling','Pedalling','expression','Using the sustain pedal to blend harmony without blurring it.'),
('dynamics-shaping','Dynamics and shaping','expression','Shaping phrases with crescendo, diminuendo and contrast.'),
('voicing-melody','Voicing the melody','expression','Bringing the tune out above the accompaniment.'),
('rubato-phrasing','Rubato and phrasing','expression','Flexing the tempo expressively while keeping the line together.'),
('syncopation','Syncopation','rhythm','Placing accents off the beat and keeping the pulse steady underneath.'),
('swing-feel','Swing feel','rhythm','Playing paired eighth notes unevenly in a long-short lilt.'),
('steady-pulse-3-4','Waltz and triple-time pulse','rhythm','Keeping a clear three-beat feel with a light second and third beat.'),
('dotted-rhythms','Dotted rhythms','rhythm','Counting and playing dotted notes against the pulse.'),
('minor-key-harmony','Minor-key harmony','theory','Hearing and playing the colours of minor keys, including the raised leading note.'),
('key-changes-modulation','Key changes','theory','Moving to a new key centre and recognising the new accidentals.'),
('chord-inversions','Chord inversions','theory','Using chord shapes with a different note in the bass for smooth movement.'),
('seventh-chords','Seventh chords','theory','Playing and recognising chords with an added seventh.'),
('twelve-bar-blues-form','Twelve-bar blues form','theory','Knowing the standard twelve-bar chord sequence.'),
('blues-scale','Blues scale','theory','Using the blue notes to improvise and decorate.'),
('accidentals-reading','Reading accidentals','reading','Reading sharps, flats and naturals that change within a bar.'),
('reading-both-clefs','Reading both clefs','reading','Following treble and bass clefs together.'),
('key-signature-flats','Keys with many flats','reading','Playing fluently in keys such as A-flat major.'),
('baroque-dance-style','Baroque dance style','style','The shape and articulation of a courtly dance.'),
('classical-sonatina-style','Classical sonatina style','style','Clean, balanced phrases typical of early Classical music.'),
('romantic-lyricism','Romantic lyricism','style','Singing, expressive playing with flexible phrasing.'),
('impressionist-colour','Impressionist colour','style','Soft, atmospheric harmony and pedal colour.'),
('ragtime-style','Ragtime style','style','A syncopated melody over a steady oom-pah bass.'),
('pop-ballad-accompaniment','Pop ballad accompaniment','style','Supporting a melody with flowing chords and a steady groove.'),
('walking-bass','Walking bass','style','A steady line of bass notes that outlines the chords.')
ON CONFLICT (id) DO NOTHING;

-- Piece tags (emphasis 3 = a central lesson of the piece). Matched by title prefix.
INSERT INTO public.piece_skills (piece_id, skill_id, emphasis, note)
SELECT p.id, t.skill_id, t.emphasis, t.note
FROM public.pieces p
JOIN (VALUES
 ('Minuet in G','baroque-dance-style',3,'Short, balanced phrases with a dance character.'),
 ('Minuet in G','steady-pulse-3-4',2,'A clear three-beat feel under the tune.'),
 ('Minuet in G','hand-independence',2,'A flowing right-hand tune over a separate left-hand line.'),
 ('Minuet in G','staccato-touch',1,'Detached left-hand notes contrast with the smoother melody.'),
 ('Minuet in G','reading-both-clefs',1,'Both hands read from different clefs.'),
 ('Sonatina in C','classical-sonatina-style',3,'Balanced phrases and clear cadences.'),
 ('Sonatina in C','scale-passages',3,'Quick scale runs that need even fingering.'),
 ('Sonatina in C','hand-independence',2,'The left hand accompanies without covering the melody.'),
 ('Sonatina in C','dynamics-shaping',2,'Contrasts between loud and soft sections.'),
 ('Sonatina in C','arpeggios-broken-chords',2,'Broken-chord figures in the accompaniment.'),
 ('Prelude in E minor','minor-key-harmony',3,'Slow chord changes that colour the minor key.'),
 ('Prelude in E minor','voicing-melody',3,'The top line must sing above repeated chords.'),
 ('Prelude in E minor','romantic-lyricism',3,'Expressive, sighing phrases.'),
 ('Prelude in E minor','rubato-phrasing',2,'Gentle give and take in the pulse.'),
 ('Prelude in E minor','pedalling',2,'Changing pedal cleanly with the harmony.'),
 ('Prelude in E minor','legato-touch',2,'Chords need to connect smoothly.'),
 ('Prelude in E minor','accidentals-reading',2,'Chromatic steps in the descending chords.'),
 ('Gymnop','impressionist-colour',3,'Soft, floating harmony.'),
 ('Gymnop','pedalling',3,'Pedal carries the bass note into the chord above.'),
 ('Gymnop','steady-pulse-3-4',2,'A slow, even three-beat feel.'),
 ('Gymnop','voicing-melody',2,'A quiet melody above gentle chords.'),
 ('Gymnop','legato-touch',2,'Long, connected lines.'),
 ('Gymnop','seventh-chords',2,'Added-seventh chords give its colour.'),
 ('Gymnop','rubato-phrasing',1,'Small, relaxed stretches of the tempo.'),
 ('The Entertainer','syncopation',3,'The melody leans on off-beats over a steady bass.'),
 ('The Entertainer','ragtime-style',3,'Classic ragtime melody and oom-pah left hand.'),
 ('The Entertainer','hand-leaps',3,'The left hand jumps between bass notes and chords.'),
 ('The Entertainer','hand-independence',3,'Syncopated right hand against a steady left.'),
 ('The Entertainer','accidentals-reading',2,'Frequent sharps and chromatic notes.'),
 ('Maple Leaf Rag','syncopation',3,'Driving syncopation throughout.'),
 ('Maple Leaf Rag','ragtime-style',3,'A defining ragtime piece.'),
 ('Maple Leaf Rag','hand-leaps',3,'Wide stride jumps in the left hand.'),
 ('Maple Leaf Rag','hand-independence',3,'Two independent, busy hands.'),
 ('Maple Leaf Rag','key-signature-flats',2,'Four flats in the key signature.'),
 ('12-Bar Blues','twelve-bar-blues-form',3,'The standard twelve-bar sequence.'),
 ('12-Bar Blues','blues-scale',2,'Blue notes for decoration.'),
 ('12-Bar Blues','swing-feel',2,'A long-short lilt in the eighth notes.'),
 ('12-Bar Blues','walking-bass',2,'A steady walking line in the left hand.'),
 ('12-Bar Blues','seventh-chords',2,'Dominant seventh chords throughout.'),
 ('Für Elise','arpeggios-broken-chords',3,'Flowing broken-chord left hand.'),
 ('Für Elise','minor-key-harmony',2,'A minor-key theme with a raised leading note.'),
 ('Für Elise','legato-touch',2,'The famous theme needs a smooth line.'),
 ('Für Elise','hand-independence',2,'Melody and broken chords at once.'),
 ('Für Elise','dynamics-shaping',2,'Soft and loud sections contrast.'),
 ('Für Elise','accidentals-reading',2,'Chromatic notes in the opening motif.'),
 ('Für Elise','key-changes-modulation',1,'Moves to new key centres in the middle sections.'),
 ('Arabesque','staccato-touch',3,'Light, quick detached notes.'),
 ('Arabesque','arpeggios-broken-chords',2,'Broken-chord figures in the right hand.'),
 ('Arabesque','hand-independence',2,'Fast right hand over a lighter left.'),
 ('Arabesque','dynamics-shaping',2,'Sudden contrasts in volume.'),
 ('Arabesque','minor-key-harmony',1,'Starts in a minor key.'),
 ('Aura Lee','pop-ballad-accompaniment',3,'Flowing chords under a singing tune.'),
 ('Aura Lee','legato-touch',2,'The tune should sing.'),
 ('Aura Lee','voicing-melody',2,'Keep the melody above the chords.'),
 ('Aura Lee','chord-inversions',2,'Inversions keep the chords moving smoothly.'),
 ('Aura Lee','dynamics-shaping',1,'Gentle swells within phrases.'),
 ('Aura Lee','key-signature-flats',1,'One flat, a first step in flat keys.')
) AS t(title_prefix, skill_id, emphasis, note) ON p.title LIKE t.title_prefix || '%'
ON CONFLICT (piece_id, skill_id) DO NOTHING;
