// Usage: npm run check:gemini -- [--generate | --full] [--url http://localhost:3000]
// Calls the app's /api/diagnostics endpoint and prints a readable, secret-free report.
// Against a deployment (or `next start`), set DIAGNOSTICS_TOKEN (the same value as on the server).
const args = process.argv.slice(2);
const mode = args.includes("--full") ? "full" : args.includes("--generate") ? "generate" : "models";
const urlArg = args.indexOf("--url");
const base = (urlArg >= 0 ? args[urlArg + 1] : process.env.APP_URL) ?? "http://localhost:3000";
const token = process.env.DIAGNOSTICS_TOKEN;

try {
  const res = await fetch(`${base}/api/diagnostics?mode=${mode}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 404) {
    console.error("Diagnostics are disabled here. Run `npm run dev`, or set DIAGNOSTICS_TOKEN on the server and in this shell.");
    process.exit(2);
  }
  const report = await res.json();
  const icon = { pass: "PASS", warn: "WARN", fail: "FAIL", skipped: "SKIP" };
  console.log(`Gemini diagnostics (${report.mode}) — model: ${report.model}`);
  for (const c of report.checks) console.log(`  [${icon[c.status]}] ${c.title}${c.code ? ` (${c.code})` : ""}\n         ${c.detail}`);
  console.log(`\nGemini answered during this run: ${report.receivedGeminiResponse ? "yes" : "NO"}  |  generateContent requests used: ${report.generateRequests}`);
  console.log(report.ok ? "Result: OK" : "Result: NOT OK");
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  console.error(`Could not reach ${base}: ${error instanceof Error ? error.message : "unknown error"}. Is the app running?`);
  process.exit(2);
}
