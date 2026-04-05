# StudySync PWA

## Setup

Download sql.js WASM files into this directory:

```
curl -O https://sql.js.org/dist/sql-wasm.js
curl -O https://sql.js.org/dist/sql-wasm.wasm
```

## Run

Open `index.html` in a browser. That's it.

Or serve locally (some browsers block workers from file://):

```
npx serve .
```

## Files

```
index.html      → porthole (DOM events → worker, worker HTML → DOM)
worker.js       → the brain (SQLite + engine + HTML builder)
primitives.js   → 3D draw loop (WebGL, TODO)
manifest.json   → PWA manifest
sql-wasm.js     → SQLite compiled to WASM (download)
sql-wasm.wasm   → SQLite WASM binary (download)
```

No npm. No node_modules. No build step. No framework.
