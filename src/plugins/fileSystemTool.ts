import * as FileSystem from 'expo-file-system';
import { McpTool } from '../core/mcp/types';
import { McpToolHandler as McpToolHandlerTransport } from '../core/mcp/transport';

export const listSandboxFilesTool: McpTool = {
  name: 'list_sandbox_files',
  description: 'Lists all files and directories inside the client application sandbox.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const listSandboxFilesHandler: McpToolHandlerTransport = async () => {
  const directory = FileSystem.documentDirectory ?? '';

  if (!directory) {
    return { files: [], error: 'Document directory not available' };
  }

  const exists = await FileSystem.getInfoAsync(directory);

  if (!exists.exists) {
    return { files: [] };
  }

  const entries = await FileSystem.readDirectoryAsync(directory);

  const files = await Promise.all(
    entries.map(async (name) => {
      const uri = `${directory}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      const fileInfo = info as FileSystem.FileInfo & { size?: number };
      return {
        name,
        size: fileInfo.size ?? 0,
        isDirectory: (fileInfo.exists && fileInfo.isDirectory) ?? false,
      };
    })
  );

  return { files };
};

export const readSandboxFileTool: McpTool = {
  name: 'read_sandbox_file',
  description: 'Reads the textual content of a specific file within the application sandbox.',
  inputSchema: {
    type: 'object',
    properties: {
      fileName: { type: 'string' },
    },
    required: ['fileName'],
  },
};

const sanitizeFileName = (fileName: string): string => {
  const trimmed = fileName.trim();
  if (trimmed.includes('..') || trimmed.startsWith('/')) {
    throw new Error('Invalid file name: path traversal detected');
  }
  return trimmed;
};

export const readSandboxFileHandler: McpToolHandlerTransport = async (params) => {
  const args = params as { fileName?: string };

  if (!args.fileName || typeof args.fileName !== 'string') {
    throw new Error('fileName is required');
  }

  const fileName = sanitizeFileName(args.fileName);
  const directory = FileSystem.documentDirectory ?? '';

  if (!directory) {
    throw new Error('Document directory not available');
  }

  const fileUri = `${directory}${fileName}`;
  const info = await FileSystem.getInfoAsync(fileUri);

  if (!info.exists) {
    throw new Error(`File not found: ${fileName}`);
  }

  const content = await FileSystem.readAsStringAsync(fileUri);
  return { fileName, content };
};
