import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/auth";

/**
 * POST /api/exam/batch-events
 * Batch telemetry events (acknowledgment).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
