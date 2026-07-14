#!/usr/bin/env node
/**
 * Runs every module code generator in a single Node process.
 *
 * These eight generators were previously chained with `&&` in package.json, which paid
 * a fresh Node boot (and, for generate-media-worker, a fresh load of the TypeScript
 * compiler) eight times over for what is a few hundred milliseconds of actual work.
 * Importing them in sequence runs exactly the same code, in exactly the same order,
 * once - a generator that calls process.exit(1) on a bad manifest (e.g. the duplicate
 * `publicBasePath` check in generate-module-router.mjs) still aborts the whole build.
 *
 * Order is load-bearing only in that it must stay stable, so add new generators to the
 * end of the list rather than in the middle. Each writes its own gitignored file and
 * reads nothing another one writes.
 */

const GENERATORS = [
  './generate-module-router.mjs',
  './generate-module-puck.mjs',
  './generate-module-cron.mjs',
  './generate-module-settings-tabs.mjs',
  './generate-module-sms-providers.mjs',
  './generate-module-extension-points.mjs',
  './generate-module-layout-types.mjs',
  './generate-media-worker.mjs',
]

for (const generator of GENERATORS) {
  await import(generator)
}
