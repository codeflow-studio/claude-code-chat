import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeJsonResponse {
  // New Claude format
  role?: string;
  result?: string;
  session_id?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  
  // Old Claude format - kept for backward compatibility
  message?: {
    content: string;
  };
  cost?: {
    total_cost: number;
  };
  duration?: {
    total_ms: number;
  };
}

export class ClaudeCodeService {
  private messageEmitter = new EventEmitter();
  private isProcessReady = false;
  private sessionId?: string;

  constructor() {
    this.messageEmitter.setMaxListeners(100);
  }

  /**
   * Start the Claude Code service
   */
  public async start(): Promise<void> {
    // Simple non-interactive test to check Claude installation
    exec('which claude', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error checking for Claude: ${error.message}`);
        this.messageEmitter.emit('error', 'Claude Code CLI is not installed or not in the PATH');
        return;
      }
      
      console.log(`Found Claude at: ${stdout.trim()}`);
      this.isProcessReady = true;
      this.messageEmitter.emit('ready');
      
      // Send welcome message
      this.messageEmitter.emit('message', {
        role: 'assistant',
        content: 'Hello! I\'m Claude Code. How can I help you with your coding tasks today?'
      });
    });
  }

  /**
   * Send a message to Claude
   * @param message The message to send
   * @param emitUserMessage Whether to emit the user message to UI (default: true)
   */
  public async sendMessage(message: string, emitUserMessage: boolean = true): Promise<void> {
    if (!this.isProcessReady) {
      await this.start();
    }

    // Emit the user message first (only if requested)
    if (emitUserMessage) {
      this.messageEmitter.emit('message', {
        role: 'user',
        content: message
      });
    }

    // Get workspace root folder
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      this.messageEmitter.emit('error', 'No workspace folder is open. Please open a folder or workspace.');
      return;
    }
    
    // Prepare Claude command arguments
    const args = ['-p', '--output-format', 'json'];
    
    // Add session ID if we have one to maintain conversation context
    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }
    
    // Set up the process in the workspace root to ensure correct context
    const claudeProcess = spawn('claude', args, {
      cwd: workspaceRoot.fsPath,
      env: { ...process.env, TERM: 'xterm-256color' }
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    // Collect stdout data
    claudeProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    // Collect stderr data
    claudeProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error(`Claude stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    claudeProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Claude process exited with code ${code}`);
        this.messageEmitter.emit('error', `Claude process error. Exit code: ${code}. ${stderrData}`);
        return;
      }
      
      try {
        // Parse the JSON response
        console.log('Parsing Claude response: ', stdoutData);
        
        const response: ClaudeJsonResponse = JSON.parse(stdoutData);
        
        // Store the session ID for future continuation
        this.sessionId = response.session_id;
        
        // Extract the content based on the response format
        let content = '';
        let duration = 0;
        let cost = 0;
        
        // Log response format for debugging
        console.log("Response format detected:", response);
        console.log("arg1 =\n", response);
        
        // Check which format we received and extract the appropriate fields
        if (response.result !== undefined) {
          // New format
          content = response.result;
          duration = response.duration_ms || 0;
          cost = response.cost_usd || 0;
          console.log(`New Claude format detected. Duration: ${duration}ms, Cost: $${cost.toFixed(6)}`);
        } else if (response.message && response.message.content) {
          // Old format
          content = response.message.content;
          duration = response.duration?.total_ms || 0;
          cost = response.cost?.total_cost || 0;
          console.log(`Legacy Claude format detected. Duration: ${duration}ms, Cost: $${cost.toFixed(6)}`);
        } else {
          throw new Error('Unrecognized response format from Claude CLI');
        }
        
        // Use 'assistant' role for all Claude responses, even if the API returns 'system'
        const messageRole = 'assistant';
        
        // Emit the response
        this.messageEmitter.emit('message', {
          role: messageRole,
          content: content.trim()
        });
        
        console.log(`Claude response sent to UI. Session ID: ${this.sessionId}`);
      } catch (error) {
        console.error('Failed to parse Claude response:', error);
        console.error('Raw response:', stdoutData);
        this.messageEmitter.emit('error', 'Failed to parse Claude response. There might be an issue with the CLI.');
      }
    });
    
    // Handle process errors
    claudeProcess.on('error', (error) => {
      console.error(`Error spawning Claude process: ${error.message}`);
      this.messageEmitter.emit('error', `Failed to start Claude process: ${error.message}`);
    });
    
    // Send the message to Claude
    claudeProcess.stdin.write(message);
    claudeProcess.stdin.end();
  }

  /**
   * Reset the conversation by clearing the session ID
   */
  public resetConversation(): void {
    this.sessionId = undefined;
    console.log('Conversation reset. Session ID cleared.');
    
    this.messageEmitter.emit('message', {
      role: 'assistant',
      content: 'Conversation has been reset. How can I help you?'
    });
  }

  /**
   * Stop the Claude process
   */
  public stop(): void {
    // No long-running process to stop
    this.isProcessReady = false;
    this.sessionId = undefined;
  }

  /**
   * Subscribe to messages from Claude
   */
  public onMessage(callback: (message: ClaudeMessage) => void): vscode.Disposable {
    const listener = (message: ClaudeMessage) => {
      callback(message);
    };
    
    this.messageEmitter.on('message', listener);
    
    return {
      dispose: () => {
        this.messageEmitter.removeListener('message', listener);
      }
    };
  }

  /**
   * Subscribe to errors from the Claude process
   */
  public onError(callback: (error: string) => void): vscode.Disposable {
    const listener = (error: string) => {
      callback(error);
    };
    
    this.messageEmitter.on('error', listener);
    
    return {
      dispose: () => {
        this.messageEmitter.removeListener('error', listener);
      }
    };
  }

  /**
   * Subscribe to process exit events
   */
  public onExit(callback: (code: number) => void): vscode.Disposable {
    const listener = (code: number) => {
      callback(code);
    };
    
    this.messageEmitter.on('exit', listener);
    
    return {
      dispose: () => {
        this.messageEmitter.removeListener('exit', listener);
      }
    };
  }

  /**
   * Get the root folder of the currently open workspace
   * @returns The Uri of the workspace root folder or undefined if none is open
   */
  private getWorkspaceRoot(): vscode.Uri | undefined {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }
}