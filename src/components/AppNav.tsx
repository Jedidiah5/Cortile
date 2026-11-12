import Link from "next/link";
import { CortileLogo } from "@/components/CortileLogo";

const links = [
  { href: "/inbox", label: "Inbox" },
  { href: "/resident", label: "Send as resident" },
  { href: "/insights", label: "Insights" },
] as const;

export function AppNav({ current }: { current: (typeof links)[number]["href"] }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/inbox" className="flex items-center" aria-label="Cortile home">
              <CortileLogo className="h-[18px] w-auto sm:h-5" />
            </Link>
            <nav className="flex items-center gap-1">
              {links.map((link) => {
                const active = current === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-panel hover:text-foreground"
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
      {/* Offset page content under the fixed bar */}
      <div className="h-14 shrink-0" aria-hidden />
    </>
  );
}
