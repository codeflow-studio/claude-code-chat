import * as vscode from 'vscode';
import { ClaudeCodeClient } from './api/claudeCodeClient';
import { ChatWebviewProvider } from './ui/chatWebviewProvider';
import { SelectionHandler } from './selectionHandler';
import { ErrorHandler, ClaudeCodeError, ErrorType } from './errorHandler';
import { SettingsManager } from './settings';

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code extension is now active');
  
  // Create instances of our services
  const claudeCodeClient = new ClaudeCodeClient();
  const chatWebviewProvider = new ChatWebviewProvider(context);
  const selectionHandler = new SelectionHandler();
  const errorHandler = ErrorHandler.getInstance();
  const settingsManager = SettingsManager.getInstance();
  
  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'claude-code-chat', // Must match the id in package.json
      chatWebviewProvider
    )
  );
  
  // Auto-start Claude Code if enabled in settings
  if (settingsManager.isAutoStartEnabled()) {
    claudeCodeClient.start().then(success => {
      if (success) {
        errorHandler.showInformation('Claude Code auto-started successfully');
      }
    }).catch(error => {
      errorHandler.handleError(error);
    });
  }
  
  // Register the startChat command
  let startChatDisposable = vscode.commands.registerCommand('claude-code.startChat', async () => {
    try {
      // Open the chat panel
      const panel = chatWebviewProvider.createOrShow();
      
      // Start Claude Code process if not already running
      if (!claudeCodeClient.isActive()) {
        errorHandler.showInformation('Starting Claude Code...');
        
        const started = await claudeCodeClient.start();
        if (started) {
          errorHandler.showInformation('Claude Code started successfully');
          
          // Load existing conversation, if any
          const context = claudeCodeClient.getConversationContext();
          await chatWebviewProvider.updateFromContext(context);
        }
      }
    } catch (error) {
      errorHandler.handleError(error, chatWebviewProvider);
    }
  });

  // Register the sendMessage command
  let sendMessageDisposable = vscode.commands.registerCommand('claude-code.sendMessage', async (messageText?: string) => {
    try {
      if (!claudeCodeClient.isActive()) {
        const startNow = await vscode.window.showInformationMessage(
          'Claude Code is not running. Start it now?',
          'Yes', 'No'
        );
        
        if (startNow === 'Yes') {
          const started = await claudeCodeClient.start();
          if (!started) {
            return;
          }
        } else {
          return;
        }
      }

      // If no message was provided, open the panel and let the user type one
      if (!messageText) {
        chatWebviewProvider.createOrShow();
        return;
      }

      // Add the user's message to the chat
      await chatWebviewProvider.addMessage('user', messageText);
      
      // Set loading state in UI
      await chatWebviewProvider.setLoading(true);
      
      try {
        const response = await claudeCodeClient.sendMessage(messageText);
        
        // Add Claude's response to the chat
        await chatWebviewProvider.addMessage('claude', response.message);
      } finally {
        // Clear loading state
        await chatWebviewProvider.setLoading(false);
      }
    } catch (error) {
      errorHandler.handleError(error, chatWebviewProvider);
    }
  });

  // Register the askAboutSelection command
  let askAboutSelectionDisposable = vscode.commands.registerCommand('claude-code.askAboutSelection', async () => {
    try {
      // Get the current selection
      const selection = selectionHandler.getCurrentSelection();
      if (!selection) {
        throw new ClaudeCodeError(
          ErrorType.INVALID_SELECTION,
          'No code selected. Please select some code first.'
        );
      }

      // Ask the user what they want to know about the selection
      const userQuery = await vscode.window.showInputBox({
        prompt: 'What would you like to know about this code?',
        placeHolder: 'E.g., "Explain this code" or "How can I improve this?"'
      });

      if (!userQuery) {
        return; // User cancelled
      }

      // Create the full message with the code selection
      const message = `${userQuery}\n\nHere's the code (${selection.language}) from ${selection.fileName}:\n\n\`\`\`${selection.language}\n${selection.text}\n\`\`\``;

      // Open the chat panel
      chatWebviewProvider.createOrShow();

      // Execute the sendMessage command with the constructed message
      vscode.commands.executeCommand('claude-code.sendMessage', message);
    } catch (error) {
      errorHandler.handleError(error, chatWebviewProvider);
    }
  });
  
  // Register the clearConversation command
  let clearConversationDisposable = vscode.commands.registerCommand('claude-code.clearConversation', async () => {
    try {
      // Clear the conversation context
      claudeCodeClient.clearConversationContext();
      
      // Clear the UI
      await chatWebviewProvider.clearMessages();
      
      errorHandler.showInformation('Conversation cleared');
    } catch (error) {
      errorHandler.handleError(error, chatWebviewProvider);
    }
  });
  
  // Register the newConversation command
  let newConversationDisposable = vscode.commands.registerCommand('claude-code.newConversation', async () => {
    try {
      // Clear the current conversation
      claudeCodeClient.clearConversationContext();
      
      // Clear the UI
      await chatWebviewProvider.clearMessages();
      
      errorHandler.showInformation('New conversation started');
    } catch (error) {
      errorHandler.handleError(error, chatWebviewProvider);
    }
  });

  // Clean up resources when the extension is deactivated
  context.subscriptions.push(
    startChatDisposable,
    sendMessageDisposable,
    askAboutSelectionDisposable,
    clearConversationDisposable,
    newConversationDisposable,
    {
      dispose: () => {
        try {
          claudeCodeClient.stop();
        } catch (error) {
          console.error('Error stopping Claude Code client:', error);
        }
      }
    }
  );
}

export function deactivate() {
  // Clean up resources when the extension is deactivated
  console.log('Claude Code extension has been deactivated');
}