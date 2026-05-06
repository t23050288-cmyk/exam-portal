/**
 * pyodide-worker.js — v2
 * Hardened Pyodide Web Worker with:
 *  - SW-cached Pyodide (served from cache if available)
 *  - Warm-up on load (no cold start during exam)
 *  - Timeout per test case (default 10s)
 *  - stdin mocked (reads from test input)
 *  - stdout/stderr captured
 *  - Structured result messages
 */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js";

let pyodideInstance = null;
let pyodideLoading  = null;

async function loadPyodideOnce() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading)  return pyodideLoading;

  pyodideLoading = (async () => {
    // Dynamic import — SW cache intercepts the CDN fetch
    importScripts(PYODIDE_CDN);
    const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/" });
    pyodideInstance = pyodide;
    return pyodide;
  })();

  return pyodideLoading;
}

// Warm up immediately on worker creation
loadPyodideOnce().then(() => {
  postMessage({ type: "ready" });
}).catch((err) => {
  postMessage({ type: "error", message: "Pyodide failed to load: " + err.message });
});

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { id, code, testCases, timeLimitMs = 10_000 } = event.data;

  let pyodide;
  try {
    pyodide = await loadPyodideOnce();
  } catch (err) {
    postMessage({ id, type: "result", error: "Pyodide not available: " + err.message, results: [] });
    return;
  }

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const inputLines = (tc.input || "").split("\n").filter(Boolean);
    let inputIdx = 0;

    // Capture stdout / stderr
    let stdout = "";
    let stderr = "";

    pyodide.globals.set("_captured_stdout", "");
    pyodide.globals.set("_captured_stderr", "");

    // Override sys.stdout and input()
    const setup = `
import sys
import io
_stdout_buf = io.StringIO()
sys.stdout = _stdout_buf
_input_lines = ${JSON.stringify(inputLines)}
_input_idx   = [0]
def input(prompt=''):
    idx = _input_idx[0]
    if idx < len(_input_lines):
        _input_idx[0] += 1
        return _input_lines[idx]
    return ''
`;

    const teardown = `
sys.stdout.flush()
__output = _stdout_buf.getvalue()
`;

    // Run with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeLimitMs)
    );

    try {
      await Promise.race([
        (async () => {
          await pyodide.runPythonAsync(setup);
          await pyodide.runPythonAsync(code);
          await pyodide.runPythonAsync(teardown);
          stdout = pyodide.globals.get("__output") || "";
        })(),
        timeoutPromise,
      ]);

      const actual   = stdout.trim();
      const expected = (tc.expected_output || "").trim();
      const passed   = actual === expected;

      results.push({
        index:       i,
        passed,
        actual_output:   tc.is_hidden ? (passed ? "[correct]" : "[incorrect]") : actual,
        expected_output: tc.is_hidden ? "[hidden]" : expected,
        description: tc.description || `Test ${i + 1}`,
        is_hidden:   tc.is_hidden || false,
        error:       null,
      });
    } catch (err) {
      results.push({
        index:       i,
        passed:      false,
        actual_output:   "",
        expected_output: tc.is_hidden ? "[hidden]" : (tc.expected_output || ""),
        description: tc.description || `Test ${i + 1}`,
        is_hidden:   tc.is_hidden || false,
        error:       err.message || "Runtime error",
      });
    }
  }

  postMessage({ id, type: "result", results, error: null });
};
