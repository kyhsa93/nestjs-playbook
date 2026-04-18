// benchmark.ts — run an agent against one or more tasks N times and
// aggregate pass rate / score distribution.
//
// Usage:
//   npx tsx scripts/benchmark.ts --agent=claude-code --task=new-domain/domain-module-basic --runs=5
//   npx tsx scripts/benchmark.ts --agent=codex --tasks-dir=tasks/new-domain --runs=3
//
// Output: stdout에 per-task 요약 표 + 전체 평균. --out=path로 JSON 덤프.

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface Args {
  agent: 'claude-code' | 'codex'
  taskIds: string[]
  runs: number
  rounds: number
  out: string | null
}

function parseArgs(argv: string[]): Args {
  let agent: Args['agent'] = 'claude-code'
  let taskIds: string[] = []
  let runs = 3
  let rounds = 1
  let out: string | null = null
  let tasksDir: string | null = null

  for (const a of argv) {
    if (a.startsWith('--agent=')) agent = a.slice('--agent='.length) as Args['agent']
    else if (a.startsWith('--task=')) taskIds.push(a.slice('--task='.length))
    else if (a.startsWith('--tasks-dir=')) tasksDir = a.slice('--tasks-dir='.length)
    else if (a.startsWith('--runs=')) runs = Number(a.slice('--runs='.length))
    else if (a.startsWith('--rounds=')) rounds = Number(a.slice('--rounds='.length))
    else if (a.startsWith('--out=')) out = a.slice('--out='.length)
  }

  if (tasksDir) {
    const abs = path.resolve(tasksDir)
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const metaPath = path.join(abs, entry.name, 'metadata.json')
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { id?: string }
            if (meta.id) taskIds.push(meta.id)
          } catch { /* skip */ }
        }
      }
    }
  }

  if (taskIds.length === 0) {
    console.error('usage: benchmark.ts --agent=<claude-code|codex> (--task=... | --tasks-dir=...) [--runs=N] [--rounds=M] [--out=path]')
    process.exit(1)
  }

  if (agent !== 'claude-code' && agent !== 'codex') {
    console.error(`invalid agent: ${agent}`)
    process.exit(1)
  }

  return { agent, taskIds, runs, rounds, out }
}

interface RunResult {
  taskId: string
  runIndex: number
  totalScore: number
  grade: string
  durationMs: number
  reportPath: string
}

function runOnce(args: Args, taskId: string, runIndex: number): RunResult {
  const harnessRoot = path.resolve(__dirname, '..')
  const runner = args.agent === 'claude-code' ? 'run-claude-code.sh' : 'run-codex.sh'
  const runnerPath = path.join(harnessRoot, 'scripts', runner)
  const taskRoot = path.join(harnessRoot, 'tasks', taskId)

  const start = Date.now()
  const res = spawnSync(runnerPath, [taskRoot, '--rounds', String(args.rounds)], {
    encoding: 'utf-8',
    timeout: 15 * 60 * 1000   // 15분 제한
  })
  const durationMs = Date.now() - start

  // Runner prints "sandbox: <path>" on first lines; find latest report.
  const sandboxLine = (res.stdout ?? '').split('\n').find((l) => l.startsWith('sandbox: '))
  const sandbox = sandboxLine?.slice('sandbox: '.length).trim()
  const reportPath = sandbox ? path.join(sandbox, 'RESULT.json') : ''

  let totalScore = 0
  let grade = 'F'
  if (reportPath && fs.existsSync(reportPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
      totalScore = report.totalScore ?? 0
      grade = report.grade ?? 'F'
    } catch { /* keep defaults */ }
  }

  return { taskId, runIndex, totalScore, grade, durationMs, reportPath }
}

function summarize(results: RunResult[]): Record<string, { mean: number; min: number; max: number; runs: number }> {
  const by: Record<string, number[]> = {}
  for (const r of results) (by[r.taskId] ??= []).push(r.totalScore)
  const out: Record<string, { mean: number; min: number; max: number; runs: number }> = {}
  for (const [taskId, scores] of Object.entries(by)) {
    const mean = scores.reduce((s, x) => s + x, 0) / scores.length
    out[taskId] = {
      mean: Math.round(mean),
      min: Math.min(...scores),
      max: Math.max(...scores),
      runs: scores.length
    }
  }
  return out
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const results: RunResult[] = []

  for (const taskId of args.taskIds) {
    for (let i = 0; i < args.runs; i += 1) {
      console.error(`[${args.agent}] ${taskId} run ${i + 1}/${args.runs}`)
      results.push(runOnce(args, taskId, i))
    }
  }

  const summary = summarize(results)
  const report = { agent: args.agent, runs: args.runs, rounds: args.rounds, results, summary }

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2))
    console.error(`report → ${args.out}`)
  }

  console.log('\n=== benchmark summary ===')
  console.log(`agent: ${args.agent}   runs/task: ${args.runs}   rounds: ${args.rounds}`)
  for (const [taskId, s] of Object.entries(summary)) {
    console.log(`  ${taskId.padEnd(45)} mean=${s.mean}  min=${s.min}  max=${s.max}  (n=${s.runs})`)
  }
}

main()
