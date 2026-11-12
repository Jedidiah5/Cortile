import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { draftQuestionReply } from "@/lib/pipeline/draft";
import { demoReadOnlyResponse } from "@/lib/demoGuard";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const readOnly = demoReadOnlyResponse();
  if (readOnly) return readOnly;

  const limited = rateLimit(`suggest:${clientIp(req)}`, 5);
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `Too many suggestions — try again in ${limited.retryAfterSec}s`,
      },
      { status: 429 },
    );
  }

  const { id } = await params;
  const supabase = createServiceClient();

  try {
    const result = await draftQuestionReply(supabase, id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggest failed" },
      { status: 500 },
    );
  }
}
