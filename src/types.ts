/**
 * Type definitions for the agentic test suite.
 */

/** A single step in a test case */
export interface TestStep {
  step: number;
  action: string;
  expected: string;
}

/** A complete test case as defined in YAML */
export interface TestCase {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  target_url: string;
  preconditions: string[];
  /** Optional site-specific hints to help the AI agent navigate this site */
  site_context?: string[];
  steps: TestStep[];
}

/** Result of executing a single step */
export interface StepResult {
  step: number;
  action: string;
  expected: string;
  status: "pass" | "fail" | "error" | "skipped";
  actual: string;
  reasoning: string;
  commands_executed: string[];
  screenshot?: string;
  duration_ms: number;
}

/** Result of executing a complete test case */
export interface TestReport {
  test_id: string;
  title: string;
  status: "pass" | "fail" | "error";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  steps: StepResult[];
  summary: string;
}

/** The LLM's decision on what to do for a step */
export interface AgentAction {
  thought: string;
  commands: string[];
  done: boolean;
  success: boolean;
  actual_result: string;
}
