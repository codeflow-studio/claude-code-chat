import * as vscode from 'vscode';
import * as path from 'path';
import { ClaudeTerminalInputProvider } from './ui/claudeTerminalInputProvider';
import { customCommandService } from './service/customCommandService';
import { TerminalDetectionService } from './service/terminalDetectionService';
import { ClaudeCodeActionProvider } from './service/claudeCodeActionProvider';
import { ClaudeExtensionService } from './service/claudeExtensionService';

// Store a reference to the Claude terminal
let claudeTerminal: vscode.Terminal | undefined;

// Track if Claude Code is running in the terminal
let isClaudeRunning = false;

// Store references to providers
let claudeTerminalInputProvider: ClaudeTerminalInputProvider | undefined;

/**
 * Ensures that a Claude Code terminal exists and is initialized
 * Now attempts to detect and connect to existing Claude terminals first
 */
async function ensureClaudeTerminal(context: vscode.ExtensionContext): Promise<{ terminal: vscode.Terminal; isExisting: boolean; isRunningClaude: boolean }> {
  // First, check if we already have a valid Claude terminal
  if (claudeTerminal && !claudeTerminal.exitStatus) {
    const isValid = await TerminalDetectionService.validateClaudeTerminal(claudeTerminal);
    if (isValid) {
      console.log('Using existing Claude terminal');
      // Check if Claude is running in this terminal
      const terminalInfo = await TerminalDetectionService.detectClaudeTerminals();
      const currentTerminalInfo = terminalInfo.find(info => info.terminal === claudeTerminal);
      return { 
        terminal: claudeTerminal, 
        isExisting: true, 
        isRunningClaude: currentTerminalInfo?.isRunningClaude || false 
      };
    } else {
      console.log('Current Claude terminal is no longer valid');
      claudeTerminal = undefined;
    }
  }
  
  // Try to find an existing Claude terminal
  const existingTerminal = await TerminalDetectionService.findBestClaudeTerminal();
  if (existingTerminal) {
    const isValid = await TerminalDetectionService.validateClaudeTerminal(existingTerminal);
    if (isValid) {
      console.log(`Connecting to existing Claude terminal: "${existingTerminal.name}"`);
      claudeTerminal = existingTerminal;
      
      // Register disposal when VSCode closes (if not already registered)
      context.subscriptions.push({
        dispose: () => {
          // Only dispose if this is still our terminal
          if (claudeTerminal === existingTerminal) {
            claudeTerminal?.dispose();
          }
        }
      });
      
      // Check if Claude is running in this terminal
      const terminalInfo = await TerminalDetectionService.detectClaudeTerminals();
      const currentTerminalInfo = terminalInfo.find(info => info.terminal === existingTerminal);
      return { 
        terminal: claudeTerminal, 
        isExisting: true, 
        isRunningClaude: currentTerminalInfo?.isRunningClaude || false 
      };
    }
  }
  
  // No existing Claude terminal found or valid, create a new one
  console.log('Creating new Claude terminal');
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
  
  return { terminal: claudeTerminal, isExisting: false, isRunningClaude: false };
}

/**
 * Launches Claude Code using the official extension if available, otherwise falls back to terminal
 * @returns Promise<boolean> true if Claude was launched successfully
 */
async function launchClaude(): Promise<boolean> {
  // First try to use the official Claude Code extension
  const officialLaunched = await ClaudeExtensionService.runOfficialClaudeCode();
  
  if (officialLaunched) {
    console.log('Claude launched using official extension');
    
    // Now try to connect to the official extension's terminal
    const connected = await connectToOfficialTerminal();
    if (connected) {
      console.log('Successfully connected to official extension terminal');
      return true;
    } else {
      console.log('Could not connect to official extension terminal, but command was executed');
      return true; // Command was still executed successfully
    }
  }
  
  // Fall back to terminal approach
  console.log('Falling back to terminal launch approach');
  return await launchWithTerminal();
}

/**
 * Attempts to connect our UI to the official Claude Code extension's terminal
 * @returns Promise<boolean> true if successfully connected
 */
async function connectToOfficialTerminal(): Promise<boolean> {
  try {
    // Give the official extension a moment to create its terminal
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find the official extension's terminal
    const officialTerminal = await ClaudeExtensionService.findOfficialExtensionTerminal();
    
    if (!officialTerminal) {
      console.log('Could not find official extension terminal');
      return false;
    }
    
    console.log(`Connecting to official extension terminal: "${officialTerminal.name}"`);
    
    // Validate the terminal is usable
    const isValid = await TerminalDetectionService.validateClaudeTerminal(officialTerminal);
    if (!isValid) {
      console.log('Official extension terminal is not valid/usable');
      return false;
    }
    
    // Update our extension to use this terminal
    claudeTerminal = officialTerminal;
    isClaudeRunning = true; // Assume Claude is running since official extension launched it
    
    // Update the UI provider to use this terminal
    if (claudeTerminalInputProvider) {
      claudeTerminalInputProvider.updateTerminal(officialTerminal, true); // Mark as existing terminal
      
      // Focus our input view since we're now connected
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    }
    
    console.log('Successfully connected to official extension terminal');
    return true;
  } catch (error) {
    console.error('Error connecting to official terminal:', error);
    return false;
  }
}

/**
 * Launches Claude Code using the terminal approach (current implementation)
 * @returns Promise<boolean> true if Claude was launched successfully
 */
