/**
 * Pyodide Web Worker
 * Runs Python code in the browser via WebAssembly — zero server cost.
 * 
 * Message protocol:
 *   IN:  { type: "run", code, testCases, questionId, timeoutMs }
 *   OUT: { type: "result", questionId, results, passedCount, totalCount, stdout, error }
 *   OUT: { type: "ready" }
 *   OUT: { type: "loading" }
 *   OUT: { type: "error", message }
 */

let pyodideReady = false;
let pyodide = null;

async function loadPyodideInstance() {
  self.postMessage({ type: "loading" });
  try {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js");
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
    });
    pyodideReady = true;
    self.postMessage({ type: "ready" });
  } catch (e) {
    self.postMessage({ type: "error", message: "Failed to load Pyodide: " + e.message });
  }
}

loadPyodideInstance();

self.onmessage = async function (e) {
  const { type, code, testCases, questionId, timeoutMs = 10000 } = e.data;

  if (type !== "run") return;

  if (!pyodideReady || !pyodide) {
    self.postMessage({ type: "error", message: "Pyodide not ready yet. Please wait.", questionId });
    return;
  }

  const results = [];
  let totalStdout = "";

  for (const tc of testCases) {
    const { input, expected_output, is_hidden, description } = tc;

    // Wrap user code to capture stdout and inject input()
    const wrappedCode = `
import sys
import io

_input_data = ${JSON.stringify(String(input))}
_input_lines = _input_data.split("\\n")
_input_idx = 0

def _mock_input(prompt=""):
    global _input_idx
    if _input_idx < len(_input_lines):
        val = _input_lines[_input_idx]
        _input_idx += 1
        return val
    return ""

sys.stdin = io.StringIO(_input_data)
_stdout_capture = io.StringIO()
sys.stdout = _stdout_capture

# Override built-in input
import builtins
builtins.input = _mock_input

try:
${code.split("\n").map(l => "    " + l).join("\n")}
except SystemExit:
    pass
except Exception as _exec_err:
    print(f"Error: {_exec_err}", file=_stdout_capture)

sys.stdout = sys.__stdout__
_output = _stdout_capture.getvalue().strip()
`;

    let actualOutput = "";
    let passed = false;
    let runtimeError = null;

    try {
      await pyodide.runPythonAsync(wrappedCode);
      actualOutput = pyodide.globals.get("_output") || "";
      const expectedTrimmed = String(expected_output || "").trim();
      passed = actualOutput.trim() === expectedTrimmed;
      totalStdout += actualOutput + "\n";
    } catch (err) {
      actualOutput = "Runtime Error: " + err.message;
      runtimeError = err.message;
      passed = false;
    }

    results.push({
      input: is_hidden ? "[hidden]" : input,
      expected: is_hidden ? "[hidden]" : expected_output,
      actual: is_hidden ? (passed ? "✓ Passed" : "✗ Failed") : actualOutput,
      passed,
      description: description || null,
      error: runtimeError,
    });
  }

  const passedCount = results.filter(r => r.passed).length;

  self.postMessage({
    type: "result",
    questionId,
    results,
    passedCount,
    totalCount: testCases.length,
    stdout: totalStdout.trim(),
    error: null,
  });
};
