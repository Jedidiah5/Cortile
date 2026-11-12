"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

/** Relative times can differ by a minute across SSR/client — suppress that noise. */
export function RelativeTime({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  const label = formatRelativeTime(iso);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
