import Link from "next/link";

const links = [
  { href: "/inbox", label: "Inbox" },
  { href: "/resident", label: "Send as resident" },
  { href: "/insights", label: "Insights" },
] as const;

export function AppNav({ current }: { current: (typeof links)[number]["href"] }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/inbox" className="text-sm font-semibold tracking-tight text-foreground">
            Cortile
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = current === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-stone-100 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <p className="hidden text-sm text-muted sm:block">Priya · demo</p>
      </div>
    </header>
  );
}
