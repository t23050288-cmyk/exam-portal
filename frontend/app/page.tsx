"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = sessionStorage.getItem("exam_token");
    if (token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="page-center">
      <div className="skeleton" style={{ width: 64, height: 64, borderRadius: "50%" }} />
    </div>
  );
}
