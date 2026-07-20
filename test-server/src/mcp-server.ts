import { WebSocketServer, WebSocket, MessageEvent } from 'ws';
import { createServer } from 'http';

// ---------------------------------------------------------------------------
// Minimal MCP / JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

interface McpInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: {
    name: string;
    version: string;
  };
}

interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    logging?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    tools?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  initialized: boolean;
  clientInfo?: { name: string; version: string };
  protocolVersion?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const sessions = new Map<string, Session>();

function getOrCreateSession(ws: WebSocket): Session {
  const id = ws.url || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let session = sessions.get(id);
  if (!session) {
    session = { id, initialized: false, messages: [] };
    sessions.set(id, session);
  }
  return session;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function isJsonRpcMessage(data: unknown): data is JsonRpcMessage {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && typeof obj.method === 'string';
}

function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && msg.id !== null;
}

function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg) || msg.id === null;
}

function createResponse(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function createError(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// ---------------------------------------------------------------------------
// Hermes LLM Integration
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'hermes3';

type ThoughtState = 'idle' | 'inThought' | 'inContent';

interface StreamDelta {
  text: string;
  thought?: string;
  done: boolean;
}

async function* streamOllamaResponse(messages: Array<{ role: string; content: string }>): AsyncGenerator<StreamDelta, void, unknown> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Ollama response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let state: ThoughtState = 'idle';
  let thoughtBuffer = '';
  let contentBuffer = '';
  let tagBuffer = '';

  const emitDelta = async (): Promise<StreamDelta> => {
    const delta: StreamDelta = { text: contentBuffer, done: false };
    if (thoughtBuffer) {
      delta.thought = thoughtBuffer;
    }
    thoughtBuffer = '';
    contentBuffer = '';
    return delta;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        let token = '';
        try {
          const parsed = JSON.parse(line);
          token = parsed.message?.content || '';
        } catch {
          // ignore parse errors
        }

        if (!token) continue;

        for (const char of token) {
          if (state === 'idle') {
            tagBuffer += char;
            if (tagBuffer.endsWith('<thought>')) {
              contentBuffer += tagBuffer.slice(0, -9);
              tagBuffer = '';
              state = 'inThought';
            } else if (tagBuffer.length > 9) {
              contentBuffer += tagBuffer.slice(0, -9);
              tagBuffer = tagBuffer.slice(-9);
            }
          } else if (state === 'inThought') {
            tagBuffer += char;
            if (tagBuffer.endsWith('</thought>')) {
              thoughtBuffer += tagBuffer.slice(0, -10);
              tagBuffer = '';
              state = 'inContent';
              yield await emitDelta();
            } else if (tagBuffer.length > 10) {
              thoughtBuffer += tagBuffer.slice(0, -10);
              tagBuffer = tagBuffer.slice(-10);
            }
          } else if (state === 'inContent') {
            contentBuffer += char;
          }
        }
      }
    }

    if (contentBuffer || thoughtBuffer) {
      yield await emitDelta();
    }
    yield { text: '', done: true };
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// MCP Handlers
// ---------------------------------------------------------------------------

async function handleInitialize(
  ws: WebSocket,
  session: Session,
  params: unknown,
  requestId: number | string
): Promise<void> {
  const initParams = params as McpInitializeParams;
  session.initialized = true;
  session.clientInfo = initParams.clientInfo;
  session.protocolVersion = initParams.protocolVersion;

  const result: McpInitializeResult = {
    protocolVersion: '2024-11-05',
    capabilities: {
      logging: {},
      prompts: {},
      resources: {},
      tools: {},
    },
    serverInfo: {
      name: `OpenClaw Server (${OLLAMA_MODEL})`,
      version: '1.0.0',
    },
  };

  ws.send(JSON.stringify(createResponse(requestId, result)));
}

async function handleNotificationsInitialized(
  ws: WebSocket,
  session: Session
): Promise<void> {
  console.log(`[${session.id}] Protocol binding fully active.`);
  // Optionally send initial tool list or prompts after binding
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {
        tools: [
          {
            name: 'systemInfo',
            description: 'Retrieve local system information',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'listSandboxFiles',
            description: 'List files in the sandbox directory',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'readSandboxFile',
            description: 'Read a file from the sandbox directory',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative file path' },
              },
              required: ['path'],
            },
          },
        ],
      },
    })
  );
}

