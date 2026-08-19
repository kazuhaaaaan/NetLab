// ============================================================
// AI Network Agent — public API.
//
// AgentEngine = orkestrator; VerificationEngine = shared verifier;
// runtime = jembatan AI → canvas/engine; registry = tool system.
// ============================================================

export { AgentEngine } from './AgentEngine';
export { VerificationEngine } from './verification';
export { createHeadlessRuntime, cloneProject, uid } from './runtime';
export { createAppRuntime } from './appRuntime';
export { buildRegistry, registryMap, permissionOk } from './registry';
export { captureSnapshot, restoreSnapshot, Transaction } from './transaction';
export {
  buildLabFromTemplate,
  getLabTemplate,
  LAB_TEMPLATES,
  LAB_TEMPLATE_IDS,
  topologyPlan,
} from './labGenerator';
export { diagnoseConnectivity, diagnoseNetwork } from './diagnostics';
export { formatPlanPreview, formatExecuteOutcome, formatDiagnostic, formatVerification, formatVerificationHistory } from './format';

export type {
  AiPermissionMode,
  AiToolKind,
  ToolResult,
  ToolDef,
  ToolExecCtx,
  ActionPlan,
  PlanAction,
  PlanActionResult,
  ExecuteOutcome,
  PlanOutcome,
  AiIntent,
  VerificationType,
  VerificationResult,
  VerificationHistoryEntry,
  GeneratedLab,
  LabTask,
  LabGradingCheckSpec,
  DiagnosticResult,
  DiagnosticEvidence,
} from './types';
export { pingResultToVerification, tracerouteToVerification, tcpToVerification } from './types';
export type { AgentRuntime, CliExecResult } from './runtime';
export type { LabTemplate, LabTemplateId } from './labGenerator';
export type { Snapshot } from './transaction';