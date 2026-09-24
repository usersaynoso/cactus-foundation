#!/usr/bin/env node
/**
 * Fails the build if server code reads a VALUE out of a 'use client' module.
 *
 * In Next's react-server layer a 'use client' file is not run at all. Every
 * export of it becomes a client reference: a proxy that can be rendered or
 * handed to a client component, and that throws the moment anything else is done
 * to it. `ticked[MARKETING_CONSENT_AGREEMENT_ID]` on the server, where the
 * constant lives in a 'use client' file, dies with "Cannot access
 * MARKETING_CONSENT_AGREEMENT_ID.toString on the server" - and the route that
 * did it returns a 500 for every request.
 *
 * `tsc`, `eslint` and the unit tests all stay green, because none of them model
 * the layer split: the types line up, and vitest runs the file as ordinary
 * modules. It was caught by a human reviewer on 2026-09-24. This is its
 * mirror-image sibling of scripts/check-client-graph.mjs, which asks the same
 * question in the other direction (client code reaching server-only code).
 *
 * What counts as server code: every file reachable from a server entry - a route
 * handler, a page, a layout and the rest of Next's special files, plus the root
 * proxy - by following static imports, re-exports and dynamic import(), without
 * ever stepping through a 'use client' file (past that boundary the client layer
 * takes over and reading its exports is fine). Starting from the entries rather
 * than from every file matters: a helper that only client components import is
 * compiled for the browser, where a 'use client' module is a real module.
 * Starting from the app's own entries also means the generated module routers
 * decide which modules are looked at, so this install's module set is exactly
 * what is checked.
 *
 * What counts as a violation is a USE, not an import, because importing a
 * client component into a server component and rendering it is the pattern the
 * whole framework is built on. Flagged:
 *   - a property or element read (`Foo.x`, `Foo[k]`), a use as a key (`x[FOO]`)
 *   - a call, `new`, or tagged template on the import
 *   - a template string or `+` that puts it into text
 *   - a spread
 *   - and, when the export is plainly data (a string, number, boolean, object,
 *     array or enum), also: passed as a call argument, rendered as a child,
 *     compared with ===, or used as a `case`. A client reference never equals the
 *     real value, so `kind === CLIENT_CONST` is silently always false.
 * Not flagged: rendering it (`<Foo />`, `<Ns.Foo />`), passing it to a JSX
 * attribute, an object property or an array, `import type` and `import { type }`.
 *
 * Known blind spots, accepted rather than guessed at: a value re-exported through
 * a server file and imported from there, an alias (`const k = FOO` then `x[k]`),
 * a bare namespace import handed to something that iterates it, and a local
 * variable that shadows an imported name.
 *
 * A finding is a defect on any install that has the file, so it fails the build:
 * this is a positive finding, not housekeeping about a module set.
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const SOURCE_DIRS = ['lib', 'modules', 'app']
const EXTS = ['.ts', '.tsx', '.js', '.jsx']

// Next's special files under app/. Anything else in there is an ordinary module
// and only counts as server code if one of these reaches it.
const SPECIAL_FILES = new Set([
  'route', 'page', 'layout', 'template', 'default', 'not-found', 'loading',
  'sitemap', 'robots', 'manifest', 'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
])
const ROOT_ENTRIES = ['proxy', 'middleware', 'instrumentation']

const SCRIPT_KINDS = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
}

// Steps over whitespace and comments. Done by hand rather than with one regex,
// because a regex can backtrack into the middle of a comment and find a quoted
// 'use client' there - which is exactly what a file saying "no 'use client'
// here, on purpose" contains.
function skipTrivia(text, from) {
  let i = from
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end + 1
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    } else {
      return i
    }
  }
}

// A directive is only a directive in the prologue: the run of string statements
// at the very top of the file, before any other code.
function hasUseClientDirective(text) {
  let i = skipTrivia(text, 0)
  for (;;) {
    const match = /^(['"])(use [a-z ]+)\1;?/.exec(text.slice(i, i + 40))
    if (!match) return false
    if (match[2] === 'use client') return true
    i = skipTrivia(text, i + match[0].length)
  }
}

function collectFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (EXTS.includes(path.extname(entry.name))) out.push(full)
  }
  return out
}

// The version of each module on disk, so a finding names the pin that has the
// defect. A core update does NOT move module pins, and "shop v0.1.454" is a much
// shorter route to "that install is behind" than a list of paths.
function readModuleVersions(rootDir) {
  const versions = new Map()
  try {
    const pinned = JSON.parse(readFileSync(path.join(rootDir, 'modules.json'), 'utf8'))
    for (const entry of pinned.modules ?? []) {
      if (entry?.name && entry?.version) versions.set(entry.name, entry.version)
    }
  } catch {
    // No modules.json is not itself an error - fall through to the manifests.
  }
  let dirs = []
  try {
    dirs = readdirSync(path.join(rootDir, 'modules'), { withFileTypes: true })
  } catch {
    return versions
  }
  for (const dir of dirs) {
    if (!dir.isDirectory() || versions.has(dir.name)) continue
    try {
      const manifest = JSON.parse(readFileSync(path.join(rootDir, 'modules', dir.name, 'cactus.module.json'), 'utf8'))
      if (manifest?.version) versions.set(dir.name, `v${String(manifest.version).replace(/^v/, '')}`)
    } catch {
      // A module with no readable manifest just goes unlabelled.
    }
  }
  return versions
}

const isTagNameChain = (node) => {
  let current = node
  while (current.parent && ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current) {
    current = current.parent
  }
  const parent = current.parent
  return Boolean(
    parent &&
      (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) &&
      parent.tagName === current,
  )
}

// `Foo`, `(Foo)`, `Foo as X`, `Foo!`, `<X>Foo` and `Foo satisfies X` are all the
// same value as far as the layer split is concerned.
const unwrap = (node) => {
  let current = node
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent))
  ) {
    current = current.parent
  }
  return current
}

const throws = (reason) => ({ reason, certain: true })
const maybe = (reason) => ({ reason, certain: false })

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
])

/**
 * Why using `node` (an import of a client export) on the server is a defect, or
 * null when it is an ordinary way to use a client reference. `certain` is true
 * where the use throws whatever the value is - a read, a call, a key, a template
 * - and false where it only goes wrong depending on what happens next: a value
 * handed to a function that may or may not read it, or a comparison that quietly
 * comes out false.
 */
