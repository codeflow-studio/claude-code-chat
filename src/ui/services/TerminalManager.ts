import * as vscode from "vscode";

/**
 * Interface for terminal manager callbacks
 */
export interface TerminalManagerCallbacks {
  postMessage: (message: any) => void;
  showErrorMessage: (message: string) => void;
  executeCommand: (command: string, ...args: any[]) => Promise<any>;
  focusInput: () => void;
}

/**
 * Service responsible for managing terminal operations and command sending
 * Extracted from ClaudeTerminalInputProvider to improve maintainability
 */
export class TerminalManager {
  private _terminal?: vscode.Terminal;
  private _isTerminalClosed: boolean = false;
  private _isConnectedToExistingTerminal: boolean = false;

  constructor(
    private readonly _callbacks: TerminalManagerCallbacks,
    terminal?: vscode.Terminal
  ) {
    this._terminal = terminal;
    this._isTerminalClosed = !terminal;
  }

  /**
   * Updates the terminal reference
   */
  public updateTerminal(terminal: vscode.Terminal, isExistingTerminal: boolean = false): void {
    this._terminal = terminal;
    this._isTerminalClosed = false;
    this._isConnectedToExistingTerminal = isExistingTerminal;
    
    // Notify UI of terminal status change
    this._callbacks.postMessage({
      command: "terminalStatus",
      isTerminalClosed: false,
      isConnectedToExistingTerminal: isExistingTerminal,
      terminalName: terminal.name
    });
  }

  /**
   * Notifies that terminal was closed
   */
  public notifyTerminalClosed(): void {
    this._isTerminalClosed = true;
    
    // Notify UI of terminal closure
    this._callbacks.postMessage({
      command: "terminalStatus",
      isTerminalClosed: true
    });
  }

  /**
   * Gets terminal status information
   */
  public getTerminalStatus(): {
    isTerminalClosed: boolean;
    isConnectedToExistingTerminal: boolean;
    terminalName: string;
  } {
    return {
      isTerminalClosed: this._isTerminalClosed,
      isConnectedToExistingTerminal: this._isConnectedToExistingTerminal,
      terminalName: this._terminal?.name || 'No Terminal'
    };
  }

  /**
   * Sends a command to the Claude terminal asynchronously
   */
  public async sendToTerminal(text: string): Promise<void> {
    console.log(`sendToTerminal called with: "${text}"`);
    return this.sendTextSmart(text);
  }

  /**
   * Sends text to the terminal with automatic paste detection
   * Uses paste mode for multi-line content or content over 100 characters
   */
  public async sendTextSmart(text: string): Promise<void> {
    const shouldUsePaste = this._shouldUsePasteMode(text);
    return this._sendToTerminalInternal(text, shouldUsePaste);
  }

  /**
   * Sends text to the terminal as a paste operation (triggers Claude Code's paste detection)
   * @deprecated Use sendTextSmart instead
   */
  public async sendTextAsPaste(text: string): Promise<void> {
    return this.sendTextSmart(text);
  }

  /**
   * Handles launching Claude with a specific command
   */
  public async handleLaunchClaude(command: string): Promise<void> {
    try {
      console.log(`Launching Claude with command: ${command}`);
      
      // Get terminal using unified terminal management
      const terminal = await this._ensureTerminalForLaunchOptions();
      
      // Show terminal
      terminal.show(false);
      
      // Send the command
      await this.sendToTerminal(command);
      
      // Update terminal status
      this._isTerminalClosed = false;
      this._callbacks.postMessage({
        command: "terminalStatus",
        isTerminalClosed: false,
        isConnectedToExistingTerminal: this._isConnectedToExistingTerminal,
        terminalName: terminal.name
      });
      
    } catch (error) {
      console.error('Error launching Claude:', error);
      this._callbacks.showErrorMessage(`Failed to launch Claude: ${error}`);
    }
  }

