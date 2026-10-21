CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  genre text,
  proficiency text,
  goal text,
  daily_minutes int,
  input_method text,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  composer text NOT NULL,
  genre text NOT NULL,
  difficulty text NOT NULL,
  key_signature text NOT NULL,
  license text NOT NULL,
  source_url text,
  musicxml_url text,
  musicxml_status text NOT NULL DEFAULT 'to be uploaded',
  default_tempo int NOT NULL DEFAULT 80,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pieces TO authenticated;
GRANT ALL ON public.pieces TO service_role;
ALTER TABLE public.pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pieces readable" ON public.pieces FOR SELECT TO authenticated USING (true);

INSERT INTO public.pieces (title, composer, genre, difficulty, key_signature, license, source_url, default_tempo) VALUES
('Minuet in G Major, BWV Anh. 114','J.S. Bach (attr. Petzold)','Classical','Early Intermediate','G major','Public Domain','https://imslp.org/wiki/Minuet_in_G_major,_BWV_Anh.114_(Petzold,_Christian)',100),
('Sonatina in C, Op. 36 No. 1','Muzio Clementi','Classical','Early Intermediate','C major','Public Domain','https://imslp.org/wiki/6_Sonatinas,_Op.36_(Clementi,_Muzio)',96),
('Prelude in E minor, Op. 28 No. 4','Frédéric Chopin','Classical','Intermediate','E minor','Public Domain','https://imslp.org/wiki/Preludes,_Op.28_(Chopin,_Fr%C3%A9d%C3%A9ric)',60),
('Gymnopédie No. 1','Erik Satie','Classical','Intermediate','D major','Public Domain','https://imslp.org/wiki/3_Gymnop%C3%A9dies_(Satie,_Erik)',66),
('The Entertainer','Scott Joplin','Jazz','Upper Intermediate','C major','Public Domain','https://imslp.org/wiki/The_Entertainer_(Joplin,_Scott)',80),
('Maple Leaf Rag','Scott Joplin','Jazz','Upper Intermediate','A-flat major','Public Domain','https://imslp.org/wiki/Maple_Leaf_Rag_(Joplin,_Scott)',84),
('12-Bar Blues in C (exercise)','KeyCoach','Blues','Early Intermediate','C major','CC0','https://creativecommons.org/publicdomain/zero/1.0/',90),
('Für Elise, WoO 59','Ludwig van Beethoven','Classical','Intermediate','A minor','Public Domain','https://imslp.org/wiki/F%C3%BCr_Elise,_WoO_59_(Beethoven,_Ludwig_van)',72),
('Arabesque, Op. 100 No. 2','Friedrich Burgmüller','Classical','Early Intermediate','A minor','Public Domain','https://imslp.org/wiki/25_Easy_and_Progressive_Studies,_Op.100_(Burgm%C3%BCller,_Friedrich)',120),
('Aura Lee (pop ballad arrangement)','George R. Poulton','Pop','Early Intermediate','F major','Public Domain','https://en.wikipedia.org/wiki/Aura_Lea',76);

CREATE TABLE public.user_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  composer text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL DEFAULT current_date,
  plan jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.practice_plans(id) ON DELETE CASCADE,
  day_index int NOT NULL,
  session_date date NOT NULL DEFAULT current_date,
  completed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  minutes int NOT NULL DEFAULT 0,
  hard_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_index)
);
CREATE TABLE public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  piece_id uuid REFERENCES public.pieces(id) ON DELETE SET NULL,
  accuracy numeric,
  tempo int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.theory_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ear_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise text NOT NULL,
  correct int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['user_pieces','practice_plans','practice_sessions','scores','theory_progress','ear_training_progress'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
END LOOP; END $$;