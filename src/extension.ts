import * as vscode from 'vscode';
import * as path from 'path';
import { ClaudeTerminalInputProvider } from './ui/claudeTerminalInputProvider';
import { customCommandService } from './service/customCommandService';
import { TerminalDetectionService } from './service/terminalDetectionService';
import { ClaudeCodeActionProvider } from './service/claudeCodeActionProvider';

// Store a reference to the Claude terminal
let claudeTerminal: vscode.Terminal | undefined;

// Track if Claude Code is running in the terminal
let isClaudeRunning = false;

// Enhanced launch options state management
const launchOptionsState = {
  active: false,
  command: null as string | null,
  blockAutoStart: false,
  processingTerminalShow: false
};

// Store references to providers
let claudeTerminalInputProvider: ClaudeTerminalInputProvider | undefined;

/**
 * Ensures that a Claude Code terminal exists and is initialized
 * Now attempts to detect and connect to existing Claude terminals first
 * Exported for use by the terminal input provider
 */
export async function ensureClaudeTerminal(context: vscode.ExtensionContext): Promise<{ terminal: vscode.Terminal; isExisting: boolean; isRunningClaude: boolean }> {
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

// Function has been replaced with direct calls to claudeTerminalInputProvider._sendToTerminal

export async function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active!');

  // Check if we should auto-start
  const config = vscode.workspace.getConfiguration('claude-code-extension');
  const autoStart = config.get('autoStartOnActivation', true);
  const autoStartCommand = config.get('autoStartCommand', 'claude') as string;
  
  // Initialize terminal variables
  let terminal: vscode.Terminal | undefined = undefined;
  let isExistingTerminal = false;
  let isClaudeAlreadyRunning = false;
  
  if (autoStart) {
    // Create and ensure the Claude terminal
    const terminalResult = await ensureClaudeTerminal(context);
    terminal = terminalResult.terminal;
    isExistingTerminal = terminalResult.isExisting;
    isClaudeAlreadyRunning = terminalResult.isRunningClaude;
    
    console.log(`Terminal setup: existing=${isExistingTerminal}, claudeRunning=${isClaudeAlreadyRunning}, name="${terminal.name}"`);
  } else {
    // Auto-start is disabled - only use existing Claude terminals, don't create new ones
    const existingTerminal = await TerminalDetectionService.findBestClaudeTerminal();
    if (existingTerminal) {
      const isValid = await TerminalDetectionService.validateClaudeTerminal(existingTerminal);
      if (isValid) {
        terminal = existingTerminal;
        isExistingTerminal = true;
        const terminalInfo = await TerminalDetectionService.detectClaudeTerminals();
        const currentTerminalInfo = terminalInfo.find(info => info.terminal === existingTerminal);
        isClaudeAlreadyRunning = currentTerminalInfo?.isRunningClaude || false;
        claudeTerminal = terminal;
        console.log(`Auto-start disabled: found existing Claude terminal: "${terminal.name}", Claude running: ${isClaudeAlreadyRunning}`);
      } else {
        console.log('Auto-start disabled: no valid existing terminal found, will show launch options');
      }
    } else {
      console.log('Auto-start disabled: no existing terminal found, will show launch options');
    }
  }
  
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
  
  // Enable streaming mode for better performance
  claudeTerminalInputProvider.enableStreamingMode(true);
  
  // Update with existing terminal status and auto-start state (only if terminal exists)
  if (terminal) {
    claudeTerminalInputProvider.updateTerminal(terminal, isExistingTerminal);
  }
  
  // Show/hide launch options based on terminal availability and auto-start setting
  if (!autoStart && !terminal) {
    // Only show launch options if no terminal exists at all
    console.log('Auto-start disabled and no terminal exists - will show launch options');
    claudeTerminalInputProvider.showLaunchOptions();
  } else if (terminal) {
    // Always hide launch options when any terminal exists (new or existing)
    console.log('Terminal is available - explicitly hiding launch options');
    claudeTerminalInputProvider.hideLaunchOptions();
  }
  
  // Store a reference to ensure it's not undefined later
  const provider = claudeTerminalInputProvider;
  
  // Simplified auto-start - just use the configured command directly

  // Auto-start function
  const performAutoStart = async () => {
    if (autoStart && terminal) {
      // Show terminal in background and start Claude Code automatically
      terminal.show(false); // false preserves focus on current editor
      
      if (isClaudeAlreadyRunning) {
        console.log('Claude is already running in the connected terminal');
        isClaudeRunning = true;
      } else if (isExistingTerminal) {
        // Connected to existing terminal but Claude not detected as running
        // Don't automatically start Claude in case it's in a different state
        console.log('Connected to existing terminal but Claude not detected - not auto-starting');
        isClaudeRunning = false;
      } else if (!isClaudeRunning) {
        // New terminal created, start Claude with configured command
        console.log(`Starting Claude in new terminal with command: ${autoStartCommand}`);
        
        // Use the configured command directly - Claude Code CLI will handle conversation selection for 'claude -r'
        await provider.sendToTerminal(autoStartCommand);
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
    
    // Ensure Claude terminal exists (may connect to existing one)
    const terminalResult = await ensureClaudeTerminal(context);
    const terminal = terminalResult.terminal;
    const isExistingTerminal = terminalResult.isExisting;
    const isClaudeAlreadyRunning = terminalResult.isRunningClaude;
    
    console.log(`Launch command: existing=${isExistingTerminal}, claudeRunning=${isClaudeAlreadyRunning}, name="${terminal.name}"`);
    
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
      const terminalResult = await ensureClaudeTerminal(context);
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
    const terminalResult = await ensureClaudeTerminal(context);
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

  context.subscriptions.push(addSelectionToInputCommand);

  // Register command to toggle Claude Code mode
  const toggleModeCommand = vscode.commands.registerCommand('claude-code-extension.toggleMode', async () => {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    // Call the public toggle mode method
    await claudeTerminalInputProvider.toggleMode();
  });

  context.subscriptions.push(toggleModeCommand);

  // Register command to toggle main mode (Terminal/Direct)
  const toggleMainModeCommand = vscode.commands.registerCommand('claude-code-extension.toggleMainMode', () => {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    // This command is mainly for keyboard shortcuts or command palette
    // The actual toggle happens via webview messages
    vscode.window.showInformationMessage('Use the toggle switch in the Claude Code sidebar to switch modes');
  });

  context.subscriptions.push(toggleMainModeCommand);

  // Register command to enable streaming mode
  const enableStreamingModeCommand = vscode.commands.registerCommand('claude-code-extension.enableStreamingMode', () => {
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }
    
    claudeTerminalInputProvider.enableStreamingMode(true);
    vscode.window.showInformationMessage('Claude streaming mode enabled for better performance');
  });

  context.subscriptions.push(enableStreamingModeCommand);

  // Register command to focus Claude Code input
  const focusInputCommand = vscode.commands.registerCommand('claude-code-extension.focusInput', async () => {
    // Check if provider is initialized
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    // Focus the input field
    await claudeTerminalInputProvider.focusInput();
  });

  context.subscriptions.push(focusInputCommand);

  // Register command to explain file with Claude Code
  const explainFileCommand = vscode.commands.registerCommand('claude-code-extension.explainFile', async (uri: vscode.Uri) => {
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    try {
      // Check if file exists
      const fileExists = await vscode.workspace.fs.stat(uri).then(() => true, () => false);
      if (!fileExists) {
        vscode.window.showWarningMessage(`File does not exist: ${uri.fsPath}`);
        return;
      }

      // Get workspace-relative path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let relativePath = uri.fsPath;
      
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        if (relativePath.startsWith(workspaceRoot)) {
          relativePath = relativePath.substring(workspaceRoot.length);
          if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
            relativePath = relativePath.substring(1);
          }
        }
      } else {
        const pathParts = relativePath.split(/[/\\]/);
        relativePath = pathParts[pathParts.length - 1];
      }

      // Format message to explain the file
      const message = `Explain this file: @${relativePath}`;
      
      // Ensure terminal is available and send message
      const terminalResult = await ensureClaudeTerminal(context);
      claudeTerminalInputProvider.updateTerminal(terminalResult.terminal, terminalResult.isExisting);
      terminalResult.terminal.show(false);
      
      if (!terminalResult.isRunningClaude && !isClaudeRunning) {
        await claudeTerminalInputProvider.sendToTerminal('claude');
        isClaudeRunning = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await claudeTerminalInputProvider.sendToTerminal(message);
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    } catch (error) {
      console.error('Error in explainFile command:', error);
      vscode.window.showErrorMessage(`Failed to explain file: ${error}`);
    }
  });

  context.subscriptions.push(explainFileCommand);

  // Register command to explain folder with Claude Code
  const explainFolderCommand = vscode.commands.registerCommand('claude-code-extension.explainFolder', async (uri: vscode.Uri) => {
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    try {
      // Check if folder exists
      const stat = await vscode.workspace.fs.stat(uri);
      if (!(stat.type & vscode.FileType.Directory)) {
        vscode.window.showWarningMessage(`Path is not a directory: ${uri.fsPath}`);
        return;
      }

      // Get workspace-relative path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let relativePath = uri.fsPath;
      
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        if (relativePath.startsWith(workspaceRoot)) {
          relativePath = relativePath.substring(workspaceRoot.length);
          if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
            relativePath = relativePath.substring(1);
          }
        }
      } else {
        const pathParts = relativePath.split(/[/\\]/);
        relativePath = pathParts[pathParts.length - 1];
      }

      // Format message to explain the folder
      const message = `Explain the structure and purpose of this folder: @${relativePath}`;
      
      // Ensure terminal is available and send message
      const terminalResult = await ensureClaudeTerminal(context);
      claudeTerminalInputProvider.updateTerminal(terminalResult.terminal, terminalResult.isExisting);
      terminalResult.terminal.show(false);
      
      if (!terminalResult.isRunningClaude && !isClaudeRunning) {
        await claudeTerminalInputProvider.sendToTerminal('claude');
        isClaudeRunning = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await claudeTerminalInputProvider.sendToTerminal(message);
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    } catch (error) {
      console.error('Error in explainFolder command:', error);
      vscode.window.showErrorMessage(`Failed to explain folder: ${error}`);
    }
  });

  context.subscriptions.push(explainFolderCommand);

  // Register command to explain selection with Claude Code
  const explainSelectionCommand = vscode.commands.registerCommand('claude-code-extension.explainSelection', async () => {
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      
      if (!selectedText) {
        vscode.window.showWarningMessage('No text selected');
        return;
      }

      // Get workspace-relative path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let relativePath = editor.document.fileName;
      
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        if (relativePath.startsWith(workspaceRoot)) {
          relativePath = relativePath.substring(workspaceRoot.length);
          if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
            relativePath = relativePath.substring(1);
          }
        }
      } else {
        const pathParts = relativePath.split(/[/\\]/);
        relativePath = pathParts[pathParts.length - 1];
      }

      // Get line numbers
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
      
      // Format message to explain the selection
      const message = `Explain this code: @${relativePath}#L${lineRange}`;
      
      // Ensure terminal is available and send message
      const terminalResult = await ensureClaudeTerminal(context);
      claudeTerminalInputProvider.updateTerminal(terminalResult.terminal, terminalResult.isExisting);
      terminalResult.terminal.show(false);
      
      if (!terminalResult.isRunningClaude && !isClaudeRunning) {
        await claudeTerminalInputProvider.sendToTerminal('claude');
        isClaudeRunning = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await claudeTerminalInputProvider.sendToTerminal(message);
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    } catch (error) {
      console.error('Error in explainSelection command:', error);
      vscode.window.showErrorMessage(`Failed to explain selection: ${error}`);
    }
  });

  context.subscriptions.push(explainSelectionCommand);

  // Register command to explain current file with Claude Code
  const explainCurrentFileCommand = vscode.commands.registerCommand('claude-code-extension.explainCurrentFile', async () => {
    if (!claudeTerminalInputProvider) {
      vscode.window.showErrorMessage('Claude terminal input provider not initialized');
      return;
    }

    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }

      // Get workspace-relative path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let relativePath = editor.document.fileName;
      
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        if (relativePath.startsWith(workspaceRoot)) {
          relativePath = relativePath.substring(workspaceRoot.length);
          if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
            relativePath = relativePath.substring(1);
          }
        }
      } else {
        const pathParts = relativePath.split(/[/\\]/);
        relativePath = pathParts[pathParts.length - 1];
      }

      // Format message to explain the current file
      const message = `Explain this file: @${relativePath}`;
      
      // Ensure terminal is available and send message
      const terminalResult = await ensureClaudeTerminal(context);
      claudeTerminalInputProvider.updateTerminal(terminalResult.terminal, terminalResult.isExisting);
      terminalResult.terminal.show(false);
      
      if (!terminalResult.isRunningClaude && !isClaudeRunning) {
        await claudeTerminalInputProvider.sendToTerminal('claude');
        isClaudeRunning = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await claudeTerminalInputProvider.sendToTerminal(message);
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    } catch (error) {
      console.error('Error in explainCurrentFile command:', error);
      vscode.window.showErrorMessage(`Failed to explain current file: ${error}`);
    }
  });

  context.subscriptions.push(explainCurrentFileCommand);

  // Register Claude Code Action Provider for Quick Fix menu
  const claudeCodeActionProvider = new ClaudeCodeActionProvider(claudeTerminalInputProvider);
  context.subscriptions.push(
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
  context.subscriptions.push(fixWithClaudeCommand);
  
  // Register command to manage launch options state
  const setLaunchOptionsStateCommand = vscode.commands.registerCommand('claude-code-extension.setLaunchOptionsState', (state: any) => {
    Object.assign(launchOptionsState, state);
    console.log(`Launch options state updated:`, launchOptionsState);
  });
  context.subscriptions.push(setLaunchOptionsStateCommand);
  
  // Register command to update terminal reference from provider
  const updateTerminalReferenceCommand = vscode.commands.registerCommand('claude-code-extension.updateTerminalReference', (terminal: vscode.Terminal) => {
    claudeTerminal = terminal;
    isClaudeRunning = true; // Assume Claude is running when terminal is updated from launch options
    console.log(`Terminal reference updated to: "${terminal.name}"`);
  });
  context.subscriptions.push(updateTerminalReferenceCommand);
  
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