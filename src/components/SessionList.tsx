import React, { useCallback } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMcpStore } from '../store/mcpStore';
import { ChatSession } from '../core/mcp/types';

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SessionItem: React.FC<{
  session: ChatSession;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
  onClose?: () => void;
}> = ({ session, isActive, onPress, onDelete, onClose }) => {
  const handleDelete = useCallback(() => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete "${session.title || 'this chat'}"?`);
      if (confirmed) {
        onDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete "${session.title || 'this chat'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  }, [session.title, onDelete]);

  return (
    <TouchableOpacity
      onPress={async () => {
        console.log('Switching to session:', session.id);
        await onPress();
        onClose?.();
      }}
      style={[styles.item, isActive && styles.itemActive]}
      activeOpacity={0.7}
    >
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, isActive && styles.itemTitleActive]} numberOfLines={1}>
          {session.title || formatDate(session.createdAt)}
        </Text>
        {!session.title && (
          <Text style={[styles.itemDate, isActive && styles.itemDateActive]} numberOfLines={1}>
            {formatDate(session.createdAt)}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const SessionList: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const sessions = useMcpStore((state: { sessions: ChatSession[] }) => state.sessions);
  const activeSessionId = useMcpStore((state: { activeSessionId: string | null }) => state.activeSessionId);
  const createNewSession = useMcpStore((state: { createNewSession: () => void }) => state.createNewSession);
  const switchSession = useMcpStore((state: { switchSession: (sessionId: string) => Promise<void> }) => state.switchSession);
  const deleteSession = useMcpStore((state: { deleteSession: (sessionId: string) => Promise<void> }) => state.deleteSession);

  const handleNewChat = useCallback(() => {
    createNewSession();
  }, [createNewSession]);

  const handleSwitch = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      await switchSession(sessionId);
    },
    [activeSessionId, switchSession]
  );

  const handleDelete = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
    },
    [deleteSession]
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatSession }) => (
      <SessionItem
        session={item}
        isActive={item.id === activeSessionId}
        onPress={async () => {
          console.log('Switching to session:', item.id);
          await handleSwitch(item.id);
        }}
        onDelete={() => handleDelete(item.id)}
        onClose={onClose}
      />
    ),
    [activeSessionId, handleSwitch, handleDelete, onClose]
  );

  const keyExtractor = useCallback((item: ChatSession) => item.id, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity onPress={handleNewChat} style={styles.newChatButton}>
          <Text style={styles.newChatButtonText}>+ New Chat</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={sessions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No chats yet</Text>
          </View>
        }
      />
    </View>
  );
};

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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  newChatButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    cursor: 'pointer',
  },
  newChatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  itemActive: {
    backgroundColor: '#E5F1FF',
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000000',
    paddingRight: 2,
  },
  itemTitleActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    paddingRight: 2,
  },
  itemDateActive: {
    color: '#007AFF',
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F2F2F7',
    cursor: 'pointer',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C8',
    marginLeft: 16,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#8E8E93',
  },
});

export default SessionList;
