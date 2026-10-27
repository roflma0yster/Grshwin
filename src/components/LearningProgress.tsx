import { Progress } from "@/components/ui/progress";

export function LearningProgress({ value, label }: { value: number; label: string }) {
  return <div className="mb-8 max-w-md space-y-2"><p className="text-sm text-muted-foreground">{label}</p><Progress value={value} className="h-1.5" /></div>;
}