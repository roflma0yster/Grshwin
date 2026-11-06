/** Audio-relative transition times, including pickup and variable-length bars. */
export function barTransitions(starts: number[], first: number, last: number, tempo: number) {
  const origin = starts[first];
  if (origin === undefined || tempo <= 0) return [];
  return starts.slice(first, last).map((start, index) => ({ bar: first + index + 1, seconds: (start - origin) * 60 / tempo }));
}

export type FollowEvent = "start" | "manual" | "resume" | "stop";
export function followSuspended(suspended: boolean, event: FollowEvent) {
  return event === "manual" ? true : event === "stop" ? suspended : false;
}

/** Return a scroll delta only when a bar is near/outside the readable viewport. */
export function followDelta(start: number, end: number, visibleStart: number, visibleEnd: number) {
  const margin = Math.min(48, (visibleEnd - visibleStart) / 8);
  if (start < visibleStart + margin || end > visibleEnd - margin) return start - visibleStart - margin;
  return 0;
}