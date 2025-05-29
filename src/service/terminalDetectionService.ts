import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

export interface ClaudeTerminalInfo {
  terminal: vscode.Terminal;
  isRunningClaude: boolean;
  confidence: number; // 0-1, how confident we are that Claude is running
}

export class TerminalDetectionService {
  /**
   * Attempts to detect existing terminals that might be running Claude Code
   */
  public static async detectClaudeTerminals(): Promise<ClaudeTerminalInfo[]> {
    const claudeTerminals: ClaudeTerminalInfo[] = [];
    const allTerminals = vscode.window.terminals;
    
    console.log(`Scanning ${allTerminals.length} existing terminals for Claude Code...`);
    
    for (const terminal of allTerminals) {
      const info = await this.analyzeTerminal(terminal);
      if (info.confidence > 0) {
        claudeTerminals.push(info);
        console.log(`Found potential Claude terminal: "${terminal.name}" (confidence: ${info.confidence})`);
      }
    }
    
    // Sort by confidence (highest first)
    claudeTerminals.sort((a, b) => b.confidence - a.confidence);
    
    return claudeTerminals;
  }
  
  /**
   * Finds the best existing Claude terminal or returns null
   */
  public static async findBestClaudeTerminal(): Promise<vscode.Terminal | null> {
    const claudeTerminals = await this.detectClaudeTerminals();
    
    if (claudeTerminals.length === 0) {
      console.log('No existing Claude terminals detected');
      return null;
    }
    
    const best = claudeTerminals[0];
    console.log(`Selected best Claude terminal: "${best.terminal.name}" (confidence: ${best.confidence})`);
    
    return best.terminal;
  }
  
  /**
   * Analyzes a single terminal to determine if it might be running Claude Code
   */
  private static async analyzeTerminal(terminal: vscode.Terminal): Promise<ClaudeTerminalInfo> {
    let confidence = 0;
    let isRunningClaude = false;
    
    // Check terminal name for Claude-related keywords
    const name = terminal.name.toLowerCase();
    if (name.includes('claude')) {
      confidence += 0.4;
      console.log(`Terminal "${terminal.name}" name suggests Claude (confidence +0.4)`);
    }
    
    // Try to get the terminal's process ID and analyze it
    try {
      const processId = await terminal.processId;
      if (processId) {
        const processInfo = await this.analyzeProcess(processId);
        confidence += processInfo.confidence;
        isRunningClaude = processInfo.isRunningClaude;
        
        if (processInfo.confidence > 0) {
          console.log(`Terminal "${terminal.name}" process analysis (confidence +${processInfo.confidence})`);
        }
      }
    } catch (error) {
      console.log(`Could not analyze process for terminal "${terminal.name}":`, error);
    }
    
    return {
      terminal,
      isRunningClaude,
      confidence: Math.min(confidence, 1.0) // Cap at 1.0
    };
  }
  
