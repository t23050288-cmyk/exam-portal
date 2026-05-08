/**
 * pyodide-worker.js — v3 (Fixed)
 * Supports BOTH message formats:
 *  1. { id, type:"run", code, stdin }  — used by pyhunt/page.tsx
 *  2. { id, testCases:[...], code }    — used by exam grading
 */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js";

let pyodideInstance = null;
let pyodideLoading  = null;

async function loadPyodideOnce() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading)  return pyodideLoading;

  pyodideLoading = (async () => {
    importScripts(PYODIDE_CDN);
    const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/" });
    pyodideInstance = pyodide;
    return pyodide;
  })();

  return pyodideLoading;
}

// Warm up immediately
loadPyodideOnce().then(() => {
  postMessage({ type: "ready" });
}).catch((err) => {
  postMessage({ type: "error", message: "Pyodide failed to load: " + err.message });
});

// ── Run a single code block, capturing stdout/stderr ──────────────────────
async function runSingle(pyodide, code, stdinLines, timeLimitMs = 15000) {
  const setup = `
import sys, io, builtins
_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
_input_lines = ${JSON.stringify(stdinLines)}
_input_idx = [0]
def input(prompt=''):
    idx = _input_idx[0]
    if idx < len(_input_lines):
        _input_idx[0] += 1
        return _input_lines[idx]
    return ''
builtins.input = input
`;
  const teardown = `
sys.stdout.flush()
sys.stderr.flush()
__out = _stdout_buf.getvalue()
__err = _stderr_buf.getvalue()
`;

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), timeLimitMs));

  let stdout = "", stderr = "";
  await Promise.race([
    (async () => {
      await pyodide.runPythonAsync(setup);
      await pyodide.runPythonAsync(code);
      await pyodide.runPythonAsync(teardown);
      stdout = pyodide.globals.get("__out") || "";
      stderr = pyodide.globals.get("__err") || "";
    })(),
    timeout,
  ]);
  return { stdout, stderr };
}

// ── Message handler ───────────────────────────────────────────────────────
self.onmessage = async (event) => {
  const msg = event.data;
  const { id } = msg;

  let pyodide;
  try {
    pyodide = await loadPyodideOnce();
  } catch (err) {
    postMessage({ id, type: "result", error: "Pyodide not available: " + err.message, results: [], stdout: "", stderr: "" });
    return;
  }

  // ── FORMAT 1: { type:"run", code, stdin } — used by pyhunt ──────────────
  if (msg.type === "run") {
    const stdinLines = (msg.stdin || "").split("\n").filter(Boolean);
    try {
      const { stdout, stderr } = await runSingle(pyodide, msg.code, stdinLines);
      postMessage({ id, type: "result", stdout, stderr, error: null });
    } catch (err) {
      // Try to capture partial output on error
      let stdout = "", stderr = "";
      try {
        const td = `
sys.stdout.flush(); sys.stderr.flush()
__out = _stdout_buf.getvalue() if '_stdout_buf' in dir() else ''
__err = _stderr_buf.getvalue() if '_stderr_buf' in dir() else ''
`;
        await pyodide.runPythonAsync(td);
        stdout = pyodide.globals.get("__out") || "";
        stderr = pyodide.globals.get("__err") || "";
      } catch {}
      postMessage({ id, type: "result", stdout, stderr: stderr || err.message, error: err.message });
    }
    return;
  }

  // ── FORMAT 2: { testCases:[...], code } — used by exam grading ───────────
  const testCases = msg.testCases || [];
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const inputLines = (tc.input || "").split("\n").filter(Boolean);
    try {
      const { stdout } = await runSingle(pyodide, msg.code, inputLines, msg.timeLimitMs || 10000);
      const actual = stdout.trim();
      const expected = (tc.expected_output || "").trim();
      const passed = actual === expected;
      results.push({
        index: i,
        passed,
        actual_output: tc.is_hidden ? (passed ? "[correct]" : "[incorrect]") : actual,
        expected_output: tc.is_hidden ? "[hidden]" : expected,
        description: tc.description || `Test ${i + 1}`,
        is_hidden: tc.is_hidden || false,
        error: null,
      });
    } catch (err) {
      results.push({
        index: i,
        passed: false,
        actual_output: "",
        expected_output: tc.is_hidden ? "[hidden]" : (tc.expected_output || ""),
        description: tc.description || `Test ${i + 1}`,
        is_hidden: tc.is_hidden || false,
        error: err.message || "Runtime error",
      });
    }
  }

  postMessage({ id, type: "result", results, error: null });
};
