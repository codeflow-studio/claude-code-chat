import * as vscode from 'vscode';
import { ChatWebviewProvider } from './ui/chatWebviewProvider';
import { ClaudeCodeService } from './service/claudeCodeService';

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active!');

  // Initialize Claude Code Service
  const claudeCodeService = new ClaudeCodeService();
  claudeCodeServiceInstance = claudeCodeService;
  
  // Register Chat Webview Provider with Claude Code Service
  const chatWebviewProvider = new ChatWebviewProvider(context.extensionUri, claudeCodeService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeChatView', chatWebviewProvider)
  );

  // Register command to start/show chat
  const startChatCommand = vscode.commands.registerCommand('claude-code-extension.startChat', () => {
    vscode.commands.executeCommand('claudeCodeChatView.focus');
  });

  // Register command to reset conversation
  const resetConversationCommand = vscode.commands.registerCommand('claude-code-extension.resetConversation', () => {
    if (claudeCodeServiceInstance) {
      claudeCodeServiceInstance.resetConversation();
      vscode.window.showInformationMessage('Claude Code conversation has been reset.');
    }
  });

  // Register command to launch Claude Code in a terminal
  const launchClaudeCodeTerminalCommand = vscode.commands.registerCommand('claude-code-extension.launchClaudeCodeTerminal', () => {
    // Create a terminal with the name "Claude Code"
    const terminal = vscode.window.createTerminal({
      name: 'Claude Code',
      iconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'claude-icon.svg'),
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });
    
    // Show the terminal
    terminal.show();
    
    // Run Claude Code in the terminal
    terminal.sendText('claude');
  });

  context.subscriptions.push(startChatCommand);
  context.subscriptions.push(resetConversationCommand);
  context.subscriptions.push(launchClaudeCodeTerminalCommand);
  
  // Add Claude process cleanup to subscriptions
  context.subscriptions.push({
    dispose: () => {
      if (claudeCodeServiceInstance) {
        claudeCodeServiceInstance.stop();
      }
    }
  });
  
  // Start the Claude Code Service
  claudeCodeService.start().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to start Claude Code: ${errorMessage}`);
  });
}

// Store a reference to the Claude Code Service for cleanup
let claudeCodeServiceInstance: ClaudeCodeService | undefined;

export function deactivate() {
  // Clean up resources when extension is deactivated
  if (claudeCodeServiceInstance) {
    console.log('Stopping Claude Code process on deactivation');
    claudeCodeServiceInstance.stop();
    claudeCodeServiceInstance = undefined;
  }
}