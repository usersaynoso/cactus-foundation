'use client'

// The media library's preview for a 3D file. Every other type in the library
// shows what it is - an image draws itself, a video plays, a scroll sequence
// shows its poster - and a model showed a grey document icon, which is the one
// case where the admin cannot tell two files apart without downloading both.
// A folder of a dozen chair GLBs is exactly where that matters.
//
// Deliberately its own small viewer rather than anything borrowed from the
// product-3d-views module: core carries no module code (see CLAUDE.md), and the
// admin wants a different thing anyway - "which file is this", not a shopping
// stage with fabric paints, AR and shadow catchers.
//
// Everything three-related is imported dynamically. three plus a loader is the
// better part of a megabyte and the media library is mostly opened to look at
// pictures, so the cost only lands once a model is actually on screen.

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three'
import { extensionForModelType } from '@/lib/media/limits'

// Where the Draco decoder is served from - core's own copy under public/draco,
// same-origin and relative, so it follows the site wherever it is deployed and
// needs no env var. See public/draco/README.md for why these are fetched files
// rather than imports.
const DECODER_PATH = '/draco/'

// How large the model is drawn, in the same units frameModel normalises into.
// The camera below is positioned to suit this and nothing else.
const FIT_TO = 2

type Status = 'loading' | 'ready' | 'failed'

