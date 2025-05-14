import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as readline from 'readline';
import { ErrorHandler, ClaudeCodeError, ErrorType } from '../errorHandler';
import { SettingsManager } from '../settings';

export interface ClaudeCodeResponse {
  message: string;
  error?: string;
}

export interface ConversationContext {
  conversationId?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
}

export class ClaudeCodeClient {
  private childProcess: child_process.ChildProcess | null = null;
  private isRunning: boolean = false;
  private stdoutData: string = '';
  private stderrData: string = '';
  private conversationContext: ConversationContext = {
    messages: []
  };
  private errorHandler: ErrorHandler;
  private settingsManager: SettingsManager;
  
  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
    this.settingsManager = SettingsManager.getInstance();
    
    // Load saved conversation if enabled
    this.loadConversation();
  }

  /**
   * Starts the Claude Code process
   */
  public async start(): Promise<boolean> {
    try {
      // Check if Claude Code CLI is installed
      const isInstalled = await this.checkClaudeCodeInstallation();
      if (!isInstalled) {
        throw new ClaudeCodeError(
          ErrorType.CLAUDE_NOT_INSTALLED,
          'Claude Code CLI is not installed'
        );
      }

      // Get CLI path and arguments from settings
      const cliPath = this.settingsManager.getCliPath();
      const additionalArgs = this.settingsManager.getAdditionalCliArgs();
      
      // Only use additional arguments from settings
      const args = [...additionalArgs];

      // Start the Claude Code process
      this.childProcess = child_process.spawn(cliPath, args);
      this.isRunning = true;

      // Collect stdout data
      this.childProcess.stdout?.on('data', (data) => {
        this.stdoutData += data.toString();
      });

      // Collect stderr data
      this.childProcess.stderr?.on('data', (data) => {
        this.stderrData += data.toString();
        console.error(`Claude Code stderr: ${data}`);
        
        // Check for authentication errors
        if (data.toString().includes('authentication') || data.toString().includes('login')) {
          this.errorHandler.handleError(
            new ClaudeCodeError(
              ErrorType.AUTHENTICATION_ERROR,
              'Authentication with Claude Code failed'
            )
          );
        }
      });

      // Handle process events
      this.childProcess.on('error', (error) => {
        this.isRunning = false;
        
        this.errorHandler.handleError(
          new ClaudeCodeError(
            ErrorType.CLAUDE_PROCESS_FAILED,
            `Failed to start Claude Code: ${error.message}`,
            error
          )
        );
      });

      this.childProcess.on('exit', (code) => {
        this.isRunning = false;
        
        if (code !== 0) {
          this.errorHandler.handleError(
            new ClaudeCodeError(
              ErrorType.CLAUDE_PROCESS_FAILED,
              `Claude Code process exited with code ${code}`
            )
          );
        }
      });

      return true;
    } catch (error) {
      if (error instanceof ClaudeCodeError) {
        this.errorHandler.handleError(error);
      } else {
        this.errorHandler.handleError(
          new ClaudeCodeError(
            ErrorType.UNKNOWN,
            `Failed to start Claude Code: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
        );
      }
      return false;
    }
  }

  /**
   * Checks if Claude Code CLI is installed
   */
  private async checkClaudeCodeInstallation(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Get CLI path from settings
      const cliPath = this.settingsManager.getCliPath();
      
      // If an absolute path is provided, we'll check if the file exists
      if (cliPath.startsWith('/') || cliPath.includes('\\') || cliPath.includes('/')) {
        // For absolute paths, use the 'which' or 'where' command to check if it exists
        const checkCommand = process.platform === 'win32' ? `where "${cliPath}"` : `which "${cliPath}"`;
        child_process.exec(checkCommand, (error) => {
          resolve(!error);
        });
      } else {
        // For commands expected to be in PATH, use the standard check
        const checkCommand = process.platform === 'win32' ? `where ${cliPath}` : `which ${cliPath}`;
        child_process.exec(checkCommand, (error) => {
          resolve(!error);
        });
      }
    });
  }

  /**
   * Sends a message to Claude Code
   * @param message The message to send
   */
  public async sendMessage(message: string): Promise<ClaudeCodeResponse> {
    try {
      // Check if the client is running
      if (!this.isActive()) {
        throw new ClaudeCodeError(
          ErrorType.CLAUDE_PROCESS_FAILED,
          'Claude Code process is not running'
        );
      }
    
      // For the MVP, we'll return a mock response since we're not actually
      // connecting to the real Claude Code CLI yet
      
      // Add the message to our conversation context
      this.conversationContext.messages.push({
        role: 'user',
        content: message,
        timestamp: Date.now()
      });
      
      // Simulate a delay to mimic the API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create a mock response
      const response = {
        message: `I've received your message: "${message}"\n\nThis is a mock response for the MVP. In the production version, this will be a real response from Claude Code.`
      };
      
      // Add the response to our conversation context
      this.conversationContext.messages.push({
        role: 'assistant',
        content: response.message,
        timestamp: Date.now()
      });
      
      // Save the conversation if enabled
      this.saveConversation();
      
      return response;
    } catch (error) {
      // Handle and rethrow the error
      if (error instanceof ClaudeCodeError) {
        this.errorHandler.handleError(error);
        throw error;
      } else {
        const wrappedError = new ClaudeCodeError(
          ErrorType.UNKNOWN,
          `Error sending message to Claude Code: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        );
        this.errorHandler.handleError(wrappedError);
        throw wrappedError;
      }
    }
  }

  /**
   * Sends a real message to the Claude Code process
   * This will be used in the production version
   * @param message The message to send
   */
  private async sendRealMessage(message: string): Promise<ClaudeCodeResponse> {
    if (!this.childProcess || !this.childProcess.stdin || !this.isRunning) {
      throw new ClaudeCodeError(
        ErrorType.CLAUDE_PROCESS_FAILED,
        'Claude Code process is not running'
      );
    }

    return new Promise<ClaudeCodeResponse>((resolve, reject) => {
      try {
        // Reset stdout and stderr data
        this.stdoutData = '';
        this.stderrData = '';

        // Send the message to the process
        if (this.childProcess && this.childProcess.stdin) {
          this.childProcess.stdin.write(message + '\n');
        }

        // Set up a timeout to prevent waiting indefinitely
        const timeout = setTimeout(() => {
          reject(new ClaudeCodeError(
            ErrorType.TIMEOUT,
            'Request to Claude Code timed out'
          ));
        }, 30000); // 30 seconds timeout

        // Check for response periodically
        const checkInterval = setInterval(() => {
          // If we have a valid JSON response, parse it and return
          if (this.stdoutData) {
            try {
              clearInterval(checkInterval);
              clearTimeout(timeout);

              // Parse JSON response (would need to adapt to actual Claude Code output format)
              const response: ClaudeCodeResponse = {
                message: this.stdoutData
              };
              
              // Add to conversation context
              this.conversationContext.messages.push({
                role: 'assistant',
                content: response.message,
                timestamp: Date.now()
              });
              
              // Save the conversation if enabled
              this.saveConversation();

              resolve(response);
            } catch (e) {
              // Continue waiting for complete response
            }
          }

          // If there's an error, reject with it
          if (this.stderrData) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            
            reject(new ClaudeCodeError(
              ErrorType.UNKNOWN,
              this.stderrData
            ));
          }
        }, 100);
      } catch (error) {
        reject(new ClaudeCodeError(
          ErrorType.UNKNOWN,
          `Error communicating with Claude Code: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        ));
      }
    });
  }

  /**
   * Gets the current conversation context
   */
  public getConversationContext(): ConversationContext {
    return this.conversationContext;
  }

  /**
   * Clears the current conversation context
   */
  public clearConversationContext(): void {
    this.conversationContext = {
      messages: []
    };
    
    // Save the cleared conversation if enabled
    this.saveConversation();
  }
  
  /**
   * Saves the current conversation to global state (if enabled)
   */
  private saveConversation(): void {
    // Only save if preservation is enabled
    if (this.settingsManager.shouldPreserveConversations()) {
      try {
        // Save to global state
        // In a real implementation, we would use the vscode.ExtensionContext globalState property
        // Since this is just the MVP, we'll just log the action
        console.log('Saving conversation:', this.conversationContext);
      } catch (error) {
        console.error('Failed to save conversation:', error);
      }
    }
  }
  
  /**
   * Loads a saved conversation (if any and if enabled)
   */
  private loadConversation(): void {
    // Only load if preservation is enabled
    if (this.settingsManager.shouldPreserveConversations()) {
      try {
        // Load from global state
        // In a real implementation, we would use the vscode.ExtensionContext globalState property
        // Since this is just the MVP, we'll just log the action
        console.log('Loading conversation (would happen in a real implementation)');
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    }
  }

  /**
   * Stops the Claude Code process
   */
  public stop(): void {
    if (this.childProcess && this.isRunning) {
      this.childProcess.kill();
      this.isRunning = false;
    }
  }

  /**
   * Checks if the Claude Code process is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}