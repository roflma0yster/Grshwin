import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, INSTRUMENT_STORAGE_KEY, resolveInstrumentId, type InstrumentId } from "@/lib/instruments";

/** The player's chosen sound, remembered on this device. Starts at the default so server rendering matches. */
export function useInstrumentChoice() {
  const [id, setId] = useState<InstrumentId>(DEFAULT_INSTRUMENT_ID);
  useEffect(() => {
    try { setId(resolveInstrumentId(window.localStorage.getItem(INSTRUMENT_STORAGE_KEY))); } catch { /* storage blocked: keep the default */ }
  }, []);
  const choose = useCallback((next: InstrumentId) => {
    setId(next);
    try { window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, next); } catch { /* not remembered, still works */ }
  }, []);
  return [id, choose] as const;
}

/**
 * Stays usable during playback: the sound changes the next time Play is pressed,
 * and the hint says so (rebuilding a voice mid-schedule could drop or hang notes).
 */
export function InstrumentSelect({ value, onChange, playingInstrument }: { value: InstrumentId; onChange: (id: InstrumentId) => void; playingInstrument: InstrumentId | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Label htmlFor="instrument">Sound</Label>
      <Select value={value} onValueChange={(v) => onChange(resolveInstrumentId(v))}>
        <SelectTrigger id="instrument" aria-label="Instrument sound" className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{INSTRUMENTS.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
      {playingInstrument !== null && playingInstrument !== value && <span role="status" className="text-xs text-muted-foreground">Applies the next time you press Play</span>}
    </div>
  );
}
