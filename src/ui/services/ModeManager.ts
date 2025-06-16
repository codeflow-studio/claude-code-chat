import * as vscode from "vscode";
import { DirectModeService } from "../../service/directModeService";
import { DirectModeResponse } from "../../types/claude-message-types";
import { MessageContext } from "./MessageHandler";

/**
 * Interface for mode manager callbacks
 */
export interface ModeManagerCallbacks {
  postMessage: (message: any) => void;
  showErrorMessage: (message: string) => void;
  showInformationMessage: (message: string) => void;
  showWarningMessage: (message: string) => void;
}

/**
 * Service responsible for managing Direct/Terminal mode switching and state
 * Extracted from ClaudeTerminalInputProvider to improve maintainability
 */
export class ModeManager {
  private _isDirectMode: boolean = false;
  private _directModeService?: DirectModeService;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _callbacks: ModeManagerCallbacks,
    workspaceRoot?: string
  ) {
    // Restore saved Direct Mode state
    this._isDirectMode = this._context.globalState.get('claudeCode.isDirectMode', false);
    
    // Initialize Direct Mode service
    this._directModeService = new DirectModeService(workspaceRoot);
    this._directModeService.setResponseCallback(this._handleDirectModeResponse.bind(this));
  }

  /**
   * Gets the current mode state
   */
  public get isDirectMode(): boolean {
    return this._isDirectMode;
  }

  /**
   * Sets the Direct Mode state and persists it
   */
  public setDirectMode(isDirectMode: boolean): void {
    this._isDirectMode = isDirectMode;
    // Save the mode state for next launch
    this._context.globalState.update('claudeCode.isDirectMode', this._isDirectMode);
    console.log(`Main mode set to: ${this._isDirectMode ? 'Direct' : 'Terminal'} (saved)`);
    
    // Notify UI of mode change
    this._callbacks.postMessage({
      command: "setDirectMode",
      isDirectMode: this._isDirectMode
    });
  }

  /**
   * Toggles between Direct and Terminal modes
   */
  public toggleMode(): void {
    this.setDirectMode(!this._isDirectMode);
  }

  /**
   * Sends a message through Direct Mode
   */
  public async sendToDirectMode(formattedMessage: string, messageContext: MessageContext): Promise<void> {
    if (!this._directModeService) {
      throw new Error('Direct Mode service not initialized');
    }

    // Track user input metadata for conversation history
    const userInputMetadata: {
      files_referenced?: string[];
      command_type?: string;
    } = {
      files_referenced: messageContext.filePaths.length > 0 ? messageContext.filePaths : undefined
    };

    // Determine message subtype based on original content
    let messageSubtype: 'prompt' | 'command' | 'file_reference' = 'prompt';
    if (messageContext.text.startsWith('/') || messageContext.text.startsWith('!')) {
      messageSubtype = 'command';
      userInputMetadata.command_type = 'slash_command';
    } else if (messageContext.text.includes('@') || messageContext.filePaths.length > 0) {
      messageSubtype = 'file_reference';
      userInputMetadata.command_type = 'file_analysis';
    }

    // Track user input with original text first
    this._directModeService.trackUserInput(formattedMessage, messageSubtype, userInputMetadata);

    // Send the pre-formatted message to Direct Mode service
    await this._directModeService.sendMessage(formattedMessage);
  }

  /**
   * Clears the Direct Mode conversation and resets session
   */
  public async clearDirectMode(): Promise<void> {
    try {
      if (this._directModeService) {
        await this._directModeService.clearConversation();
        console.log('Direct Mode conversation cleared and session reset');
        
        // Show confirmation message to user
        this._callbacks.showInformationMessage('Conversation cleared and session reset');
      }
    } catch (error) {
      console.error('Error clearing Direct Mode conversation:', error);
      this._callbacks.showErrorMessage(`Failed to clear conversation: ${error}`);
    }
  }

  /**
   * Stops the Direct Mode service
   */
  public async stopDirectMode(): Promise<void> {
    try {
      if (this._directModeService) {
        await this._directModeService.stop();
        console.log('Direct Mode service stopped');
      }
    } catch (error) {
      console.error('Error stopping Direct Mode service:', error);
    }
  }

  /**
   * Pauses the currently running Claude Code process
   */
  public async pauseProcess(): Promise<void> {
    try {
      if (this._directModeService) {
        const wasTerminated = await this._directModeService.terminateCurrentProcess();
        if (wasTerminated) {
          console.log('Claude Code process terminated by user');
          this._callbacks.showInformationMessage('Claude Code process terminated');
        } else {
          console.log('No Claude Code process is currently running');
          this._callbacks.showWarningMessage('No Claude Code process is currently running');
        }
      }
    } catch (error) {
      console.error('Error pausing Claude Code process:', error);
      this._callbacks.showErrorMessage(`Failed to pause process: ${error}`);
    }
  }

  /**
   * Gets the Direct Mode service instance
   */
  public getDirectModeService(): DirectModeService | undefined {
    return this._directModeService;
  }

  /**
   * Sends initial mode state to webview
   */
  public sendInitialModeState(): void {
    this._callbacks.postMessage({
      command: "setDirectMode",
      isDirectMode: this._isDirectMode
    });
  }

  /**
   * Handles responses from the Direct Mode service
   */
  private _handleDirectModeResponse(response: DirectModeResponse): void {
    try {
      // Handle special system messages for process state
      if (response.type === 'system' && response.subtype === 'process_state') {
        // Update UI based on process running state
        this._callbacks.postMessage({
          command: 'updateProcessState',
          isProcessRunning: response.metadata?.processRunning || false
        });
        return;
      }

      // Send response to webview for display
      this._callbacks.postMessage({
        command: 'directModeResponse',
        response: {
          type: response.type,
          subtype: response.subtype,
          content: response.content,
          error: response.error,
          timestamp: new Date().toISOString(),
          metadata: response.metadata,
          isUpdate: response.isUpdate,
          toolExecutionContext: response.toolExecutionContext,
          // Add display name for better UI presentation
          displayName: this._getDisplayNameForMessageType(response.type, response.subtype)
        }
      });

      // Log response for debugging
      if (response.type === 'error') {
        console.error('Direct Mode response error:', response.error);
      } else if (response.content) {
        console.log('Direct Mode response:', response.type, response.subtype);
      }
      
    } catch (error) {
      console.error('Error handling Direct Mode response:', error);
    }
  }

  /**
   * Gets user-friendly display name for message types
   */
  private _getDisplayNameForMessageType(type: string, _subtype?: string): string {
    switch (type) {
      case 'user_input':
        return 'You';
      case 'system':
        return 'Session';
      case 'assistant':
        return 'Claude';
      case 'user':
        return 'Tool Result';
      case 'result':
        return 'Result';
      case 'error':
        return 'Error';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }
}