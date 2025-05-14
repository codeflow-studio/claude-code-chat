import * as vscode from 'vscode';

/**
 * Error types specific to the Claude Code extension
 */
export enum ErrorType {
  CLAUDE_NOT_INSTALLED = 'claude_not_installed',
  CLAUDE_PROCESS_FAILED = 'claude_process_failed',
  CONNECTION_ERROR = 'connection_error',
  TIMEOUT = 'timeout',
  AUTHENTICATION_ERROR = 'authentication_error',
  INVALID_SELECTION = 'invalid_selection',
  UNKNOWN = 'unknown'
}

/**
 * Represents a structured error in the Claude Code extension
 */
export class ClaudeCodeError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ClaudeCodeError.prototype);
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClaudeCodeError);
    }
    
    this.name = 'ClaudeCodeError';
  }
}

/**
 * Centralized error handling for the extension
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  
  /**
   * Gets the singleton instance of ErrorHandler
   */
  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }
  
  private constructor() {
    // Private constructor to enforce singleton pattern
  }
  
  /**
   * Creates a user-friendly error message based on the error type
   * @param error The error to process
   */
  public getErrorMessage(error: Error | ClaudeCodeError | unknown): string {
    if (error instanceof ClaudeCodeError) {
      switch (error.type) {
        case ErrorType.CLAUDE_NOT_INSTALLED:
          return 'Claude Code CLI is not installed. Please install it first.';
          
        case ErrorType.CLAUDE_PROCESS_FAILED:
          return 'Failed to start Claude Code. Please check if it is properly installed.';
          
        case ErrorType.CONNECTION_ERROR:
          return 'Failed to connect to Claude Code. Please check your internet connection.';
          
        case ErrorType.TIMEOUT:
          return 'The request to Claude Code timed out. Please try again later.';
          
        case ErrorType.AUTHENTICATION_ERROR:
          return 'Authentication with Claude Code failed. Please run claude-code in your terminal to authenticate.';
          
        case ErrorType.INVALID_SELECTION:
          return 'No valid code selection found. Please select some code first.';
          
        default:
          return error.message || 'An unknown error occurred while using Claude Code.';
      }
    } else if (error instanceof Error) {
      return error.message;
    } else {
      return String(error);
    }
  }
  
  /**
   * Handles an error by showing the appropriate message to the user
   * @param error The error to handle
   * @param chatWebviewProvider Optional chat provider to display the error in
   */
  public async handleError(
    error: Error | ClaudeCodeError | unknown,
    chatWebviewProvider?: { addMessage(sender: 'claude', text: string): Promise<void> }
  ): Promise<void> {
    const errorMessage = this.getErrorMessage(error);
    
    // Show error in the chat if provider is available
    if (chatWebviewProvider) {
      await chatWebviewProvider.addMessage('claude', `Error: ${errorMessage}`);
    }
    
    // Always show in the notification UI
    vscode.window.showErrorMessage(errorMessage);
    
    // Log detailed error for debugging
    console.error('Claude Code Error:', error);
  }
  
  /**
   * Shows informational messages to the user
   * @param message The message to show
   */
  public showInformation(message: string): void {
    vscode.window.showInformationMessage(message);
  }
}