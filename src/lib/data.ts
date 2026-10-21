import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Piece = Tables<"pieces">;

export type PlanDay = {
  day: string;
  focus: string;
  warmup: { title: string; details: string };
  drills: { title: string; details: string }[];
  pieceId: string;
  practiceSteps: { step: string; tempo: string }[];
  checklist: string[];
};
export type WeeklyPlan = { weekTheme: string; days: PlanDay[] };

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const piecesQuery = queryOptions({
  queryKey: ["pieces"],
  queryFn: async () => {
    const { data, error } = await supabase.from("pieces").select("*").order("difficulty").order("title");
    if (error) throw error;
    return data;
  },
});

export const latestPlanQuery = queryOptions({
  queryKey: ["plan", "latest"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("practice_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, plan: data.plan as unknown as WeeklyPlan } : null;
  },
});

export const sessionsQuery = queryOptions({
  queryKey: ["sessions"],
  queryFn: async () => {
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("practice_sessions")
      .select("*")
      .gte("session_date", since)
      .order("session_date", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export function todayIndex(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return ((diff % 7) + 7) % 7;
}

/** Consecutive days (ending today or yesterday) with logged practice. */
export function computeStreak(dates: string[], today = new Date()) {
  const set = new Set(dates);
  const d = new Date(today);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (set.has(key(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export const LEVELS = [
  { value: "Early Intermediate", desc: "Around Grade 4 — sonatinas, simple Baroque dances, both clefs comfortably." },
  { value: "Intermediate", desc: "Around Grade 5 — easier Chopin preludes, pedalling and voicing." },
  { value: "Upper Intermediate", desc: "Around Grade 6 — ragtime, faster passagework, wider dynamics." },
];
