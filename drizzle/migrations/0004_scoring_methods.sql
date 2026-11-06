ALTER TABLE public.scores ADD COLUMN scoring_method text, ADD COLUMN extra_notes integer;
ALTER TABLE public.scores ADD CONSTRAINT scores_scoring_method_valid CHECK (scoring_method IS NULL OR scoring_method IN ('classic', 'basic-pitch'));
ALTER TABLE public.scores ADD CONSTRAINT scores_extra_notes_nonnegative CHECK (extra_notes IS NULL OR extra_notes >= 0);
