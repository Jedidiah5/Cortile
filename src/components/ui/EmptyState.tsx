export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  );
}
