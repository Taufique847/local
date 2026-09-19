import { ToolRegistry } from './tool.registry';
import { ToolExecutionContext, IToolExecutionResult } from './tool.types';
import { PolicyGuardrailsService } from '../policy-guardrails.service';

export class ToolExecutor {
  /**
   * Executes a tool safely with latency tracking, input parsing, and error encapsulation.
   */
  public static async executeTool(
    toolName: string,
    rawArgs: any,
    context: ToolExecutionContext
  ): Promise<IToolExecutionResult> {
    const startTime = Date.now();
    const tool = ToolRegistry.getTool(toolName);

    if (!tool) {
      return {
        toolName,
        success: false,
        error: `Tool "${toolName}" is not registered in the system`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      let parsedArgs: any = rawArgs;
      if (typeof rawArgs === 'string') {
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch {
          parsedArgs = {};
        }
      }

      // Check required parameters
      const required = tool.parameters.required || [];
      for (const req of required) {
        if (parsedArgs[req] === undefined || parsedArgs[req] === null) {
          return {
            toolName,
            success: false,
            error: `Missing required argument: "${req}" for tool "${toolName}"`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // Policy Guardrail Check (M18)
      if (context.businessId) {
        const guardrailCheck = await PolicyGuardrailsService.validateToolInvocation(
          context.businessId,
          toolName,
          parsedArgs
        );
        if (!guardrailCheck.allowed) {
          return {
            toolName,
            success: false,
            error: `Policy Guardrail: ${guardrailCheck.violation}`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      const result = await tool.execute(parsedArgs, context);

      return {
        toolName,
        success: true,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.error(`Tool execution error [${toolName}]:`, err);
      return {
        toolName,
        success: false,
        error: err.message || 'Unknown tool execution failure',
        durationMs: Date.now() - startTime,
      };
    }
  }
}
