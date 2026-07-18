import {
  McpTool,
  JsonRpcRequest,
  JsonRpcResponse,
  McpError,
  MCP_ERROR_CODES,
} from './types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type McpToolHandler = (params: unknown) => Promise<unknown>;

export interface McpWebSocketClientOptions {
  onStatusChange?: (status: ConnectionStatus) => void;
  onToolStart?: (toolName: string, params: unknown) => void;
  onToolEnd?: (toolName: string, result: unknown, error?: Error) => void;
  onMessageReceived?: (text: string, isDone: boolean, thought?: string) => void;
}

export class McpWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private status: ConnectionStatus = 'disconnected';
  private readonly toolRegistry: Map<string, McpTool> = new Map();
  private readonly toolHandlers: Map<string, McpToolHandler> = new Map();
  private readonly onStatusChange?: (status: ConnectionStatus) => void;
  private readonly onToolStart?: (toolName: string, params: unknown) => void;
  private readonly onToolEnd?: (toolName: string, result: unknown, error?: Error) => void;
  private readonly onMessageReceived?: (text: string, isDone: boolean, thought?: string) => void;
  private pendingRequests: Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private requestIdCounter = 0;

  constructor(url: string, options: McpWebSocketClientOptions = {}) {
    this.url = url;
    this.onStatusChange = options.onStatusChange;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.onMessageReceived = options.onMessageReceived;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(url?: string): void {
    if (url) {
      this.url = url;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (error) {
      this.setStatus('error');
      this.onToolEnd?.('connect', null, error instanceof Error ? error : new Error(String(error)));
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.rejectAllPending(new Error('WebSocket connection closed'));
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.rejectAllPending(new Error('WebSocket disconnected'));
  }

  registerLocalTool(tool: McpTool, handler: McpToolHandler): void {
    this.toolRegistry.set(tool.name, tool);
    this.toolHandlers.set(tool.name, handler);
  }

  unregisterLocalTool(name: string): void {
    this.toolRegistry.delete(name);
    this.toolHandlers.delete(name);
  }

  getRegisteredTools(): McpTool[] {
    return Array.from(this.toolRegistry.values());
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const id = ++this.requestIdCounter;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  sendMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const notification: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: null,
      method: 'chat/message',
      params: { text },
    };

    try {
      this.ws.send(JSON.stringify(notification));
    } catch {
      // ignore send errors
    }
  }

  private async handleMessage(data: string): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!this.isJsonRpcMessage(parsed)) {
      return;
    }

    if (this.isRequest(parsed)) {
      await this.handleIncomingRequest(parsed);
      return;
    }

    if (this.isResponse(parsed)) {
      this.handleIncomingResponse(parsed);
      return;
    }
  }

  private async handleIncomingRequest(request: JsonRpcRequest): Promise<void> {
    try {
      switch (request.method) {
        case 'tools/list': {
          const tools = this.getRegisteredTools();
          await this.sendResponse(request.id, { tools });
          break;
        }
        case 'tools/call': {
          const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
          if (!params || typeof params !== 'object' || typeof params.name !== 'string') {
            await this.sendError(request.id, MCP_ERROR_CODES.INVALID_PARAMS, 'Invalid params for tools/call');
            return;
          }

          const toolName = params.name;
          const tool = this.toolRegistry.get(toolName);
          const handler = this.toolHandlers.get(toolName);

          if (!tool || !handler) {
            await this.sendError(request.id, MCP_ERROR_CODES.RESOURCE_NOT_FOUND, `Tool not found: ${toolName}`);
            return;
          }

          this.onToolStart?.(toolName, params.arguments ?? {});

          try {
            const result = await handler(params.arguments ?? {});
            this.onToolEnd?.(toolName, result, undefined);
            await this.sendResponse(request.id, {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result),
                },
              ],
            });
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.onToolEnd?.(toolName, null, err);
            await this.sendError(request.id, MCP_ERROR_CODES.TOOL_EXECUTION_ERROR, err.message);
          }
          break;
        }
        case 'chat/message': {
          const params = request.params as { text?: string; done?: boolean; thought?: string } | undefined;
          const text = typeof params?.text === 'string' ? params.text : '';
          const isDone = typeof params?.done === 'boolean' ? params.done : false;
          const thought = typeof params?.thought === 'string' ? params.thought : undefined;
          this.onMessageReceived?.(text, isDone, thought);
          break;
        }
        default:
          await this.sendError(request.id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${request.method}`);
      }
    } catch {
      await this.sendError(request.id, MCP_ERROR_CODES.INTERNAL_ERROR, 'Internal server error');
    }
  }

  private handleIncomingResponse(response: JsonRpcResponse): void {
    if (response.id === null || response.id === undefined) {
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      const result = response.result as { text?: string; done?: boolean; thought?: string } | undefined;
      if (result && typeof result.text === 'string') {
        const isDone = typeof result.done === 'boolean' ? result.done : false;
        const thought = typeof result.thought === 'string' ? result.thought : undefined;
        this.onMessageReceived?.(result.text, isDone, thought);
      }
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`MCP Error ${response.error.code}: ${response.error.message}`));
      return;
    }

    pending.resolve(response.result);
  }

  private async sendResponse(id: string | number | null, result: unknown): Promise<void> {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.send(response);
  }

  private async sendError(id: string | number | null, code: number, message: string, data?: unknown): Promise<void> {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.send(response);
  }

  private send(message: JsonRpcResponse): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch {
      // ignore send errors
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.onStatusChange?.(status);
  }

  private isJsonRpcMessage(message: unknown): message is JsonRpcRequest | JsonRpcResponse {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const obj = message as Record<string, unknown>;

    if (obj.jsonrpc !== '2.0') {
      return false;
    }

    if (typeof obj.id !== 'string' && typeof obj.id !== 'number' && obj.id !== null) {
      return false;
    }

    if (typeof obj.method !== 'string' && !('result' in obj) && !('error' in obj)) {
      return false;
    }

    return true;
  }

  private isRequest(message: JsonRpcRequest | JsonRpcResponse): message is JsonRpcRequest {
    return typeof (message as JsonRpcRequest).method === 'string';
  }

  private isResponse(message: JsonRpcRequest | JsonRpcResponse): message is JsonRpcResponse {
    return 'result' in message || 'error' in message;
  }
}
