import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationContext } from '../api/claudeCodeClient';
import { SettingsManager } from '../settings';

export interface ChatMessage {
  sender: 'user' | 'claude';
  text: string;
  timestamp: number;
}

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claude-code-chat';
  
  private _view: vscode.WebviewView | undefined;
  private _panel: vscode.WebviewPanel | undefined;
  private _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _settingsManager: SettingsManager;
  
  constructor(private readonly _context: vscode.ExtensionContext) {
    this._extensionUri = _context.extensionUri;
    this._settingsManager = SettingsManager.getInstance();
  }
  
  /**
   * Resolves the webview view
   * @param webviewView The webview view to resolve
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
    
    // Set options for the webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath))
      ]
    };
    
    // Set the HTML content for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'sendMessage':
            // Forward the message to the Claude Code client
            vscode.commands.executeCommand('claude-code.sendMessage', message.text);
            break;
            
          case 'clearMessages':
            // Clear the conversation
            vscode.commands.executeCommand('claude-code.clearConversation');
            break;
            
          case 'newChat':
            // Start a new conversation
            vscode.commands.executeCommand('claude-code.newConversation');
            break;
        }
      },
      null,
      this._disposables
    );
  }
  
  /**
   * Creates or shows the webview panel (legacy method for backward compatibility)
   */
  public createOrShow(): vscode.WebviewPanel {
    // If the panel already exists, show it
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      return this._panel;
    }
    
    // Get the preferred panel location from settings
    const viewColumn = this._settingsManager.getPanelViewColumn();
    
    // Create a new panel
    this._panel = vscode.window.createWebviewPanel(
      ChatWebviewProvider.viewType,
      'Claude Code Chat',
      viewColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this._context.extensionPath))
        ]
      }
    );
    
    // Set the webview's html content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    
    // Handle dispose event
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    
    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'sendMessage':
            // Forward the message to the Claude Code client
            vscode.commands.executeCommand('claude-code.sendMessage', message.text);
            break;
            
          case 'clearMessages':
            // Clear the conversation
            vscode.commands.executeCommand('claude-code.clearConversation');
            break;
            
          case 'newChat':
            // Start a new conversation
            vscode.commands.executeCommand('claude-code.newConversation');
            break;
        }
      },
      null,
      this._disposables
    );
    
    return this._panel;
  }
  
  /**
   * Adds a message to the chat history
   * @param sender The sender of the message ('user' or 'claude')
   * @param text The message text
   */
  public async addMessage(sender: 'user' | 'claude', text: string): Promise<void> {
    const message: ChatMessage = {
      sender,
      text,
      timestamp: Date.now()
    };
    
    // Try to send to the view first, then fallback to panel if necessary
    if (this._view) {
      await this._view.webview.postMessage({
        type: 'addMessage',
        message
      });
    } else if (this._panel) {
      await this._panel.webview.postMessage({
        type: 'addMessage',
        message
      });
    }
  }
  
  /**
   * Clears the chat history
   */
  public async clearMessages(): Promise<void> {
    if (this._view) {
      await this._view.webview.postMessage({
        type: 'clearMessages'
      });
    } else if (this._panel) {
      await this._panel.webview.postMessage({
        type: 'clearMessages'
      });
    }
  }
  
  /**
   * Updates the webview with conversation context
   * @param context The conversation context
   */
  public async updateFromContext(context: ConversationContext): Promise<void> {
    // First clear existing messages
    await this.clearMessages();
    
    // Add each message from the context
    for (const msg of context.messages) {
      await this.addMessage(
        msg.role === 'user' ? 'user' : 'claude',
        msg.content
      );
    }
  }
  
  /**
   * Sets the loading state in the UI
   * @param isLoading Whether Claude is processing a request
   */
  public async setLoading(isLoading: boolean): Promise<void> {
    if (this._view) {
      await this._view.webview.postMessage({
        type: 'setLoading',
        isLoading
      });
    } else if (this._panel) {
      await this._panel.webview.postMessage({
        type: 'setLoading',
        isLoading
      });
    }
  }
  
  /**
   * Dispose of the panel and related resources
   */
  private _dispose() {
    this._panel = undefined;
    
    // Dispose of all disposables
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  
  /**
   * Returns the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to script and stylesheet
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._context.extensionPath, 'media', 'main.js'))
    );
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._context.extensionPath, 'media', 'styles.css'))
    );
    
    // Use a nonce to whitelist scripts
    const nonce = this._getNonce();
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet" />
      <title>Claude Code Chat</title>
    </head>
    <body>
      <div class="chat-container">
        <div class="messages" id="messages">
          <!-- Messages will be inserted here -->
        </div>
        
        <div class="input-container">
          <textarea id="messageInput" placeholder="Type your message to Claude Code..."></textarea>
          <button id="sendButton">Send</button>
        </div>
        
        <div class="actions">
          <button id="clearButton">Clear Chat</button>
          <button id="newChatButton">New Chat</button>
        </div>
      </div>
      
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
  
  /**
   * Generates a nonce for the webview
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    return text;
  }
}