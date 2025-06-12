import { spawn } from 'child_process';
import { ClaudeMessageHandler } from '../utils/claude-message-handler';
import { ClaudeMessage, DirectModeResponse } from '../types/claude-message-types';

export interface MessageContext {
  images?: Array<{
    name: string;
    path: string;
    type: string;
  }>;
  selectedProblemIds?: string[];
  filePaths?: string[];
}

export class DirectModeService {
  private _responseCallback?: (response: DirectModeResponse) => void;
  private _isActive: boolean = false;
  private _currentSessionId?: string;
  private _lastMessage?: DirectModeResponse;

  constructor(private _workspaceRoot?: string) {}

  /**
   * Sets the callback function to handle streaming responses
   */
  setResponseCallback(callback: (response: DirectModeResponse) => void) {
    this._responseCallback = callback;
  }

  /**
   * Prepares Direct Mode service for message sending
   * Note: We use claude -p for each message instead of persistent session
   */
  async startSession(_options?: { resume?: string }): Promise<void> {
    // For Direct Mode, we spawn claude -p for each message
    // This is more reliable than trying to maintain a persistent interactive session
    this._isActive = true;
    console.log('Direct Mode service ready (per-message claude -p mode)');
  }

  /**
   * Sends a message to Claude using claude -p with streaming JSON output
   * Each message spawns a separate claude -p process
   */
  async sendMessage(text: string, context?: MessageContext): Promise<void> {
    // Start session if not active
    if (!this._isActive) {
      await this.startSession();
    }

    try {
      // Build the enhanced message with context
      let enhancedMessage = text;

      // Add file paths as @ mentions
      if (context?.filePaths && context.filePaths.length > 0) {
        const fileMentions = context.filePaths.map(path => `@${path}`).join(' ');
        enhancedMessage = `${enhancedMessage} ${fileMentions}`;
      }

      // Add image paths
      if (context?.images && context.images.length > 0) {
        const imagePaths = context.images.map(img => img.path).join(' ');
        enhancedMessage = `${enhancedMessage} ${imagePaths}`;
      }

      // Build claude -p command with streaming JSON
      const args = [
        '-p', enhancedMessage,
        '--output-format', 'stream-json',
        '--verbose'
      ];

      // Add --resume if we have a session ID from previous messages
      if (this._currentSessionId) {
        args.push('--resume', this._currentSessionId);
        console.log('Resuming session with ID:', this._currentSessionId);
      } else {
        console.log('Starting new conversation (no session ID yet)');
      }

      console.log('Spawning claude -p with args:', args);

      // Spawn claude -p process for this specific message
      const claudeProcess = spawn('claude', args, {
        cwd: this._workspaceRoot || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin, capture stdout/stderr
      });

      let partialData = '';

      // Handle process output - capture streaming JSON
      claudeProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('Claude CLI stdout received:', output);
        
        partialData += output;

        // Process complete JSON lines
        const lines = partialData.split('\n');
        partialData = lines.pop() || ''; // Keep incomplete line for next chunk

        for (const line of lines) {
          if (line.trim()) {
            console.log('Processing line:', line);
            try {
              const rawMessage = JSON.parse(line);
              console.log('Parsed JSON:', rawMessage);
              
              // Normalize and process the message using our comprehensive handler
              const claudeMessage = ClaudeMessageHandler.normalizeMessage(rawMessage);
              this._processClaudeMessage(claudeMessage);
            } catch (error) {
              console.error('Failed to parse JSON response:', line, error);
            }
          }
        }
      });

      // Handle process errors
      claudeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('Claude CLI stderr:', data.toString());
        this._handleError(`CLI Error: ${data.toString()}`);
      });

      // Handle process exit
      claudeProcess.on('exit', (code: number | null) => {
        console.log(`Claude CLI process exited with code ${code}`);
        if (code !== 0) {
          this._handleError(`Claude CLI exited with code ${code}`);
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        console.error('Claude CLI process error:', error);
        this._handleError(`Failed to start Claude CLI: ${error.message}`);
      });

      console.log('Message sent to Claude CLI (claude -p mode):', enhancedMessage);

    } catch (error) {
      console.error('Error sending message:', error);
      this._handleError(`Failed to send message: ${error}`);
    }
  }

  /**
   * Stops the current direct mode session
   */
  stop(): void {
    this._isActive = false;
    this._currentSessionId = undefined; // Clear session ID
    console.log('Direct Mode service stopped (session cleared)');
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this._currentSessionId;
  }

  /**
   * Checks if the service is currently active
   */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Processes a Claude message using the comprehensive message handler
   */
  private _processClaudeMessage(claudeMessage: ClaudeMessage): void {
    try {
      // Extract and store session ID from all messages that have it
      const sessionId = ClaudeMessageHandler.extractSessionId(claudeMessage);
      if (sessionId) {
        this._currentSessionId = sessionId;
        console.log(`Session ID captured from ${claudeMessage.type} message:`, this._currentSessionId);
      }

      // Check for errors
      if (ClaudeMessageHandler.isError(claudeMessage)) {
        const errorContent = ClaudeMessageHandler.extractContent(claudeMessage);
        this._handleError(`Claude Error: ${errorContent}`);
        return;
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
          
          if (this._responseCallback) {
            this._responseCallback(updatedResponse);
          }

          console.log('Updated assistant message with result metadata:', {
            type: updatedResponse.type,
            subtype: updatedResponse.subtype,
            hasContent: !!updatedResponse.content,
            sessionId: sessionId,
            isUpdate: true
          });
          return;
        }
      }
      
      // Store this message as the last message
      this._lastMessage = directModeResponse;
      
      if (this._responseCallback) {
        this._responseCallback(directModeResponse);
      }

      console.log(`Processed ${claudeMessage.type} message:`, {
        type: claudeMessage.type,
        subtype: claudeMessage.subtype,
        hasContent: !!directModeResponse.content,
        sessionId: sessionId
      });

    } catch (error) {
      console.error('Error processing Claude message:', error);
      this._handleError(`Message processing error: ${error}`);
    }
  }

  /**
   * Add a user input message to track conversation history
   */
  trackUserInput(
    content: string,
    subtype: 'prompt' | 'command' | 'file_reference' = 'prompt',
    metadata?: {
      files_referenced?: string[];
      command_type?: string;
    }
  ): void {
    const userInputMessage = ClaudeMessageHandler.createUserInputMessage(content, subtype, metadata);
    const directModeResponse = ClaudeMessageHandler.toDirectModeResponse(userInputMessage);
    
    if (this._responseCallback) {
      this._responseCallback(directModeResponse);
    }
  }

  /**
   * Process conversation history with analytics
   * This would typically be called with collected DirectModeResponse messages
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
   * Handles errors and notifies via callback
   */
  private _handleError(error: string): void {
    console.error('DirectModeService error:', error);
    if (this._responseCallback) {
      this._responseCallback({
        type: 'error',
        error: error
      });
    }
  }
}