// Public entry: safe for any app. Contains IDX/VOW projections only; FULL
// projections live in `@vabrato/mls/full` (agent console only, MLS-7).
export { mlsConfig, type MlsConfig } from "./config";
export {
  createResoClient,
  DEFAULT_RETRY,
  ResoError,
  type ClientCredentials,
  type ClientEvent,
  type Clock,
  type ResoClient,
  type ResoClientOptions,
  type RetryOptions,
} from "./client/client";
export * as odata from "./client/odata";
export type { ODataQuery } from "./client/odata";
export * from "./resources";
export * from "./levels/fields";
export {
  pick,
  projectForLevel,
  projectIdx,
  projectMedia,
  projectOffice,
  projectOpenHouse,
  projectVow,
  type Fields,
} from "./levels/project";
export * from "./eligibility";
