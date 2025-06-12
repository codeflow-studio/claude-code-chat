import {
  ClaudeMessage,
  ClaudeMessageType,
  DirectModeResponse,
  ResultMessage,
  SystemMessage,
  AssistantMessage,
  UserMessage,
  ErrorMessage,
  UserInputMessage,
  MessageContent,
  isResultMessage,
  isSystemMessage,
  isAssistantMessage,
  isUserMessage,
  isErrorMessage,
  isUserInputMessage,
} from '../types/claude-message-types';

/**
 * Comprehensive message handler for Claude Code responses
 * Handles all message types with proper parsing and content extraction
 */
export class ClaudeMessageHandler {
  /**
   * Parse raw JSON output from Claude Code CLI
   */
  static parseRawOutput(stdout: string): ClaudeMessage[] {
    if (!stdout.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(stdout);
      
      // Handle both single messages and arrays
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      
      return messages.map(msg => this.normalizeMessage(msg));
    } catch (error) {
      throw new Error(`Failed to parse Claude Code JSON output: ${error}`);
    }
  }

  /**
   * Parse streaming JSON output (one JSON object per line)
   */
  static parseStreamingOutput(output: string): ClaudeMessage[] {
    const lines = output.split('\n').filter(line => line.trim());
    const messages: ClaudeMessage[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        messages.push(this.normalizeMessage(parsed));
      } catch (error) {
        // Skip invalid JSON lines but continue processing
        console.warn(`Skipping invalid JSON line: ${line}`);
      }
    }

