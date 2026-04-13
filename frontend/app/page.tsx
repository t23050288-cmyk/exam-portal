"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = sessionStorage.getItem("exam_token");
    if (token) {
      router.replace("/exam");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="page-center">
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );
}
