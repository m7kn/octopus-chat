import { create } from 'zustand';
import { McpWebSocketClient, ConnectionStatus, McpToolHandler } from '../core/mcp/transport';
import { McpTool, McpError, ChatMessage } from '../core/mcp/types';

export interface ActiveTool {
  name: string;
  params: unknown;
  startedAt: number;
}

export interface McpStore {
  client: McpWebSocketClient | null;
  isConnected: boolean;
  activeTools: ActiveTool[];
  messages: ChatMessage[];
  error: McpError | null;
  connect: (url: string) => void;
  disconnect: () => void;
  sendUserPrompt: (text: string) => void;
  registerLocalTool: (tool: McpTool, handler: McpToolHandler) => void;
  unregisterLocalTool: (name: string) => void;
  clearError: () => void;
}

let messageIdCounter = 0;

export const useMcpStore = create<McpStore>((set, get) => {
  const client = new McpWebSocketClient('', {
    onStatusChange: (status: ConnectionStatus) => {
      set({ isConnected: status === 'connected' });
    },
    onToolStart: (toolName: string, params: unknown) => {
      const activeTool: ActiveTool = {
        name: toolName,
        params,
        startedAt: Date.now(),
      };
      set((state) => ({
        activeTools: [...state.activeTools, activeTool],
      }));
    },
    onToolEnd: (toolName: string) => {
      set((state) => ({
        activeTools: state.activeTools.filter((tool) => tool.name !== toolName),
      }));
    },
    onMessageReceived: (text: string, isDone: boolean, thought?: string) => {
      set((state) => {
        const messages = [...state.messages];
        const lastMessage = messages[messages.length - 1];

        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content += text;
          if (thought !== undefined) {
            lastMessage.thought = thought;
          }
        } else {
          messages.push({
            id: `msg-${++messageIdCounter}`,
            role: 'assistant',
            content: text,
            thought,
            timestamp: Date.now(),
          });
        }

        return { messages };
      });
    },
  });

  return {
    client,
    isConnected: false,
    activeTools: [],
    messages: [],
    error: null,
    connect: (url: string) => {
      client.connect(url);
    },
    disconnect: () => {
      client.disconnect();
    },
    sendUserPrompt: (text: string) => {
      const userMessage: ChatMessage = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
      }));

      client.sendMessage(text);
    },
    registerLocalTool: (tool: McpTool, handler: McpToolHandler) => {
      client.registerLocalTool(tool, handler);
    },
    unregisterLocalTool: (name: string) => {
      client.unregisterLocalTool(name);
    },
    clearError: () => {
      set({ error: null });
    },
  };
});
