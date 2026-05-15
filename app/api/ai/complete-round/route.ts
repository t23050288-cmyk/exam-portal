/**
 * /api/ai/complete-round — Atomically assign a rank for a student completing a round.
 * Uses Supabase RPC get_strict_rank for race-condition-free rank assignment.
 * Returns: { rank: number, clue_index: number }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function sbRpc(fn: string, params: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase RPC ${fn} failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function sbPatchRank(userId: string, rank: number) {
  // Only PATCH the round1_rank field — avoids NOT NULL constraint on student_name etc.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pyhunt_progress?student_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        round1_rank: rank,
        last_active: new Date().toISOString(),
      }),
    }
  );
  // PATCH on missing row returns 204 with no body — that's fine, rank is in DB via RPC insert
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    console.warn(`[complete-round] PATCH rank warning: ${res.status} ${err}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { round_id, user_id, total_clues } = await req.json();

    if (!round_id || !user_id) {
      return NextResponse.json({ error: "round_id and user_id required" }, { status: 400 });
    }

    // 1. Atomic rank assignment via Supabase RPC (inserts into round_submissions)
    const rank: number = await sbRpc("get_strict_rank", {
      p_round_id: round_id,
      p_user_id: user_id,
    });

    if (!rank || typeof rank !== "number") {
      throw new Error(`Invalid rank from RPC: ${rank}`);
    }

    // 2. Calculate clue index with round-robin + divergent path
    const numClues = total_clues && total_clues > 0 ? total_clues : 4;
    const baseIndex = (rank - 1) % numClues;
    // Odd rounds (1,3): forward orbit 0→1→2→3. Even rounds (2,4): reverse 3→2→1→0
    const clueIndex = round_id % 2 === 0
      ? numClues - 1 - baseIndex
      : baseIndex;

    // 3. Persist rank — only PATCH existing row to avoid NOT NULL constraint issues
    await sbPatchRank(user_id, rank);

    console.log(`[complete-round] round=${round_id}, user=${user_id.slice(0,8)}, rank=${rank}, clue_index=${clueIndex}/${numClues}`);

    return NextResponse.json({
      status: "Success",
      rank,
      clue_index: clueIndex,
      total_clues: numClues,
    });
  } catch (err: any) {
    console.error("[complete-round] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
