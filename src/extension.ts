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

  context.subscriptions.push(startChatCommand);
  
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