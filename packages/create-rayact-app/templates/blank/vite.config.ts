import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { createRayactViteConfig, RAYACT_ENTRY_ID } from 'rayact/dev-server';

const root = path.dirname(fileURLToPath(import.meta.url));
const release = process.env.RAYACT_MODE === 'release';

export default defineConfig(
  createRayactViteConfig(
    {
      root,
      entry: 'src/App.tsx',
      mode: release ? 'release' : 'development',
      outDir: 'dist',
      minify: release,
      bytecode: false
    },
    RAYACT_ENTRY_ID
  )
);
