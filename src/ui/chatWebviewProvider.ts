import * as vscode from "vscode";
import { getNonce } from "../utils";

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeChatView";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
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
            // TODO: Send message to Claude Code process
            this._handleUserMessage(webviewView.webview, message.text);
            return;
        }
      },
      undefined,
      []
    );
  }

  private _handleUserMessage(webview: vscode.Webview, text: string) {
    // For now, just echo the message back with a mock response
    // Later, this will connect to the actual Claude Code process
    setTimeout(() => {
      webview.postMessage({
        command: "receiveMessage",
        sender: "claude",
        text: `You said: "${text}"\n\nThis is a placeholder response that demonstrates Claude's formatting capabilities.\n\n## Code Example\n\n\`\`\`javascript\n// This demonstrates syntax highlighting\nfunction exampleFunction() {\n  return "Hello world!";\n}\n\`\`\`\n\n### Features\n\n* Markdown support\n* Code highlighting\n* Lists like this one\n\n> Claude Code helps you write, understand, and improve your code directly within VSCode.`,
        timestamp: new Date().toISOString(),
      });
    }, 1500);
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
