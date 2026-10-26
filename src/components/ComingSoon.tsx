import { PageHeader } from "@/components/AppShell";

export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <p className="font-display text-xl">Coming soon</p>
        <p className="mt-2 text-muted-foreground">{text}</p>
      </div>
    </>
  );
}
