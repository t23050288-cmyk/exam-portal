import { NextRequest, NextResponse } from "next/server";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

// Cloudinary config from environment
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const API_KEY = process.env.CLOUDINARY_API_KEY || "";
const API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

function checkAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret") || "";
  return secret === ADMIN_SECRET;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // If Cloudinary is configured, use it
    if (CLOUD_NAME && API_KEY && API_SECRET) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString("base64");
      const dataUri = `data:${file.type};base64,${base64}`;

      // Generate signature for unsigned upload
      const timestamp = Math.floor(Date.now() / 1000);
      const crypto = await import("crypto");
      const signature = crypto
        .createHash("sha1")
        .update(`folder=exam-portal&timestamp=${timestamp}${API_SECRET}`)
        .digest("hex");

      const cloudForm = new FormData();
      cloudForm.append("file", dataUri);
      cloudForm.append("api_key", API_KEY);
      cloudForm.append("timestamp", timestamp.toString());
      cloudForm.append("signature", signature);
      cloudForm.append("folder", "exam-portal");

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: cloudForm }
      );

      if (!cloudRes.ok) {
        const errText = await cloudRes.text();
        console.error("[Upload] Cloudinary error:", errText);
        return NextResponse.json({ error: "Cloudinary upload failed" }, { status: 500 });
      }

      const result = await cloudRes.json();
      return NextResponse.json({
        url: result.secure_url,
        public_id: result.public_id,
      });
    }

    // Fallback: use Supabase Storage
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ext = file.name.split(".").pop() || "png";
    const fileName = `question_${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("exam-assets")
      .upload(fileName, bytes, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Upload] Supabase storage error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("exam-assets")
      .getPublicUrl(fileName);

    return NextResponse.json({
      url: urlData.publicUrl,
      public_id: fileName,
    });
  } catch (err: any) {
    console.error("[Upload] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Note: bodyParser config handled by Next.js App Router automatically

