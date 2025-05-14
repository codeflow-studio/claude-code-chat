import * as vscode from 'vscode';
import { getNonce } from '../utils';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeCodeChatView';

  constructor(
    private readonly _extensionUri: vscode.Uri,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      // Enable scripts in the webview
      enableScripts: true,
      
      // Restrict the webview to only load resources from the extension's directory
      localResourceRoots: [this._extensionUri]
    };

    // Set the webview's HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'sendMessage':
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
        command: 'receiveMessage',
        sender: 'claude',
        text: `You said: "${text}"\n\nThis is a placeholder response that demonstrates Claude's formatting capabilities.\n\n## Code Example\n\n\`\`\`javascript\n// This demonstrates syntax highlighting\nfunction exampleFunction() {\n  return "Hello world!";\n}\n\`\`\`\n\n### Features\n\n* Markdown support\n* Code highlighting\n* Lists like this one\n\n> Claude Code helps you write, understand, and improve your code directly within VSCode.`,
        timestamp: new Date().toISOString()
      });
    }, 1500);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Generate a nonce for script security
    const nonce = getNonce();

    // Get paths to local resources
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const claudeIconPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'claude-icon.svg'));

    return /* html */`
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
          <!-- Chat header with Claude branding -->
          <div class="chat-header">
            <div class="chat-header-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#5A32FB"/>
                <path d="M6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18C8.68629 18 6 15.3137 6 12Z" fill="white"/>
                <path d="M10.5 10H13.5C14.0523 10 14.5 10.4477 14.5 11V15C14.5 15.5523 14.0523 16 13.5 16H10.5C9.94772 16 9.5 15.5523 9.5 15V11C9.5 10.4477 9.94772 10 10.5 10Z" fill="#5A32FB"/>
              </svg>
              <span class="chat-header-title">Claude Code</span>
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
              <svg class="claude-flower" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.2451 9.75492H22L15.8774 14.4896L18.1226 22.2451L12 17.5104L5.87745 22.2451L8.12255 14.4896L2 9.75492H9.75492L12 2Z" fill="currentColor"/>
              </svg>
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