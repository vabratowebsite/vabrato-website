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
  /** Usage of the attempt that produced the answer (the API's top-level usage). */
  usage: Usage;
  /**
   * Every attempt the API ran and may bill, from `usage.iterations`: with
   * the server-side fallback, a declined attempt can be billed as well as the
   * one that answered. Absent when the API reports a single attempt.
   */
  attempts?: { model: string; usage: Usage }[];
}

/** "too_large": the request (usually a PDF) has too many pages or is too big for the model. */
export type ModelErrorKind = "rate_limited" | "overloaded" | "bad_request" | "too_large" | "auth" | "network" | "other";

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
