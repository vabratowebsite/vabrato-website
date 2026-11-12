import type { ModelClient, ModelRequest, ModelResult } from "./client";

// A scripted model for tests: no network, no cost. It records every request
// so tests can check what would have been sent.

export interface FakeModel extends ModelClient {
  requests: ModelRequest[];
}

type Answer = string | Partial<ModelResult>;

export function fakeModel(answer: Answer | ((req: ModelRequest) => Answer | Promise<Answer>)): FakeModel {
  const requests: ModelRequest[] = [];
  return {
    requests,
    async generate(req) {
      requests.push(req);
      const a = typeof answer === "function" ? await answer(req) : answer;
      const partial = typeof a === "string" ? { text: a } : a;
      return {
        text: "",
        citations: [],
        stop: "end",
        model: "claude-opus-5-5",
        usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
        ...partial,
      };
    },
  };
}
