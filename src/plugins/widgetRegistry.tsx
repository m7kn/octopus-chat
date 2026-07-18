import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface WidgetProps {
  data: Record<string, unknown>;
}

export const SystemStatusCard: React.FC<WidgetProps> = ({ data }) => {
  const os = typeof data.os === 'string' ? data.os : 'Unknown';
  const version = typeof data.version === 'string' || typeof data.version === 'number' ? String(data.version) : 'Unknown';
  const isWeb = data.isWeb === true;
  const timestamp = typeof data.timestamp === 'number' ? new Date(data.timestamp).toLocaleString() : 'N/A';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>System Status</Text>
      <View style={styles.row}>
        <Text style={styles.label}>OS:</Text>
        <Text style={styles.value}>{os}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Version:</Text>
        <Text style={styles.value}>{version}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Platform:</Text>
        <Text style={styles.value}>{isWeb ? 'Web' : 'Native'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Timestamp:</Text>
        <Text style={styles.value}>{timestamp}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
});

export type WidgetComponent = React.FC<WidgetProps>;

export const widgetRegistry: Record<string, WidgetComponent> = {
  SystemStatusCard,
};
