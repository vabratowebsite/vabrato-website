import type { Usage } from "./models";

// What the pipeline needs from a model, with nothing Anthropic-specific in
// it: the real client is in ./anthropic.ts, tests use ./testing.ts.

export type Effort = "low" | "medium" | "high";

export type ModelPart =
  | { type: "text"; text: string }
  /** A PDF, base64. With `citations`, the answer carries page references. */
  | { type: "pdf"; data: string; title: string; citations?: boolean }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

export interface ModelRequest {
  system: string;
  parts: ModelPart[];
  effort: Effort;
  maxTokens: number;
  /** Ask for JSON matching this schema. Can't be combined with citations. */
  jsonSchema?: Record<string, unknown>;
}

export interface Citation {
  /** The quoted passage. */
  text: string;
  document: string | null;
  startPage: number;
  endPage: number;
}

export interface ModelResult {
  text: string;
  citations: Citation[];
  stop: "end" | "max_tokens" | "refusal" | "other";
  /** The model that answered (the fallback model after a decline). */
  model: string;
  usage: Usage;
}

export type ModelErrorKind = "rate_limited" | "overloaded" | "bad_request" | "auth" | "network" | "other";

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export interface ModelClient {
  generate(req: ModelRequest): Promise<ModelResult>;
}
