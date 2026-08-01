#!/usr/bin/env node
// Report what a web module (Emscripten SIDE_MODULE) needs from the host.
//
// Emscripten externalises weak symbols in a side module: C++ template
// instantiations and inline destructors become imports so one canonical copy
// wins across modules. Most of those the module also exports itself, and the
// dynamic linker resolves them locally — only the remainder must come from the
// host, and that remainder is what has to appear in
// native/web/module_sdk_exports.txt.
//
// usage: module-imports.mjs <module.wasm> [--all]

import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: module-imports.mjs <module.wasm> [--all]');
  process.exit(1);
}

const module = new WebAssembly.Module(fs.readFileSync(file));
const exported = new Set(WebAssembly.Module.exports(module).map(e => e.name));

// Two kinds of dependency, both of which the host has to satisfy:
//
//   * `env.<name>` function imports — ordinary calls.
//   * `GOT.mem.<name>` / `GOT.func.<name>` global imports — addresses rather than
//     calls: vtables, typeinfo, and other statics the module takes the address of.
//     Emscripten resolves these against the main module too, and a missing one does
//     not produce a LinkError; it fails later with
//     "TypeError: Cannot read properties of undefined (reading 'value')", which names
//     nothing. Missing them out of this report is how that gets shipped.
//
// `env.__memory_base`/`__table_base`/`__stack_pointer` are supplied by the loader
// itself, not by the host's exports, so they are not requirements to report.
const loaderProvided = new Set(['__memory_base', '__table_base', '__stack_pointer']);
const imported = WebAssembly.Module.imports(module)
  .filter(i =>
    (i.kind === 'function' && i.module === 'env') ||
    (i.kind === 'global' && (i.module === 'GOT.mem' || i.module === 'GOT.func')))
  .filter(i => !loaderProvided.has(i.name))
  .map(i => i.name);

const selfSatisfied = imported.filter(n => exported.has(n)).sort();
const hostRequired = imported.filter(n => !exported.has(n)).sort();

if (flags.includes('--all')) {
  console.error(`# self-satisfied (${selfSatisfied.length}) — resolved by the module's own exports`);
  for (const name of selfSatisfied) console.error(`#   ${name}`);
}

console.error(
  `# ${file}: ${imported.length} function imports, ` +
    `${selfSatisfied.length} self-satisfied, ${hostRequired.length} host-required`,
);
for (const name of hostRequired) console.log(name);