function violation(rawNode, isData) {
  const node = unwrap(rawNode)
  const parent = node.parent
  if (!parent) return null

  if (
    (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) &&
    parent.tagName === node
  ) {
    return null
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return isTagNameChain(node) ? null : throws('a property is read from it')
  }
  if (ts.isElementAccessExpression(parent)) {
    if (parent.expression === node) return throws('an element is read from it')
    if (parent.argumentExpression === node) return throws('it is used as a key')
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    if (parent.expression === node) return throws(ts.isNewExpression(parent) ? 'it is constructed' : 'it is called')
    if (isData && parent.arguments?.includes(node)) return maybe('it is passed to a function as a value')
  }
  if (ts.isTaggedTemplateExpression(parent) && parent.tag === node) return throws('it is used as a template tag')
  if (ts.isTemplateSpan(parent)) return throws('it is put into a template string')
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind
    if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.PlusEqualsToken) return throws('it is joined into a string')
    if (op === ts.SyntaxKind.InKeyword && parent.left === node) return throws('it is used as a key')
    if (isData && EQUALITY.has(op)) return maybe('it is compared, and a client reference never equals the real value')
  }
  if (ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent) || ts.isJsxSpreadAttribute(parent)) return throws('it is spread')
  if (isData) {
    if (ts.isCaseClause(parent) && parent.expression === node) {
      return maybe('it is a case label, and a client reference never equals the real value')
    }
    if (ts.isJsxExpression(parent) && (ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent))) {
      return maybe('it is rendered as text')
    }
  }
  return null
}

const DATA_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ArrayLiteralExpression,
])

const isDataInitialiser = (expression) => {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  if (ts.isPrefixUnaryExpression(current)) return isDataInitialiser(current.operand)
  return DATA_KINDS.has(current.kind)
}

const hasExportModifier = (node) => ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export

/**
 * The exports of a client file that are plainly data. Anything not listed is
 * treated as something that could be a component, which is the cautious answer:
 * it can only be flagged for a read that no component survives.
 */
function dataExportsOf(sourceFile) {
  const dataLocals = new Set()
  const exported = new Set()
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        if (!isDataInitialiser(declaration.initializer)) continue
        dataLocals.add(declaration.name.text)
        if (hasExportModifier(statement)) exported.add(declaration.name.text)
      }
    } else if (ts.isEnumDeclaration(statement)) {
      const isConst = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ConstKeyword)
      if (!isConst) {
        dataLocals.add(statement.name.text)
        if (hasExportModifier(statement)) exported.add(statement.name.text)
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        if (specifier.isTypeOnly) continue
        const local = (specifier.propertyName ?? specifier.name).text
        if (dataLocals.has(local)) exported.add(specifier.name.text)
      }
    }
  }
  return exported
}

