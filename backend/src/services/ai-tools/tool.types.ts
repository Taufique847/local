export interface ToolExecutionContext {
  businessId: string;
  businessName: string;
  callSid: string;
  callerPhone: string;
  customerId?: string;
  leadId?: string;
  appointmentId?: string;
}

export interface IToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
  execute: (args: TArgs, context: ToolExecutionContext) => Promise<TResult>;
}

export interface IToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}
