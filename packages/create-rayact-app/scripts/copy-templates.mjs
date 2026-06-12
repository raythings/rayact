import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'templates');
const dest = path.join(root, 'dist', 'templates');

fs.cpSync(src, dest, { recursive: true });
console.log('Copied templates → dist/templates');
