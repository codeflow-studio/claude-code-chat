import * as vscode from "vscode";
import { getNonce } from "../utils";
import { searchFiles, getGitCommits } from "../fileSystem";

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
            // Check if it's a slash command
            if (message.text.trim().startsWith('/')) {
              this._handleSlashCommand(message.text.trim());
            } else {
              this._sendToTerminal(message.text);
            }
            return;
            
          case "searchFiles":
            this._handleFileSearch(message.query, message.mentionsRequestId);
            return;
            
          case "searchCommits":
            this._handleCommitSearch(message.query, message.mentionsRequestId);
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
  
  private async _handleFileSearch(query: string, mentionsRequestId: string) {
    try {
      // Check if query looks like a git commit reference
      if (/^[a-f0-9]{7,40}$/i.test(query)) {
        // Search for git commits
        await this._handleCommitSearch(query, mentionsRequestId);
      } else {
        // Search for files matching the query
        const results = await searchFiles(query);
        
        // Send results back to webview
        if (this._view) {
          this._view.webview.postMessage({
            type: "fileSearchResults",
            results,
            mentionsRequestId
          });
        }
      }
    } catch (error) {
      console.error("Error searching files:", error);
      
      // Send empty results back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "fileSearchResults",
          results: [],
          mentionsRequestId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }
  
  private async _handleCommitSearch(query: string, mentionsRequestId: string) {
    try {
      // Search for commits matching the query
      const commits = await getGitCommits(query);
      
      // Send results back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "commitSearchResults",
          commits,
          mentionsRequestId
        });
      }
    } catch (error) {
      console.error("Error searching commits:", error);
      
      // Send empty results back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "commitSearchResults",
          commits: [],
          mentionsRequestId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }
  
  private _handleSlashCommand(command: string) {
    // For Claude Code, slash commands are sent directly as-is to the interactive session
    // The Claude Code CLI will handle parsing and executing them
    this._sendToTerminal(command);
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
    const codiconsCss = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "codicon.css")
    );
    
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <link href="${codiconsCss}" rel="stylesheet">
        <title>Claude Code Input</title>
        <style>
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow-x: hidden;
          }
          * {
            box-sizing: border-box;
          }
          .input-wrapper {
            width: 100% !important;
            min-width: 100% !important;
          }
          .highlight-container {
            width: 100% !important;
            min-width: 100% !important;
          }
          textarea {
            width: 100% !important;
            min-width: 100% !important;
          }
        </style>
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
              <div class="highlight-container">
                <div id="highlightLayer" class="highlight-layer"></div>
                <textarea id="messageInput" placeholder="Type your task here..." rows="1"></textarea>
              </div>
              <div class="input-actions">
                <button id="contextButton" title="Add Context (@)" class="context-button">
                  @
                </button>
                <button id="sendButton" title="Send to Claude Terminal">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
            <div id="contextMenuContainer" class="context-menu-container" style="display: none;"></div>
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