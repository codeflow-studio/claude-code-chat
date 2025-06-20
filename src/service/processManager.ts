/**
 * Process Manager Service
 * Handles Claude CLI process lifecycle, spawning, and termination
 * Supports both streaming JSON input and one-shot processes
 */

import { spawn } from 'child_process';

export interface ProcessState {
  isRunning: boolean;
  currentProcess?: any;
  suspended: boolean;
}

export class ProcessManager {
  private _isProcessRunning: boolean = false;
  private _currentProcess?: any;
  private _processStateCallback?: (state: ProcessState) => void;
  private _streamingMode: boolean = false;
  private _partialData: string = '';

  constructor(private _workspaceRoot?: string) {}

  /**
   * Sets the process state change callback
   */
  setProcessStateCallback(callback: (state: ProcessState) => void): void {
    this._processStateCallback = callback;
  }

  /**
   * Spawns a new Claude CLI process with the given arguments
   */
  spawnClaudeProcess(args: string[]): any {
    console.log('Spawning claude process with args:', args);

    const claudeProcess = spawn('claude', args, {
      cwd: this._workspaceRoot || process.cwd(),
      stdio: this._streamingMode ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
    });

    // Track the current process and set running state
    this._currentProcess = claudeProcess;
    this._isProcessRunning = true;
    this._notifyProcessStateChanged();

    return claudeProcess;
  }

  /**
   * Starts a persistent Claude process for streaming JSON input
   */
  startStreamingProcess(allowedTools: string[]): any {
    console.log('Starting streaming Claude process...');
    
    this._streamingMode = true;
    this._partialData = '';
    
    const args = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    if (allowedTools.length > 0) {
      args.push('--allowedTools', allowedTools.join(','));
    }

    const claudeProcess = this.spawnClaudeProcess(args);
    
    console.log('Streaming Claude process started with PID:', claudeProcess.pid);
    return claudeProcess;
  }

  /**
   * Sends a message to the streaming Claude process via stdin
   */
  sendStreamingMessage(message: { role: string; content: string }): boolean {
    if (!this._streamingMode || !this._currentProcess || !this._isProcessRunning) {
      console.error('Cannot send streaming message: no active streaming process');
      return false;
    }

    try {
      // Format message according to Claude Code streaming spec
      // Ensure we're sending the correct type for user messages
      if (message.role !== 'user') {
        console.warn('Streaming input currently only supports user messages, got:', message.role);
      }
      
      const formattedMessage = {
        type: "user",  // Always "user" for streaming input
        message: {
          role: "user",  // Always "user" for streaming input
          content: [
            {
              type: "text",
              text: message.content
            }
          ]
        }
        // Session state is maintained internally by the streaming process
      };
      
      const jsonMessage = JSON.stringify(formattedMessage) + '\n';
      console.log('Sending streaming message (formatted):', jsonMessage.trim());
      
      this._currentProcess.stdin.write(jsonMessage);
      return true;
    } catch (error) {
      console.error('Error sending streaming message:', error);
      return false;
    }
  }

  /**
   * Checks if currently in streaming mode
   */
  isStreamingMode(): boolean {
    return this._streamingMode;
  }

  /**
   * Terminates the currently running Claude process
   */
  async terminateCurrentProcess(): Promise<boolean> {
    if (this._currentProcess && this._isProcessRunning) {
      console.log('Terminating Claude CLI process...');
      await this._terminateProcessCleanly(this._currentProcess);
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._streamingMode = false;
      this._partialData = '';
      this._notifyProcessStateChanged();
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
   * Gets the current process reference
   */
  getCurrentProcess(): any {
    return this._currentProcess;
  }

  /**
   * Marks process as completed
   */
  markProcessCompleted(): void {
    this._isProcessRunning = false;
    this._currentProcess = undefined;
    this._streamingMode = false;
    this._partialData = '';
    this._notifyProcessStateChanged();
  }

  /**
   * Sets up standard process event handlers
   */
  setupProcessHandlers(
    process: any,
    onStdout: (data: Buffer) => void,
    onStderr: (data: Buffer) => void,
    onExit: (code: number | null) => void,
    onError: (error: Error) => void,
    suppressErrors: boolean = false
  ): void {
    // Handle process output
    if (this._streamingMode) {
      // For streaming mode, buffer partial data
      process.stdout?.on('data', (data: Buffer) => {
        this._partialData += data.toString();
        onStdout(data);
      });
    } else {
      process.stdout?.on('data', onStdout);
    }

    // Handle process errors
    process.stderr?.on('data', (data: Buffer) => {
      console.error('Claude CLI stderr:', data.toString());
      if (!suppressErrors) {
        onStderr(data);
      }
    });

    // Handle process exit
    process.on('exit', (code: number | null) => {
      console.log(`Claude CLI process exited with code ${code}`);
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._notifyProcessStateChanged();
      if (code !== 0 && !suppressErrors) {
        onExit(code);
      }
    });

    // Handle process errors
    process.on('error', (error: Error) => {
      console.error('Claude CLI process error:', error);
      this._isProcessRunning = false;
      this._currentProcess = undefined;
      this._notifyProcessStateChanged();
      if (!suppressErrors) {
        onError(error);
      }
    });
  }

  /**
   * Notifies callback about process state changes for UI updates
   */
  private _notifyProcessStateChanged(): void {
    if (this._processStateCallback) {
      this._processStateCallback({
        isRunning: this._isProcessRunning,
        currentProcess: this._currentProcess,
        suspended: false // This will be managed by the calling service
      });
    }
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
}