async function handleToolCall(
  ws: WebSocket,
  session: Session,
  params: unknown,
  requestId: number | string
): Promise<void> {
  const toolParams = (params as Record<string, unknown>) || {};
  const toolName = typeof toolParams.name === 'string' ? toolParams.name : 'unknown';
  const arguments_ = typeof toolParams.arguments === 'object' ? toolParams.arguments : {};

  console.log(`[${session.id}] tools/call: ${toolName}`, arguments_);

  // Stub: echo back tool arguments as placeholder result
  ws.send(
    JSON.stringify(
      createResponse(requestId, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tool: toolName,
              args: arguments_,
              result: 'stubbed-result',
            }),
          },
        ],
      })
    )
  );
}

async function handleChatMessage(
  ws: WebSocket,
  session: Session,
  params: Record<string, unknown>,
  requestId?: number | string
): Promise<void> {
  const text = typeof params.text === 'string' ? params.text : '';
  console.log(`[${session.id}] chat/message: "${text}"`);

  session.messages.push({ role: 'user', content: text });

  let streamCounter = 0;
  try {
    for await (const delta of streamOllamaResponse(session.messages)) {
      const streamId = `stream-${session.id}-${++streamCounter}`;
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: streamId,
          method: 'chat/message',
          params: {
            text: delta.text,
            done: delta.done,
            ...(delta.thought ? { thought: delta.thought } : {}),
          },
        })
      );

      if (delta.text && !delta.done) {
        session.messages.push({ role: 'assistant', content: delta.text });
      }
    }
  } catch (err) {
    console.error(`[${session.id}] Ollama stream error:`, err);
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: `stream-${session.id}-error`,
        method: 'chat/message',
        params: {
          text: 'Sorry, I encountered an error while generating the response.',
          done: true,
        },
      })
    );
  }

  if (requestId !== undefined) {
    ws.send(JSON.stringify(createResponse(requestId, { acknowledged: true, text })));
  }
}

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

async function routeMessage(ws: WebSocket, session: Session, msg: JsonRpcMessage): Promise<void> {
  if (isNotification(msg)) {
    switch (msg.method) {
      case 'notifications/initialized':
        await handleNotificationsInitialized(ws, session);
        break;
      case 'chat/message':
        await handleChatMessage(ws, session, (msg.params as Record<string, unknown>) || {});
        break;
      default:
        console.log(`[${session.id}] Unhandled notification: ${msg.method}`);
        break;
    }
    return;
  }

  if (!isRequest(msg)) {
    // Response from client -> ignore or log
    console.log(`[${session.id}] Received response (no handler):`, msg);
    return;
  }

  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      await handleInitialize(ws, session, params as McpInitializeParams, id);
      break;

    case 'tools/call':
      await handleToolCall(ws, session, (params as Record<string, unknown>) || {}, id);
      break;

    case 'messages/new':
      await handleChatMessage(ws, session, (params as Record<string, unknown>) || {}, id);
      break;

    case 'ping':
      ws.send(JSON.stringify(createResponse(id, { pong: true })));
      break;

    default:
      console.log(`[${session.id}] Unhandled request: ${method}`);
      ws.send(
        JSON.stringify(
          createError(id, -32601, `Method not found: ${method}`)
        )
      );
      break;
  }
}

// ---------------------------------------------------------------------------
// WebSocket Server with /mcp path routing
// ---------------------------------------------------------------------------

const httpServer = createServer((req, res) => {
  if (req.url === '/mcp') {
    // Let WebSocketServer handle the upgrade via the upgrade event below
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/mcp') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket) => {
  const session = getOrCreateSession(ws);
  console.log(`[${session.id}] WebSocket connected`);

  ws.on('message', async (data: MessageEvent['data']) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!isJsonRpcMessage(parsed)) {
        console.warn(`[${session.id}] Ignoring non-JSON-RPC message`);
        return;
      }
      await routeMessage(ws, session, parsed);
    } catch (err) {
      console.error(`[${session.id}] Message handling error:`, err);
    }
  });

  ws.on('close', () => {
    console.log(`[${session.id}] WebSocket disconnected`);
  });

  ws.on('error', (err) => {
    console.error(`[${session.id}] WebSocket error:`, err);
  });
});

const PORT = 8080;
httpServer.listen(PORT, () => {
  console.log(`🤖 OpenClaw MCP Server listening on ws://localhost:${PORT}/mcp`);
});
