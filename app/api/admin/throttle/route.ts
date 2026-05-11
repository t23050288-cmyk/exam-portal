import { NextRequest, NextResponse } from "next/server";

// In-memory mock for throttle mode (resets on server restart, but good for demo)
// In production, this would be in a DB table like 'app_settings'
let currentThrottleMode = "normal";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

function checkAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret") || "";
  return secret === ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ throttle_mode: currentThrottleMode });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { mode } = await req.json();
    if (!["normal", "safe", "emergency"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    currentThrottleMode = mode;
    return NextResponse.json({ success: true, throttle_mode: currentThrottleMode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