export default function ModelPreview({ url, mimeType, height = 288 }: {
  url: string
  mimeType: string
  /** Height of the canvas box in px. The panel's preview area is fixed, so this is too. */
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    setStatus('loading')
    setError(null)

    // Everything below is asynchronous and the panel can be closed, or stepped
    // to the next item, at any point in it. `cancelled` stops a late arrival
    // touching state, and the teardown stack frees whatever had been built by
    // the time it was pulled - GPU allocations are not reachable by the garbage
    // collector, so an unmount that skips this leaks a whole model per item the
    // admin clicks through.
    let cancelled = false
    const teardown: Array<() => void> = []

    void (async () => {
      try {
        const model = await parseModel(url, mimeType)
        if (cancelled) {
          disposeModel(model)
          return
        }
        teardown.push(() => disposeModel(model))

        const three = await import('three')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
        if (cancelled) return

        const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true })
        teardown.push(() => renderer.dispose())
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        // Tone mapping and the sRGB output are what stop a PBR model arriving
        // washed out or over-bright. Same pair three's own examples use.
        renderer.toneMapping = three.ACESFilmicToneMapping
        renderer.outputColorSpace = three.SRGBColorSpace

        const scene = new three.Scene()

        // An image-based environment, not just lights. A material with
        // metalness 1 has no diffuse term at all - its colour is entirely what
        // it reflects - so a chrome chair base renders solid black with lights
        // alone, which reads as a broken file rather than as missing lighting.
        // RoomEnvironment is three's own procedural studio: no asset to host,
        // nothing to fetch, no licence.
        const pmrem = new three.PMREMGenerator(renderer)
        const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        pmrem.dispose()
        scene.environment = environment
        teardown.push(() => environment.dispose())

        scene.add(new three.AmbientLight(0xffffff, 0.6))
        const key = new three.DirectionalLight(0xffffff, 1.2)
        key.position.set(3, 5, 4)
        scene.add(key)
        const fill = new three.DirectionalLight(0xffffff, 0.4)
        fill.position.set(-4, 1, -3)
        scene.add(fill)

        // Models arrive in wildly different units - a chair authored in
        // millimetres and one authored in metres differ by a thousand - so the
        // camera can only be fixed if the MODEL is normalised to a known size
        // first. Without this half of what an admin uploads renders as either a
        // speck or an invisible wall of polygons filling the near plane.
        const size = new three.Box3().setFromObject(model).getSize(new three.Vector3())
        const largest = Math.max(size.x, size.y, size.z)
        // Multiplied into whatever scale the root already carries, never
        // assigned over it: FBXLoader puts the file's unit conversion on the
        // root it hands back, and the box above was measured in world space, so
        // assigning would throw that factor away and draw the model at 1/100th.
        if (largest > 0 && Number.isFinite(largest)) model.scale.multiplyScalar(FIT_TO / largest)
        // Re-measured after scaling rather than multiplying the old centre
        // through: the two agree for a plain scale and stop agreeing the moment
        // a loader hands back a root that already had a transform on it.
        const centre = new three.Box3().setFromObject(model).getCenter(new three.Vector3())
        model.position.sub(centre)
        scene.add(model)

        const camera = new three.PerspectiveCamera(45, 1, 0.1, 100)
        camera.position.set(2.4, 1.6, 3.2)

        const controls = new OrbitControls(camera, canvas)
        teardown.push(() => controls.dispose())
        controls.enableDamping = true
        controls.enablePan = false
        // It turns by itself until the admin takes hold of it, and then stops
        // for good. The motion is there to say "this is a model, it moves";
        // once someone is examining one corner of it, a viewer that keeps
        // turning is fighting them.
        controls.autoRotate = true
        controls.autoRotateSpeed = 1.5
        controls.addEventListener('start', () => { controls.autoRotate = false })

        const resize = () => {
          const width = canvas.clientWidth
          const boxHeight = canvas.clientHeight
          if (width === 0 || boxHeight === 0) return
          camera.aspect = width / boxHeight
          camera.updateProjectionMatrix()
          // updateStyle false: CSS owns the element's size here, and letting
          // three write inline width/height would fight the flex layout.
          renderer.setSize(width, boxHeight, false)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)
        teardown.push(() => observer.disconnect())

        renderer.setAnimationLoop(() => {
          controls.update()
          renderer.render(scene, camera)
        })
        teardown.push(() => renderer.setAnimationLoop(null))

        setStatus('ready')
      } catch (cause) {
        if (cancelled) return
        setStatus('failed')
        setError(cause instanceof Error ? cause.message : 'Could not open this model')
      }
    })()

    return () => {
      cancelled = true
      // Reverse order, so the animation loop stops before the renderer it
      // draws with is disposed.
      while (teardown.length) teardown.pop()!()
    }
  }, [url, mimeType])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={canvasRef}
        aria-label="3D model preview"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          // Only grabbable once there is something to grab, and never while the
          // failure message is the thing on screen.
          cursor: status === 'ready' ? 'grab' : 'default',
          // A failed load leaves an empty canvas over the message below it.
          visibility: status === 'ready' ? 'visible' : 'hidden',
          touchAction: 'none',
        }}
      />
      {status !== 'ready' && (
        <div style={overlay}>
          {status === 'loading' ? (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading model…</span>
          ) : (
            <>
              <span style={{ fontSize: '2.5rem' }} aria-hidden="true">🧊</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '20rem' }}>
                {error ?? 'Could not open this model'}
              </span>
            </>
          )}
        </div>
      )}
      {status === 'ready' && (
        <span style={hint}>Drag to turn · scroll to zoom</span>
      )}
    </div>
  )
}

/**
 * Fetch and parse a model, picking the loader from its media type.
 *
 * The type is turned back into an extension rather than switched on directly,
 * because the extension table in lib/media/limits.ts is already the one place
 * that decides which 3D formats the library accepts at all - so a format added
 * there and not here is a compile error rather than a preview that silently
 * shows nothing.
 */
