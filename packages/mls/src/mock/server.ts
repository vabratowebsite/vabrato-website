import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createMockHandler, MOCK_BASE_PATH, MOCK_CLIENT_ID, MOCK_TOKEN_PATH, type MockHandler, type MockOptions } from "./handler";

// HTTP adapter for the mock RESO API, for local development and for testing
// the client over a real socket. Listens on 127.0.0.1 only.

export interface RunningMock {
  server: Server;
  handler: MockHandler;
  origin: string;
  baseUrl: string;
  tokenUrl: string;
  close(): Promise<void>;
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
  return new Request(new URL(req.url ?? "/", origin), { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
}

export async function startMockServer(port = 0, opts: MockOptions = {}): Promise<RunningMock> {
  let origin = "";
  let handler: MockHandler | null = null;
  const server = createServer((req, res) => {
    toRequest(req, origin)
      .then((r) => handler!(r))
      .then((r) => send(res, r))
      .catch(() => {
        res.statusCode = 500;
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Mock server has no port");
  origin = `http://127.0.0.1:${addr.port}`;
  handler = createMockHandler({ ...opts, publicOrigin: opts.publicOrigin ?? origin });
  return {
    server,
    handler,
    origin,
    baseUrl: origin + MOCK_BASE_PATH,
    tokenUrl: origin + MOCK_TOKEN_PATH,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

// `pnpm --filter @vabrato/mls mock` (PORT defaults to 4010).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT ?? 4010);
  startMockServer(port).then((m) => {
    console.log(`Mock MLSListings RESO API (fictional data) on ${m.baseUrl}`);
    console.log(`Token: POST ${m.tokenUrl} (client_id=${MOCK_CLIENT_ID}, secret: see MOCK_CLIENT_SECRET in src/mock/handler.ts)`);
  });
}
