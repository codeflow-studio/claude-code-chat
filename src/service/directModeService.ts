import { spawn } from 'child_process';
import { ClaudeMessageHandler } from '../utils/claude-message-handler';
import { ClaudeMessage, DirectModeResponse } from '../types/claude-message-types';
import { formatMessageWithProblems, processImagesForMessage, type ImageContext } from '../utils/messageUtils';

export interface MessageContext {
  images?: Array<{
    name: string;
    path: string;
    type: string;
    data?: string;
    isFromClipboard?: boolean;
    isExternalDrop?: boolean;
  }>;
  selectedProblemIds?: string[];
  filePaths?: string[];
  selectedProblems?: Array<{
    file: string;
    line: number;
    column: number;
    severity: string;
    message: string;
    source?: string;
  }>;
}

export class DirectModeService {
  private _responseCallback?: (response: DirectModeResponse) => void;
  private _isActive: boolean = false;
  private _currentSessionId?: string;
  private _lastMessage?: DirectModeResponse;
  private _currentProcess?: any; // Track the running Claude process
  private _isProcessRunning: boolean = false;

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
  async sendMessage(text: string): Promise<void> {
    // Start session if not active
    if (!this._isActive) {
      await this.startSession();
    }

    try {
      // Build claude -p command with streaming JSON
      const args = [
        '-p', text,
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', 'Write', 'Edit', 'MultiEdit'
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

      // Track the current process and set running state
      this._currentProcess = claudeProcess;
      this._isProcessRunning = true;
      this._notifyProcessStateChanged();

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
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        if (code !== 0) {
          this._handleError(`Claude CLI exited with code ${code}`);
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        console.error('Claude CLI process error:', error);
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        this._handleError(`Failed to start Claude CLI: ${error.message}`);
      });

      console.log('Message sent to Claude CLI (claude -p mode):');
      console.log('Enhanced message:', text);
      console.log('Claude args:', args);

    } catch (error) {
      console.error('Error sending message:', error);
      this._handleError(`Failed to send message: ${error}`);
    }
  }

  /**
   * Terminates the currently running Claude process
   */
  terminateCurrentProcess(): boolean {
    if (this._currentProcess && this._isProcessRunning) {
      console.log('Terminating Claude CLI process...');
      this._currentProcess.kill('SIGTERM');
      
      // Force kill if process doesn't terminate within 5 seconds
      setTimeout(() => {
        if (this._isProcessRunning && this._currentProcess) {
          console.log('Force killing Claude CLI process...');
          this._currentProcess.kill('SIGKILL');
        }
      }, 5000);
      
      return true;
    }
    return false;
  }

  /**
   * Checks if a Claude process is currently running
   */
  isProcessRunning(): boolean {
    return this._isProcessRunning;
  }

  /**
   * Clears the current conversation and session ID without stopping the service
   */
  clearConversation(): void {
    // Terminate any running process first
    this.terminateCurrentProcess();
    
    // Clear session ID to start fresh conversation
    this._currentSessionId = undefined;
    this._lastMessage = undefined;
    
    // Clear pending tool executions
    ClaudeMessageHandler.clearPendingTools();
    
    console.log('Direct Mode conversation cleared (session ID reset)');
  }

  /**
   * Stops the current direct mode session
   */
  stop(): void {
    // Terminate any running process first
    this.terminateCurrentProcess();
    
    this._isActive = false;
    this._currentSessionId = undefined; // Clear session ID
    
    // Clear pending tool executions
    ClaudeMessageHandler.clearPendingTools();
    
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
   * Notifies callback about process state changes for UI updates
   */
  private _notifyProcessStateChanged(): void {
    if (this._responseCallback) {
      this._responseCallback({
        type: 'system',
        subtype: 'process_state',
        content: this._isProcessRunning ? 'Process running' : 'Process stopped',
        metadata: {
          processRunning: this._isProcessRunning
        }
      });
    }
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
   * Process images for Direct Mode using shared utility
   * Converts MessageContext images to ImageContext format
   */
  async processImagesWithMessage(
    text: string, 
    images: Array<{ name: string; path: string; type: string }>, 
    imageManager: any
  ): Promise<{ enhancedMessage: string; failedImages: string[] }> {
    // Convert to shared ImageContext format
    const imageContexts: ImageContext[] = images.map(img => ({
      name: img.name,
      path: img.path,
      type: img.type
    }));
    
    // Use shared processing utility
    const result = await processImagesForMessage(text, imageContexts, imageManager);
    
    return {
      enhancedMessage: result.enhancedMessage,
      failedImages: result.failedImages
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