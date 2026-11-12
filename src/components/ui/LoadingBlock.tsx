export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent"
          aria-hidden
        />
        {label}
      </div>
    </div>
  );
}
