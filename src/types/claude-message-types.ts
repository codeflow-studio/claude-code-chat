/**
 * Comprehensive Claude Code message type definitions
 * Based on the official claude-code-js library patterns
 */

// Base message interface
export interface BaseClaudeMessage {
  type: ClaudeMessageType;
  subtype?: string;
  timestamp?: string;
}

// Message types enum
export type ClaudeMessageType = 'result' | 'system' | 'assistant' | 'user' | 'error' | 'user_input';

// Content types for assistant and user messages
export interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  name?: string; // for tool_use
  input?: any; // for tool_use
  tool_use_id?: string; // for tool_result
  content?: string; // for tool_result
  thinking?: string; // for thinking
  signature?: string; // for thinking (verification signature)
}

// MCP Server info for system messages
export interface MCPServerInfo {
  name: string;
  status: string;
}

// Usage statistics
export interface UsageStats {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Result message (final responses)
export interface ResultMessage extends BaseClaudeMessage {
  type: 'result';
  subtype: 'success';
  cost_usd: number;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  session_id: string;
}

// System message (initialization and configuration)
export interface SystemMessage extends BaseClaudeMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  tools: string[];
  mcp_servers: MCPServerInfo[];
  session_id?: string;
}

// Assistant message (Claude's responses and tool usage)
export interface AssistantMessage extends BaseClaudeMessage {
  type: 'assistant';
  message: {
    content: string | MessageContent[];
    usage?: UsageStats;
  };
  session_id?: string;
}

// User message (tool results and user content)
export interface UserMessage extends BaseClaudeMessage {
  type: 'user';
  message: {
    content: MessageContent[];
  };
  session_id?: string;
}

// Error message
export interface ErrorMessage extends BaseClaudeMessage {
  type: 'error';
  error: string;
  details?: any;
  session_id?: string;
}

// Custom user input message (for tracking user inputs in conversation)
export interface UserInputMessage extends BaseClaudeMessage {
  type: 'user_input';
  subtype: 'prompt' | 'command' | 'file_reference';
  content: string;
  metadata?: {
    files_referenced?: string[];
    command_type?: string;
    timestamp: string;
  };
  session_id?: string;
}

// Union type for all possible messages
export type ClaudeMessage = 
  | ResultMessage 
  | SystemMessage 
  | AssistantMessage 
  | UserMessage 
  | ErrorMessage 
  | UserInputMessage;

// Type guards for different message types
export function isResultMessage(message: ClaudeMessage): message is ResultMessage {
  return message.type === 'result';
}

export function isSystemMessage(message: ClaudeMessage): message is SystemMessage {
  return message.type === 'system';
}

export function isAssistantMessage(message: ClaudeMessage): message is AssistantMessage {
  return message.type === 'assistant';
}

export function isUserMessage(message: ClaudeMessage): message is UserMessage {
  return message.type === 'user';
}

export function isErrorMessage(message: ClaudeMessage): message is ErrorMessage {
  return message.type === 'error';
}

export function isUserInputMessage(message: ClaudeMessage): message is UserInputMessage {
  return message.type === 'user_input';
}

// Response interface for the DirectModeService
export interface DirectModeResponse {
  type: ClaudeMessageType;
  subtype?: string;
  message?: any;
  content?: string;
  error?: string;
  metadata?: {
    sessionId?: string;
    cost?: number;
    duration?: number;
    usage?: UsageStats;
    tools?: string[];
    model?: string;
    mcpServers?: MCPServerInfo[];
  };
  originalMessage?: ClaudeMessage; // Store the original parsed message
  isUpdate?: boolean; // Flag to indicate this is an update to an existing message
}