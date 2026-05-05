import * as fs from 'node:fs'
import * as path from 'node:path'

const HARNESS_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(HARNESS_ROOT, '..')
const RULES_ROOT = path.join(HARNESS_ROOT, 'evaluators', 'rules')
const FIXTURES_ROOT = path.join(HARNESS_ROOT, 'tests', 'fixtures')

const FIXTURE_OPTIONAL = new Set(['build', 'test-run'])

function listEvaluatorNames(): string[] {
  return fs
    .readdirSync(RULES_ROOT)
    .filter((file) => file.endsWith('.evaluator.ts'))
    .map((file) => file.replace(/\.ast\.evaluator\.ts$/, '').replace(/\.evaluator\.ts$/, ''))
    .sort()
}

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out

  for (const entry of fs.readdirSync(root)) {
    const fullPath = path.join(root, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      out.push(...walkFiles(fullPath, predicate))
      continue
    }
    if (predicate(fullPath)) out.push(fullPath)
  }

  return out
}

function validateFixtureCoverage(): string[] {
  const failures: string[] = []
  const evaluatorNames = listEvaluatorNames()

  for (const evaluatorName of evaluatorNames) {
    if (FIXTURE_OPTIONAL.has(evaluatorName)) continue

    const fixtureDir = path.join(FIXTURES_ROOT, evaluatorName)
    if (!fs.existsSync(fixtureDir)) {
      failures.push(`fixture directory missing: tests/fixtures/${evaluatorName}`)
      continue
    }

    const caseNames = fs
      .readdirSync(fixtureDir)
      .filter((caseName) => fs.statSync(path.join(fixtureDir, caseName)).isDirectory())

    if (!caseNames.includes('good')) {
      failures.push(`good fixture missing: tests/fixtures/${evaluatorName}/good`)
    }
    if (!caseNames.some((caseName) => caseName.startsWith('bad'))) {
      failures.push(`bad fixture missing: tests/fixtures/${evaluatorName}/bad-*`)
    }

    for (const caseName of caseNames) {
      const expectedPath = path.join(fixtureDir, caseName, 'expected.json')
      if (!fs.existsSync(expectedPath)) {
        failures.push(`expected.json missing: tests/fixtures/${evaluatorName}/${caseName}`)
      }
    }
  }

  return failures
}

function extractDocRefs(source: string): string[] {
  const refs = new Set<string>()
  const regex = /docRef\s*:\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(source)) !== null) {
    refs.add(match[1])
  }
  return [...refs]
}

function validateDocRefs(): string[] {
  const failures: string[] = []
  const ruleFiles = walkFiles(RULES_ROOT, (file) => file.endsWith('.ts'))

  for (const file of ruleFiles) {
    const source = fs.readFileSync(file, 'utf-8')
    const refs = extractDocRefs(source)
    for (const ref of refs) {
      const [docPath] = ref.split('#')
      const absoluteDocPath = path.join(REPO_ROOT, docPath)
      if (!fs.existsSync(absoluteDocPath)) {
        failures.push(`${path.relative(REPO_ROOT, file)} has invalid docRef: ${ref}`)
      }
    }
  }

  return failures
}

function run(): void {
  const failures = [...validateFixtureCoverage(), ...validateDocRefs()]

  if (failures.length === 0) {
    console.log('  PASS harness meta validation')
    return
  }

  console.error('  FAIL harness meta validation')
  for (const failure of failures) {
    console.error(`    - ${failure}`)
  }
  process.exit(1)
}

run()
