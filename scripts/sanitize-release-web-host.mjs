#!/usr/bin/env node

import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: sanitize-release-web-host.mjs <rayact_release.html>');

// The release preRun replaces the shell's wholesale, because the shell's version is
// built around the dev server (manifest prefetch, revision cache) and every marker of
// that has to be gone from a shipped host. The cost is that this is a hand-maintained
// duplicate: anything preRun gains in shell.html must be mirrored here or it silently
// vanishes from release builds only. That has bitten twice — module loading and
// app-assets staging both shipped broken this way — so test/cli/release-web-host.test.mjs
// now asserts each behaviour survives sanitisation.
const releasePreRun = `preRun:[function(){
  // Native web modules (side-module wasm): stage the bytes into MEMFS only. The host
  // dlopens them from /rayact-modules during boot, because doing it here would run
  // before runtimeInitialized and corrupt the heap (web_plugin_loader.cpp explains).
  // The list is injected as a global by assembleWebApp; dev reads it from the manifest.
  var rayactModules = window.__rayactWebModules;
  if (Array.isArray(rayactModules) && rayactModules.length) {
    addRunDependency("rayact-modules");
    try { FS.mkdirTree("/rayact-modules"); } catch (e) {}
    Promise.all(rayactModules.map(function(url) {
      var target = "/rayact-modules/" + String(url).split("/").pop().split("?")[0];
      return fetch(url).then(function(response) {
        if (!response.ok) throw new Error(url + ": " + response.status);
        return response.arrayBuffer();
      }).then(function(bytes) {
        FS.writeFile(target, new Uint8Array(bytes));
      }).catch(function(error) {
        console.error("[rayact-web] module fetch failed: " + error.message);
      });
    })).then(function() { removeRunDependency("rayact-modules"); });
  }
  addRunDependency("rayact-app-bundle");
  var load = function(name, fallback) {
    fetch(name).then(function(response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.arrayBuffer();
    }).then(function(bytes) {
      FS.writeFile("/" + name, new Uint8Array(bytes));
      removeRunDependency("rayact-app-bundle");
    }).catch(function() {
      if (fallback) fallback(); else removeRunDependency("rayact-app-bundle");
    });
  };
  load("app.qjsbc", function() { load("app.js", null); });
  // Runtime assets the bundle reads from the filesystem (the CSS importCSS() loads).
  // assembleWebApp stages these next to the bundle and lists them in app-assets.json;
  // without this they are staged and never read, which is what release did before.
  addRunDependency("rayact-app-assets");
  fetch("app-assets.json").then(function(response) {
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }).then(function(list) {
    if (!Array.isArray(list)) return;
    return Promise.all(list.map(function(rel) {
      return fetch(rel).then(function(response) {
        if (!response.ok) throw new Error(rel + ": " + response.status);
        return response.arrayBuffer();
      }).then(function(bytes) {
        var dir = "/" + rel.split("/").slice(0, -1).join("/");
        if (dir !== "/") FS.mkdirTree(dir);
        FS.writeFile("/" + rel, new Uint8Array(bytes));
      });
    }));
  }).catch(function() {}).then(function() {
    removeRunDependency("rayact-app-assets");
  });
}],`;
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
