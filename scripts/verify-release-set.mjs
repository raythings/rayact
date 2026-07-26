#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? 'release1');
const releaseFile = path.join(directory, 'release-set.json');
const contents = fs.readFileSync(releaseFile);
const release = JSON.parse(contents);
for (const item of [...release.packages, ...release.artifacts]) {
  const filename = item.tarball ?? item.filename;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, filename))).digest('hex');
  if (actual !== item.sha256) throw new Error(`Release-set checksum mismatch: ${filename}`);
}
// Public key: env override, else the key committed with the repo.
import { fileURLToPath } from 'node:url';
const defaultKeyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'release-public-key.pem');
const publicKey = process.env.RAYACT_RELEASE_PUBLIC_KEY
  ?? (fs.existsSync(defaultKeyPath) ? fs.readFileSync(defaultKeyPath, 'utf8') : null);
const sigPath = path.join(directory, 'release-set.sig');
if (publicKey && fs.existsSync(sigPath)) {
  const signature = Buffer.from(fs.readFileSync(sigPath, 'utf8').trim(), 'base64');
  if (!crypto.verify(null, contents, publicKey, signature)) throw new Error('Invalid release-set signature');
  console.log('Signature: OK');
} else if (process.argv.includes('--require-signature')) {
  throw new Error('release-set.sig missing or no public key available');
}
console.log(`Verified release set ${release.version}.`);
