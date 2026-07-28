import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { createRayactViteConfig, RAYACT_ENTRY_ID } from 'rayact/dev-server';

const root = path.dirname(fileURLToPath(import.meta.url));
const release = process.env.RAYACT_MODE === 'release';

// Alternate entries (the FlatList/scroll bench) are selected with RAYACT_ENTRY.
// Bench parameters are NOT passed as vite defines: `rayact build` supplies its
// own vite config, so anything defined here is dropped and the identifier
// reaches the bundle as a ReferenceError. See scripts/gen-bench-config.mjs.
const entry = process.env.RAYACT_ENTRY || 'src/App.tsx';

export default defineConfig(
  createRayactViteConfig(
    {
      root,
      entry,
      platform: 'desktop',
      mode: release ? 'release' : 'development',
      outDir: 'dist',
      minify: release,
      bytecode: false
    },
    RAYACT_ENTRY_ID
  )
);
