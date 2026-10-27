import { pageHead } from "@/lib/head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LEVELS } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => pageHead("Set up your practice — KeyCoach", "Tell KeyCoach about your playing."),
  component: Onboarding,
});

type Opt = { value: string; desc?: string };
const STEPS: { key: string; title: string; options: Opt[] }[] = [
  { key: "genre", title: "What do you love playing?", options: ["Classical", "Jazz", "Blues", "Pop"].map((value) => ({ value })) },
  { key: "proficiency", title: "Where are you now?", options: LEVELS },
  { key: "goal", title: "What's your goal?", options: [{ value: "Fun", desc: "Enjoy playing pieces you like." }, { value: "Exam prep", desc: "Prepare for a graded exam." }, { value: "Performance", desc: "Polish pieces to perform." }] },
  { key: "daily_minutes", title: "Daily practice time", options: ["15", "30", "45", "60"].map((value) => ({ value, desc: `${value} minutes` })) },
  { key: "input_method", title: "How will you play along?", options: [{ value: "Acoustic", desc: "Acoustic piano — uses your microphone." }, { value: "Digital", desc: "Digital piano — connects via MIDI." }] },
];

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const s = STEPS[step]!;

  async function finish() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({
      id: u.user!.id,
      genre: answers["genre"] ?? null,
      proficiency: answers["proficiency"] ?? null,
      goal: answers["goal"] ?? null,
      daily_minutes: Number(answers["daily_minutes"]),
      input_method: answers["input_method"] ?? null,
      onboarded: true,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    navigate({ to: "/dashboard" });
  }

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
            <Button disabled={!answers[s.key] || saving} onClick={finish}>
              Start practising
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