    return messages;
  }

  /**
   * Normalize message to ensure it has proper type structure
   */
  static normalizeMessage(rawMessage: any): ClaudeMessage {
    // Add timestamp if not present
    if (!rawMessage.timestamp) {
      rawMessage.timestamp = new Date().toISOString();
    }

    return rawMessage as ClaudeMessage;
  }

  /**
   * Convert Claude message to DirectModeResponse format
   */
  static toDirectModeResponse(message: ClaudeMessage): DirectModeResponse {
    const baseResponse: DirectModeResponse = {
      type: message.type,
      subtype: message.subtype,
      originalMessage: message,
    };

    switch (message.type) {
      case 'result':
        if (isResultMessage(message)) {
          return {
            ...baseResponse,
            content: message.result,
            metadata: {
              sessionId: message.session_id,
              cost: message.cost_usd,
              duration: message.duration_ms,
            }
          };
        }
        break;

      case 'system':
        if (isSystemMessage(message)) {
          const content = this.formatSystemContent(message);
          return {
            ...baseResponse,
            content,
            metadata: {
              sessionId: message.session_id,
              tools: message.tools,
              model: message.model,
              mcpServers: message.mcp_servers,
            }
          };
        }
        break;

      case 'assistant':
        if (isAssistantMessage(message)) {
          const content = this.extractAssistantContent(message);
          return {
            ...baseResponse,
            message: message.message,
            content,
            metadata: {
              sessionId: message.session_id,
              usage: message.message.usage,
            }
          };
        }
        break;

      case 'user':
        if (isUserMessage(message)) {
          const content = this.extractUserContent(message);
          return {
            ...baseResponse,
            message: message.message,
            content,
            metadata: {
              sessionId: message.session_id,
            }
          };
        }
        break;

      case 'error':
        if (isErrorMessage(message)) {
          return {
            ...baseResponse,
            error: message.error,
            metadata: {
              sessionId: message.session_id,
            }
          };
        }
        break;

      case 'user_input':
        if (isUserInputMessage(message)) {
          return {
            ...baseResponse,
            content: message.content,
            metadata: {
              sessionId: message.session_id,
            }
          };
        }
        break;
    }

    return baseResponse;
  }

  /**
   * Extract the final result content from any message type
   */
  static extractContent(message: ClaudeMessage): string {
    switch (message.type) {
      case 'result':
        if (isResultMessage(message)) {
          return message.result;
        }
        break;
      
      case 'assistant':
        if (isAssistantMessage(message)) {
          return this.extractAssistantContent(message) || '';
        }
        break;
      
      case 'user_input':
        if (isUserInputMessage(message)) {
          return message.content;
        }
        break;
      
      case 'error':
        if (isErrorMessage(message)) {
          return message.error;
        }
        break;
      
      case 'system':
        if (isSystemMessage(message)) {
          return this.formatSystemContent(message);
        }
        break;
      
      case 'user':
        if (isUserMessage(message)) {
          return this.extractUserContent(message) || '';
        }
        break;
    }
    
    return '';
  }

  /**
   * Extract session ID from any message type
   */
  static extractSessionId(message: ClaudeMessage): string | undefined {
    return 'session_id' in message ? message.session_id : undefined;
  }

  /**
   * Check if message indicates an error
   */
  static isError(message: ClaudeMessage): boolean {
    if (message.type === 'error') {
      return true;
    }
    
    if (message.type === 'result' && isResultMessage(message)) {
      return message.is_error;
    }
    
    return false;
  }

  /**
   * Get cost information from message if available
   */
  static extractCost(message: ClaudeMessage): number | undefined {
    if (message.type === 'result' && isResultMessage(message)) {
      return message.cost_usd;
    }
    return undefined;
  }

  /**
   * Get timing information from message if available
   */
  static extractTiming(message: ClaudeMessage): { duration_ms?: number; duration_api_ms?: number } {
    if (message.type === 'result' && isResultMessage(message)) {
      return {
        duration_ms: message.duration_ms,
        duration_api_ms: message.duration_api_ms,
      };
    }
    return {};
  }

  /**
   * Get usage statistics from message if available
   */
  static extractUsage(message: ClaudeMessage) {
    if (message.type === 'assistant' && isAssistantMessage(message)) {
      return message.message.usage;
    }
    return undefined;
  }

  /**
   * Create a user input message for tracking conversation history
   */
  static createUserInputMessage(
    content: string,
    subtype: 'prompt' | 'command' | 'file_reference' = 'prompt',
    metadata?: {
      files_referenced?: string[];
      command_type?: string;
    }
  ): UserInputMessage {
    return {
      type: 'user_input',
      subtype,
      content,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Filter messages by type
   */
  static filterByType<T extends ClaudeMessage>(
    messages: ClaudeMessage[],
    type: ClaudeMessageType
  ): T[] {
    return messages.filter(msg => msg.type === type) as T[];
  }

  /**
   * Get the last message of a specific type
   */
  static getLastMessageOfType<T extends ClaudeMessage>(
    messages: ClaudeMessage[],
    type: ClaudeMessageType
  ): T | undefined {
    const filtered = this.filterByType<T>(messages, type);
    return filtered[filtered.length - 1];
  }

  /**
   * Process a complete conversation flow and return organized results
   */
  static processConversation(messages: ClaudeMessage[]) {
    const systemInfo = this.getLastMessageOfType<SystemMessage>(messages, 'system');
    const finalResult = this.getLastMessageOfType<ResultMessage>(messages, 'result');
    const errors = this.filterByType<ErrorMessage>(messages, 'error');
    const assistantMessages = this.filterByType<AssistantMessage>(messages, 'assistant');
    const userInputs = this.filterByType<UserInputMessage>(messages, 'user_input');

    return {
      systemInfo,
      finalResult,
      errors,
      assistantMessages,
      userInputs,
      hasErrors: errors.length > 0 || (finalResult?.is_error ?? false),
      sessionId: finalResult?.session_id || systemInfo?.session_id,
      totalCost: finalResult?.cost_usd,
      timing: finalResult ? this.extractTiming(finalResult) : {},
    };
  }

  // Private helper methods for content extraction

  /**
   * Format system content for display
   */
  private static formatSystemContent(message: SystemMessage): string {
    const parts: string[] = [];
    
    if (message.model) {
      parts.push(`Model: ${message.model}`);
    }
    
    if (message.tools && message.tools.length > 0) {
      parts.push(`Available tools: ${message.tools.length}`);
    }
    
    if (message.mcp_servers && message.mcp_servers.length > 0) {
      const connectedServers = message.mcp_servers
        .filter(server => server.status === 'connected')
        .map(server => server.name)
        .join(', ');
      if (connectedServers) {
        parts.push(`MCP servers: ${connectedServers}`);
      }
    }
    
    return parts.length > 0 ? `Session initialized\n${parts.join('\n')}` : 'Session initialized';
  }

  /**
   * Extract content from assistant responses
   */
  private static extractAssistantContent(message: AssistantMessage): string | undefined {
    if (message.message?.content) {
      if (Array.isArray(message.message.content)) {
        const contentParts: string[] = [];
        
        message.message.content.forEach((item: MessageContent) => {
          if (item.type === 'text' && item.text) {
            contentParts.push(item.text);
          } else if (item.type === 'tool_use') {
            const toolName = item.name || 'unknown';
            const input = item.input ? ` (${Object.keys(item.input).join(', ')})` : '';
            contentParts.push(`🔧 Using tool: ${toolName}${input}`);
          } else if (item.type === 'thinking' && item.thinking) {
            // Display thinking content with special formatting
            const thinkingPreview = item.thinking.length > 150 
              ? item.thinking.substring(0, 150) + '...' 
              : item.thinking;
            contentParts.push(`🤔 Thinking: ${thinkingPreview}`);
          }
        });
        
        return contentParts.length > 0 ? contentParts.join('\n') : undefined;
      }
      
      if (typeof message.message.content === 'string') {
        return message.message.content;
      }
    }
    
    return undefined;
  }

  /**
   * Extract content from user responses (tool results)
   */
  private static extractUserContent(message: UserMessage): string | undefined {
    if (message.message?.content && Array.isArray(message.message.content)) {
      const toolResults: string[] = [];
      
      message.message.content.forEach((item: MessageContent) => {
        if (item.type === 'tool_result') {
          const toolId = item.tool_use_id;
          let content = item.content;
          
          // Truncate very long tool results for better display
          if (typeof content === 'string' && content.length > 500) {
            content = content.substring(0, 500) + '...[truncated]';
          }
          
          toolResults.push(`📊 Tool result${toolId ? ` (${toolId.slice(-8)})` : ''}:\n${content}`);
        }
      });
      
      return toolResults.length > 0 ? toolResults.join('\n\n') : undefined;
    }
    
    return undefined;
  }
}