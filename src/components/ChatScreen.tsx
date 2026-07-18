import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMcpStore } from '../store/mcpStore';
import { systemInfoTool, systemInfoToolHandler } from '../plugins/systemInfoTool';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [thoughtExpanded, setThoughtExpanded] = useState<Record<string, boolean>>({});
  const scrollViewRef = useRef<ScrollView>(null);

  const messages = useMcpStore((state: { messages: { id: string; role: 'user' | 'assistant'; content: string; thought?: string }[] }) => state.messages);
  const isConnected = useMcpStore((state: { isConnected: boolean }) => state.isConnected);
  const activeTools = useMcpStore((state: { activeTools: { name: string; params: unknown; startedAt: number }[] }) => state.activeTools);
  const sendUserPrompt = useMcpStore((state: { sendUserPrompt: (text: string) => void }) => state.sendUserPrompt);
  const registerLocalTool = useMcpStore((state: { registerLocalTool: (tool: import('../core/mcp/types').McpTool, handler: import('../core/mcp/transport').McpToolHandler) => void }) => state.registerLocalTool);
  const client = useMcpStore((state: { client: import('../core/mcp/transport').McpWebSocketClient | null }) => state.client);

  const connect = useMcpStore((state) => state.connect);

  useEffect(() => {
    registerLocalTool(systemInfoTool, systemInfoToolHandler);
  }, [registerLocalTool]);

  useEffect(() => {
      // Válassz az alábbi URL-ek közül a tesztelési környezeted alapján:
      // Webes teszteléshez (npm run web):
      const SERVER_URL = 'ws://localhost:8080/mcp';
      
      // Android Emulátorhoz (ha a gépeden fut a mock szerver):
      // const SERVER_URL = 'ws://10.0.2.2:8080/mcp';
      
      // Valódi Android telefonhoz (a fejlesztői géped helyi IP címe kell):
      // const SERVER_URL = 'ws://192.168.1.X:8080/mcp';

      connect(SERVER_URL);
    }, [connect]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !isConnected) return;

    sendUserPrompt(trimmed);
    setInputText('');
  }, [inputText, isConnected, sendUserPrompt]);

  const toggleThought = useCallback((messageId: string) => {
    setThoughtExpanded((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const renderMessage = useCallback((message: { id: string; role: 'user' | 'assistant'; content: string; thought?: string }) => {
    const isUser = message.role === 'user';
    const showThought = thoughtExpanded[message.id];

    return (
      <View
        key={message.id}
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {!isUser && message.thought && (
          <TouchableOpacity
            onPress={() => toggleThought(message.id)}
            style={styles.thoughtToggle}
          >
            <Text style={styles.thoughtToggleText}>{showThought ? 'Hide reasoning' : 'Show reasoning'}</Text>
          </TouchableOpacity>
        )}
        {!isUser && message.thought && showThought && (
          <View style={styles.thoughtBox}>
            <Text style={styles.thoughtText}>{message.thought}</Text>
          </View>
        )}
        <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
      </View>
    );
  }, [thoughtExpanded, toggleThought]);

  const renderActiveToolsOverlay = () => {
    if (activeTools.length === 0) return null;

    return (
      <View style={styles.activeToolsOverlay}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.activeToolsText}>
          {activeTools.map((t: { name: string }) => t.name).join(', ')} running...
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Octopus Chat</Text>
        <View style={[styles.statusDot, { backgroundColor: isConnected ? '#34C759' : '#FF3B30' }]} />
      </View>

      {renderActiveToolsOverlay()}

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {isConnected ? 'Send a message to start chatting.' : 'Connect to a server to begin.'}
            </Text>
          </View>
        )}
        {messages.map(renderMessage)}
      </ScrollView>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 8 : 12) }]}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={isConnected ? 'Type a message...' : 'Not connected'}
          placeholderTextColor="#8E8E93"
          editable={isConnected}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendButton, { opacity: isConnected && inputText.trim() ? 1 : 0.5 }]}
          onPress={handleSend}
          disabled={!isConnected || !inputText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#000000',
  },
  thoughtToggle: {
    marginBottom: 8,
  },
  thoughtToggleText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  thoughtBox: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8E8E93',
  },
  thoughtText: {
    fontSize: 13,
    color: '#3C3C43',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  activeToolsOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  activeToolsText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    fontSize: 16,
    color: '#000000',
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
