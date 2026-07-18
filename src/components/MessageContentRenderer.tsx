import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { widgetRegistry } from '../plugins/widgetRegistry';

export interface WidgetPayload {
  type: 'ui-widget';
  name: string;
  data: Record<string, unknown>;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <View style={styles.codeContainer}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language || 'code'}</Text>
        <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
          <Text style={styles.copyButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.codeBody}>
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </View>
    </View>
  );
};

interface WidgetRendererProps {
  payload: WidgetPayload;
  textColor: string;
}

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ payload, textColor }) => {
  const Component = widgetRegistry[payload.name];

  if (!Component) {
    return (
      <View style={styles.unknownWidget}>
        <Text style={[styles.unknownWidgetText, { color: '#FF3B30' }]}>Unknown widget: {payload.name}</Text>
        <Text style={[styles.unknownWidgetData, { color: textColor }]}>
          {JSON.stringify(payload.data, null, 2)}
        </Text>
      </View>
    );
  }

  return <Component data={payload.data} />;
};

const parseWidget = (text: string): WidgetPayload | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.type === 'ui-widget' && typeof parsed.name === 'string') {
      return {
        type: 'ui-widget',
        name: parsed.name,
        data: typeof parsed.data === 'object' && parsed.data !== null ? parsed.data : {},
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
};

const findWidgetInText = (text: string): { widget: WidgetPayload | null; before: string; after: string } => {
  const widgetMarker = '"type": "ui-widget"';
  const markerIndex = text.indexOf(widgetMarker);

  if (markerIndex === -1) {
    return { widget: null, before: text, after: '' };
  }

  let start = markerIndex;
  while (start >= 0 && text[start] !== '{') {
    start--;
  }

  if (start < 0) {
    return { widget: null, before: text, after: '' };
  }

  let braceCount = 0;
  let end = start;
  while (end < text.length) {
    if (text[end] === '{') braceCount++;
    if (text[end] === '}') braceCount--;
    if (braceCount === 0) break;
    end++;
  }

  if (braceCount !== 0 || end >= text.length) {
    return { widget: null, before: text, after: '' };
  }

  const jsonStr = text.slice(start, end + 1);
  const before = text.slice(0, start);
  const after = text.slice(end + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && parsed.type === 'ui-widget' && typeof parsed.name === 'string') {
      return {
        widget: {
          type: 'ui-widget',
          name: parsed.name,
          data: typeof parsed.data === 'object' && parsed.data !== null ? parsed.data : {},
        },
        before,
        after,
      };
    }
  } catch {
    // invalid JSON, fall back to plain text
  }

  return { widget: null, before: text, after: '' };
};

const parseContent = (content: string, textColor: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```([\w\s]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const beforeText = content.slice(lastIndex, match.index);
    if (beforeText.trim()) {
      parts.push(<Text key={`text-${key++}`} style={[styles.plainText, { color: textColor }]}>{beforeText}</Text>);
    }

    const language = match[1].trim() || undefined;
    const code = match[2].replace(/\n$/, '');
    parts.push(<CodeBlock key={`code-${key++}`} code={code} language={language} />);

    lastIndex = match.index + match[0].length;
  }

  const afterText = content.slice(lastIndex);
  if (afterText.trim()) {
    parts.push(<Text key={`text-${key++}`} style={[styles.plainText, { color: textColor }]}>{afterText}</Text>);
  }

  return parts;
};

export interface MessageContentRendererProps {
  content: string;
  isUser?: boolean;
}

const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({ content, isUser = false }) => {
  const trimmed = content.trim();
  const textColor = isUser ? '#FFFFFF' : '#000000';

  const wholeWidget = parseWidget(trimmed);
  if (wholeWidget) {
    return <WidgetRenderer payload={wholeWidget} textColor={textColor} />;
  }

  const { widget, before, after } = findWidgetInText(content);

  if (widget) {
    const beforeParts = parseContent(before, textColor);
    const afterParts = after.trim() ? parseContent(after, textColor) : [];

    return (
      <View style={styles.container}>
        {beforeParts.map((part, i) => (
          <View key={`before-${i}`} style={styles.partContainer}>
            {part}
          </View>
        ))}
        <WidgetRenderer payload={widget} textColor={textColor} />
        {afterParts.map((part, i) => (
          <View key={`after-${i}`} style={styles.partContainer}>
            {part}
          </View>
        ))}
      </View>
    );
  }

  const parts = parseContent(content, textColor);

  if (parts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {parts.map((part, index) => (
        <View key={index} style={styles.partContainer}>
          {part}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  partContainer: {
    marginBottom: 8,
  },
  plainText: {
    fontSize: 16,
    lineHeight: 22,
  },
  codeContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2D2D2D',
  },
  codeLanguage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CDCFE',
    textTransform: 'uppercase',
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#3E3E3E',
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4D4D4',
  },
  codeBody: {
    padding: 12,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    lineHeight: 20,
    color: '#D4D4D4',
  },
  unknownWidget: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30',
  },
  unknownWidgetText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  unknownWidgetData: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default MessageContentRenderer;