/**
 * @param {string} rootDir
 * @returns {Array<{
 *   file: string, line: number, name: string, reason: string,
 *   client: string, trail: string[], shared: boolean, severity: 'error' | 'warn',
 * }>} every place server code reads a value out of a 'use client' module
 */
export function findServerClientValueReads(rootDir) {
  const texts = new Map()
  for (const dir of SOURCE_DIRS) {
    for (const file of collectFiles(path.join(rootDir, dir))) texts.set(file, readFileSync(file, 'utf8'))
  }
  for (const name of ROOT_ENTRIES) {
    for (const ext of EXTS) {
      const file = path.join(rootDir, name + ext)
      if (existsSync(file)) texts.set(file, readFileSync(file, 'utf8'))
    }
  }

  const clientCache = new Map()
  const isClient = (file) => {
    if (!clientCache.has(file)) clientCache.set(file, hasUseClientDirective(texts.get(file) ?? ''))
    return clientCache.get(file)
  }

  const parsed = new Map()
  const parse = (file) => {
    if (!parsed.has(file)) {
      parsed.set(
        file,
        ts.createSourceFile(file, texts.get(file) ?? '', ts.ScriptTarget.Latest, true, SCRIPT_KINDS[path.extname(file)]),
      )
    }
    return parsed.get(file)
  }

  const resolveSpecifier = (spec, from) => {
    let base
    if (spec.startsWith('@/')) base = path.join(rootDir, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
    else return null
    for (const ext of EXTS) if (texts.has(base + ext)) return base + ext
    for (const ext of EXTS) if (texts.has(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`)
    return null
  }

  // Every edge the bundler follows out of a server file: static imports,
  // re-exports and dynamic import(). Only `import type` and `export type` are
  // erased.
  const importsOf = (sourceFile) => {
    const out = []
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
        out.push({ spec: node.moduleSpecifier.text, node })
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.isTypeOnly
      ) {
        out.push({ spec: node.moduleSpecifier.text, node: null })
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        out.push({ spec: node.arguments[0].text, node: null })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return out
  }

  const entries = []
  for (const file of texts.keys()) {
    const relative = path.relative(rootDir, file)
    const stem = path.basename(file, path.extname(file))
    const isAppEntry = relative.startsWith(`app${path.sep}`) && SPECIAL_FILES.has(stem)
    const isRootEntry = path.dirname(relative) === '.' && ROOT_ENTRIES.includes(stem)
    if ((isAppEntry || isRootEntry) && !isClient(file)) entries.push(file)
  }

  // Breadth-first, so the trail printed is the shortest route from an entry -
  // which is the edge worth looking at first.
  const cameFrom = new Map(entries.map((entry) => [entry, null]))
  const queue = [...entries]
  const findings = []
  const trailTo = (file) => {
    const trail = []
    for (let current = file; current; current = cameFrom.get(current)) trail.unshift(current)
    return trail
  }
  const exportsCache = new Map()

  while (queue.length) {
    const file = queue.shift()
    const sourceFile = parse(file)

    for (const { spec, node } of importsOf(sourceFile)) {
      const resolved = resolveSpecifier(spec, file)
      if (!resolved) continue

      if (isClient(resolved)) {
        if (node) collectReads(file, sourceFile, node, resolved)
        continue
      }
      if (!cameFrom.has(resolved)) {
        cameFrom.set(resolved, file)
        queue.push(resolved)
      }
    }
  }

  function collectReads(file, sourceFile, declaration, clientFile) {
    const clause = declaration.importClause
    if (!clause) return
    if (!exportsCache.has(clientFile)) exportsCache.set(clientFile, dataExportsOf(parse(clientFile)))
    const dataExports = exportsCache.get(clientFile)

    // local name -> the client export it stands for, or a namespace marker
    const bindings = new Map()
    if (clause.name) bindings.set(clause.name.text, { exported: 'default' })
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        if (specifier.isTypeOnly) continue
        bindings.set(specifier.name.text, { exported: (specifier.propertyName ?? specifier.name).text })
      }
    } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, { namespace: true })
    }
    if (bindings.size === 0) return

    const report = (node, name, { reason, certain }) => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      findings.push({ file, line: line + 1, name, reason, certain, client: clientFile, trail: trailTo(file) })
    }

    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return
      if (ts.isIdentifier(node) && bindings.has(node.text) && isReference(node)) {
        const binding = bindings.get(node.text)
        if (binding.namespace) {
          const access = node.parent
          if (ts.isPropertyAccessExpression(access) && access.expression === node && !isTagNameChain(node)) {
            const found = violation(access, dataExports.has(access.name.text))
            if (found) report(access, `${node.text}.${access.name.text}`, found)
          }
        } else {
          const found = violation(node, dataExports.has(binding.exported))
          if (found) report(node, node.text, found)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  if (findings.length === 0) return findings

  // A file that a client component can also reach is compiled for both layers,
  // and a use inside it may sit in a function that only ever runs in the browser
  // - an editor preview beside its server-rendered twin, say. Nothing here can
  // tell, so such a finding is reported but not allowed to fail a build. A file
  // that only the server reaches has no other layer for the code to be running
  // in, which is what makes a throwing use in it certain.
  const clientReachable = new Set()
  const clientQueue = [...texts.keys()].filter(isClient)
  for (const file of clientQueue) clientReachable.add(file)
  while (clientQueue.length) {
    const file = clientQueue.shift()
    for (const { spec } of importsOf(parse(file))) {
      const resolved = resolveSpecifier(spec, file)
      if (resolved && !clientReachable.has(resolved)) {
        clientReachable.add(resolved)
        clientQueue.push(resolved)
      }
    }
  }

  return findings.map(({ certain, ...finding }) => {
    const shared = clientReachable.has(finding.file)
    return { ...finding, shared, severity: certain && !shared ? 'error' : 'warn' }
  })
}

// An identifier that is a use of the import rather than a name that merely
// looks like it: a declaration, a property name, the right of a dot.
function isReference(identifier) {
  const parent = identifier.parent
  if (!parent) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false
  if (ts.isQualifiedName(parent)) return false
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false
  if (ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) {
    if (parent.name === identifier) return false
  }
  if (ts.isBindingElement(parent) && (parent.name === identifier || parent.propertyName === identifier)) return false
  if (ts.isParameter(parent) && parent.name === identifier) return false
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) return false
  if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent)) && parent.name === identifier) {
    return false
  }
  if (ts.isJsxAttribute(parent) && parent.name === identifier) return false
  if (ts.isEnumMember(parent) && parent.name === identifier) return false
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return false
  return true
}

export function formatFinding(finding, rootDir, moduleVersions = new Map()) {
  const label = (absolute) => {
    const relative = path.relative(rootDir, absolute)
    const match = /^modules\/([^/]+)\//.exec(relative)
    const version = match && moduleVersions.get(match[1])
    return version ? `${relative}  [${match[1]} ${version}]` : relative
  }
  const trail = finding.trail.map(label).join('\n      -> ')
  const why = finding.shared
    ? '    also reachable from a client component, so this may sit in code that only runs in the browser - not certain\n'
    : ''
  return (
    `${path.relative(rootDir, finding.file)}:${finding.line}  ${finding.name} - ${finding.reason}\n` +
    `    read from ${label(finding.client)}, which is 'use client'\n${why}` +
    `    reached on the server by:\n      ${trail}`
  )
}

// CLI: node scripts/check-server-client-imports.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const findings = findServerClientValueReads(rootDir)
  const errors = findings.filter((finding) => finding.severity === 'error')
  const warnings = findings.filter((finding) => finding.severity === 'warn')
  const moduleVersions = readModuleVersions(rootDir)

  if (warnings.length > 0) {
    console.warn(
      `[check-server-client-imports] ${warnings.length} use(s) worth a look that are not certain enough to stop a build - ` +
        'either the file is also reachable from a client component, or the value is compared or handed on rather than read:\n',
    )
    for (const finding of warnings) console.warn(`  ${formatFinding(finding, rootDir, moduleVersions)}\n`)
  }

  if (errors.length === 0) {
    console.log("[check-server-client-imports] no server-only file reads a value out of a 'use client' module")
    process.exit(0)
  }

  console.error(
    `[check-server-client-imports] ${errors.length} place(s) where server code reads a value out of a 'use client' module. ` +
      'On the server such a module is a proxy that can be rendered but not read, so each of these throws at runtime. ' +
      "Move the value into a file with no 'use client' and import it from there in both places:\n",
  )
  for (const finding of errors) console.error(`  ${formatFinding(finding, rootDir, moduleVersions)}\n`)
  const modulesNamed = [
    ...new Set(
      errors.flatMap((finding) => {
        const match = /^modules\/([^/]+)\//.exec(path.relative(rootDir, finding.file))
        const version = match && moduleVersions.get(match[1])
        return version ? [`${match[1]} ${version}`] : []
      }),
    ),
  ]
  if (modulesNamed.length > 0) {
    console.error(`[check-server-client-imports] module versions involved: ${modulesNamed.join(', ')}`)
    console.error(
      "[check-server-client-imports] if a fix for this is already released, this install's module pins are behind - " +
        'a core update does NOT move them. Update those modules from the admin Modules page.\n',
    )
  }
  process.exit(1)
}
