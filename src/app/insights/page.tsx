import { AppNav } from "@/components/AppNav";

export default function InsightsPage() {
  return (
    <>
      <AppNav current="/insights" />
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
        Insights arrive in Phase 6.
      </main>
    </>
  );
}
