import * as vscode from "vscode";
import { getNonce } from "../utils";
import { searchFiles, getGitCommits } from "../fileSystem";
import { ImageManager } from "../service/imageManager";

export class ClaudeTerminalInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeInputView";
  private _view?: vscode.WebviewView;
  private _isTerminalClosed: boolean = false;
  private _imageManager?: ImageManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private _terminal: vscode.Terminal,
    private _context: vscode.ExtensionContext
  ) {
    this._imageManager = new ImageManager(_context);
  }

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
            // Handle images if present
            if (message.images && message.images.length > 0) {
              this._handleMessageWithImages(message.text, message.images);
            } else {
              // Check if it's a slash command
              if (message.text.trim().startsWith('/')) {
                this._handleSlashCommand(message.text.trim());
              } else {
                this._sendToTerminal(message.text);
              }
            }
            return;
            
          case "searchFiles":
            this._handleFileSearch(message.query, message.mentionsRequestId);
            return;
            
          case "searchCommits":
            this._handleCommitSearch(message.query, message.mentionsRequestId);
            return;
            
          case "showError":
            vscode.window.showErrorMessage(message.message);
            return;
            
          case "selectImageFiles":
            this._handleImageFileSelection();
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
    // First send the text without executing it (false parameter)
    this._terminal.sendText(text, false);
    
    // Add a small delay to ensure the text is properly buffered
    setTimeout(() => {
      // Then explicitly send Enter key to execute the command
      this._terminal.sendText('', true);
    }, 50);
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
  
  private async _handleImageFileSelection() {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: true,
      openLabel: 'Select Images',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      }
    };

    const fileUris = await vscode.window.showOpenDialog(options);
    
    if (fileUris && fileUris.length > 0) {
      const imagePaths = fileUris.map(uri => uri.fsPath);
      
      // Send the paths to the webview
      if (this._view) {
        this._view.webview.postMessage({
          command: 'imageFilesSelected',
          imagePaths: imagePaths
        });
      }
    }
  }
  
  private async _handleMessageWithImages(text: string, images: any[]) {
    try {
      const imagePaths: string[] = [];
      const failedImages: string[] = [];
      
      for (const image of images) {
        if (!image.name) {
          continue;
        }
        
        try {
          // If it's a clipboard image, save to temp
          if (image.isFromClipboard && image.data) {
            const tempPath = await this._imageManager!.saveImage(image.data, image.name, image.type);
            
            // Verify the file was actually created
            const fs = require('fs');
            if (fs.existsSync(tempPath)) {
              // Double-check the file is readable
              try {
                await fs.promises.access(tempPath, fs.constants.R_OK);
                imagePaths.push(tempPath);
              } catch (accessError) {
                console.error(`File created but not readable: ${tempPath}`, accessError);
                failedImages.push(image.name);
                // Try to clean up the inaccessible file
                try {
                  await this._imageManager!.removeImage(tempPath);
                } catch (cleanupError) {
                  console.error('Failed to clean up inaccessible file:', cleanupError);
                }
              }
            } else {
              console.error(`File was not created successfully: ${tempPath}`);
              failedImages.push(image.name);
            }
          } else if (image.path) {
            // Use the original path for file selections and drag-drop
            const fs = require('fs');
            try {
              await fs.promises.access(image.path, fs.constants.R_OK);
              imagePaths.push(image.path);
            } catch (error) {
              console.error(`Cannot access file: ${image.path}`, error);
              failedImages.push(image.name);
            }
          }
        } catch (error) {
          console.error(`Failed to process image ${image.name}:`, error);
          failedImages.push(image.name);
        }
      }
      
      // Notify user about failed images
      if (failedImages.length > 0) {
        const failedList = failedImages.join(', ');
        vscode.window.showWarningMessage(
          `Failed to process ${failedImages.length} image(s): ${failedList}. Continuing with successfully processed images.`
        );
      }
      
      // Only proceed if we have successfully processed images or text
      if (imagePaths.length === 0 && !text) {
        vscode.window.showErrorMessage('No images were successfully processed and no text was provided.');
        return;
      }
      
      // Format message with verified image paths
      let enhancedMessage = text || '';
      
      if (imagePaths.length > 0) {
        const imageReferences = this._imageManager!.formatImageReferences(imagePaths);
        enhancedMessage = enhancedMessage ? `${enhancedMessage}${imageReferences}` : imageReferences.trim();
        
        // Log successful image paths for debugging
        console.log(`Successfully processed ${imagePaths.length} image(s):`, imagePaths);
      }
      
      // Send to terminal only if we have content
      if (enhancedMessage) {
        this._sendToTerminal(enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling images:', error);
      vscode.window.showErrorMessage(`Failed to process images: ${error}`);
      // Fallback to sending just text if available
      if (text) {
        this._sendToTerminal(text);
      }
    }
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
                <button id="sendButton" title="Send to Claude Terminal">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="input-bottom-actions">
              <button id="contextButton" title="Add Context (@)" class="context-button">
                @
              </button>
              <button id="imageButton" title="Attach image" class="image-button">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 1H3.5C2.67157 1 2 1.67157 2 2.5V13.5C2 14.3284 2.67157 15 3.5 15H12.5C13.3284 15 14 14.3284 14 13.5V6M9 1L14 6M9 1V6H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div id="contextMenuContainer" class="context-menu-container" style="display: none;"></div>
            <div id="imagePreviewContainer" class="image-preview-container"></div>
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