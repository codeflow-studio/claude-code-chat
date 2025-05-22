import * as vscode from 'vscode';
import * as path from 'path';
import { ClaudeTerminalInputProvider } from './ui/claudeTerminalInputProvider';
import { customCommandService } from './service/customCommandService';

// Store a reference to the Claude terminal
let claudeTerminal: vscode.Terminal | undefined;

// Track if Claude Code is running in the terminal
let isClaudeRunning = false;

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

// Function has been replaced with direct calls to claudeTerminalInputProvider._sendToTerminal

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
  
  // Watch for changes to custom command files (project-specific)
  const projectWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/commands/*.md');
  
  // When files are created, changed or deleted, rescan custom commands
  projectWatcher.onDidCreate(() => customCommandService.scanCustomCommands());
  projectWatcher.onDidChange(() => customCommandService.scanCustomCommands());
  projectWatcher.onDidDelete(() => customCommandService.scanCustomCommands());
  
  // Watch for changes to user-specific custom command files
  let userCommandsPath = '';
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      userCommandsPath = path.join(homeDir, '.claude', 'commands', '*.md').replace(/\\/g, '/');
      const userWatcher = vscode.workspace.createFileSystemWatcher(userCommandsPath);
      userWatcher.onDidCreate(() => customCommandService.scanCustomCommands());
      userWatcher.onDidChange(() => customCommandService.scanCustomCommands());
      userWatcher.onDidDelete(() => customCommandService.scanCustomCommands());
      context.subscriptions.push(userWatcher);
    }
  } catch (err) {
    console.error('Error setting up user commands watcher:', err);
  }
  
  // Register the watcher for disposal when extension is deactivated
  context.subscriptions.push(projectWatcher);
  
  // Register Terminal Input Provider first so we can use it to send commands
  claudeTerminalInputProvider = new ClaudeTerminalInputProvider(context.extensionUri, terminal, context);
  
  // Store a reference to ensure it's not undefined later
  const provider = claudeTerminalInputProvider;
  
  // Auto-start function
  const performAutoStart = async () => {
    if (autoStart) {
      // Show terminal in background and start Claude Code automatically
      terminal.show(false); // false preserves focus on current editor
      if (!isClaudeRunning) {
        await provider.sendToTerminal('claude');
        isClaudeRunning = true;
      }
    }
  };
  
  // Call the auto-start function
  performAutoStart().catch(err => {
    console.error('Error during auto-start:', err);
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeInputView', claudeTerminalInputProvider)
  );
  
  // Register command to launch Claude Code in a terminal
  const launchClaudeCodeTerminalCommand = vscode.commands.registerCommand('claude-code-extension.launchClaudeCodeTerminal', async () => {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      console.error('Claude terminal input provider not initialized');
      return;
    }
    
    // Store a reference to ensure it's not undefined later
    const provider = claudeTerminalInputProvider;
    
    // Ensure Claude terminal exists
    const terminal = ensureClaudeTerminal(context);
    
    // Show the terminal in background 
    terminal.show(false);
    
    // Update the terminal reference in the input provider
    provider.updateTerminal(terminal);
    
    // Only start Claude Code in the terminal if it's not already running
    if (!isClaudeRunning) {
      // Claude is not running, start it using the sendToTerminal method and await its completion
      await provider.sendToTerminal('claude');
      isClaudeRunning = true;
    }
    // If Claude is already running, we just showed the terminal - no need to start Claude again
    
    // Focus the input view
    vscode.commands.executeCommand('claudeCodeInputView.focus');
  });

  context.subscriptions.push(launchClaudeCodeTerminalCommand);
  
  // Add restart command
  const restartClaudeCodeCommand = vscode.commands.registerCommand('claude-code-extension.restartClaudeCode', async () => {
    if (!claudeTerminalInputProvider) {
      console.error('Claude terminal input provider not initialized');
      return;
    }
    
    // Store a reference to ensure it's not undefined later
    const provider = claudeTerminalInputProvider;
    
    // First, send the /exit command to properly exit Claude and await its completion
    await provider.sendToTerminal('/exit');
    
    // Wait a bit for Claude to fully exit
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (!claudeTerminal) {
      // Terminal was closed, recreate it
      const newTerminal = ensureClaudeTerminal(context);
      
      // Update the terminal reference in the input provider
      provider.updateTerminal(newTerminal);
    }
    
    // Send clear command to clean the terminal and await its completion
    await provider.sendToTerminal('clear');
    
    // Reset the running flag
    isClaudeRunning = false;
    
    // Start Claude Code with -c flag to continue last session and await its completion
    await provider.sendToTerminal('claude -c');
    isClaudeRunning = true;
    
    // Focus the input view
    vscode.commands.executeCommand('claudeCodeInputView.focus');
  });
  
  context.subscriptions.push(restartClaudeCodeCommand);
  
  // Terminal lifecycle event handlers
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal === claudeTerminal) {
        console.log('Claude terminal was closed by user');
        claudeTerminal = undefined;
        isClaudeRunning = false;
        
        // Update UI provider to indicate terminal is closed
        if (claudeTerminalInputProvider) {
          claudeTerminalInputProvider.notifyTerminalClosed();
        }
      }
    })
  );
  
  // Handle input to killed terminal
  const handleSendToClosedTerminal = vscode.commands.registerCommand('claude-code-extension.sendToClosedTerminal', async (message: string) => {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      console.error('Claude terminal input provider not initialized');
      return;
    }
    
    // Store a reference to ensure it's not undefined later
    const provider = claudeTerminalInputProvider;
    
    // Terminal was killed, recreate it
    const newTerminal = ensureClaudeTerminal(context);
    
    // Update the terminal reference in the input provider
    provider.updateTerminal(newTerminal);
    
    // Reset the running flag
    isClaudeRunning = false;
    
    // Start Claude Code without the -c flag (fresh start)
    await provider.sendToTerminal('claude');
    isClaudeRunning = true;
    
    // Wait a bit for Claude to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send the user's message and await its completion
    await provider.sendToTerminal(message);
    
    // Focus the input view
    vscode.commands.executeCommand('claudeCodeInputView.focus');
  });
  
  context.subscriptions.push(handleSendToClosedTerminal);

  // Register command to add selected text to Claude Code input
  const addSelectionToInputCommand = vscode.commands.registerCommand('claude-code-extension.addSelectionToInput', () => {
    // Get the active text editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found');
      return;
    }

    // Get the selected text
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    
    if (!selectedText) {
      vscode.window.showWarningMessage('No text selected');
      return;
    }

    // Get the file path relative to workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let relativePath = editor.document.fileName;
    
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      if (relativePath.startsWith(workspaceRoot)) {
        relativePath = relativePath.substring(workspaceRoot.length);
        // Remove leading slash if present
        if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
          relativePath = relativePath.substring(1);
        }
      }
    } else {
      // If no workspace, just use the filename
      const pathParts = relativePath.split(/[/\\]/);
      relativePath = pathParts[pathParts.length - 1];
    }

    // Get line numbers (VSCode uses 0-based indexing, convert to 1-based)
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    
    // Create line range string
    const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
    
    // Format the text with file path, line numbers, and code block
    const formattedText = `@${relativePath}:${lineRange}\n\`\`\`\n${selectedText}\n\`\`\``;

    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    // Add the formatted text to the input field
    claudeTerminalInputProvider.addTextToInput(formattedText);
  });

  context.subscriptions.push(addSelectionToInputCommand);
  
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