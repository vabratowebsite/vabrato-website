import Anthropic from "@anthropic-ai/sdk";
import { ModelError, type Citation, type ModelClient, type ModelPart, type ModelRequest, type ModelResult } from "./client";
import { FALLBACK_MODEL, MODEL, type Usage } from "./models";

// The only file that talks to the Claude API (a guard test and ESLint keep it
// that way). Server-side only: the key comes from ANTHROPIC_API_KEY.
//
// Zero Data Retention: documents are sent inline with the request, never
// uploaded to the Files API, and no message threads are used.

type Block = Anthropic.Beta.BetaContentBlockParam;

function block(part: ModelPart): Block {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "image") return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: part.data },
    title: part.title,
    ...(part.citations ? { citations: { enabled: true } } : {}),
  };
}

function toModelError(e: unknown): ModelError {
  if (e instanceof Anthropic.RateLimitError) return new ModelError("rate_limited", "rate limited");
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ModelError("auth", "not authorized");
  // Too many PDF pages, a request over the size limit, or a prompt over the context window.
  if (e instanceof Anthropic.APIError && (e.status === 413 || (e instanceof Anthropic.BadRequestError && /\bpages?\b|too large|too long|exceeds|maximum/i.test(e.message ?? ""))))
    return new ModelError("too_large", `too large (${e.status})`);
  if (e instanceof Anthropic.BadRequestError) return new ModelError("bad_request", `bad request (${e.status})`);
  if (e instanceof Anthropic.APIConnectionError) return new ModelError("network", "connection failed");
  if (e instanceof Anthropic.APIError) return new ModelError(e.status !== undefined && e.status >= 500 ? "overloaded" : "other", `API error ${e.status ?? ""}`.trim());
  return new ModelError("other", "unexpected error");
}

/** Billed usage per attempt, from `usage.iterations` (fallback and the attempt it replaced). */
export function attemptsFrom(iterations: Anthropic.Beta.BetaIterationsUsage | null | undefined): { model: string; usage: Usage }[] | undefined {
  const runs = (iterations ?? []).filter((i): i is Anthropic.Beta.BetaMessageIterationUsage | Anthropic.Beta.BetaFallbackMessageIterationUsage => i.type === "message" || i.type === "fallback_message");
  if (runs.length === 0) return undefined;
  return runs.map((i) => ({
    // A first attempt without a model name ran on the model we asked for.
    model: i.model ?? MODEL,
    usage: { inputTokens: i.input_tokens, outputTokens: i.output_tokens, cacheReadTokens: i.cache_read_input_tokens ?? 0, cacheWriteTokens: i.cache_creation_input_tokens ?? 0 },
  }));
}

/**
 * `maxRetries`: the SDK retries 408/409/429/5xx and connection errors twice
 * by default; a test that must not spend more than planned passes 0.
 */
export function anthropicClient(opts: { apiKey?: string; maxRetries?: number } = {}): ModelClient {
  const client = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}) });
  return {
    async generate(req: ModelRequest): Promise<ModelResult> {
      try {
        // Streamed so long answers don't hit HTTP timeouts; nothing is shown
        // to the person until the pipeline's checks have run on the whole text.
        const message = await client.beta.messages
          .stream({
            model: MODEL,
            max_tokens: req.maxTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: [{ model: FALLBACK_MODEL }],
            thinking: { type: "adaptive" },
            output_config: {
              effort: req.effort,
              ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}),
            },
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: req.parts.map(block) }],
          })
          .finalMessage();

        let text = "";
        const citations: Citation[] = [];
        for (const b of message.content) {
          if (b.type !== "text") continue;
          text += b.text;
          for (const c of b.citations ?? []) {
            if (c.type === "page_location") citations.push({ text: c.cited_text, document: c.document_title, startPage: c.start_page_number, endPage: c.end_page_number });
          }
        }
        return {
          text,
          citations,
          stop: message.stop_reason === "end_turn" ? "end" : message.stop_reason === "max_tokens" ? "max_tokens" : message.stop_reason === "refusal" ? "refusal" : "other",
          model: message.model,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
          },
          ...(attemptsFrom(message.usage.iterations) ? { attempts: attemptsFrom(message.usage.iterations) } : {}),
        };
      } catch (e) {
        throw toModelError(e);
      }
    },
  };
}
