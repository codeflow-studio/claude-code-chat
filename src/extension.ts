import * as vscode from 'vscode';
import { ChatWebviewProvider } from './ui/chatWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active!');

  // Register Chat Webview Provider
  const chatWebviewProvider = new ChatWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeChatView', chatWebviewProvider)
  );

  // Register command to start/show chat
  const startChatCommand = vscode.commands.registerCommand('claude-code-extension.startChat', () => {
    vscode.commands.executeCommand('claudeCodeChatView.focus');
  });

  context.subscriptions.push(startChatCommand);
}

export function deactivate() {
  // Clean up resources when extension is deactivated
}