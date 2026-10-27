CREATE POLICY "score owners read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "score owners upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "score owners delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);
ALTER TABLE public.user_pieces ADD COLUMN IF NOT EXISTS musicxml_content text;
ALTER TABLE public.user_pieces ADD CONSTRAINT user_piece_xml_size CHECK (musicxml_content IS NULL OR octet_length(musicxml_content) <= 5242880);