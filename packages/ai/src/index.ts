// @vabrato/ai: the only way AI features call a model (SPEC <ai_rules>).
// Server-side only. Import it from server actions and route handlers, never
// from client components or public (signed-out) pages; a guard test checks.

export { runAi, type AiDeps, type AiFailure, type AiFeature, type AiInput, type AiLogEvent, type AiOutput, type AiResult, type FeatureKey, type InputPart } from "./run";
export { ModelError, type Citation, type Effort, type ModelClient, type ModelPart, type ModelRequest, type ModelResult } from "./client";
export { anthropicClient } from "./anthropic";
export { supabaseAiStore, type AiStore, type FinishInfo } from "./store";
export { listingForAi, stripNeverSend } from "./listing-fields";
export { FALLBACK_MODEL, MODEL, costMicros, type Usage } from "./models";
export { fairHousingBlocks, paymentInstructionMatches, removeForeignLinks, wrapData } from "./safety";
