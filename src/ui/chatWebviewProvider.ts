import * as vscode from "vscode";
import { getNonce } from "../utils";
import { ClaudeCodeService, ClaudeMessage } from "../service/claudeCodeService";

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeChatView";
  private _view?: vscode.WebviewView;
  private _messageListeners: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _claudeCodeService: ClaudeCodeService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      // Enable scripts in the webview
      enableScripts: true,

      // Restrict the webview to only load resources from the extension's directory
      localResourceRoots: [this._extensionUri],
    };

    // Set the webview's HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "sendMessage":
            this._handleUserMessage(message.text);
            return;
          case "resetConversation":
            this._handleResetConversation();
            return;
        }
      },
      undefined,
      []
    );

    // Set up listeners for Claude Code service events
    this._setupClaudeCodeListeners();
  }

  private _setupClaudeCodeListeners() {
    // Clean up any existing listeners
    this._disposeMessageListeners();

    // Add message listener
    this._messageListeners.push(
      this._claudeCodeService.onMessage((message: ClaudeMessage) => {
        if (!this._view) {
          return;
        }

        // Send the message to the webview
        this._view.webview.postMessage({
          command: "receiveMessage",
          sender: message.role,
          text: message.content,
          timestamp: new Date().toISOString(),
        });
        
        // If this is a response from Claude, update the UI status
        if (message.role === 'assistant') {
          this._view.webview.postMessage({
            command: "updateStatus",
            status: "ready"
          });
        }
      })
    );

    // Add error listener
    this._messageListeners.push(
      this._claudeCodeService.onError((error: string) => {
        if (!this._view) {
          return;
        }

        this._view.webview.postMessage({
          command: "receiveMessage",
          sender: "claude",
          text: `⚠️ Error: ${error}`,
          timestamp: new Date().toISOString(),
        });
        
        // Update UI status when there's an error
        this._view.webview.postMessage({
          command: "updateStatus",
          status: "error"
        });

        vscode.window.showErrorMessage(`Claude Code error: ${error}`);
      })
    );

    // Add exit listener
    this._messageListeners.push(
      this._claudeCodeService.onExit((code: number) => {
        if (!this._view) {
          return;
        }

        // Don't flood UI with restart messages
        if (code !== 0) {
          this._view.webview.postMessage({
            command: "receiveMessage",
            sender: "claude",
            text: `Claude Code process exited. Attempting to restart...`,
            timestamp: new Date().toISOString(),
          });
          
          // Update UI status on process exit
          this._view.webview.postMessage({
            command: "updateStatus",
            status: "restarting"
          });
        }

        // Add delay before restart to prevent immediate crash loops
        setTimeout(() => {
          // Try to restart the process
          this._claudeCodeService.start().catch(error => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to restart Claude Code: ${errorMessage}`);
            
            if (this._view) {
              this._view.webview.postMessage({
                command: "receiveMessage",
                sender: "claude",
                text: `⚠️ Error restarting Claude Code. Please try again or restart VS Code.`,
                timestamp: new Date().toISOString(),
              });
              
              // Update UI status when restart fails
              this._view.webview.postMessage({
                command: "updateStatus",
                status: "error"
              });
            }
          });
        }, 2000);
      })
    );
  }

  private _disposeMessageListeners() {
    for (const disposable of this._messageListeners) {
      disposable.dispose();
    }
    this._messageListeners = [];
  }

  private async _handleUserMessage(text: string) {
    if (!this._view) {
      return;
    }
    
    // Update UI to show loading state
    this._view.webview.postMessage({
      command: "updateStatus",
      status: "thinking"
    });
    
    try {
      // Send message to Claude Code process but don't emit the user message
      // since the client already displayed it
      await this._claudeCodeService.sendMessage(text, false);
    } catch (error) {
      if (!this._view) {
        return;
      }

      // Get error message safely
      const errorMessage = error instanceof Error 
        ? error.message 
        : String(error);

      // Show error in UI
      this._view.webview.postMessage({
        command: "receiveMessage",
        sender: "claude",
        text: `⚠️ Error: Failed to send message to Claude Code. ${errorMessage}`,
        timestamp: new Date().toISOString(),
      });
      
      // Update UI status on error
      this._view.webview.postMessage({
        command: "updateStatus",
        status: "error"
      });

      vscode.window.showErrorMessage(`Failed to send message to Claude Code: ${errorMessage}`);
    }
  }
  
  private _handleResetConversation() {
    if (!this._view) {
      return;
    }
    
    // Call the service to reset the conversation
    this._claudeCodeService.resetConversation();
    
    // Update UI to indicate reset
    this._view.webview.postMessage({
      command: "conversationReset"
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Generate a nonce for script security
    const nonce = getNonce();

    // Get paths to local resources
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "styles.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const claudeIconPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "claude-icon.svg")
    );

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
      <title>Claude Code Chat</title>
      <link href="${styleUri}" rel="stylesheet">
      </head>
      <body>
      <div class="chat-container">
        <!-- Header with actions -->
        <div class="chat-header">
          <div class="chat-title">
            <img class="claude-icon" src="${claudeIconPath}" width="20" height="20" alt="Claude Icon" />
            <span>Claude Code Assistant</span>
          </div>
          <div class="chat-actions">
            <button id="resetButton" title="Reset conversation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Message container -->
        <div id="messages" class="messages"></div>
        
        <!-- Input area styled like Claude -->
        <div class="input-container">
          <div class="input-wrapper">
            <textarea id="messageInput" placeholder="Ask Claude Code..." rows="1"></textarea>
            <div class="input-actions">
              <button id="sendButton">
                Send
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Claude attribution footer -->
        <div class="utility-row">
          <div class="claude-attribution">
            <img class="claude-flower" src="${claudeIconPath}" width="16" height="16" alt="Claude Icon" />
            <span>Claude can make mistakes. Please double-check responses.</span>
          </div>
          <div class="claude-version">
            <span>Claude 3.7 Sonnet</span>
          </div>
        </div>
      </div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}