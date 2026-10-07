/**
 * Vercel serverless entry. Bundled by scripts/build-vercel.mjs into
 * .vercel/output/functions/api.func — see README "Deploy to Vercel".
 */
import { app } from './app.ts';

export default app;
