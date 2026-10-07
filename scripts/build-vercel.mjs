// Packages the app for Vercel using the Build Output API v3
// (https://vercel.com/docs/build-output-api/v3):
//   .vercel/output/static/          ← the Vite build (dist/)
//   .vercel/output/functions/api.func ← the Express API bundled into one file
// Runs automatically during `npm run build` on Vercel (VERCEL=1), or with `--force`.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

if (!process.env.VERCEL && !process.argv.includes('--force')) {
  console.log('[vercel] skipped (not running on Vercel)');
  process.exit(0);
}

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });

cpSync('dist', `${out}/static`, { recursive: true });

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${out}/functions/api.func/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Express and friends are CommonJS: give the ESM bundle a real `require`.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

writeFileSync(
  `${out}/functions/api.func/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('[vercel] wrote .vercel/output (static + api function)');
