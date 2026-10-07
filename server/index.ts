import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from './app.ts';
import { warmUp } from './providers/index.ts';
import { ROOT, config } from './util.ts';

// ── Static web app (production: `npm run build && npm start`) ──
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Canopy API on http://localhost:${config.port}`);
  warmUp();
});
