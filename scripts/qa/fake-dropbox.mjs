// Local QA only: stands in for Dropbox (consent, tokens, revoke, the current
// account, listing the app folder and downloads) so the console's Dropbox
// import can be checked end to end without a Dropbox account or app, and
// without any file leaving the machine (Integrations PR 2).
//
//   node --experimental-strip-types --import ./scripts/qa/ts-resolve.mjs scripts/qa/fake-dropbox.mjs <log file>
//
// Start apps/va with DROPBOX_WWW_BASE_URL, DROPBOX_API_BASE_URL and
// DROPBOX_CONTENT_BASE_URL set to http://127.0.0.1:4040, any DROPBOX_APP_KEY
// and DROPBOX_APP_SECRET, and a 32-byte INTEGRATIONS_TOKEN_KEY. The consent
// page approves at once. The log gets one JSON line per request with its
// method, path and status only. POST /__fake/file?account=…&name=…&kind=pdf
// adds a fictional file; POST /__fake/revoke-all simulates the person
// removing the app; GET /__fake/grants counts live grants.

import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createFakeDropbox } from "../../packages/lib/src/integrations/fake-dropbox.ts";

const LOG = process.argv[2];
if (!LOG) throw new Error("usage: node --experimental-strip-types fake-dropbox.mjs <log file>");
writeFileSync(LOG, "");
const PORT = Number(process.env.FAKE_DROPBOX_PORT ?? 4040);
const dropbox = createFakeDropbox({ email: process.env.FAKE_DROPBOX_EMAIL ?? "qa-agent@example.test" });

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const answer = await dropbox.handle(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers: req.headers, body }));
  const last = dropbox.log.at(-1);
  if (last) appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...last })}\n`);
  res.writeHead(answer.status, Object.fromEntries(answer.headers));
  res.end(Buffer.from(await answer.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`fake Dropbox on http://127.0.0.1:${PORT}`));
