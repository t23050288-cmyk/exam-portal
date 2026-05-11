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
 * Returns { id, studentId, branch } or null.
 * Tries multiple column lookups since the students table schema varies.
 */
export async function getStudentFromRequest(
  authHeader: string | null
): Promise<{ id: string; studentId: string; branch: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const studentId = verifyToken(token);
  if (!studentId) return null;

  // Try multiple column lookups since schema may use 'id', 'student_id', or 'usn'
  // Try 1: by id (Supabase auto-generated UUID)
  const { data: d1 } = await supabaseAdmin
    .from("students")
    .select("id, branch, usn")
    .eq("id", studentId)
    .maybeSingle();
  if (d1) return { id: d1.id, studentId: d1.usn, branch: d1.branch || "CS" };

  // Try 2: by student_id (if column exists)
  const { data: d2 } = await supabaseAdmin
    .from("students")
    .select("id, branch, usn")
    .eq("student_id", studentId)
    .maybeSingle();
  if (d2) return { id: d2.id, studentId: d2.usn, branch: d2.branch || "CS" };

  // Try 3: by USN (the token sub might be the USN itself)
  const { data: d3 } = await supabaseAdmin
    .from("students")
    .select("id, branch, usn")
    .eq("usn", studentId)
    .maybeSingle();
  if (d3) return { id: d3.id, studentId: d3.usn, branch: d3.branch || "CS" };

  // Try 4: by USN uppercase
  const { data: d4 } = await supabaseAdmin
    .from("students")
    .select("id, branch, usn")
    .eq("usn", studentId.toUpperCase())
    .maybeSingle();
  if (d4) return { id: d4.id, studentId: d4.usn, branch: d4.branch || "CS" };

  // If all lookups fail, still return with default branch so questions load
  console.warn(`[AUTH] Could not find student '${studentId}' in DB, using fallback info`);
  return { id: studentId, studentId: studentId, branch: "CS" };
}
