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
if (process.env.RAYACT_RELEASE_PUBLIC_KEY) {
  const signature = Buffer.from(fs.readFileSync(path.join(directory, 'release-set.sig'), 'utf8').trim(), 'base64');
  if (!crypto.verify(null, contents, process.env.RAYACT_RELEASE_PUBLIC_KEY, signature)) throw new Error('Invalid release-set signature');
}
console.log(`Verified release set ${release.version}.`);
