/**
 * Shared auth helper for API routes — verifies JWT tokens.
 */
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const JWT_SECRET = process.env.JWT_SECRET || "examguard-super-secret-jwt-2024";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

/**
 * Verify a JWT token and return the student_id (sub claim).
 * Returns null if invalid or expired.
 */
export function verifyToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSig) return null;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return decoded.sub || null;
  } catch {
    return null;
  }
}

/**
 * Extract and verify student from Authorization header.
 * Returns { studentId, branch } or null.
 */
export async function getStudentFromRequest(
  authHeader: string | null
): Promise<{ studentId: string; branch: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const studentId = verifyToken(token);
  if (!studentId) return null;

  // Fetch branch from students table
  const { data } = await supabaseAdmin
    .from("students")
    .select("branch")
    .eq("student_id", studentId)
    .maybeSingle();

  // Also try by USN if student_id didn't match
  if (!data) {
    const { data: data2 } = await supabaseAdmin
      .from("students")
      .select("branch")
      .eq("usn", studentId)
      .maybeSingle();
    return { studentId, branch: data2?.branch || "CS" };
  }

  return { studentId, branch: data?.branch || "CS" };
}
