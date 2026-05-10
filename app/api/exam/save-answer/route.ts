import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest } from "@/lib/auth";

/**
 * POST /api/exam/save-answer
 * Saves a single answer (no-op acknowledgment for now, answers saved in batch on submit).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // Acknowledge receipt — actual scoring happens at submit time
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
