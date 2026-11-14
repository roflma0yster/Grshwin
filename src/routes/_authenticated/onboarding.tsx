import { pageHead } from "@/lib/head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LEVELS, profileQuery } from "@/lib/data";
import { DAILY_MINUTES, GENRES, GOALS, INPUT_METHODS, ONBOARDING_DEFAULTS, answersFromProfile, profilePayload } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => pageHead("Set up your practice — Grshwin", "Tell Grshwin about your playing."),
  component: Onboarding,
});

type Opt = { value: string; desc?: string };
const GOAL_DESC: Record<string, string> = { Fun: "Enjoy playing pieces you like.", "Exam prep": "Prepare for a graded exam.", Performance: "Polish pieces to perform." };
const INPUT_DESC: Record<string, string> = { Acoustic: "Acoustic piano — uses your microphone.", Digital: "Digital piano — connects via MIDI." };
const STEPS: { key: string; title: string; options: Opt[] }[] = [
  { key: "genre", title: "What do you love playing?", options: GENRES.map((value) => ({ value })) },
  { key: "proficiency", title: "Where are you now?", options: LEVELS },
  { key: "goal", title: "What's your goal?", options: GOALS.map((value) => ({ value, desc: GOAL_DESC[value] })) },
  { key: "daily_minutes", title: "Daily practice time", options: DAILY_MINUTES.map((m) => ({ value: String(m), desc: `${m} minutes` })) },
  { key: "input_method", title: "How will you play along?", options: INPUT_METHODS.map((value) => ({ value, desc: INPUT_DESC[value] })) },
];

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: profile, isLoading: profileLoading } = useQuery(profileQuery);
  const seeded = useRef(false);
  const s = STEPS[step]!;
  // Coming back later: start from what is already saved, so nothing is lost by skipping or changing one answer.
  useEffect(() => {
    if (profile && !seeded.current) { seeded.current = true; setAnswers((given) => ({ ...answersFromProfile(profile), ...given })); }
  }, [profile]);
  const returning = !!profile?.onboarded;

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    // Any question left unanswered gets its default, so skipping always saves a complete profile.
    const { error } = await supabase.from("profiles").upsert(profilePayload(u.user!.id, answers));
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    navigate({ to: "/dashboard" });
  }
  const finish = save;
  // First visit: skip saves the defaults. Returning: nothing is saved, just go back.
  function skip() { if (returning) navigate({ to: "/dashboard" }); else void save(); }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full bg-muted", i <= step && "bg-primary")} />
          ))}
        </div>
        <h1 className="font-display text-3xl">{s.title}</h1>
        <div className="mt-6 grid gap-3">
          {s.options.map((o) => (
            <button
              key={o.value}
              onClick={() => setAnswers({ ...answers, [s.key]: o.value })}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary",
                answers[s.key] === o.value && "border-primary bg-accent",
              )}
            >
              <div className="font-semibold">{s.key === "daily_minutes" ? `${o.value} min` : o.value}</div>
              {o.desc && s.key !== "daily_minutes" && <div className="mt-0.5 text-sm text-muted-foreground">{o.desc}</div>}
            </button>
          ))}
        </div>
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!answers[s.key]} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button disabled={!answers[s.key] || saving || profileLoading} onClick={finish}>
              Start practicing
            </Button>
          )}
        </div>
        <div className="mt-6 text-center">
          <Button variant="link" disabled={saving || profileLoading} onClick={skip}>{returning ? "Cancel" : "Skip for now"}</Button>
          {!returning && <p className="mt-1 text-xs text-muted-foreground">We'll use standard settings ({ONBOARDING_DEFAULTS.proficiency}, {ONBOARDING_DEFAULTS.genre}, {ONBOARDING_DEFAULTS.daily_minutes} minutes a day) for anything you haven't answered. You can change them any time from your dashboard.</p>}
        </div>
      </div>
    </div>
  );
}
