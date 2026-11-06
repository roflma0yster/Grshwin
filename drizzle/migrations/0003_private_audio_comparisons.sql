CREATE TABLE public.audio_comparisons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), baseline_name text NOT NULL, performance_name text NOT NULL, baseline_path text NOT NULL, performance_path text NOT NULL, baseline_start double precision NOT NULL, baseline_end double precision NOT NULL, performance_start double precision NOT NULL, performance_end double precision NOT NULL, result jsonb NOT NULL,
 CONSTRAINT audio_comparison_owner_paths CHECK (baseline_path LIKE user_id::text || '/%' AND performance_path LIKE user_id::text || '/%')
);
GRANT SELECT, INSERT, DELETE ON public.audio_comparisons TO authenticated;
GRANT ALL ON public.audio_comparisons TO service_role;
ALTER TABLE public.audio_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read audio comparisons" ON public.audio_comparisons FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners save audio comparisons" ON public.audio_comparisons FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete audio comparisons" ON public.audio_comparisons FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read comparison recordings" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audio-comparisons' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners upload comparison recordings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-comparisons' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners delete comparison recordings" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'audio-comparisons' AND (storage.foldername(name))[1] = auth.uid()::text);