async function launchWithTerminal(): Promise<boolean> {
  try {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      console.error('Claude terminal input provider not initialized');
      return false;
    }
    
    // Store a reference to ensure it's not undefined later
    const provider = claudeTerminalInputProvider;
    
    // Ensure Claude terminal exists (may connect to existing one)
    const terminalResult = await ensureClaudeTerminal(context);
    const terminal = terminalResult.terminal;
    const isExistingTerminal = terminalResult.isExisting;
    const isClaudeAlreadyRunning = terminalResult.isRunningClaude;
    
    console.log(`Terminal launch: existing=${isExistingTerminal}, claudeRunning=${isClaudeAlreadyRunning}, name="${terminal.name}"`);
    
    // Show the terminal in background 
    terminal.show(false);
    
    // Update the terminal reference in the input provider
    provider.updateTerminal(terminal, isExistingTerminal);
    
    if (isClaudeAlreadyRunning) {
      console.log('Claude is already running in the connected terminal');
      isClaudeRunning = true;
    } else if (isExistingTerminal) {
      // Connected to existing terminal but Claude not detected as running
      // Don't automatically start Claude - let user decide
      console.log('Connected to existing terminal but Claude not detected - not auto-starting');
      isClaudeRunning = false;
    } else if (!isClaudeRunning) {
      // Claude is not running in new terminal, start it using the sendToTerminal method and await its completion
      console.log('Starting Claude in new terminal');
      await provider.sendToTerminal('claude');
      isClaudeRunning = true;
    }
    
    // Focus the input view
    vscode.commands.executeCommand('claudeCodeInputView.focus');
    return true;
  } catch (error) {
    console.error('Error launching Claude with terminal:', error);
    return false;
  }
}

// Store context globally so launchWithTerminal can access it
let context: vscode.ExtensionContext;

export async function activate(extensionContext: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active!');
  
  // Store context globally for use in other functions
  context = extensionContext;

  // Create and ensure the Claude terminal
  const terminalResult = await ensureClaudeTerminal(extensionContext);
  const terminal = terminalResult.terminal;
  const isExistingTerminal = terminalResult.isExisting;
  const isClaudeAlreadyRunning = terminalResult.isRunningClaude;
  
  console.log(`Terminal setup: existing=${isExistingTerminal}, claudeRunning=${isClaudeAlreadyRunning}, name="${terminal.name}"`);
  
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
      extensionContext.subscriptions.push(userWatcher);
    }
  } catch (err) {
    console.error('Error setting up user commands watcher:', err);
  }
  
  // Register the watcher for disposal when extension is deactivated
  extensionContext.subscriptions.push(projectWatcher);
  
  // Register Terminal Input Provider first so we can use it to send commands
  claudeTerminalInputProvider = new ClaudeTerminalInputProvider(extensionContext.extensionUri, terminal, extensionContext);
  
  // Update with existing terminal status
  claudeTerminalInputProvider.updateTerminal(terminal, isExistingTerminal);
  
  // Auto-start function
  const performAutoStart = async () => {
    if (autoStart) {
      console.log('Auto-starting Claude Code...');
      await launchClaude();
    }
  };
  
  // Call the auto-start function
  performAutoStart().catch(err => {
    console.error('Error during auto-start:', err);
  });
  extensionContext.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeInputView', claudeTerminalInputProvider)
  );
  
  // Register command to launch Claude Code in a terminal
  const launchClaudeCodeTerminalCommand = vscode.commands.registerCommand('claude-code-extension.launchClaudeCodeTerminal', async () => {
    console.log('Manual launch command triggered');
    await launchClaude();
  });

  extensionContext.subscriptions.push(launchClaudeCodeTerminalCommand);
  
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
      const terminalResult = await ensureClaudeTerminal(extensionContext);
      const newTerminal = terminalResult.terminal;
      
      // Update the terminal reference in the input provider
      provider.updateTerminal(newTerminal, terminalResult.isExisting);
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
  
  extensionContext.subscriptions.push(restartClaudeCodeCommand);
  
  // Terminal lifecycle event handlers
  extensionContext.subscriptions.push(
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
    const terminalResult = await ensureClaudeTerminal(extensionContext);
    const newTerminal = terminalResult.terminal;
    
    // Update the terminal reference in the input provider
    provider.updateTerminal(newTerminal, terminalResult.isExisting);
    
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
  
  extensionContext.subscriptions.push(handleSendToClosedTerminal);

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
    
    // Format the text with only file path and line numbers (no code content)
    const formattedText = `@${relativePath}#L${lineRange}`;

    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    // Add the formatted text to the input field
    claudeTerminalInputProvider.addTextToInput(formattedText);
  });

  extensionContext.subscriptions.push(addSelectionToInputCommand);

  // Register Claude Code Action Provider for Quick Fix menu
  const claudeCodeActionProvider = new ClaudeCodeActionProvider(claudeTerminalInputProvider);
  extensionContext.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      '*', // Apply to all file types
      claudeCodeActionProvider,
      {
        providedCodeActionKinds: ClaudeCodeActionProvider.providedCodeActionKinds
      }
    )
  );

  // Register command for fixing with Claude Code
  const fixWithClaudeCommand = vscode.commands.registerCommand(
    'claude-code-extension.fixWithClaude',
    async (document: vscode.TextDocument, range: vscode.Range | vscode.Selection, diagnostic: vscode.Diagnostic) => {
      await ClaudeCodeActionProvider.handleFixWithClaude(
        claudeTerminalInputProvider,
        document,
        range,
        diagnostic
      );
    }
  );
  extensionContext.subscriptions.push(fixWithClaudeCommand);
  
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