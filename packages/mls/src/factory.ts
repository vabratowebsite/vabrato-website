import { createResoClient, type ResoClient, type ResoClientOptions } from "./client/client";
import type { MlsConfig } from "./config";
import { createMockFetch, MOCK_ORIGIN } from "./mock/fetch";
import { createMockHandler, MOCK_BASE_PATH, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_TOKEN_PATH, type MockHandler } from "./mock/handler";

// Picks the transport from MLS_MODE. mock: the in-process mock API with
// fictional fixtures (no network). live: MLSListings with OAuth2 client
// credentials from the environment.

export function createClientFromConfig(
  cfg: MlsConfig,
  overrides: Partial<ResoClientOptions> & { mock?: MockHandler } = {},
): { client: ResoClient; mock: MockHandler | null } {
  const { mock: mockOverride, ...rest } = overrides;
  if (cfg.mode === "mock") {
    const mock = mockOverride ?? createMockHandler();
    const client = createResoClient({
      baseUrl: MOCK_ORIGIN + MOCK_BASE_PATH,
      fetch: createMockFetch(mock),
      auth: { tokenUrl: MOCK_ORIGIN + MOCK_TOKEN_PATH, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET },
      rateLimitPerSec: cfg.rateLimitPerSec,
      ...rest,
    });
    return { client, mock };
  }
  const client = createResoClient({
    baseUrl: cfg.apiBaseUrl,
    auth: { tokenUrl: cfg.tokenUrl, clientId: cfg.clientId, clientSecret: cfg.clientSecret },
    rateLimitPerSec: cfg.rateLimitPerSec,
    ...rest,
  });
  return { client, mock: null };
}
