"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

/** Subscribe to messages + incidents for a building; refresh the inbox on change. */
export function useInboxRealtime(buildingId: string | undefined) {
  const router = useRouter();

  useEffect(() => {
    if (!buildingId) return;

    const supabase = createBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 200);
    };

    const channel = supabase
      .channel(`inbox:${buildingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `building_id=eq.${buildingId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incidents",
          filter: `building_id=eq.${buildingId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [buildingId, router]);
}
