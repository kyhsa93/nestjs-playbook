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

/** Method-level decorator summary. */
export interface MethodDecoratorInfo {
  methodName: string
  decorators: { name: string; argsText: string; fullText: string }[]
  body: string          // raw method body text (between { and matching })
}

/** Inspect a class method: returns its decorators and source-text body. */
export function listMethodDecorators(filePath: string): MethodDecoratorInfo[] {
  const sf = readSourceFile(filePath)
  const results: MethodDecoratorInfo[] = []

  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const decorators: MethodDecoratorInfo['decorators'] = []
      const mods = (node.modifiers as ts.NodeArray<ts.ModifierLike> | undefined) ?? []
      for (const mod of mods) {
        if (!ts.isDecorator(mod)) continue
        const expr = mod.expression
        let name = ''
        let argsText = ''
        if (ts.isCallExpression(expr)) {
          name = expr.expression.getText(sf)
          argsText = expr.arguments.map((a) => a.getText(sf)).join(', ')
        } else {
          name = expr.getText(sf)
        }
        decorators.push({ name, argsText, fullText: mod.getText(sf) })
      }
      const body = node.body ? node.body.getText(sf).slice(1, -1) : ''  // strip outer { }
      results.push({ methodName: node.name.text, decorators, body })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return results
}

/** Constructor parameter types of each class in the file. */
export interface ConstructorParam {
  name: string          // e.g. "orderCommandService"
  typeText: string      // e.g. "OrderCommandService" or "Repository<OrderEntity>"
}

export function listConstructorParams(filePath: string): ConstructorParam[] {
  const sf = readSourceFile(filePath)
  const params: ConstructorParam[] = []

  function visit(node: ts.Node) {
    if (ts.isConstructorDeclaration(node)) {
      for (const p of node.parameters) {
        if (!p.name || !ts.isIdentifier(p.name)) continue
        const typeText = p.type ? p.type.getText(sf) : 'unknown'
        params.push({ name: p.name.text, typeText })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return params
}

/** Find a decorator by name on any class in the file (e.g. '@Module'). */
export function findClassDecorator(filePath: string, decoratorName: string): string | null {
  const sf = readSourceFile(filePath)
  let found: string | null = null
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const mods = (node.modifiers as ts.NodeArray<ts.ModifierLike> | undefined) ?? []
      for (const mod of mods) {
        if (!ts.isDecorator(mod)) continue
        const expr = mod.expression
        const exprName = ts.isCallExpression(expr) ? expr.expression.getText(sf) : expr.getText(sf)
        if (exprName === decoratorName) {
          found = mod.getText(sf)
          return
        }
      }
    }
    if (!found) ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}
