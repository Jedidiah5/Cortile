import { NextResponse } from "next/server";

/** When DEMO_READ_ONLY=true, block mutating API routes on the public demo. */
export function demoReadOnlyResponse(): NextResponse | null {
  if (process.env.DEMO_READ_ONLY === "true") {
    return NextResponse.json(
      { error: "Demo is read-only" },
      { status: 403 },
    );
  }
  return null;
}
