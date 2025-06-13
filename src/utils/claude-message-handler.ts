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
            const toolIcon = this.getToolIcon(toolName);
            
            // Enhanced tool use display with file path extraction
            let toolDescription = `${toolIcon} Using tool: ${toolName}`;
            
            if (item.input) {
              // Extract file path for file operations
              if (item.input.file_path) {
                const fileName = item.input.file_path.split('/').pop() || item.input.file_path;
                toolDescription += ` → ${fileName}`;
              } else if (item.input.command) {
                // Show command for Bash tool
                const command = item.input.command.length > 50 
                  ? item.input.command.substring(0, 50) + '...'
                  : item.input.command;
                toolDescription += ` → ${command}`;
              } else if (item.input.pattern) {
                // Show pattern for Grep/Glob tools
                toolDescription += ` → ${item.input.pattern}`;
              } else {
                // Show parameter names for other tools
                const params = Object.keys(item.input).join(', ');
                toolDescription += ` (${params})`;
              }
            }
            
            contentParts.push(toolDescription);
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
          
          // Enhanced tool result processing for better UI display
          if (typeof content === 'string') {
            // Detect file operations by checking for line number format
            const hasLineNumbers = content.includes('→');
            
            if (hasLineNumbers) {
              // For file reads with line numbers, keep more content and format better
              const maxLines = 50; // Show up to 50 lines for file content
              const lines = content.split('\n');
              
              if (lines.length > maxLines) {
                const truncatedLines = lines.slice(0, maxLines);
                content = truncatedLines.join('\n') + `\n...[showing ${maxLines} of ${lines.length} lines]`;
              }
            } else if (content.length > 1000) {
              // For non-file content, use longer truncation limit
              content = content.substring(0, 1000) + '...[truncated]';
            }
          }
          
          // Enhanced tool result display with better formatting
          const toolName = this.extractToolNameFromId(toolId);
          const resultIcon = this.getToolResultIcon(toolName);
          const resultHeader = toolName ? `${resultIcon} ${toolName} result` : `📊 Tool result`;
          
          toolResults.push(`${resultHeader}${toolId ? ` (${toolId.slice(-8)})` : ''}:\n${content}`);
        }
      });
      
      return toolResults.length > 0 ? toolResults.join('\n\n') : undefined;
    }
    
    return undefined;
  }

  /**
   * Extract tool name from tool use ID for better display
   */
  private static extractToolNameFromId(toolId?: string): string | undefined {
    if (!toolId) return undefined;
    
    // Tool IDs often contain the tool name, extract it
    const toolNames = ['Read', 'Edit', 'Write', 'MultiEdit', 'Bash', 'Grep', 'Glob', 'LS', 'Task'];
    return toolNames.find(name => toolId.toLowerCase().includes(name.toLowerCase()));
  }

  /**
   * Get appropriate icon for tool usage
   */
  private static getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      'Read': '📖',
      'Edit': '✏️', 
      'Write': '📝',
      'MultiEdit': '📄',
      'Bash': '💻',
      'Grep': '🔍',
      'Glob': '📁',
      'LS': '📋',
      'Task': '⚡'
    };
    
    return icons[toolName] || '🔧';
  }

  /**
   * Get appropriate icon for tool results
   */
  private static getToolResultIcon(toolName?: string): string {
    const icons: Record<string, string> = {
      'Read': '📄',
      'Edit': '✅', 
      'Write': '💾',
      'MultiEdit': '📝',
      'Bash': '⚡',
      'Grep': '🔍',
      'Glob': '📁',
      'LS': '📋',
      'Task': '✨'
    };
    
    return toolName ? icons[toolName] || '📊' : '📊';
  }
}