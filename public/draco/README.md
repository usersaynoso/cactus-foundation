# Draco decoder

The Google Draco mesh decoder, served same-origin so the media library can preview a
3D model that arrived Draco-compressed - which is what Blender's "Compression" tick,
gltf-pipeline and most "shrink my GLB" tools produce. Without a decoder registered,
three's GLTFLoader refuses such a file outright, and the admin sees a model that never
appears rather than a message about a missing decoder.

## Why these are files rather than imports

The decoder is an Emscripten build: a JavaScript wrapper that fetches and instantiates a
wasm blob at runtime, from a path it is told. It is not an ES module and cannot be
bundled, so it has to sit somewhere the browser can fetch it from. `public/` is that
somewhere - static, same-origin, no route to maintain and no env var to keep in step
with the deployment URL.

Only the wasm pair is vendored. three also ships `draco_decoder.js`, the pure-JS
fallback for browsers without WebAssembly, at 700 KB; a browser that can run WebGL can
run wasm, so carrying it would be most of a megabyte for a case that does not exist.

## Contents

- `draco_wasm_wrapper.js` - the loader/glue, fetched by `DRACOLoader.setDecoderPath()`
- `draco_decoder.wasm` - the decoder itself, fetched by the wrapper

Both are lazy: `DRACOLoader` only asks for them when it meets an actually-compressed
primitive, so an ordinary uncompressed GLB downloads neither.

## Updating

Copied verbatim from the `three` package, so they must be replaced whenever three is
upgraded - a wrapper and a `three` that disagree about the decoder's interface fail at
parse time, on compressed files only.

```
cp node_modules/three/examples/jsm/libs/draco/draco_wasm_wrapper.js public/draco/
cp node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm public/draco/
```

Current copy: three 0.180.0. Licence: Apache 2.0 (Google).
