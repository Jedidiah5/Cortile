"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

/** Relative times can differ by a minute across SSR/client — suppress that noise. */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelativeTime(iso));

  useEffect(() => {
    setLabel(formatRelativeTime(iso));
    const id = window.setInterval(() => setLabel(formatRelativeTime(iso)), 60_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return <span suppressHydrationWarning>{label}</span>;
}
