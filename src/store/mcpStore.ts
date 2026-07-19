import { create } from 'zustand';
import { McpWebSocketClient, ConnectionStatus, McpToolHandler } from '../core/mcp/transport';
import { McpTool, McpError, ChatMessage } from '../core/mcp/types';
import { initializeDatabase } from '../core/db/database';
import { loadAllMessages, saveMessage, updateMessageContent } from '../core/db/messageRepo';

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
  pendingAuthorization: { toolName: string; params: unknown; resolve: (approved: boolean) => void } | null;
  connect: (url: string) => void;
  disconnect: () => void;
  sendUserPrompt: (text: string) => Promise<void>;
  registerLocalTool: (tool: McpTool, handler: McpToolHandler) => void;
  unregisterLocalTool: (name: string) => void;
  approveTool: () => void;
  denyTool: () => void;
  clearError: () => void;
  init: () => Promise<void>;
}

let messageIdCounter = 0;
let dbInitialized = false;

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
    onMessageReceived: async (text: string, isDone: boolean, thought?: string) => {
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed && !isDone && thought === undefined) return;

      set((state) => {
        const messages = [...state.messages];
        const lastMessage = messages[messages.length - 1];
        const nextThought = thought;

        if (lastMessage && lastMessage.role === 'assistant') {
          const prevId = typeof lastMessage.id === 'string' ? lastMessage.id : String(lastMessage.id ?? '');
          const updatedContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
          const updatedMessage = {
            ...lastMessage,
            id: prevId,
            content: updatedContent + text,
            thought: nextThought !== undefined ? nextThought : lastMessage.thought,
          };
          messages[messages.length - 1] = updatedMessage;
        } else {
          const safeCounter = ++messageIdCounter;
          messages.push({
            id: `msg-${safeCounter}`,
            role: 'assistant',
            content: text,
            thought: nextThought,
            timestamp: Date.now(),
          });
        }

        return { messages };
      });

      if (isDone) {
        const updatedMessages = get().messages;
        const lastMessage = get().messages[get().messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          await saveMessage(lastMessage).catch((err) => {
            console.error("=> DB HIBA az asszisztens üzenet mentésekor:", err);
          });
        }
      }
    },
  });

  client.validateToolPermission = async (toolName: string, params: unknown) => {
    return new Promise<boolean>((resolve) => {
      set({
        pendingAuthorization: {
          toolName,
          params,
          resolve,
        },
      });
    });
  };

  return {
    client,
    isConnected: false,
    activeTools: [],
    messages: [],
    error: null,
    pendingAuthorization: null,
    connect: (url: string) => {
      client.connect(url);
    },
    disconnect: () => {
      client.disconnect();
    },
    sendUserPrompt: async (text: string) => {
      const userMessage: ChatMessage = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
      }));

      await saveMessage(userMessage);
      client.sendMessage(text);
    },
    registerLocalTool: (tool: McpTool, handler: McpToolHandler) => {
      client.registerLocalTool(tool, handler);
    },
    unregisterLocalTool: (name: string) => {
      client.unregisterLocalTool(name);
    },
    approveTool: () => {
      const auth = get().pendingAuthorization;
      if (auth) {
        auth.resolve(true);
        set({ pendingAuthorization: null });
      }
    },
    denyTool: () => {
      const auth = get().pendingAuthorization;
      if (auth) {
        auth.resolve(false);
        set({ pendingAuthorization: null });
      }
    },
    clearError: () => {
      set({ error: null });
    },
    init: async () => {
      console.log("=> Init start...");

      if (dbInitialized) return;
      dbInitialized = true;
      console.log("=> DB inicializálása kezdődik...");

      await initializeDatabase();

      console.log("=> DB sikeresen inicializálva.");      
      console.log("=> Előzménymezőnyök betöltése a DB-ből...");
      
      const historicalMessages = await loadAllMessages();

      console.log(`=> DB-ből betöltött üzenetek száma: ${historicalMessages.length}`);

      let maxCounter = 0;
      for (const msg of historicalMessages) {
        const idStr = typeof msg.id === 'string' ? msg.id : String(msg.id ?? '');
        const numPart = idStr.replace(/^msg-/, '');
        const parsed = parseInt(numPart, 10);
        if (!Number.isNaN(parsed) && parsed > maxCounter) {
          maxCounter = parsed;
        }
      }
      messageIdCounter = maxCounter;

      set({ messages: historicalMessages });
    },
    };
});
