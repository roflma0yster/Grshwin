export function MicLevelMeter({ level }: { level: number }) {
  return <div className="my-3"><label className="text-sm text-muted-foreground" htmlFor="mic-level">Microphone level</label><meter id="mic-level" aria-label="Microphone level" className="block h-4 w-full" min={0} max={1} value={Math.min(1, level * 8)} /></div>;
}