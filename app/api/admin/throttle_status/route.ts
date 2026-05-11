import { NextRequest, NextResponse } from "next/server";

// Sync with throttle/route.ts (ideally shared in DB)
export async function GET(req: NextRequest) {
  return NextResponse.json({ throttle_mode: "normal" });
}
