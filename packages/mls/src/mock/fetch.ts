import type { MockHandler } from "./handler";

/** In-process `fetch` backed by the mock handler: no network, same HTTP semantics. */
export function createMockFetch(handler: MockHandler): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    return handler(req);
  }) as typeof fetch;
}

/** Origin the in-process mock answers on (never resolved over the network). */
export const MOCK_ORIGIN = "https://mock.mls.invalid";
