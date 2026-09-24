// Bundles src/vercelHandler.ts -> api/[...path].js for Vercel deployment.
//
// Why this exists (not just letting Vercel auto-compile api/*.ts itself):
// Vercel's Node.js function build transpiles each file individually and
// leaves real npm dependencies to be resolved by Node at runtime — which is
// exactly right for ordinary npm packages, but @setu/core is a workspace
// package whose package.json deliberately exports raw TypeScript source
// (./src/index.ts, not a compiled dist/) for zero-build local dev DX. Node's
// runtime can't execute that .ts file directly, so without this step the
// deployed function crashes at import time with ERR_MODULE_NOT_FOUND.
//
// Fix: bundle (inline) only the workspace-local @setu/core import — esbuild
// parses its raw TS source directly, no problem — while every real npm
// dependency stays external and is resolved normally from node_modules at
// runtime, exactly as it would be without this build step.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const external = Object.keys(pkg.dependencies).filter((name) => name !== '@setu/core')

await build({
  entryPoints: ['src/vercelHandler.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'api/index.js',
  external,
  logLevel: 'info',
})
