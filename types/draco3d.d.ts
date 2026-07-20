// draco3d ships no types of its own, and there is no @types package for it.
// Written by hand rather than reached for with an `any`, the same way the 3D
// module declares three's untyped meshopt decoder.
//
// Only the decoder factory is declared, because only the decoder is used: the
// model optimiser registers it so a Draco-compressed upload can be opened at all
// (see lib/media/model-optimise.ts). Nothing here compresses WITH Draco - the
// viewer decodes meshopt far faster - so createEncoderModule is deliberately
// absent rather than declared and unused.
declare module 'draco3d' {
  // The decoder module is an Emscripten build. Its surface is large, dynamically
  // shaped, and consumed entirely by gltf-transform rather than by us, so it is
  // typed as the opaque handle it is to this codebase - naming methods we never
  // call would be documentation that nothing keeps honest.
  export type DecoderModule = object

  export function createDecoderModule(config?: object): Promise<DecoderModule>

  const draco3d: {
    createDecoderModule(config?: object): Promise<DecoderModule>
  }
  export default draco3d
}
