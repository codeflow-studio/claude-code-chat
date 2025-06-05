import * as vscode from 'vscode';

/**
 * Service to handle integration with the official Claude Code extension
 */
export class ClaudeExtensionService {
  private static readonly OFFICIAL_EXTENSION_ID = 'anthropic.claude-code';
  private static readonly OFFICIAL_COMMAND_ID = 'claude-code.runClaude';

  /**
   * Checks if the official Claude Code extension is installed and enabled
   * @returns Promise<boolean> true if the extension is available
   */
  public static async isOfficialExtensionAvailable(): Promise<boolean> {
    try {
      const extension = vscode.extensions.getExtension(this.OFFICIAL_EXTENSION_ID);
      
      if (!extension) {
        console.log('Official Claude Code extension not found');
        return false;
      }

      // Check if the extension is active or can be activated
      if (!extension.isActive) {
        try {
          await extension.activate();
          console.log('Official Claude Code extension activated');
        } catch (error) {
          console.log('Failed to activate official Claude Code extension:', error);
          return false;
        }
      }

      console.log('Official Claude Code extension is available and active');
      return true;
    } catch (error) {
      console.error('Error checking for official Claude Code extension:', error);
      return false;
    }
  }

  /**
   * Executes the official Claude Code extension's run command
   * @returns Promise<boolean> true if the command was executed successfully
   */
  public static async runOfficialClaudeCode(): Promise<boolean> {
    try {
      const isAvailable = await this.isOfficialExtensionAvailable();
      
      if (!isAvailable) {
        console.log('Official Claude Code extension not available, falling back to terminal');
        return false;
      }

      // Execute the official extension's command
      await vscode.commands.executeCommand(this.OFFICIAL_COMMAND_ID);
      console.log('Official Claude Code extension command executed successfully');
      return true;
    } catch (error) {
      console.error('Error executing official Claude Code extension command:', error);
      return false;
    }
  }

  /**
   * Gets information about the official Claude Code extension
   * @returns Extension information or null if not available
   */
  public static getOfficialExtensionInfo(): vscode.Extension<any> | null {
    try {
      return vscode.extensions.getExtension(this.OFFICIAL_EXTENSION_ID) || null;
    } catch (error) {
      console.error('Error getting official Claude Code extension info:', error);
      return null;
    }
  }

  /**
   * Finds the terminal created by the official Claude Code extension
   * Uses the existing TerminalDetectionService but with enhanced logic for official extension
   * @returns Promise<vscode.Terminal | null> the official extension's terminal or null
   */
  public static async findOfficialExtensionTerminal(): Promise<vscode.Terminal | null> {
    try {
      // Import here to avoid circular dependency
      const terminalDetectionModule = await import('./terminalDetectionService');
      const terminalDetectionService = terminalDetectionModule.TerminalDetectionService;
      
      // Get all potential Claude terminals
      const claudeTerminals = await terminalDetectionService.detectClaudeTerminals();
      
      if (claudeTerminals.length === 0) {
        console.log('No Claude terminals found for official extension');
        return null;
      }

      // Look for terminals that are most likely from the official extension
      for (const terminalInfo of claudeTerminals) {
        const terminal = terminalInfo.terminal;
        
        // Check if this terminal is likely from the official extension
        if (await this.isOfficialExtensionTerminal(terminal)) {
          console.log(`Found official extension terminal: "${terminal.name}"`);
          return terminal;
        }
      }

      // If no official extension terminal found specifically, 
      // return the highest confidence Claude terminal
      const bestTerminal = claudeTerminals[0].terminal;
      console.log(`Using best Claude terminal for official extension: "${bestTerminal.name}"`);
      return bestTerminal;
    } catch (error) {
      console.error('Error finding official extension terminal:', error);
      return null;
    }
  }

  /**
   * Determines if a terminal is likely created by the official Claude Code extension
   * @param terminal The terminal to check
   * @returns Promise<boolean> true if likely from official extension
   */
  private static async isOfficialExtensionTerminal(terminal: vscode.Terminal): Promise<boolean> {
    const name = terminal.name.toLowerCase();
    
    // Official extension might use specific naming patterns
    const officialPatterns = [
      'claude',
      'claude code',
      'anthropic'
    ];
    
    // Check if terminal name matches official patterns
    const matchesOfficialPattern = officialPatterns.some(pattern => 
      name.includes(pattern) && !name.includes('claude-code-extension')
    );
    
    if (matchesOfficialPattern) {
      console.log(`Terminal "${terminal.name}" matches official extension pattern`);
      return true;
    }
    
    // Additional check: see if terminal was created recently after we triggered the official command
    // This is heuristic-based but can help identify the right terminal
    return false;
  }
}