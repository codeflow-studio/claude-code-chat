import { ClaudeMessageHandler } from '../utils/claude-message-handler';
import { ClaudeMessage, DirectModeResponse } from '../types/claude-message-types';
import { processImagesForMessage, type ImageContext } from '../utils/messageUtils';
import { PermissionService } from './permissionService';
import { ProcessManager } from './processManager';
import { MessageProcessor } from './messageProcessor';

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
  
  // Service instances
  private _permissionService: PermissionService;
  private _processManager: ProcessManager;
  private _messageProcessor: MessageProcessor;

  constructor(private _workspaceRoot?: string) {
    this._permissionService = new PermissionService(_workspaceRoot);
    this._processManager = new ProcessManager(_workspaceRoot);
    this._messageProcessor = new MessageProcessor();
    
    // Set up process state callback
    this._processManager.setProcessStateCallback((state) => {
      this._notifyProcessStateChanged(state.isRunning);
    });
  }

  /**
   * Sets the callback function to handle streaming responses
   */
  setResponseCallback(callback: (response: DirectModeResponse) => void) {
    this._responseCallback = callback;
  }

  /**
   * Gets the permission service instance
   */
  getPermissionService(): PermissionService {
    return this._permissionService;
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
      const allowedTools = await this._permissionService.getAllowedTools();
      const permissionModeArgs = this._permissionService.getPermissionModeArgs();
      
      const args = [
        '-p', text,  // Always use the current message text
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', allowedTools.join(','),
        ...permissionModeArgs  // Add permission mode arguments
      ];

      // Add --resume if we have a session ID from previous messages
      const currentSessionId = this._messageProcessor.getCurrentSessionId();
      if (currentSessionId) {
        args.push('--resume', currentSessionId);
        console.log('Resuming session with ID:', currentSessionId, 'with new message');
      } else {
        console.log('Starting new conversation (no session ID yet)');
      }

      // Spawn claude -p process for this specific message
      const claudeProcess = this._processManager.spawnClaudeProcess(args);

      let partialData = '';

      // Set up process handlers
      this._processManager.setupProcessHandlers(
        claudeProcess,
        // onStdout
        async (data: Buffer) => {
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
                await this._processClaudeMessage(claudeMessage);
              } catch (error) {
                console.error('Failed to parse JSON response:', line, error);
              }
            }
          }
        },
        // onStderr
        (data: Buffer) => {
          // Don't show stderr errors if we have a pending permission request
          if (!this._permissionService.hasPendingPermission()) {
            this._handleError(`CLI Error: ${data.toString()}`);
          }
        },
        // onExit
        (code: number | null) => {
          if (!this._permissionService.hasPendingPermission()) {
            this._handleError(`Claude CLI exited with code ${code}`);
          }
        },
        // onError
        (error: Error) => {
          // Don't show startup errors if we have a pending permission request
          if (!this._permissionService.hasPendingPermission()) {
            this._handleError(`Failed to start Claude CLI: ${error.message}`);
          }
        },
        // suppressErrors
        this._permissionService.hasPendingPermission()
      );

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
  async terminateCurrentProcess(): Promise<boolean> {
    let terminatedAny = false;

    // Handle suspended processes from permission service
    if (this._permissionService.hasPendingPermission()) {
      console.log('Clearing pending permission state...');
      this._permissionService.clearPendingPermissionState();
      terminatedAny = true;
    }
    
    // Handle regular running processes
    if (this._processManager.isProcessRunning()) {
      terminatedAny = await this._processManager.terminateCurrentProcess();
    }
    
    return terminatedAny;
  }

  /**
   * Checks if a Claude process is currently running
   */
  isProcessRunning(): boolean {
    return this._processManager.isProcessRunning();
  }

  /**
   * Checks if there's a pending permission request
   */
  hasPendingPermission(): boolean {
    return this._permissionService.hasPendingPermission();
  }

  /**
   * Gets information about the pending permission request
   */
  getPendingPermissionInfo(): { toolName: string; sessionId: string; suspendedAt: Date } | null {
    return this._permissionService.getPendingPermissionInfo();
  }

  /**
   * Clears the current conversation and session ID without stopping the service
   */
  async clearConversation(): Promise<void> {
    // Terminate any running process first
    await this.terminateCurrentProcess();
    
    // Clear permission state
    this._permissionService.clearPendingPermissionState();
    
    // Clear message processor state
    this._messageProcessor.clearConversation();
    
    // Clear pending tool executions
    ClaudeMessageHandler.clearPendingTools();
    
    console.log('Direct Mode conversation cleared (session ID reset)');
  }

  /**
   * Stops the current direct mode session
   */
  async stop(): Promise<void> {
    // Terminate any running process first
    await this.terminateCurrentProcess();
    
    // Clear permission state
    this._permissionService.clearPendingPermissionState();
    
    // Clear message processor state
    this._messageProcessor.clearConversation();
    
    this._isActive = false;
    
    // Clear pending tool executions
    ClaudeMessageHandler.clearPendingTools();
    
    console.log('Direct Mode service stopped (session cleared)');
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this._messageProcessor.getCurrentSessionId();
  }

  /**
   * Checks if the service is currently active
   */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Handles permission response from user
   */
  async handlePermissionResponse(action: 'approve' | 'approve-all' | 'reject', toolName: string, sessionId: string): Promise<void> {
    console.log(`Permission response: ${action} for ${toolName} (session: ${sessionId})`);
    
    const pendingState = this._permissionService.getPendingPermissionState();
    
    // Verify we have a pending permission state that matches
    if (!pendingState || 
        pendingState.toolName !== toolName ||
        pendingState.sessionId !== sessionId) {
      console.warn('Permission response received but no matching pending state found');
      return;
    }
    
    if (action === 'reject') {
      // Process was already terminated when permission was requested
      console.log('Permission rejected - process already terminated');
      
      // Clear pending permission state
      this._permissionService.clearPendingPermissionState();
      
      if (this._responseCallback) {
        this._responseCallback({
          type: 'system',
          content: 'Permission denied. Process stopped.',
          metadata: { processRunning: false, suspended: false }
        });
      }
      return;
    }
    
    // For approve and approve-all, start new process with continuation prompt
    try {
      console.log(`Permission approved (${action}) - starting new process with continuation prompt`);
      
      // If approve-all, save to settings for future use
      if (action === 'approve-all') {
        await this._permissionService.saveToolPermission(toolName);
      }
      
      // Start new process with continuation prompt
      await this._resumeSuspendedProcess(action);
      
    } catch (error) {
      console.error('Error handling permission response:', error);
      
      // Clear state and notify
      this._permissionService.clearPendingPermissionState();
      
      if (this._responseCallback) {
        this._responseCallback({
          type: 'error',
          content: `Failed to resume process: ${error}`,
          error: String(error)
        });
      }
    }
  }

  // Permission-related methods are now handled by PermissionService

  /**
   * Resumes a suspended process after permission is granted using minimal continuation prompt
   */
  private async _resumeSuspendedProcess(action: 'approve' | 'approve-all'): Promise<void> {
    const pendingState = this._permissionService.getPendingPermissionState();
    if (!pendingState) {
      throw new Error('No suspended process to resume');
    }
    
    const { toolName, sessionId, commandContext, toolUseId } = pendingState;
    
    try {
      // Get current allowed tools and add the newly approved tool
      const allowedTools = await this._permissionService.getAllowedTools();
      if (!allowedTools.includes(toolName)) {
        allowedTools.push(toolName);
      }
      
      // Use a natural continuation prompt that explains what happened
      let continuationPrompt: string;
      
      if (toolUseId && commandContext) {
        continuationPrompt = `Permission granted for ${toolName}. Your previous ${commandContext} command was interrupted for permission approval. Please retry the command now.`;
        console.log('Using specific command continuation for:', commandContext, 'tool_use_id:', toolUseId);
      } else if (toolUseId) {
        continuationPrompt = `Permission granted for ${toolName}. Your previous command was interrupted for permission approval. Please retry the command now.`;
        console.log('Using tool-specific continuation for tool_use_id:', toolUseId);
      } else {
        continuationPrompt = `You have been granted permission to use ${toolName}. Please continue with your previous task.`;
        console.log('Using generic continuation prompt (no tool_use_id available)');
      }
      
      const args = [
        '-p', continuationPrompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', allowedTools.join(','),
        '--resume', sessionId
      ];
      
      console.log('Continuing Claude process with minimal prompt after permission granted:', args);
      
      // Small delay to ensure clean process restart  
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Spawn new Claude process with minimal continuation prompt
      const claudeProcess = this._processManager.spawnClaudeProcess(args);
      
      let partialData = '';
      
      // Set up process handlers (similar to sendMessage)
      this._processManager.setupProcessHandlers(
        claudeProcess,
        // onStdout
        async (data: Buffer) => {
          const output = data.toString();
          console.log('Claude CLI stdout received (after permission grant):', output);
          
          partialData += output;
          
          const lines = partialData.split('\n');
          partialData = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const rawMessage = JSON.parse(line);
                const claudeMessage = ClaudeMessageHandler.normalizeMessage(rawMessage);
                await this._processClaudeMessage(claudeMessage);
              } catch (error) {
                console.error('Failed to parse JSON response (after permission grant):', line, error);
              }
            }
          }
        },
        // onStderr
        (data: Buffer) => {
          this._handleError(`CLI Error: ${data.toString()}`);
        },
        // onExit
        (code: number | null) => {
          if (code !== 0) {
            this._handleError(`Claude CLI exited with code ${code}`);
          }
        },
        // onError
        (error: Error) => {
          this._handleError(`Failed to start Claude CLI: ${error.message}`);
        }
      );
      
      // Show permission granted message
      if (this._responseCallback) {
        const displayName = commandContext ? `${toolName} (${commandContext})` : toolName;
        
        this._responseCallback({
          type: 'system',
          subtype: 'permission_granted',
          content: `Permission granted for ${displayName}. Continuing...`,
          metadata: { 
            processRunning: true,
            suspended: false,
            action: action,
            toolName,
            commandContext
          }
        });
      }
      
      // Clear pending permission state
      this._permissionService.clearPendingPermissionState();
      
      console.log(`Claude process successfully continued with ${toolName} permission granted`);
      
    } catch (error) {
      console.error('Failed to continue process after permission grant:', error);
      
      // Clear state on failure
      this._permissionService.clearPendingPermissionState();
      
      throw error;
    }
  }

  /**
   * Notifies callback about process state changes for UI updates
   */
  private _notifyProcessStateChanged(isRunning: boolean): void {
    if (this._responseCallback) {
      this._responseCallback({
        type: 'system',
        subtype: 'process_state',
        content: isRunning ? 'Process running' : 'Process stopped',
        metadata: {
          processRunning: isRunning
        }
      });
    }
  }

  // Command context extraction is now handled by PermissionService

  // Command parsing is now handled by PermissionService

  // Permission request detection is now handled by PermissionService

  /**
   * Terminates the current Claude process when a permission request is detected
   */
  private async _suspendProcessForPermission(toolName: string, _sessionId: string): Promise<void> {
    if (this._processManager.isProcessRunning()) {
      console.log(`Terminating Claude process for ${toolName} permission request`);
      
      // Set up timeout for permission request (5 minutes)
      const timeoutId = setTimeout(() => {
        console.log('Permission request timed out');
        this._handlePermissionTimeout();
      }, 5 * 60 * 1000); // 5 minutes timeout
      
      // Store the current process reference before terminating
      const processToStore = this._processManager.getCurrentProcess();
      
      // Terminate the process cleanly
      await this._processManager.terminateCurrentProcess();
      
      // Update pending permission state with timeout
      const pendingState = this._permissionService.getPendingPermissionState();
      if (pendingState) {
        pendingState.process = processToStore;
        pendingState.timeoutId = timeoutId;
      }
      
      console.log('Claude process terminated cleanly, waiting for permission response (5 min timeout)');
    }
  }

  /**
   * Handles permission request timeout
   */
  private _handlePermissionTimeout(): void {
    const pendingState = this._permissionService.getPendingPermissionState();
    if (!pendingState) {
      return;
    }
    
    console.log(`Permission request for ${pendingState.toolName} timed out`);
    
    const toolName = pendingState.toolName;
    
    // Clear state
    this._permissionService.clearPendingPermissionState();
    
    // Notify UI about timeout
    if (this._responseCallback) {
      this._responseCallback({
        type: 'error',
        content: `Permission request for ${toolName} timed out. Process was already stopped.`,
        error: 'Permission request timeout',
        metadata: { 
          processRunning: false,
          suspended: false
        }
      });
    }
  }

  /**
   * Processes a Claude message using the comprehensive message handler
   */
  private async _processClaudeMessage(claudeMessage: ClaudeMessage): Promise<void> {
    try {
      // Check for permission requests in user messages FIRST
      if (claudeMessage.type === 'user') {
        const content = ClaudeMessageHandler.extractContent(claudeMessage);
        if (content) {
          const permissionInfo = this._permissionService.isPermissionRequest(content);
          if (permissionInfo) {
            console.log('Permission request detected:', permissionInfo);
            
            // Extract command context and tool_use_id from the last assistant message
            const lastAssistantMessage = this._messageProcessor.getLastAssistantMessage();
            const { commandContext, toolUseId } = this._permissionService.extractCommandContext(
              permissionInfo.toolName, 
              lastAssistantMessage
            );
            console.log('Extracted command context:', commandContext, 'tool_use_id:', toolUseId);
            
            // Extract session ID
            const sessionId = ClaudeMessageHandler.extractSessionId(claudeMessage) || 
                            this._messageProcessor.getCurrentSessionId() || 'unknown';
            
            // Set up pending permission state
            this._permissionService.setPendingPermissionState({
              sessionId,
              toolName: permissionInfo.toolName,
              commandContext,
              toolUseId,
              process: this._processManager.getCurrentProcess(),
              suspendedAt: new Date()
            });
            
            // Send permission request to UI FIRST
            if (this._responseCallback) {
              this._responseCallback({
                type: 'user',
                subtype: 'permission_request',
                content: content,
                metadata: {
                  sessionId,
                  toolName: permissionInfo.toolName,
                  commandContext,
                  isPermissionRequest: true
                }
              });
            }
            
            // Then terminate the current process
            await this._suspendProcessForPermission(
              permissionInfo.toolName, 
              sessionId
            );
            
            return; // Don't process as normal message
          }
        }
      }

      // Process the message through MessageProcessor
      const result = await this._messageProcessor.processClaudeMessage(claudeMessage);
      
      if (!result.shouldProcess) {
        if (result.isError && !this._permissionService.hasPendingPermission()) {
          const errorContent = ClaudeMessageHandler.extractContent(claudeMessage);
          this._handleError(`Claude Error: ${errorContent}`);
        }
        return;
      }
      
      if (result.directModeResponse && this._responseCallback) {
        this._responseCallback(result.directModeResponse);
      }

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
    const directModeResponse = this._messageProcessor.createUserInputMessage(content, subtype, metadata);
    
    if (this._responseCallback) {
      this._responseCallback(directModeResponse);
    }
  }

  /**
   * Process conversation history with analytics
   * This would typically be called with collected DirectModeResponse messages
   */
  static processConversationHistory(responses: DirectModeResponse[]) {
    return MessageProcessor.processConversationHistory(responses);
  }

  /**
   * Get conversation statistics from a set of responses
   */
  static getConversationStats(responses: DirectModeResponse[]) {
    return MessageProcessor.getConversationStats(responses);
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

  // Process termination is now handled by ProcessManager

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