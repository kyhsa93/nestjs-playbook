// Harness CLI — nestjs-playbook 가이드 규칙을 대상 NestJS 프로젝트에 적용하는 linter.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'
import { evaluateChecklist } from '../rules/checklist.evaluator'
import { evaluateStructure } from '../rules/structure.evaluator'
import { evaluateCqrsPattern } from '../rules/cqrs-pattern.evaluator'
import { evaluateErrorHandling } from '../rules/error-handling.evaluator'
import { evaluateTestPresence } from '../rules/test-presence.evaluator'
import { evaluateDtoValidation } from '../rules/dto-validation.evaluator'
import { evaluateTaskQueue } from '../rules/task-queue.evaluator'
import { evaluateScheduler } from '../rules/scheduler.evaluator'
import { evaluateDeprecatedApi } from '../rules/deprecated-api.evaluator'
import { evaluateModuleDI } from '../rules/module-di.ast.evaluator'
import { evaluateImportGraph } from '../rules/import-graph.evaluator'
import { evaluateDomainEventOutbox } from '../rules/domain-event-outbox.evaluator'
import { evaluateBuild } from '../rules/build.evaluator'
import { evaluateTestRun } from '../rules/test-run.evaluator'
import { evaluateSecretManager } from '../rules/secret-manager.evaluator'
import { evaluateConfigValidation } from '../rules/config-validation.evaluator'
import { evaluateLogging } from '../rules/logging.evaluator'
import { evaluateAuth } from '../rules/auth.evaluator'
import { evaluateBootstrapHealthcheck } from '../rules/bootstrap-healthcheck.evaluator'
import { aggregate } from '../shared/score'
import type { EvaluatorResult } from '../shared/types'

const EVALUATORS: Record<string, (root: string) => EvaluatorResult> = {
  structure: evaluateStructure,
  'layer-dependency': evaluateLayerDependency,
  'repository-pattern': evaluateRepositoryPattern,
  'controller-path': evaluateControllerPath,
  checklist: evaluateChecklist,
  'cqrs-pattern': evaluateCqrsPattern,
  'error-handling': evaluateErrorHandling,
  'test-presence': evaluateTestPresence,
  'dto-validation': evaluateDtoValidation,
  'task-queue': evaluateTaskQueue,
  scheduler: evaluateScheduler,
  'deprecated-api': evaluateDeprecatedApi,
  'module-di-ast': evaluateModuleDI,
  'import-graph': evaluateImportGraph,
  'domain-event-outbox': evaluateDomainEventOutbox,
  build: evaluateBuild,
  'test-run': evaluateTestRun,
  'secret-manager': evaluateSecretManager,
  'config-validation': evaluateConfigValidation,
  logging: evaluateLogging,
  auth: evaluateAuth,
  'bootstrap-healthcheck': evaluateBootstrapHealthcheck
}
