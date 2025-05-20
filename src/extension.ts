import * as vscode from 'vscode';
import { ClaudeTerminalInputProvider } from './ui/claudeTerminalInputProvider';
import { customCommandService } from './service/customCommandService';

// Store a reference to the Claude terminal
let claudeTerminal: vscode.Terminal | undefined;

// Store references to providers
let claudeTerminalInputProvider: ClaudeTerminalInputProvider | undefined;

/**
 * Ensures that a Claude Code terminal exists and is initialized
 */
function ensureClaudeTerminal(context: vscode.ExtensionContext): vscode.Terminal {
  // Create terminal if it doesn't exist or was closed
  if (!claudeTerminal || claudeTerminal.exitStatus) {
    claudeTerminal = vscode.window.createTerminal({
      name: 'Claude Code',
      iconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'claude-icon.svg'),
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });
    
    // Register disposal when VSCode closes
    context.subscriptions.push({
      dispose: () => {
        claudeTerminal?.dispose();
      }
    });
  }
  
  return claudeTerminal;
}

/**
 * Starts Claude Code in the terminal
 */
function startClaudeCodeInTerminal(terminal: vscode.Terminal): void {
  // Run Claude Code in the terminal
  terminal.sendText('claude');
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active!');

  // Create and ensure the Claude terminal
  const terminal = ensureClaudeTerminal(context);
  
  // Check if we should auto-start
  const config = vscode.workspace.getConfiguration('claude-code-extension');
  const autoStart = config.get('autoStartOnActivation', true);
  
  // Initialize custom command service
  customCommandService.scanCustomCommands().catch(err => {
    console.error('Error scanning custom commands:', err);
  });
  
  // Watch for changes to custom command files
  const projectWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/commands/*.md');
  
  // When files are created, changed or deleted, rescan custom commands
  projectWatcher.onDidCreate(() => customCommandService.scanCustomCommands());
  projectWatcher.onDidChange(() => customCommandService.scanCustomCommands());
  projectWatcher.onDidDelete(() => customCommandService.scanCustomCommands());
  
  // Register the watcher for disposal when extension is deactivated
  context.subscriptions.push(projectWatcher);
  
  if (autoStart) {
    // Show terminal in background and start Claude Code automatically
    terminal.show(false); // false preserves focus on current editor
    startClaudeCodeInTerminal(terminal);
  }
  
  // Register Terminal Input Provider
  claudeTerminalInputProvider = new ClaudeTerminalInputProvider(context.extensionUri, terminal, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeInputView', claudeTerminalInputProvider)
  );
  
  // Register command to launch Claude Code in a terminal
  const launchClaudeCodeTerminalCommand = vscode.commands.registerCommand('claude-code-extension.launchClaudeCodeTerminal', () => {
    const terminal = ensureClaudeTerminal(context);
    
    // Show the terminal in background
    terminal.show(false);
    
    // Start Claude Code in the terminal
    startClaudeCodeInTerminal(terminal);
    
    // Update the terminal reference in the input provider
    if (claudeTerminalInputProvider) {
      claudeTerminalInputProvider.updateTerminal(terminal);
    }
    
    // Focus the input view
    vscode.commands.executeCommand('claudeCodeInputView.focus');
  });

  context.subscriptions.push(launchClaudeCodeTerminalCommand);
  
  // Add restart command
  const restartClaudeCodeCommand = vscode.commands.registerCommand('claude-code-extension.restartClaudeCode', () => {
    if (claudeTerminal) {
      // Clear the terminal
      claudeTerminal.sendText('\u0003'); // Send CTRL+C
      claudeTerminal.sendText('clear'); // Clear the terminal
      
      // Start Claude Code again
      startClaudeCodeInTerminal(claudeTerminal);
      
      // Show terminal in background and focus the input
      claudeTerminal.show(false);
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    } else {
      // Terminal was killed, recreate it
      const newTerminal = ensureClaudeTerminal(context);
      newTerminal.show(false);
      startClaudeCodeInTerminal(newTerminal);
      
      // Update the terminal reference in the input provider
      if (claudeTerminalInputProvider) {
        claudeTerminalInputProvider.updateTerminal(newTerminal);
      }
      
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    }
  });
  
  context.subscriptions.push(restartClaudeCodeCommand);
  
  // Terminal lifecycle event handlers
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal === claudeTerminal) {
        console.log('Claude terminal was closed by user');
        claudeTerminal = undefined;
        
        // Update UI provider to indicate terminal is closed
        if (claudeTerminalInputProvider) {
          claudeTerminalInputProvider.notifyTerminalClosed();
        }
      }
    })
  );
  
  // Handle input to killed terminal
  const handleSendToClosedTerminal = vscode.commands.registerCommand('claude-code-extension.sendToClosedTerminal', (message: string) => {
    // Terminal was killed, recreate it
    const newTerminal = ensureClaudeTerminal(context);
    
    // Show the terminal but in the background (preserveActive: false)
    newTerminal.show(false);
    
    // Start Claude Code before sending the message
    startClaudeCodeInTerminal(newTerminal);
    
    // Wait a bit for Claude to initialize
    setTimeout(() => {
      // Send text without executing it
      newTerminal.sendText(message, false);
      
      // Add a small delay to ensure the text is properly buffered
      setTimeout(() => {
        // Then send Enter key to execute
        newTerminal.sendText('', true);
      }, 50);
      
      // Update the terminal reference in the input provider
      if (claudeTerminalInputProvider) {
        claudeTerminalInputProvider.updateTerminal(newTerminal);
      }
      
      // Return focus to the input view after a delay
      setTimeout(() => {
        vscode.commands.executeCommand('claudeCodeInputView.focus');
      }, 150);
    }, 1000);
  });
  
  context.subscriptions.push(handleSendToClosedTerminal);
  
  // Focus terminal input view if we auto-started
  if (autoStart) {
    vscode.commands.executeCommand('claudeCodeInputView.focus');
  }
}

export function deactivate() {
  // Clean up resources when extension is deactivated
  if (claudeTerminal) {
    console.log('Closing Claude terminal on deactivation');
    claudeTerminal.dispose();
    claudeTerminal = undefined;
  }
}