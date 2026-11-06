ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS scoring_method text, ADD COLUMN IF NOT EXISTS extra_notes integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scores'::regclass AND conname = 'scores_scoring_method_valid') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_scoring_method_valid CHECK (scoring_method IS NULL OR scoring_method IN ('classic', 'basic-pitch'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scores'::regclass AND conname = 'scores_extra_notes_nonnegative') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_extra_notes_nonnegative CHECK (extra_notes IS NULL OR extra_notes >= 0);
  END IF;
END $$;