import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'

export interface ImportEdge {
  from: string
  to: string
  specifier: string
}

export function walkTsFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkTsFiles(full, files)
    else if (full.endsWith('.ts')) files.push(full)
  }
  return files
}

export function readSourceFile(filePath: string): ts.SourceFile {
  const source = fs.readFileSync(filePath, 'utf-8')
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
}

export function parseImports(filePath: string): string[] {
  const sf = readSourceFile(filePath)
  const imports: string[] = []
  sf.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text)
    }
  })
  return imports
}

export function getDecoratorTexts(filePath: string): string[] {
  const sf = readSourceFile(filePath)
  const decorators: string[] = []
  function visit(node: ts.Node) {
    const mods = (node as ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers
    if (mods) {
      for (const mod of mods) {
        if (ts.isDecorator(mod)) decorators.push(mod.getText(sf))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return decorators
}

export function hasProviderArray(filePath: string): boolean {
  const sf = readSourceFile(filePath)
  let found = false
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'providers') {
      found = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

export function classifyLayer(filePath: string): 'domain' | 'application' | 'interface' | 'infrastructure' | 'unknown' {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.includes('/domain/')) return 'domain'
  if (normalized.includes('/application/')) return 'application'
  if (normalized.includes('/interface/')) return 'interface'
  if (normalized.includes('/infrastructure/')) return 'infrastructure'
  return 'unknown'
}
