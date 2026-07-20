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
}

const sessions = new Map<string, Session>();

function getOrCreateSession(ws: WebSocket): Session {
  const id = ws.url || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let session = sessions.get(id);
  if (!session) {
    session = { id, initialized: false };
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
      name: 'openclaw-server',
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
  params: unknown,
  requestId: number | string | null
): Promise<void> {
  const chatParams = (params as Record<string, unknown>) || {};
  const text = typeof chatParams.text === 'string' ? chatParams.text : '';
  console.log(`[${session.id}] messages/new: "${text}"`);

  // Stub: acknowledge receipt
  if (requestId !== null) {
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
