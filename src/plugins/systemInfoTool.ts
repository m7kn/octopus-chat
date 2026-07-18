import { McpTool } from '../core/mcp/types';
import { McpToolHandler } from '../core/mcp/transport';
import { Platform } from 'react-native';

export const systemInfoTool: McpTool = {
  name: 'get_system_info',
  description: 'Returns basic system information about the current device.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const systemInfoToolHandler: McpToolHandler = async () => {
  return {
    os: Platform.OS,
    version: Platform.Version,
    isWeb: Platform.OS === 'web',
    timestamp: Date.now(),
  };
};
