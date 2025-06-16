/**
 * Message Processor Service
 * Handles Claude message processing, analysis, and response conversion
 */

import { ClaudeMessageHandler } from '../utils/claude-message-handler';
import { ClaudeMessage, DirectModeResponse } from '../types/claude-message-types';

export interface MessageProcessingResult {
  shouldProcess: boolean;
  isPermissionRequest?: boolean;
  isError?: boolean;
  isDuplicate?: boolean;
  directModeResponse?: DirectModeResponse;
}

export class MessageProcessor {
  private _lastMessage?: DirectModeResponse;
  private _lastAssistantMessage?: ClaudeMessage;
  private _currentSessionId?: string;

  /**
   * Processes a Claude message and returns processing result
   */
  async processClaudeMessage(claudeMessage: ClaudeMessage): Promise<MessageProcessingResult> {
    try {
      // Extract and store session ID from all messages that have it
      const sessionId = ClaudeMessageHandler.extractSessionId(claudeMessage);
      if (sessionId) {
        this._currentSessionId = sessionId;
        console.log(`Session ID captured from ${claudeMessage.type} message:`, this._currentSessionId);
      }

      // Store assistant messages for command context extraction
      if (claudeMessage.type === 'assistant') {
        this._lastAssistantMessage = claudeMessage;
      }

      // Check for errors - but these should be handled by the caller for permission requests
      if (ClaudeMessageHandler.isError(claudeMessage)) {
        return {
          shouldProcess: false,
          isError: true
        };
      }

      // Convert to DirectModeResponse format
      const directModeResponse = ClaudeMessageHandler.toDirectModeResponse(claudeMessage);
      
      // Check for duplicate content between result and last assistant message
      if (claudeMessage.type === 'result' && this._lastMessage?.type === 'assistant') {
        const currentContent = directModeResponse.content;
        const lastContent = this._lastMessage.content;
        
        if (currentContent && lastContent && currentContent.trim() === lastContent.trim()) {
          console.log('Detected duplicate content between result and assistant message - updating last message');
          
          // Update the last message with result metadata while keeping assistant content
          const updatedResponse: DirectModeResponse = {
            ...this._lastMessage,
            type: 'result',
            subtype: directModeResponse.subtype,
            metadata: directModeResponse.metadata,
            originalMessage: claudeMessage,
            isUpdate: true // Flag to indicate this is an update
          };
          
          this._lastMessage = updatedResponse;
          
          return {
            shouldProcess: true,
            isDuplicate: true,
            directModeResponse: updatedResponse
          };
        }
      }
      
      // Store this message as the last message
      this._lastMessage = directModeResponse;
      
      console.log(`Processed ${claudeMessage.type} message:`, {
        type: claudeMessage.type,
        subtype: claudeMessage.subtype,
        hasContent: !!directModeResponse.content,
        sessionId: sessionId
      });

      return {
        shouldProcess: true,
        directModeResponse: directModeResponse
      };

    } catch (error) {
      console.error('Error processing Claude message:', error);
      throw error;
    }
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this._currentSessionId;
  }

  /**
   * Gets the last assistant message for command context extraction
   */
  getLastAssistantMessage(): ClaudeMessage | undefined {
    return this._lastAssistantMessage;
  }

  /**
   * Clears conversation state
   */
  clearConversation(): void {
    this._currentSessionId = undefined;
    this._lastMessage = undefined;
    this._lastAssistantMessage = undefined;
  }

  /**
   * Sets the current session ID (for resuming sessions)
   */
  setCurrentSessionId(sessionId: string): void {
    this._currentSessionId = sessionId;
  }

  /**
   * Process conversation history with analytics
   */
  static processConversationHistory(responses: DirectModeResponse[]) {
    // Convert DirectModeResponse back to ClaudeMessage for analysis
    const claudeMessages: ClaudeMessage[] = responses
      .filter(response => response.originalMessage)
      .map(response => response.originalMessage!);

    return ClaudeMessageHandler.processConversation(claudeMessages);
  }

  /**
   * Get conversation statistics from a set of responses
   */
  static getConversationStats(responses: DirectModeResponse[]) {
    const messageTypes = responses.reduce((acc, response) => {
      acc[response.type] = (acc[response.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalCost = responses
      .filter(r => r.metadata?.cost)
      .reduce((sum, r) => sum + (r.metadata!.cost || 0), 0);

    const totalDuration = responses
      .filter(r => r.metadata?.duration)
      .reduce((sum, r) => sum + (r.metadata!.duration || 0), 0);

    const errors = responses.filter(r => r.type === 'error' || r.error);

    return {
      messageTypes,
      totalMessages: responses.length,
      totalCost: totalCost > 0 ? totalCost : undefined,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
      errorCount: errors.length,
      hasErrors: errors.length > 0
    };
  }

  /**
   * Add a user input message to track conversation history
   */
  createUserInputMessage(
    content: string,
    subtype: 'prompt' | 'command' | 'file_reference' = 'prompt',
    metadata?: {
      files_referenced?: string[];
      command_type?: string;
    }
  ): DirectModeResponse {
    const userInputMessage = ClaudeMessageHandler.createUserInputMessage(content, subtype, metadata);
    return ClaudeMessageHandler.toDirectModeResponse(userInputMessage);
  }
}