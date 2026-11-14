// Local QA only: lets `node --experimental-strip-types` run the fakes in
// packages/lib/src/integrations, whose relative imports have no extension
// (the bundler style the apps use). A missing "./x" is retried as "./x.ts".
//
//   node --experimental-strip-types --import ./scripts/qa/ts-resolve.mjs scripts/qa/fake-google.mjs <log>

import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e?.code === "ERR_MODULE_NOT_FOUND" && /^\\.\\.?\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
    throw e;
  }
}`)}`,
  import.meta.url,
);
