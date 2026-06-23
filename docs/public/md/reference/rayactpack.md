# Container format (`.rayactpack`)

Release builds ship a single self-contained container instead of a loose tree of
files. It carries the Rayact-internal assets only — QuickJS bytecode, CSS, icon
fonts, and images. WebAssembly is excluded; non-standard files are opt-in via
`pack.include`.

The layout mirrors the fovea packer, with a rayact magic and a self-describing
header (an embedded key makes a pack loadable without an external project file).

## Binary layout

All integers little-endian:

```
magic     : "RAYACTPK"            (8 bytes)
version   : u32 = 1
flags     : u32                   (bit0 = obfuscated)
keyLen    : u32                   (obfuscation key length; 0 if not obfuscated)
key       : keyLen bytes          (rayactAppKey used to derive the XOR keystream)
fileCount : u32
table     : fileCount × { u32 pathLen, path[pathLen], u64 offset, u64 size }
blobs     : payload (XOR-encoded iff obfuscated)
```

Obfuscation is light tamper-resistance: a stable FNV-1a-derived XOR keystream
keyed by `rayactAppKey + "/" + path` (cross-platform stable, unlike `std::hash`).
Enable it with `"pack": { "obfuscate": true }`.

## Chunking

By default a single **core** chunk holds everything. When the staged size exceeds
`pack.maxChunkSize` (default 100 MB) extra files spill into sibling chunks
(`app.rayactpack.1`, `.2`, …); `app.qjsbc` always stays in chunk 0 so the host
can boot from the base file alone.

## Tooling

The native host produces and inspects containers:

```sh
rayact_desktop --pack <stageDir> <out.rayactpack> [--obfuscate <key>]
rayact_desktop --verify <out.rayactpack>     # list contents + sizes
rayact_desktop --check  <out.rayactpack>     # boot it headlessly, then exit
```

`rayact build` emits the container automatically. On desktop the host loads a
`.rayactpack` directly (extracting once to a scratch dir so existing CSS/font/
image loaders work unchanged). Mobile hosts copy the pack out of app assets and
call `engineLoadPackFile`.