  /**
   * Analyzes a process to determine if it might be running Claude Code
   */
  private static async analyzeProcess(pid: number): Promise<{confidence: number, isRunningClaude: boolean}> {
    try {
      let confidence = 0;
      let isRunningClaude = false;
      
      // Try different methods to detect Claude processes
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // Use ps command to check process tree
        const processResult = await this.checkUnixProcessTree(pid);
        confidence += processResult.confidence;
        isRunningClaude = processResult.isRunningClaude;
      } else if (process.platform === 'win32') {
        // Use tasklist for Windows
        const processResult = await this.checkWindowsProcessTree(pid);
        confidence += processResult.confidence;
        isRunningClaude = processResult.isRunningClaude;
      }
      
      return { confidence, isRunningClaude };
    } catch (error) {
      console.log(`Error analyzing process ${pid}:`, error);
      return { confidence: 0, isRunningClaude: false };
    }
  }
  
  /**
   * Check Unix/macOS process tree for Claude
   */
  private static async checkUnixProcessTree(pid: number): Promise<{confidence: number, isRunningClaude: boolean}> {
    try {
      // Get process tree starting from the terminal shell
      const { stdout } = await exec(`ps -o pid,ppid,comm,args -p ${pid} -g ${pid} 2>/dev/null || true`);
      
      let confidence = 0;
      let isRunningClaude = false;
      
      if (stdout) {
        const lines = stdout.split('\n');
        for (const line of lines) {
          const lower = line.toLowerCase();
          
          // Look for 'claude' in command name or arguments
          if (lower.includes('claude') && !lower.includes('claude-code-extension')) {
            confidence += 0.5;
            isRunningClaude = true;
            console.log(`Found Claude process in tree: ${line.trim()}`);
          }
          
          // Look for common Node.js patterns that might indicate Claude Code
          if (lower.includes('node') && (lower.includes('@anthropic') || lower.includes('claude'))) {
            confidence += 0.3;
            console.log(`Found potential Claude Node.js process: ${line.trim()}`);
          }
        }
      }
      
      return { confidence: Math.min(confidence, 0.6), isRunningClaude };
    } catch (error) {
      console.log(`Error checking Unix process tree:`, error);
      return { confidence: 0, isRunningClaude: false };
    }
  }
  
  /**
   * Check Windows process tree for Claude
   */
  private static async checkWindowsProcessTree(pid: number): Promise<{confidence: number, isRunningClaude: boolean}> {
    try {
      // Use wmic to get process information
      const { stdout } = await exec(`wmic process where "ProcessId=${pid}" get Name,CommandLine,ParentProcessId /format:csv 2>nul || echo ""`);
      
      let confidence = 0;
      let isRunningClaude = false;
      
      if (stdout) {
        const lines = stdout.split('\n');
        for (const line of lines) {
          const lower = line.toLowerCase();
          
          // Look for 'claude' in command line
          if (lower.includes('claude') && !lower.includes('claude-code-extension')) {
            confidence += 0.5;
            isRunningClaude = true;
            console.log(`Found Claude process in Windows tree: ${line.trim()}`);
          }
          
          // Look for Node.js patterns
          if (lower.includes('node.exe') && (lower.includes('anthropic') || lower.includes('claude'))) {
            confidence += 0.3;
            console.log(`Found potential Claude Node.js process: ${line.trim()}`);
          }
        }
      }
      
      return { confidence: Math.min(confidence, 0.6), isRunningClaude };
    } catch (error) {
      console.log(`Error checking Windows process tree:`, error);
      return { confidence: 0, isRunningClaude: false };
    }
  }
  
  /**
   * Tests if a terminal is responsive by sending a test command
   * Note: This is a fallback method and should be used carefully
   */
  public static async testTerminalResponsiveness(terminal: vscode.Terminal): Promise<boolean> {
    try {
      // This is a non-destructive way to test - we just check if terminal exists and is not closed
      if (terminal.exitStatus !== undefined) {
        return false; // Terminal has exited
      }
      
      // For now, we'll just assume the terminal is responsive if it exists and hasn't exited
      // In the future, we could implement more sophisticated testing
      return true;
    } catch (error) {
      console.log(`Error testing terminal responsiveness:`, error);
      return false;
    }
  }
  
  /**
   * Validates that a terminal can be used for Claude Code
   */
  public static async validateClaudeTerminal(terminal: vscode.Terminal): Promise<boolean> {
    try {
      // Check if terminal still exists and is not closed
      if (terminal.exitStatus !== undefined) {
        console.log(`Terminal "${terminal.name}" has exited, cannot use for Claude`);
        return false;
      }
      
      // Check if the terminal is in the current window's terminal list
      const currentTerminals = vscode.window.terminals;
      if (!currentTerminals.includes(terminal)) {
        console.log(`Terminal "${terminal.name}" is not in current window, cannot use for Claude`);
        return false;
      }
      
      // Test responsiveness
      const isResponsive = await this.testTerminalResponsiveness(terminal);
      if (!isResponsive) {
        console.log(`Terminal "${terminal.name}" is not responsive, cannot use for Claude`);
        return false;
      }
      
      console.log(`Terminal "${terminal.name}" validation passed`);
      return true;
    } catch (error) {
      console.log(`Error validating terminal "${terminal.name}":`, error);
      return false;
    }
  }
}