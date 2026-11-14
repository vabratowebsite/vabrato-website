// Local QA only: stands in for Google (sign-in consent, tokens, revoke,
// userinfo and the primary calendar's events) so the console's Google
// Calendar connection can be checked end to end without a Google account,
// an OAuth client or any event leaving the machine (Integrations PR 1).
//
//   node --experimental-strip-types scripts/qa/fake-google.mjs <log file>
//
// Start apps/va with GOOGLE_ACCOUNTS_BASE_URL, GOOGLE_OAUTH_BASE_URL and
// GOOGLE_API_BASE_URL set to http://127.0.0.1:4030, and any client id,
// secret and a 32-byte INTEGRATIONS_TOKEN_KEY. The consent page approves at
// once. The log gets one JSON line per request with its method, path and
// status only. GET /__fake/events lists the events; POST /__fake/revoke-all
// simulates the person removing the console's access in their Google account;
// POST /__fake/account?email=…&verified=false sets the next account.

import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createFakeGoogle } from "../../packages/lib/src/integrations/fake-google.ts";

const LOG = process.argv[2];
if (!LOG) throw new Error("usage: node --experimental-strip-types fake-google.mjs <log file>");
writeFileSync(LOG, "");
const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 4030);
const google = createFakeGoogle({ email: process.env.FAKE_GOOGLE_EMAIL ?? "qa-agent@example.test" });

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers: req.headers, body });
  const answer = await google.handle(request);
  const last = google.log.at(-1);
  if (last) appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...last })}\n`);
  res.writeHead(answer.status, Object.fromEntries(answer.headers));
  res.end(Buffer.from(await answer.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`fake Google on http://127.0.0.1:${PORT}`));
