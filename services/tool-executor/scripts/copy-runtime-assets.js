/**
 * tsc only emits compiled `.ts` output, so the hand-written CommonJS runtime at
 * src/adk/shared/stage7-runtime.js never reaches dist/. Without this the
 * deployed CodeExecutor finds no stage7-runtime.js, falls back to copying the
 * TypeScript source verbatim, and every declarative skill loses its ctx.store /
 * ctx.render / ctx.emit. Copy the file verbatim - it is already valid CommonJS.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assets = ['adk/shared/stage7-runtime.js'];

for (const asset of assets) {
  const src = path.join(root, 'src', asset);
  const dest = path.join(root, 'dist', asset);
  if (!fs.existsSync(src)) {
    console.warn(`copy-runtime-assets: missing source ${src}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copy-runtime-assets: ${asset} -> dist`);
}
