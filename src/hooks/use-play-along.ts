import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PLAY_ALONG, PLAY_ALONG_STORAGE_KEY, parsePlayAlongSettings, type PlayAlongSettings } from "@/lib/play-along";

/** Play-along and falling-notes settings, remembered on this device. Starts at the defaults so server rendering matches. */
export function usePlayAlongSettings() {
  const [settings, setSettings] = useState<PlayAlongSettings>(DEFAULT_PLAY_ALONG);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLAY_ALONG_STORAGE_KEY);
      if (raw) setSettings(parsePlayAlongSettings(JSON.parse(raw)));
    } catch { /* storage blocked or corrupt: keep the defaults */ }
  }, []);
  const update = useCallback((patch: Partial<PlayAlongSettings>) => {
    setSettings((previous) => {
      const next = parsePlayAlongSettings({ ...previous, ...patch });
      try { window.localStorage.setItem(PLAY_ALONG_STORAGE_KEY, JSON.stringify(next)); } catch { /* not remembered, still works */ }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
