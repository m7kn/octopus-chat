import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ChatMessage } from '../mcp/types';

const WEB_STORAGE_KEY = 'octopus-chat-messages';

async function readMessages(): Promise<ChatMessage[]> {
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem(WEB_STORAGE_KEY);
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

async function writeMessages(messages: ChatMessage[]): Promise<void> {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const payload = JSON.stringify(sorted);

  if (Platform.OS === 'web') {
    localStorage.setItem(WEB_STORAGE_KEY, payload);
    return;
  }

  const path = `${FileSystem.documentDirectory}db/messages.json`;
  await FileSystem.writeAsStringAsync(path, payload);
}

export async function loadAllMessages(): Promise<ChatMessage[]> {
  const messages = await readMessages();
  return messages.sort((a, b) => a.timestamp - b.timestamp);
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
