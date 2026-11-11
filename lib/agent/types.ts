/** One tool call made by the agent. Sent to the browser so the user can see what the agent did. */
export type AgentStep = {
  tool: string;
  args: unknown;
  ok: boolean;
  writes: boolean;
  result?: unknown;
  error?: string;
};

export type AgentResult = {
  reply: string;
  steps: AgentStep[];
};
