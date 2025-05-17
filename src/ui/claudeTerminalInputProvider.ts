import * as vscode from "vscode";
import { getNonce } from "../utils";

export class ClaudeTerminalInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeInputView";
  private _view?: vscode.WebviewView;
  private _isTerminalClosed: boolean = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private _terminal: vscode.Terminal
  ) {}

  public updateTerminal(terminal: vscode.Terminal) {
    this._terminal = terminal;
    this._isTerminalClosed = false;
    
    // Update UI state if view exists
    if (this._view) {
      this._view.webview.postMessage({
        command: "terminalStatus",
        isTerminalClosed: false
      });
    }
  }
  
  public notifyTerminalClosed() {
    this._isTerminalClosed = true;
    
    // Update UI state if view exists
    if (this._view) {
      this._view.webview.postMessage({
        command: "terminalStatus",
        isTerminalClosed: true
      });
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    
    // Setup webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Send initial terminal status
    webviewView.webview.postMessage({
      command: "terminalStatus",
      isTerminalClosed: this._isTerminalClosed
    });
    
    // Handle message from webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "sendToTerminal":
            this._sendToTerminal(message.text);
            return;
        }
      },
      undefined,
      []
    );
  }
  
  private _sendToTerminal(text: string) {
    // Check if terminal is closed
    if (this._isTerminalClosed) {
      // Use command to recreate terminal and send message
      vscode.commands.executeCommand('claude-code-extension.sendToClosedTerminal', text);
      return;
    }
    
    // Ensure terminal exists and is showing
    this._terminal.show();
    
    // Send text to terminal
    this._terminal.sendText(text, true);
  }
  
  private _getHtmlForWebview(webview: vscode.Webview) {
    // Generate nonce for script security
    const nonce = getNonce();
    
    // Get resource URIs
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "styles.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "input.js")
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
        <link href="${styleUri}" rel="stylesheet">
        <title>Claude Code Input</title>
      </head>
      <body>
        <div class="chat-container input-only">
          <!-- Header with Claude branding -->
          <div class="chat-header">
            <div class="chat-title">
              <img class="claude-icon" src="${claudeIconPath}" width="20" height="20" alt="Claude Icon" />
              <span>Claude Terminal Input</span>
            </div>
          </div>
          
          <!-- Terminal status banner (shown when terminal is closed) -->
          <div id="terminalStatusBanner" class="terminal-status-banner hidden">
            <div class="terminal-status-icon">⚠️</div>
            <div class="terminal-status-message">
              Terminal was closed. Sending a message will reopen it.
            </div>
          </div>
          
          <!-- Input area styled like Claude -->
          <div class="input-container">
            <div class="input-wrapper">
              <textarea id="messageInput" placeholder="Type your message to Claude Code..." rows="3"></textarea>
              <div class="input-actions">
                <button id="sendButton" title="Send to Claude Terminal">
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
              <span>Interactive terminal for Claude Code</span>
            </div>
          </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}