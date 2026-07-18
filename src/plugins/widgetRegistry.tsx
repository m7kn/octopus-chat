import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SystemStatusCardProps {
  data: {
    cpu?: number;
    memory?: number;
    status?: string;
    uptime?: string;
  };
}

const SystemStatusCard: React.FC<SystemStatusCardProps> = ({ data }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>System Status</Text>
      
      <View style={styles.row}>
        <Text style={styles.label}>CPU Usage:</Text>
        <Text style={styles.value}>
          {data.cpu !== undefined ? `${data.cpu}%` : 'N/A'}
        </Text>
      </View>
      
      <View style={styles.row}>
        <Text style={styles.label}>Memory Usage:</Text>
        <Text style={styles.value}>
          {data.memory !== undefined ? `${data.memory}%` : 'N/A'}
        </Text>
      </View>
      
      <View style={styles.row}>
        <Text style={styles.label}>Status:</Text>
        <Text style={[
          styles.value, 
          data.status === 'optimal' ? styles.optimalText : null
        ]}>
          {data.status ? data.status.toUpperCase() : 'UNKNOWN'}
        </Text>
      </View>
      
      <View style={styles.row}>
        <Text style={styles.label}>Uptime:</Text>
        <Text style={styles.value}>{data.uptime || 'N/A'}</Text>
      </View>
    </View>
  );
};

// Központi registry exportálása a MessageContentRenderer számára
export const widgetRegistry: Record<string, React.FC<any>> = {
  SystemStatusCard: SystemStatusCard,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#000000',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#8E8E93',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  optimalText: {
    color: '#34C759',
  },
});