  /**
   * Handles launching Claude with conversation history selection
   */
  public async handleLaunchClaudeHistory(): Promise<void> {
    try {
      console.log('Launching Claude with -r option for conversation history');
      
      // Directly call claude -r - Claude Code CLI will handle the conversation selection
      await this.handleLaunchClaude('claude -r');
      
    } catch (error) {
      console.error('Error launching Claude history:', error);
      this._callbacks.showErrorMessage(`Failed to launch Claude with conversation history: ${error}`);
    }
  }

  /**
   * Handles mode toggle by sending Shift+Tab to Claude Code terminal
   */
  public async handleModeToggle(): Promise<void> {
    try {
      console.log('Toggling Claude Code mode (Shift+Tab)');
      
      // Check if terminal is available
      if (this._isTerminalClosed || !this._terminal) {
        this._callbacks.showErrorMessage('Claude Code terminal is not active. Please start Claude Code first.');
        return;
      }
      
      // Show the terminal in the background (preserves focus)
      this._terminal?.show(true);
      
      // Send Shift+Tab key sequence to toggle mode
      // \x1b[Z is the escape sequence for Shift+Tab
      this._terminal?.sendText('\x1b[Z', false);
      
      console.log('Mode toggle command sent to Claude Code terminal');
      
    } catch (error) {
      console.error('Error toggling Claude mode:', error);
      this._callbacks.showErrorMessage(`Failed to toggle Claude mode: ${error}`);
    }
  }

  /**
   * Determines if text should be sent as a paste operation
   */
  private _shouldUsePasteMode(text: string): boolean {
    // Use paste mode for:
    // - Multi-line content (contains newlines)
    // - Long content (over 100 characters)
    // - Content that looks like code blocks (contains ```)
    return text.includes('\n') || text.length > 100 || text.includes('```');
  }

  /**
   * Internal method to send text to terminal with smart paste detection
   */
  private async _sendToTerminalInternal(text: string, shouldUsePaste: boolean): Promise<void> {
    // Check if terminal is closed or doesn't exist
    if (this._isTerminalClosed || !this._terminal) {
      // Use command to recreate terminal and send message
      await this._callbacks.executeCommand('claude-code-extension.sendToClosedTerminal', text);
      return;
    }
    
    // Show the terminal in the background (preserves focus)
    this._terminal?.show(true);
    
    if (shouldUsePaste) {
      // Send bracketed paste start sequence
      this._terminal?.sendText('\x1b[200~', false);
      
      // Send the actual text
      this._terminal?.sendText(text + " ", false);

      // Send bracketed paste end sequence
      this._terminal?.sendText('\x1b[201~', false);
      
      // Keep bracketed paste mode enabled (Claude Code keeps it on)
    } else {
      // Send text to terminal normally
      this._terminal?.sendText(text + " ", false);
    }
    
    // Use the same delay logic for both paste and normal mode
    return new Promise<void>((resolve) => {
      // Add a delay to ensure the text is properly buffered
      setTimeout(() => {
        // Then explicitly send Enter key to execute the command
        this._terminal?.sendText('', true);
        
        // Return focus to the input view after a small delay
        setTimeout(() => {
          this._returnFocusToInput();
          // Resolve the promise after the command has been executed
          resolve();
        }, 700);
      }, 1000);
    });
  }

  /**
   * Returns focus to the input field
   */
  private _returnFocusToInput(): void {
    // Use callback to focus input
    this._callbacks.focusInput();
  }

  /**
   * Uses the extension's unified terminal management for launch options
   */
  private async _ensureTerminalForLaunchOptions(): Promise<vscode.Terminal> {
    // Import the ensureClaudeTerminal function from extension
    const { ensureClaudeTerminal } = await import('../../extension');
    
    // Get extension context from workspace state (this is a workaround)
    const context = vscode.workspace.getConfiguration('claudeCode').get('_context') as vscode.ExtensionContext;
    
    // Use the unified terminal management
    const terminalResult = await ensureClaudeTerminal(context);
    const terminal = terminalResult.terminal;
    
    // Update our reference
    this.updateTerminal(terminal, terminalResult.isExisting);
    
    // Update the extension's global terminal reference
    await this._callbacks.executeCommand('claude-code-extension.updateTerminalReference', terminal);
    
    return terminal;
  }
}