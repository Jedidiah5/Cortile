import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { draftQuestionReply } from "@/lib/pipeline/draft";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
