import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { exec } from 'child_process';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ClaudeCodeService {
  private messageEmitter = new EventEmitter();
  private isProcessReady = false;

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
      
      // Send the ready message to the UI
      this.messageEmitter.emit('message', {
        role: 'assistant',
        content: 'Claude Code found. How can I help you with your project?'
      });
    });
  }

  /**
   * Send a message to Claude
   */
  public async sendMessage(message: string): Promise<void> {
    if (!this.isProcessReady) {
      await this.start();
    }

    // Emit the user message first
    this.messageEmitter.emit('message', {
      role: 'user',
      content: message
    });

    // Create a temporary script file to handle the trust prompt
    const tempScriptFile = '/tmp/claude_vscode_script.sh';
    const scriptContent = `#!/bin/bash
# Script to handle Claude interaction
(echo "1"; echo "${message}") | TERM=xterm-256color claude -p 2>/dev/null
`;

    // Write the script file
    const fs = require('fs');
    fs.writeFileSync(tempScriptFile, scriptContent);
    fs.chmodSync(tempScriptFile, '755');
    
    // Execute the script
    console.log('Executing Claude via script file');
    
    exec(`bash ${tempScriptFile}`, { env: { ...process.env, TERM: 'xterm-256color' } }, (error, stdout, stderr) => {
      // Clean up the temp file
      try {
        fs.unlinkSync(tempScriptFile);
      } catch (e) {
        console.error('Error removing temp file:', e);
      }
      
      if (error) {
        console.error(`Error from Claude: ${error.message}`);
        this.messageEmitter.emit('error', `Error from Claude: ${error.message}`);
        return;
      }
      
      if (stderr) {
        console.error(`Claude stderr: ${stderr}`);
      }
      
      // Emit the response
      this.messageEmitter.emit('message', {
        role: 'assistant',
        content: stdout.trim() || 'No response received from Claude. There might be an issue with the CLI.'
      });
      
      console.log('Claude response sent to UI');
    });
  }

  /**
   * Stop the Claude process
   */
  public stop(): void {
    // No long-running process to stop
    this.isProcessReady = false;
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
}