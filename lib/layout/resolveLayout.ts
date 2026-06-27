// Legacy three-tier resolver. The models it depended on (ModuleLayoutDefault,
// SiteConfig.defaultLayoutId, InfoPage.layoutId) were removed in v0.5.26.
// Kept as a stub so any module that imports it still compiles. Use resolveThemeLayout instead.
export async function resolveLayout(_pageLayoutId: string | null | undefined, _moduleName: string) {
  return null
}
