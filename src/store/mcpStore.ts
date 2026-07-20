import { create } from 'zustand';
import { McpWebSocketClient, ConnectionStatus, McpToolHandler } from '../core/mcp/transport';
import { McpTool, McpError, ChatMessage, ChatSession } from '../core/mcp/types';
import { initializeDatabase } from '../core/db/database';
import { loadAllMessages, saveMessage, updateMessageContent, loadAllSessions, loadMessagesBySession, createSession, deleteSessionData } from '../core/db/messageRepo';

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
  sessions: ChatSession[];
  activeSessionId: string | null;
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
  createNewSession: () => void;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
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
            sessionId: lastMessage.sessionId,
          };
          messages[messages.length - 1] = updatedMessage;
        } else {
          const safeCounter = ++messageIdCounter;
          const activeSessionId = get().activeSessionId;
          messages.push({
            id: `msg-${safeCounter}`,
            role: 'assistant',
            content: text,
            thought: nextThought,
            timestamp: Date.now(),
            sessionId: activeSessionId ?? '',
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
    sessions: [],
    activeSessionId: null,
    error: null,
    pendingAuthorization: null,
    connect: (url: string) => {
      client.connect(url);
    },
    disconnect: () => {
      client.disconnect();
    },
    sendUserPrompt: async (text: string) => {
      const activeSessionId = get().activeSessionId;
      if (!activeSessionId) return;

      const userMessage: ChatMessage = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        sessionId: activeSessionId,
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
      createNewSession: () => {
        const newSession: ChatSession = {
          id: `session-${Date.now()}`,
          title: 'New Chat',
          createdAt: Date.now(),
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newSession.id,
          messages: [],
        }));
      },
      switchSession: async (sessionId: string) => {
        try {
          const sessionMessages = await loadMessagesBySession(sessionId);
          set({ 
            activeSessionId: sessionId, 
            messages: sessionMessages 
          });
        } catch (error) {
          console.error("Failed to switch session:", error);
        }
      },
      deleteSession: async (sessionId: string) => {
        await deleteSessionData(sessionId);
        set((state) => ({
          sessions: state.sessions.filter(s => s.id !== sessionId),
          activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
          messages: state.activeSessionId === sessionId ? [] : state.messages,
        }));
      },
      init: async () => {
        console.log("=> Init start...");

        if (dbInitialized) return;
        dbInitialized = true;
        console.log("=> DB inicializálása kezdődik...");

        await initializeDatabase();

        console.log("=> DB sikeresen inicializálva.");      
        console.log("=> Előzménymezőnyök betöltése a DB-ből...");
        
        const historicalSessions = await loadAllSessions();
        let activeSessionId: string | null = null;
        let historicalMessages: ChatMessage[] = [];

        if (historicalSessions.length > 0) {
          const mostRecent = historicalSessions[historicalSessions.length - 1];
          activeSessionId = mostRecent.id;
          historicalMessages = await loadMessagesBySession(mostRecent.id);
        } else {
          const newSession: ChatSession = {
            id: `session-${Date.now()}`,
            title: 'New Chat',
            createdAt: Date.now(),
          };
          await createSession(newSession);
          activeSessionId = newSession.id;
          historicalSessions.push(newSession);
        }

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

        set({ 
          sessions: historicalSessions,
          activeSessionId,
          messages: historicalMessages 
        });
      },
    };
});
