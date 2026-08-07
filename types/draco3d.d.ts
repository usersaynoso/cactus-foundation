// draco3d ships no types of its own, and there is no @types package for it.
// Written by hand rather than reached for with an `any`, the same way the 3D
// module declares three's untyped meshopt decoder.
//
// The decoder is what the product code uses: the model optimiser registers it so
// a Draco-compressed upload can be opened at all, then drops the extension so the
// file is written back out with meshopt instead, which the viewer decodes far
// faster (see lib/media/model-optimise.ts). Nothing shipped compresses WITH
// Draco.
//
// The encoder is declared all the same, for one caller: model-optimise.test.ts
// builds a Draco-compressed GLB with it, because the only honest way to prove
// the optimiser survives one is to hand it a real one. Declaring it here rather
// than casting round it in the test keeps that dependency visible - if the
// optimiser ever did register an encoder, this is where you would notice it
// already had somewhere to come from.
declare module 'draco3d' {
  // Both modules are Emscripten builds. Their surface is large, dynamically
  // shaped, and consumed entirely by gltf-transform rather than by us, so each is
  // typed as the opaque handle it is to this codebase - naming methods we never
  // call would be documentation that nothing keeps honest.
  export type DecoderModule = object
  export type EncoderModule = object

  export function createDecoderModule(config?: object): Promise<DecoderModule>
  export function createEncoderModule(config?: object): Promise<EncoderModule>

  const draco3d: {
    createDecoderModule(config?: object): Promise<DecoderModule>
    createEncoderModule(config?: object): Promise<EncoderModule>
  }
  export default draco3d
}
