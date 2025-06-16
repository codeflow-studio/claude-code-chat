import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ClaudeMessageHandler } from '../utils/claude-message-handler';
import { ClaudeMessage, DirectModeResponse } from '../types/claude-message-types';
import { processImagesForMessage, type ImageContext } from '../utils/messageUtils';

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
  private _originalPrompt?: string; // Store the first prompt that started conversation
  private _lastMessage?: DirectModeResponse;
  private _currentProcess?: any; // Track the running Claude process
  private _isProcessRunning: boolean = false;
  private _pendingPermissionState?: {
    sessionId: string;
    toolName: string;
    process: any;
    suspendedAt: Date;
    timeoutId?: NodeJS.Timeout;
  };

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
      // Store original prompt if this is the first message in session
      if (!this._currentSessionId) {
        this._originalPrompt = text;
      }

      // Build claude -p command with streaming JSON
      const allowedTools = await this._getAllowedTools();
      const promptToUse = this._currentSessionId ? this._originalPrompt! : text;
      const args = [
        '-p', promptToUse,
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', allowedTools.join(',')
      ];

      // Add --resume if we have a session ID from previous messages
      if (this._currentSessionId) {
        args.push('--resume', this._currentSessionId);
        console.log('Resuming session with ID:', this._currentSessionId, 'using original prompt');
      } else {
        console.log('Starting new conversation (no session ID yet)');
      }

      console.log('Spawning claude -p with args:', args);

      // Spawn claude -p process for this specific message
      const claudeProcess = spawn('claude', args, {
        cwd: this._workspaceRoot || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin since prompt is passed as arg
      });

      // Track the current process and set running state
      this._currentProcess = claudeProcess;
      this._isProcessRunning = true;
      this._notifyProcessStateChanged();

      let partialData = '';

      // Handle process output - capture streaming JSON
      claudeProcess.stdout?.on('data', async (data: Buffer) => {
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
      });

      // Handle process errors
      claudeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('Claude CLI stderr:', data.toString());
        // Don't show stderr errors if we have a pending permission request
        if (!this._pendingPermissionState) {
          this._handleError(`CLI Error: ${data.toString()}`);
        }
      });

      // Handle process exit
      claudeProcess.on('exit', (code: number | null) => {
        console.log(`Claude CLI process exited with code ${code}`);
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        if (code !== 0 && !this._pendingPermissionState) {
          this._handleError(`Claude CLI exited with code ${code}`);
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        console.error('Claude CLI process error:', error);
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        // Don't show startup errors if we have a pending permission request
        if (!this._pendingPermissionState) {
          this._handleError(`Failed to start Claude CLI: ${error.message}`);
        }
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
  async terminateCurrentProcess(): Promise<boolean> {
    let terminatedAny = false;

    // Handle suspended processes
    if (this._pendingPermissionState?.process) {
      console.log('Terminating suspended Claude CLI process...');
      
      // Clear timeout first
      if (this._pendingPermissionState.timeoutId) {
        clearTimeout(this._pendingPermissionState.timeoutId);
      }
      
      await this._terminateProcessCleanly(this._pendingPermissionState.process);
      this._pendingPermissionState = undefined;
      terminatedAny = true;
    }
    
    // Handle regular running processes
    if (this._currentProcess && this._isProcessRunning) {
      console.log('Terminating Claude CLI process...');
      await this._terminateProcessCleanly(this._currentProcess);
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._notifyProcessStateChanged();
      terminatedAny = true;
    }
    
    return terminatedAny;
  }

  /**
   * Checks if a Claude process is currently running
   */
  isProcessRunning(): boolean {
    return this._isProcessRunning;
  }

  /**
   * Checks if there's a pending permission request
   */
  hasPendingPermission(): boolean {
    return !!this._pendingPermissionState;
  }

  /**
   * Gets information about the pending permission request
   */
  getPendingPermissionInfo(): { toolName: string; sessionId: string; suspendedAt: Date } | null {
    if (!this._pendingPermissionState) {
      return null;
    }
    
    return {
      toolName: this._pendingPermissionState.toolName,
      sessionId: this._pendingPermissionState.sessionId,
      suspendedAt: this._pendingPermissionState.suspendedAt
    };
  }

  /**
   * Clears the current conversation and session ID without stopping the service
   */
  async clearConversation(): Promise<void> {
    // Terminate any running process first
    await this.terminateCurrentProcess();
    
    // Clear any pending permission state
    if (this._pendingPermissionState) {
      console.log('Clearing pending permission state during conversation clear');
      
      // Clear timeout if exists
      if (this._pendingPermissionState.timeoutId) {
        clearTimeout(this._pendingPermissionState.timeoutId);
      }
      
      this._pendingPermissionState = undefined;
    }
    
    // Clear session ID and original prompt to start fresh conversation
    this._currentSessionId = undefined;
    this._originalPrompt = undefined;
    this._lastMessage = undefined;
    
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
    
    // Clear any pending permission state
    if (this._pendingPermissionState) {
      console.log('Clearing pending permission state during stop');
      
      // Clear timeout if exists
      if (this._pendingPermissionState.timeoutId) {
        clearTimeout(this._pendingPermissionState.timeoutId);
      }
      
      this._pendingPermissionState = undefined;
    }
    
    this._isActive = false;
    this._currentSessionId = undefined; // Clear session ID
    this._originalPrompt = undefined; // Clear original prompt
    
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
   * Handles permission response from user
   */
  async handlePermissionResponse(action: 'approve' | 'approve-all' | 'reject', toolName: string, sessionId: string): Promise<void> {
    console.log(`Permission response: ${action} for ${toolName} (session: ${sessionId})`);
    
    // Verify we have a pending permission state that matches
    if (!this._pendingPermissionState || 
        this._pendingPermissionState.toolName !== toolName ||
        this._pendingPermissionState.sessionId !== sessionId) {
      console.warn('Permission response received but no matching pending state found');
      return;
    }
    
    // Clear the timeout since we got a user response
    if (this._pendingPermissionState.timeoutId) {
      clearTimeout(this._pendingPermissionState.timeoutId);
    }
    
    if (action === 'reject') {
      // Process was already terminated when permission was requested
      console.log('Permission rejected - process already terminated');
      
      // Clear pending permission state
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._pendingPermissionState = undefined;
      this._notifyProcessStateChanged();
      
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
        await this._saveToolPermission(toolName);
      }
      
      // Start new process with continuation prompt
      await this._resumeSuspendedProcess(action);
      
    } catch (error) {
      console.error('Error handling permission response:', error);
      
      // Process was already terminated, just clean up state
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._pendingPermissionState = undefined;
      this._notifyProcessStateChanged();
      
      if (this._responseCallback) {
        this._responseCallback({
          type: 'error',
          content: `Failed to resume process: ${error}`,
          error: String(error)
        });
      }
    }
  }

  /**
   * Gets allowed tools from default + saved permissions
   */
  private async _getAllowedTools(): Promise<string[]> {
    const defaultTools = ['Write', 'Edit', 'MultiEdit'];
    
    try {
      const savedPermissions = await this._loadSavedPermissions();
      return [...defaultTools, ...savedPermissions];
    } catch (error) {
      console.log('No saved permissions found, using default tools');
      return defaultTools;
    }
  }

  /**
   * Loads saved tool permissions from .claude/settings.local.json
   */
  private async _loadSavedPermissions(): Promise<string[]> {
    const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
    const settingsFile = path.join(claudeDir, 'settings.local.json');
    
    try {
      const settingsContent = await fs.readFile(settingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);
      return settings.allowedTools || [];
    } catch (error) {
      // File doesn't exist or invalid JSON
      return [];
    }
  }

  /**
   * Saves tool permission to .claude/settings.local.json
   */
  private async _saveToolPermission(toolName: string): Promise<void> {
    try {
      const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
      const settingsFile = path.join(claudeDir, 'settings.local.json');
      
      // Ensure .claude directory exists
      try {
        await fs.access(claudeDir);
      } catch {
        await fs.mkdir(claudeDir, { recursive: true });
      }
      
      // Load existing settings or create new
      let settings: any = {};
      try {
        const settingsContent = await fs.readFile(settingsFile, 'utf8');
        settings = JSON.parse(settingsContent);
      } catch {
        // File doesn't exist or invalid JSON, start fresh
      }
      
      // Add tool to allowed tools if not already present
      if (!settings.allowedTools) {
        settings.allowedTools = [];
      }
      
      if (!settings.allowedTools.includes(toolName)) {
        settings.allowedTools.push(toolName);
      }
      
      // Save settings
      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      console.log(`Saved permission for ${toolName} to ${settingsFile}`);
      
    } catch (error) {
      console.error('Error saving tool permission:', error);
      throw error;
    }
  }

  /**
   * Resumes a suspended process after permission is granted using minimal continuation prompt
   * 
   * This approach mimics the official Claude Code terminal behavior:
   * - Instead of restarting with the original prompt (which causes regeneration)
   * - We use a minimal "you got permission" prompt with --resume to continue seamlessly
   * - This prevents Claude from repeating previous work and maintains conversation flow
   */
  private async _resumeSuspendedProcess(action: 'approve' | 'approve-all'): Promise<void> {
    if (!this._pendingPermissionState) {
      throw new Error('No suspended process to resume');
    }
    
    const { process, toolName, sessionId } = this._pendingPermissionState;
    
    try {
      // Get current allowed tools and add the newly approved tool
      const allowedTools = await this._getAllowedTools();
      if (!allowedTools.includes(toolName)) {
        allowedTools.push(toolName);
      }
      
      // Use minimal continuation prompt instead of restarting with original prompt
      const continuationPrompt = `You have been granted permission to use ${toolName}. Please continue with your previous task.`;
      
      const args = [
        '-p', continuationPrompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', allowedTools.join(','),
        '--resume', sessionId
      ];
      
      console.log('Continuing Claude process with minimal prompt after permission granted:', args);
      console.log('Continuation prompt:', continuationPrompt);
      
      // Process was already terminated when permission was requested
      console.log('Process was already terminated during permission request - starting new process');
      
      // Small delay to ensure clean process restart  
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Spawn new Claude process with minimal continuation prompt
      const claudeProcess = spawn('claude', args, {
        cwd: this._workspaceRoot || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Update tracking with new process
      this._currentProcess = claudeProcess;
      this._isProcessRunning = true;
      this._notifyProcessStateChanged();
      
      let partialData = '';
      
      // Handle process output - same as in sendMessage
      claudeProcess.stdout?.on('data', async (data: Buffer) => {
        const output = data.toString();
        console.log('Claude CLI stdout received (after permission grant):', output);
        
        partialData += output;
        
        // Process complete JSON lines
        const lines = partialData.split('\n');
        partialData = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            console.log('Processing line (after permission grant):', line);
            try {
              const rawMessage = JSON.parse(line);
              console.log('Parsed JSON (after permission grant):', rawMessage);
              
              const claudeMessage = ClaudeMessageHandler.normalizeMessage(rawMessage);
              await this._processClaudeMessage(claudeMessage);
            } catch (error) {
              console.error('Failed to parse JSON response (after permission grant):', line, error);
            }
          }
        }
      });
      
      // Handle process errors
      claudeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('Claude CLI stderr (after permission grant):', data.toString());
        this._handleError(`CLI Error: ${data.toString()}`);
      });
      
      // Handle process exit
      claudeProcess.on('exit', (code: number | null) => {
        console.log(`Claude CLI process exited with code ${code} (after permission grant)`);
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        if (code !== 0) {
          this._handleError(`Claude CLI exited with code ${code}`);
        }
      });
      
      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        console.error('Claude CLI process error (after permission grant):', error);
        this._isProcessRunning = false;
        this._currentProcess = undefined;
        this._notifyProcessStateChanged();
        this._handleError(`Failed to start Claude CLI: ${error.message}`);
      });
      
      // Clear pending permission state since process is now restarted
      this._pendingPermissionState = undefined;
      
      // Notify UI about process state change (minimal message)
      if (this._responseCallback) {
        this._responseCallback({
          type: 'system',
          subtype: 'permission_granted',
          content: '', // Empty content to minimize UI clutter - feedback is shown in permission dialog
          metadata: { 
            processRunning: true,
            suspended: false,
            action: action,
            silent: true // Flag to indicate this should be processed silently
          }
        });
      }
      
      console.log(`Claude process successfully continued with ${toolName} permission granted using minimal prompt`);
      
    } catch (error) {
      console.error('Failed to continue process after permission grant:', error);
      
      // Ensure cleanup on failure
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._pendingPermissionState = undefined;
      this._notifyProcessStateChanged();
      
      throw error;
    }
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
   * Detects if content contains a permission request
   */
  private _isPermissionRequest(content: string): { toolName: string; originalContent: string } | null {
    if (typeof content !== 'string') return null;
    
    // Match permission request patterns
    const permissionPattern = /Claude requested permissions to use (.+?), but you haven't granted it yet/i;
    const match = content.match(permissionPattern);
    
    if (match) {
      return {
        toolName: match[1].trim(),
        originalContent: content
      };
    }
    
    return null;
  }

  /**
   * Terminates the current Claude process when a permission request is detected
   */
  private async _suspendProcessForPermission(toolName: string, sessionId: string): Promise<void> {
    if (this._currentProcess && this._isProcessRunning) {
      console.log(`Terminating Claude process for ${toolName} permission request`);
      
      // Clear any existing timeout
      if (this._pendingPermissionState?.timeoutId) {
        clearTimeout(this._pendingPermissionState.timeoutId);
      }
      
      // Set up timeout for permission request (5 minutes)
      const timeoutId = setTimeout(() => {
        console.log('Permission request timed out');
        this._handlePermissionTimeout();
      }, 5 * 60 * 1000); // 5 minutes timeout
      
      // Store the current process reference before terminating
      const processToStore = this._currentProcess;
      
      // Terminate the process cleanly instead of pausing
      await this._terminateProcessCleanly(this._currentProcess);
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._notifyProcessStateChanged();
      
      // Update existing pending permission state with timeout and process reference
      if (this._pendingPermissionState) {
        this._pendingPermissionState.process = processToStore;
        this._pendingPermissionState.timeoutId = timeoutId;
      } else {
        // Fallback if state wasn't set earlier
        this._pendingPermissionState = {
          sessionId,
          toolName,
          process: processToStore,
          suspendedAt: new Date(),
          timeoutId
        };
      }
      
      console.log('Claude process terminated cleanly, waiting for permission response (5 min timeout)');
      
      // Show the system message after a small delay so the permission dialog appears first
      setTimeout(() => {
        if (this._responseCallback && this._pendingPermissionState) {
          this._responseCallback({
            type: 'system',
            subtype: 'permission_requested',
            content: `Process stopped - waiting for ${toolName} permission`,
            metadata: { 
              processRunning: false,
              suspended: false, // Changed from true - process is terminated, not suspended
              toolName,
              sessionId
            }
          });
        }
      }, 100); // Small delay to ensure permission dialog renders first
    }
  }

  /**
   * Handles permission request timeout
   */
  private _handlePermissionTimeout(): void {
    if (!this._pendingPermissionState) {
      return;
    }
    
    console.log(`Permission request for ${this._pendingPermissionState.toolName} timed out`);
    
    // Process was already terminated when permission was requested
    const toolName = this._pendingPermissionState.toolName;
    
    // Clear state
    this._isProcessRunning = false;
    this._currentProcess = undefined;
    this._pendingPermissionState = undefined;
    this._notifyProcessStateChanged();
    
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
      // Extract and store session ID from all messages that have it
      const sessionId = ClaudeMessageHandler.extractSessionId(claudeMessage);
      if (sessionId) {
        this._currentSessionId = sessionId;
        console.log(`Session ID captured from ${claudeMessage.type} message:`, this._currentSessionId);
      }

      // Check for permission requests in user messages FIRST
      if (claudeMessage.type === 'user') {
        const content = ClaudeMessageHandler.extractContent(claudeMessage);
        if (content) {
          const permissionInfo = this._isPermissionRequest(content);
          if (permissionInfo) {
            console.log('Permission request detected:', permissionInfo);
            
            // Set up pending permission state early to enable error suppression
            const permissionSessionId = sessionId || this._currentSessionId || 'unknown';
            this._pendingPermissionState = {
              sessionId: permissionSessionId,
              toolName: permissionInfo.toolName,
              process: this._currentProcess,
              suspendedAt: new Date()
            };
            
            // Send permission request to UI FIRST (so it appears before system message)
            if (this._responseCallback) {
              this._responseCallback({
                type: 'user',
                subtype: 'permission_request',
                content: content,
                metadata: {
                  sessionId: permissionSessionId,
                  toolName: permissionInfo.toolName,
                  isPermissionRequest: true
                }
              });
            }
            
            // Then terminate the current process and show status message
            await this._suspendProcessForPermission(
              permissionInfo.toolName, 
              permissionSessionId
            );
            
            return; // Don't process as normal message
          }
        }
      }

      // Check for errors - but suppress errors during permission requests
      if (ClaudeMessageHandler.isError(claudeMessage)) {
        // Don't show errors if we have a pending permission request
        if (this._pendingPermissionState) {
          console.log('Suppressing error message during permission request:', claudeMessage);
          return;
        }
        
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
   * Terminates a process cleanly with proper timing and error handling
   */
  private async _terminateProcessCleanly(process: any): Promise<void> {
    if (!process || process.killed) {
      return;
    }

    return new Promise<void>((resolve) => {
      // Set up exit handler
      const onExit = () => {
        console.log('Process exited cleanly');
        resolve();
      };

      // Listen for process exit
      process.once('exit', onExit);

      // Send SIGTERM first
      console.log('Sending SIGTERM to process');
      process.kill('SIGTERM');

      // Set up timeout for force kill
      const forceKillTimeout = setTimeout(() => {
        if (!process.killed) {
          console.log('Process did not exit gracefully, force killing with SIGKILL');
          process.kill('SIGKILL');
          
          // Give it a moment for SIGKILL to take effect
          setTimeout(() => {
            process.removeListener('exit', onExit);
            resolve();
          }, 500);
        }
      }, 3000); // 3 second timeout for graceful exit

      // Clean up timeout if process exits naturally
      process.once('exit', () => {
        clearTimeout(forceKillTimeout);
      });
    });
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