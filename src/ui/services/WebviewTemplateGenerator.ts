import * as vscode from "vscode";
import { getNonce } from "../../utils";

/**
 * Service responsible for generating HTML templates for webviews
 * Extracted from ClaudeTerminalInputProvider to improve maintainability
 */
export class WebviewTemplateGenerator {
  /**
   * Generates the complete HTML template for the Claude Code input webview
   * @param webview The webview instance for CSP and resource URI generation
   * @param extensionUri The extension's URI for resource loading
   * @returns Complete HTML string for the webview
   */
  public generateHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    // Generate nonce for script security
    const nonce = getNonce();
    
    // Get resource URIs
    const resourceUris = this._getResourceUris(webview, extensionUri);
    
    return this._buildHtmlTemplate(webview, nonce, resourceUris);
  }

  /**
   * Gets all resource URIs needed for the webview
   */
  private _getResourceUris(webview: vscode.Webview, extensionUri: vscode.Uri) {
    return {
      styleUri: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "styles.css")
      ),
      scriptUri: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "js", "main.js")
      ),
      claudeIconPath: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "resources", "claude-icon.svg")
      ),
      imageIconPath: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "resources", "image-svgrepo-com.svg")
      ),
      modeToggleIconPath: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "resources", "mode-toggle.svg")
      ),
      codiconsCss: webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "codicon.css")
      )
    };
  }

  /**
   * Builds the complete HTML template
   */
  private _buildHtmlTemplate(
    webview: vscode.Webview, 
    nonce: string, 
    resources: ReturnType<typeof this._getResourceUris>
  ): string {
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
        <link href="${resources.styleUri}" rel="stylesheet">
        <link href="${resources.codiconsCss}" rel="stylesheet">
        <title>Claude Code Input</title>
        <style>
          ${this._getInlineStyles()}
        </style>
      </head>
      <body>
        ${this._getBodyContent(resources)}
        <script type="module" nonce="${nonce}" src="${resources.scriptUri}"></script>
      </body>
      </html>
    `;
  }

  /**
   * Gets the inline CSS styles
   */
  private _getInlineStyles(): string {
    return `
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
          /* Ensure proper initial sizing before JavaScript loads */
          .chat-container {
            height: 100vh !important;
            max-height: 100vh !important;
            min-height: 100vh !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            position: relative !important;
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
          /* Ensure Direct Mode container expands properly */
          .direct-mode-container {
            flex: 1 1 auto !important;
            height: 0 !important;
            min-height: 200px !important;
          }
          /* Specific handling for narrow widths */
          @media (max-width: 300px) {
            .chat-container {
              height: 100vh !important;
              max-height: 100vh !important;
              min-height: 100vh !important;
            }
            .direct-mode-container {
              flex: 1 1 auto !important;
              height: 0 !important;
              min-height: 150px !important;
            }
          }
          /* Pause button styles */
          .pause-button {
            background: linear-gradient(135deg, #ff6b6b, #ee5a52);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: none;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(238, 90, 82, 0.3);
            position: relative;
            overflow: hidden;
          }
          .pause-button:hover {
            background: linear-gradient(135deg, #ee5a52, #dc4c64);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(238, 90, 82, 0.4);
          }
          .pause-button:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(238, 90, 82, 0.3);
          }
          .pause-button.visible {
            display: flex;
            animation: slideInFromRight 0.3s ease-out;
          }
          .pause-button.visible.pulsing {
            animation: pulseGlow 2s ease-in-out infinite;
          }
          .pause-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
          }
          /* Pause button animations */
          @keyframes slideInFromRight {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes pulseGlow {
            0%, 100% {
              box-shadow: 0 2px 4px rgba(238, 90, 82, 0.3);
            }
            50% {
              box-shadow: 0 2px 4px rgba(238, 90, 82, 0.6), 0 0 12px rgba(238, 90, 82, 0.4);
            }
          }
          /* Direct mode header improvements */
          .direct-mode-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 500;
          }
          .header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .clear-responses-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 6px;
            padding: 5px 10px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .clear-responses-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
          }
          /* Enhanced file edit and tool usage styles */
          .file-edit-block {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin: 8px 0;
            background: var(--vscode-editor-background);
            overflow: hidden;
          }
          .file-edit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--vscode-editor-selectionBackground, rgba(0, 123, 255, 0.1));
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .file-edit-info {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .file-details .file-name {
            font-weight: 600;
            font-size: 14px;
            color: var(--vscode-editor-foreground);
          }
          .file-details .file-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
          }
          .change-info {
            font-size: 12px;
            color: var(--vscode-charts-blue);
            font-weight: 500;
            background: var(--vscode-badge-background);
            padding: 2px 6px;
            border-radius: 4px;
          }
          .file-diff {
            border-top: 1px solid var(--vscode-panel-border);
          }
          .diff-section {
            padding: 8px 0;
          }
          .diff-section.removed {
            background: rgba(248, 81, 73, 0.1);
            border-left: 3px solid #f85149;
          }
          .diff-section.added {
            background: rgba(46, 160, 67, 0.1);
            border-left: 3px solid #2ea043;
          }
          .diff-label {
            padding: 4px 16px;
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
          }
          .diff-section.removed .diff-label {
            color: #f85149;
          }
          .diff-section.added .diff-label {
            color: #2ea043;
          }
          .diff-content {
            margin: 0 16px;
            border-radius: 4px;
            overflow: hidden;
          }
          .diff-content pre {
            margin: 0;
            padding: 12px;
            background: var(--vscode-textCodeBlock-background);
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
            font-size: 13px;
            line-height: 1.4;
            overflow-x: auto;
            white-space: pre-wrap;
          }
          .file-tool-block {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin: 6px 0;
            background: var(--vscode-editor-background);
            overflow: hidden;
          }
          .file-tool-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            background: var(--vscode-editor-selectionBackground, rgba(0, 123, 255, 0.05));
          }
          .file-action {
            font-weight: 500;
            font-size: 13px;
            color: var(--vscode-editor-foreground);
          }
          .tool-usage-block {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin: 6px 0;
            background: var(--vscode-editor-background);
            padding: 10px 14px;
          }
          .tool-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
          }
          .tool-name {
            font-weight: 600;
            color: var(--vscode-editor-foreground);
          }
          .tool-description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
          }
          .tool-input {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-textCodeBlock-background);
            padding: 6px 8px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
            margin-top: 6px;
          }
          .tool-result {
            border: 1px solid var(--vscode-charts-green);
            border-radius: 6px;
            margin: 6px 0;
            background: rgba(46, 160, 67, 0.05);
            overflow: hidden;
          }
          .tool-result-header {
            padding: 8px 12px;
            background: rgba(46, 160, 67, 0.1);
            font-weight: 500;
            font-size: 13px;
            color: var(--vscode-charts-green);
            border-bottom: 1px solid var(--vscode-charts-green);
          }
          .tool-result-content {
            padding: 10px 12px;
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
            font-size: 12px;
            white-space: pre-wrap;
            color: var(--vscode-editor-foreground);
          }
          .content-text {
            margin: 4px 0;
          }
          /* Loading indicator styles */
          .loading-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 16px 20px;
            margin: 8px 0;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
          }
          .loading-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-panel-border);
            border-top: 2px solid var(--vscode-progressBar-background);
            border-radius: 50%;
            animation: loadingSpin 1s linear infinite;
          }
          .loading-text {
            font-style: italic;
            font-size: 13px;
          }
          /* Loading animations */
          @keyframes loadingSpin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }

          /* Enhanced Tool Result Editor UI */
          .tool-result-editor, .tool-result-generic {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin: 8px 0;
            background: var(--vscode-editor-background);
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .tool-result-editor .tool-result-header,
          .tool-result-generic .tool-result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
          }

          .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .header-right {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .result-icon {
            font-size: 16px;
          }

          .result-title {
            font-weight: 500;
            color: var(--vscode-foreground);
          }

          .file-name {
            padding: 2px 6px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, monospace);
          }

          .tool-id {
            padding: 2px 6px;
            background: var(--vscode-descriptionForeground);
            color: var(--vscode-editor-background);
            border-radius: 4px;
            font-size: 10px;
            font-family: var(--vscode-editor-font-family, monospace);
            opacity: 0.7;
          }

          .copy-btn, .expand-btn {
            background: none;
            border: none;
            padding: 4px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 12px;
            transition: background-color 0.2s ease;
          }

          .copy-btn:hover, .expand-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
          }

          .copy-icon, .expand-icon {
            display: block;
          }

          /* Editor Content Area */
          .tool-result-editor-content {
            max-height: 300px;
            overflow-y: auto;
            background: var(--vscode-editor-background);
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 1.4;
          }

          .tool-result-editor-content.expanded {
            max-height: 600px;
          }

          .editor-line {
            display: flex;
            min-height: 18px;
            position: relative;
          }

          .editor-line:hover {
            background: var(--vscode-editor-hoverHighlightBackground);
          }

          .line-number {
            display: inline-block;
            width: 50px;
            text-align: right;
            padding: 0 8px 0 4px;
            color: var(--vscode-editorLineNumber-foreground);
            background: var(--vscode-editorGutter-background);
            border-right: 1px solid var(--vscode-editorGutter-background);
            font-size: 11px;
            user-select: none;
            flex-shrink: 0;
          }

          .line-content {
            padding: 0 8px;
            white-space: pre-wrap;
            word-break: break-word;
            flex: 1;
            color: var(--vscode-editor-foreground);
          }

          .editor-content-raw {
            padding: 12px;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--vscode-editor-foreground);
          }

          /* Editor Footer */
          .editor-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 12px;
            background: var(--vscode-statusBar-background);
            border-top: 1px solid var(--vscode-panel-border);
            font-size: 11px;
            color: var(--vscode-statusBar-foreground);
          }

          .line-count {
            opacity: 0.8;
          }

          .language-badge {
            padding: 2px 6px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
          }

          /* Generic Tool Result */
          .tool-result-content {
            padding: 0;
            background: var(--vscode-editor-background);
          }

          .result-text {
            margin: 0;
            padding: 12px;
            background: transparent;
            border: none;
            font-family: var(--vscode-editor-font-family, 'Monaco', 'Menlo', monospace);
            font-size: var(--vscode-editor-font-size, 12px);
            color: var(--vscode-editor-foreground);
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 300px;
            overflow-y: auto;
          }

          /* Syntax highlighting hints (basic) */
          .tool-result-editor-content[data-language="javascript"] .line-content,
          .tool-result-editor-content[data-language="typescript"] .line-content {
            color: var(--vscode-symbolIcon-textForeground, var(--vscode-editor-foreground));
          }

          .tool-result-editor-content[data-language="python"] .line-content {
            color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-editor-foreground));
          }

          .tool-result-editor-content[data-language="json"] .line-content {
            color: var(--vscode-symbolIcon-stringForeground, var(--vscode-editor-foreground));
          }

          /* Scrollbar styling for editor content */
          .tool-result-editor-content::-webkit-scrollbar,
          .result-text::-webkit-scrollbar {
            width: 12px;
          }

          .tool-result-editor-content::-webkit-scrollbar-track,
          .result-text::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
          }

          .tool-result-editor-content::-webkit-scrollbar-thumb,
          .result-text::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 6px;
          }

          .tool-result-editor-content::-webkit-scrollbar-thumb:hover,
          .result-text::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
          }

          /* Animation for expand/collapse */
          .tool-result-editor-content {
            transition: max-height 0.3s ease-in-out;
          }

          /* Mobile responsiveness */
          @media (max-width: 600px) {
            .line-number {
              width: 40px;
              font-size: 10px;
            }
            
            .tool-result-editor-content,
            .result-text {
              font-size: 11px;
            }
            
            .header-right {
              gap: 4px;
            }
            
            .file-name {
              display: none; /* Hide on mobile to save space */
            }
          }
    `;
  }

  /**
   * Gets the HTML body content
   */
  private _getBodyContent(resources: ReturnType<typeof this._getResourceUris>): string {
    return `
        <div class="chat-container input-only">
          <!-- Header with Claude branding -->
          <div class="chat-header">
            <div class="chat-title">
              <img class="claude-icon" src="${resources.claudeIconPath}" width="20" height="20" alt="Claude Icon" />
              <span>Claude Terminal Input</span>
            </div>
            <div class="mode-toggle-switch">
              <span class="mode-label">Terminal</span>
              <label class="toggle-switch">
                <input type="checkbox" id="mainModeToggle">
                <span class="slider"></span>
              </label>
              <span class="mode-label">Direct</span>
            </div>
          </div>
          
          <!-- Terminal status banner (shown when terminal is closed) -->
          <div id="terminalStatusBanner" class="terminal-status-banner hidden">
            <div class="terminal-status-icon">⚠️</div>
            <div class="terminal-status-message">
              Terminal was closed. Sending a message will reopen it.
            </div>
          </div>
          
          <!-- Launch options container (shown when no Claude terminal is active) -->
          <div id="launchOptionsContainer" class="launch-options-container hidden">
            <div class="launch-header">
              <h3>Start Claude Code</h3>
              <p>Choose how to start your session</p>
            </div>
            
            <div class="launch-buttons">
              <button id="launchNew" class="launch-option-btn primary" title="Start a fresh conversation">
                <div class="launch-icon">▶️</div>
                <div class="launch-text">
                  <div class="launch-title">Start New Session</div>
                  <div class="launch-desc">Begin fresh conversation</div>
                </div>
              </button>
              
              <button id="launchContinue" class="launch-option-btn" title="Resume your previous conversation">
                <div class="launch-icon">⏭️</div>
                <div class="launch-text">
                  <div class="launch-title">Continue Last Session</div>
                  <div class="launch-desc">Resume previous conversation</div>
                </div>
              </button>
              
              <button id="launchHistory" class="launch-option-btn" title="Browse and select from conversation history">
                <div class="launch-icon">📚</div>
                <div class="launch-text">
                  <div class="launch-title">Select History</div>
                  <div class="launch-desc">Choose from past conversations</div>
                </div>
              </button>
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
              <div class="drag-hint" style="display: none;">
                Drop files here to add them to your message
              </div>
            </div>
            <div class="input-bottom-actions">
              <button id="contextButton" title="Add Context (@)" class="context-button">
                @
              </button>
              <button id="imageButton" title="Attach image" class="image-button">
                <img src="${resources.imageIconPath}" width="20" height="20" alt="Attach Image" />
              </button>
              <button id="modeToggleButton" title="Toggle Claude Mode (Shift+Tab)" class="mode-toggle-button">
                <img src="${resources.modeToggleIconPath}" width="16" height="16" alt="Toggle Mode" />
              </button>
            </div>
            <div id="contextMenuContainer" class="context-menu-container" style="display: none;"></div>
            <div id="imagePreviewContainer" class="image-preview-container"></div>
            <div id="problemPreviewContainer" class="problem-preview-container"></div>
          </div>
          
          <!-- Direct Mode Response Container -->
          <div id="directModeContainer" class="direct-mode-container hidden">
            <div class="direct-mode-header">
              <span>Claude Responses</span>
              <div class="header-actions">
                <button id="pauseProcessBtn" class="pause-button" title="Stop the currently running Claude Code process">
                  <svg class="pause-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2"/>
                    <rect x="8" y="8" width="2.5" height="8" rx="1" fill="currentColor"/>
                    <rect x="13.5" y="8" width="2.5" height="8" rx="1" fill="currentColor"/>
                  </svg>
                  Stop
                </button>
                <button id="clearResponsesBtn" class="clear-responses-btn">Clear</button>
              </div>
            </div>
            <div id="directModeMessages" class="direct-mode-messages">
              <div class="placeholder-message">Direct Mode - Ready to receive responses</div>
            </div>
          </div>
          
          <!-- Claude attribution footer -->
          <div class="utility-row">
            <div class="claude-attribution">
              <img class="claude-flower" src="${resources.claudeIconPath}" width="16" height="16" alt="Claude Icon" />
              <span>Interactive terminal for Claude Code</span>
            </div>
          </div>
        </div>
    `;
  }
}