"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function AITestTool() {
  const [prompt, setPrompt] = useState("Write a Python function that returns the square of a number.");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const testProctor = async () => {
    setLoading(true);
    setError(null);
    setResponse("");
    setLatency(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/ai/proctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      const data = await res.json();
      setLatency(Math.round(performance.now() - t0));
      if (!res.ok || data.error) {
        setError(`${res.status} — ${data.error || data.detail || JSON.stringify(data)}`);
      } else {
        setResponse(data.choices?.[0]?.message?.content || JSON.stringify(data));
      }
    } catch (err: any) {
      setLatency(Math.round(performance.now() - t0));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testCodeChecker = async () => {
    setLoading(true);
    setError(null);
    setResponse("");
    setLatency(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/ai/check-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_title: "Test: Square Function",
          problem_description: "Write a function square(n) that returns n*n",
          code: "def square(n):\n    return n * n",
          test_cases: [
            { input: "5", expected: "25" },
            { input: "3", expected: "9" },
          ],
          round_num: 3,
        }),
      });

      const data = await res.json();
      setLatency(Math.round(performance.now() - t0));
      if (!res.ok || data.error) {
        setError(`${res.status} — ${data.error || data.detail || JSON.stringify(data)}`);
      } else {
        setResponse(
          `✅ correct: ${data.correct}\n📊 Score: ${data.score}/10\n📋 Status: ${data.status}\n💬 Feedback: ${data.feedback}\n🐛 Errors: ${data.errors || "None"}`
        );
      }
    } catch (err: any) {
      setLatency(Math.round(performance.now() - t0));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="ai-prompt" style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Test Prompt (for Proctor)</label>
        <textarea
          id="ai-prompt"
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 12,
            color: "#fff",
            fontSize: 14,
            outline: "none",
            minHeight: 80,
          }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={testProctor}
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px 24px",
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            boxShadow: "0 4px 15px rgba(139, 92, 246, 0.3)",
          }}
        >
          {loading ? "⟳ Testing..." : "🧠 Test Proctor AI"}
        </button>
        <button
          onClick={testCodeChecker}
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px 24px",
            background: "linear-gradient(135deg, #10b981, #059669)",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            boxShadow: "0 4px 15px rgba(16, 185, 129, 0.3)",
          }}
        >
          {loading ? "⟳ Testing..." : "🐍 Test Code Checker"}
        </button>
      </div>

      <AnimatePresence>
        {(response || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: 16,
              background: error ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${error ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: error ? "#f87171" : "#34d399", textTransform: "uppercase" }}>
                {error ? "❌ Test Failed" : "✅ Success — AI Response"}
              </div>
              {latency !== null && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                  {latency}ms
                </div>
              )}
            </div>
            <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}>
              {error || response}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
