import { Platform } from 'react-native';
import * as FileSystem from "expo-file-system/legacy";
import { ChatMessage, ChatSession } from '../mcp/types';

const WEB_MESSAGES_KEY = 'octopus-chat-messages';
const WEB_SESSIONS_KEY = 'octopus-chat-sessions';

async function readMessages(): Promise<ChatMessage[]> {
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem(WEB_MESSAGES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  try {
    const path = `${FileSystem.documentDirectory}db/messages.json`;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readSessions(): Promise<ChatSession[]> {
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem(WEB_SESSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  try {
    const path = `${FileSystem.documentDirectory}db/sessions.json`;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMessages(messages: ChatMessage[]): Promise<void> {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const payload = JSON.stringify(sorted);

  if (Platform.OS === 'web') {
    localStorage.setItem(WEB_MESSAGES_KEY, payload);
    return;
  }

  const path = `${FileSystem.documentDirectory}db/messages.json`;
  await FileSystem.writeAsStringAsync(path, payload);
}

async function writeSessions(sessions: ChatSession[]): Promise<void> {
  const sorted = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
  const payload = JSON.stringify(sorted);

  if (Platform.OS === 'web') {
    localStorage.setItem(WEB_SESSIONS_KEY, payload);
    return;
  }

  const path = `${FileSystem.documentDirectory}db/sessions.json`;
  await FileSystem.writeAsStringAsync(path, payload);
}

export async function loadAllMessages(): Promise<ChatMessage[]> {
  const messages = await readMessages();
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function loadAllSessions(): Promise<ChatSession[]> {
  const sessions = await readSessions();
  return sessions.sort((a, b) => a.createdAt - b.createdAt);
}

export async function loadMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
  const messages = await readMessages();
  return messages
    .filter(m => m.sessionId === sessionId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function createSession(session: ChatSession): Promise<void> {
  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  const messages = await readMessages();
  messages.push(message);
  await writeMessages(messages);
}

export async function updateMessageContent(
  id: string,
  content: string,
  thought?: string
): Promise<void> {
  const messages = await readMessages();
  const index = messages.findIndex(m => m.id === id);
  if (index >= 0) {
    messages[index] = { ...messages[index], content, thought };
    await writeMessages(messages);
  }
}

export async function deleteSessionData(sessionId: string): Promise<void> {
  const messages = await readMessages();
  const filtered = messages.filter(m => m.sessionId !== sessionId);
  await writeMessages(filtered);

  const sessions = await readSessions();
  const remaining = sessions.filter(s => s.id !== sessionId);
  await writeSessions(remaining);
}
