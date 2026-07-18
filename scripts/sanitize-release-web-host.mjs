#!/usr/bin/env node

import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: sanitize-release-web-host.mjs <rayact_release.html>');

const releasePreRun = 'preRun:[function(){addRunDependency("rayact-app-bundle");var load=function(name,fallback){fetch(name).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.arrayBuffer()}).then(function(bytes){FS.writeFile("/"+name,new Uint8Array(bytes));removeRunDependency("rayact-app-bundle")}).catch(function(){if(fallback)fallback();else removeRunDependency("rayact-app-bundle")})};load("app.qjsbc",function(){load("app.js",null)})}],';
let html = fs.readFileSync(file, 'utf8').replace(
  /preRun\s*:\s*\[[\s\S]*?\]\s*,\s*__rayactPrefetchCache\s*:\s*[^,]+,\s*__rayactActiveRevision\s*:\s*[^,]+,/,
  releasePreRun
);
html = html.replace(
  /(?:\/\/ Browsers cannot browse raw mDNS\.[\s\S]*?)?var\s+rayactDevMatch\s*=[\s\S]*?var\s+Module\s*=\s*\{/,
  'var Module={'
);

const forbidden = ['rayactDevBase', '__rayactPrefetchCache', '/rayact/manifest.json', '?dev='];
const remaining = forbidden.filter((marker) => html.includes(marker));
if (remaining.length > 0) {
  throw new Error(`Release Web host still contains development bootstrap markers: ${remaining.join(', ')}`);
}
fs.writeFileSync(file, html);
