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

async function sbUpsert(table: string, data: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert ${table} failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { round_id, user_id, total_clues } = await req.json();

    if (!round_id || !user_id) {
      return NextResponse.json({ error: "round_id and user_id required" }, { status: 400 });
    }

    // 1. Atomic rank assignment via Supabase RPC
    const rank: number = await sbRpc("get_strict_rank", {
      p_round_id: round_id,
      p_user_id: user_id,
    });

    if (!rank || typeof rank !== "number") {
      throw new Error(`Invalid rank from RPC: ${rank}`);
    }

    // 2. Calculate clue index with round-robin + divergent path
    const numClues = total_clues || 4;
    const baseIndex = (rank - 1) % numClues;
    // Odd rounds: forward orbit (0,1,2,3). Even rounds: reverse orbit (3,2,1,0)
    const clueIndex = round_id % 2 === 0
      ? numClues - 1 - baseIndex
      : baseIndex;

    // 3. Persist rank to pyhunt_progress
    await sbUpsert("pyhunt_progress", {
      student_id: user_id,
      round1_rank: rank,
      last_active: new Date().toISOString(),
    });

    console.log(`[complete-round] round=${round_id}, user=${user_id}, rank=${rank}, clue_index=${clueIndex}/${numClues}`);

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