async function parseModel(url: string, mimeType: string): Promise<Object3D> {
  const extension = extensionForModelType(mimeType)
  if (!extension) throw new Error('This is not a 3D file the library knows how to draw')

  // Started first, awaited last: the loader chunks are scripts from our own
  // origin while the model is a large file from the media Worker, and running
  // the two in series adds the whole of the first to the wait before anything
  // appears. loadAsync() would do exactly that, which is why this parses bytes
  // it fetched itself.
  const bytes = fetchModelBytes(url)
  // What a loader resolves a file's relative references against - the directory
  // the file itself sits in. parse() has to be told; a loader told nothing
  // resolves against the admin page instead.
  const { LoaderUtils } = await import('three')
  const resourcePath = LoaderUtils.extractUrlBase(url)

  switch (extension) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const loader = new GLTFLoader()
      // EXT_meshopt_compression: what core's own optimiser writes (see
      // lib/media/model-optimise.ts), so without this the library could not
      // preview a file it had just optimised itself. The decoder is three's
      // own, with its wasm inline, so it fetches nothing at runtime - but it
      // must be ready BEFORE the parse, since the loader asks it synchronously
      // the moment it meets the extension.
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
      await MeshoptDecoder.ready
      loader.setMeshoptDecoder(MeshoptDecoder)
      // KHR_draco_mesh_compression: the other compression a glTF arrives under,
      // and the more common one on an unoptimised upload - it is what Blender's
      // "Compression" tick and most "shrink my GLB" tools produce. GLTFLoader
      // refuses such a file outright when no decoder is registered, which would
      // reach the admin as a model that simply never appeared. Registered
      // unconditionally because it costs nothing until a file actually uses the
      // extension: DRACOLoader fetches its wasm lazily, on the first compressed
      // primitive it meets.
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
      const draco = new DRACOLoader().setDecoderPath(DECODER_PATH)
      loader.setDRACOLoader(draco)
      try {
        const gltf = await loader.parseAsync(await bytes, resourcePath)
        return gltf.scene
      } finally {
        // One preview, one decoder: DRACOLoader keeps a pool of Web Workers,
        // each with its own compiled copy of the wasm, and clicking through a
        // folder of models would otherwise leave a pool per file running.
        draco.dispose()
      }
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
      // No .mtl is fetched: the admin uploaded one file, and an OBJ's materials
      // live in a sibling that was never uploaded with it. An OBJ is text
      // rather than binary, hence the one decode the other formats do not need.
      return new OBJLoader().parse(new TextDecoder().decode(await bytes))
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      // FBXLoader reads both the binary and the ASCII flavour out of the same
      // buffer, so this needs no branch of its own.
      return new FBXLoader().parse(await bytes, resourcePath)
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js')
      return new TDSLoader().parse(await bytes, resourcePath)
    }
    default:
      throw new Error('No preview for this kind of 3D file yet')
  }
}

async function fetchModelBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    // Worth stating in full: a media url carries a signed token (see
    // lib/media/asset-token.ts), so the interesting failure here is a 403 from
    // an expired one, which is otherwise indistinguishable from a broken file.
    throw new Error(`Could not fetch this model (${response.status} ${response.statusText})`)
  }
  return response.arrayBuffer()
}

/**
 * Release a model's GPU memory. Geometries and textures live on the GPU and are
 * not reachable by the garbage collector, so an admin flicking through a folder
 * of models would otherwise pile up every one they had looked at until the tab
 * fell over.
 */
function disposeModel(model: Object3D): void {
  model.traverse((child) => {
    const mesh = child as Object3D & { geometry?: { dispose?: () => void }; material?: unknown }
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      const m = material as { dispose?: () => void } & Record<string, unknown>
      // A material's texture maps are separate GPU allocations and are not
      // freed by disposing the material itself. Probed by shape rather than by
      // naming each slot, so whatever maps a given file happens to carry are
      // all caught.
      for (const value of Object.values(m)) {
        const texture = value as { isTexture?: boolean; dispose?: () => void } | null
        if (texture && typeof texture === 'object' && texture.isTexture) texture.dispose?.()
      }
      m.dispose?.()
    }
  })
}

const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  padding: 'var(--space-4)',
}

const hint: CSSProperties = {
  position: 'absolute',
  bottom: '0.4rem',
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.1rem 0.4rem',
  pointerEvents: 'none',
}
