import * as vscode from "vscode";
import { getNonce } from "../utils";
import { searchFiles, getGitCommits } from "../fileSystem";
import { ImageManager } from "../service/imageManager";
import { fileServiceClient } from "../api/FileService";
import { customCommandService } from "../service/customCommandService";

export class ClaudeTerminalInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeInputView";
  private _view?: vscode.WebviewView;
  private _isTerminalClosed: boolean = false;
  private _imageManager?: ImageManager;
  private _currentMessage?: any;

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

  public addTextToInput(text: string) {
    // Send the text to the webview input field
    if (this._view) {
      this._view.webview.postMessage({
        command: "addTextToInput",
        text: text
      });
      
      // Focus the input view
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    }
  }
  
  /**
   * Sends a command to the Claude terminal asynchronously
   * @param text The text to send to the terminal
   * @returns A promise that resolves when the command has been executed
   * @public Wrapper for the private _sendToTerminal method
   */
  public async sendToTerminal(text: string): Promise<void> {
    return this._sendToTerminal(text);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
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
      async (message) => {
        switch (message.command) {
          case "sendToTerminal": {
            // Store message context for _handleMessageWithContext to access
            this._currentMessage = message;
            
             if (message.text.trim().startsWith('/')) {
                await this._handleSlashCommand(message.text.trim());
              } else {
                await this._handleMessageWithContext(message.text);
              }
            
            // Clear message context
            this._currentMessage = undefined;
            return;
          }
            
          case "searchFiles":
            this._handleFileSearch(message.query, message.mentionsRequestId);
            return;
            
          case "searchCommits":
            this._handleCommitSearch(message.query, message.mentionsRequestId);
            return;
            
          case "getProblems":
            this._handleGetProblems(message.mentionsRequestId);
            return;
            
          case "showError":
            vscode.window.showErrorMessage(message.message);
            return;
            
          case "selectImageFiles":
            this._handleImageFileSelection();
            return;
            
          case "resolveDroppedPaths":
            this._handleDroppedPaths(message);
            return;
            
          case "resolveDroppedImages":
            this._handleDroppedImages(message);
            return;
        }
      },
      undefined,
      []
    );
  }
  
  /**
   * Sends text to the terminal asynchronously
   * @param text The text to send to the terminal
   * @returns A promise that resolves when the command has been executed
   */
  private async _sendToTerminal(text: string): Promise<void> {
    // Check if terminal is closed
    if (this._isTerminalClosed) {
      // Use command to recreate terminal and send message
      await vscode.commands.executeCommand('claude-code-extension.sendToClosedTerminal', text);
      return;
    }
    
    // Show the terminal in the background (preserves focus)
    this._terminal.show(true);
    
    // Send text to terminal
    this._terminal.sendText(text, false);
    
    // Return a promise that resolves after the command has been executed
    return new Promise<void>((resolve) => {
      // Add a delay to ensure the text is properly buffered
      setTimeout(() => {
        // Then explicitly send Enter key to execute the command
        this._terminal.sendText('', true);
        
        // Return focus to the input view after a small delay
        setTimeout(() => {
          this._returnFocusToInput();
          // Resolve the promise after the command has been executed
          resolve();
        }, 700);
      }, 1000);
    });
  }
  
  private _returnFocusToInput() {
    // First, check if we still have the view
    if (!this._view) return;
    
    // Tell the webview to focus its input
    this._view.webview.postMessage({
      command: 'focusInput'
    });
    
    // Focus the webview itself multiple times to ensure it takes effect
    vscode.commands.executeCommand('claudeCodeInputView.focus');
    
    setTimeout(() => {
      // Tell the webview to focus its input again
      this._view?.webview.postMessage({
        command: 'focusInput'
      });
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    }, 100);
    
    setTimeout(() => {
      // One more time to be sure
      this._view?.webview.postMessage({
        command: 'focusInput'
      });
      vscode.commands.executeCommand('claudeCodeInputView.focus');
    }, 200);
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
  
  private async _handleGetProblems(mentionsRequestId: string) {
    try {
      // Get current problems from VSCode diagnostics
      const problems = this._getCurrentProblems();
      
      // Send problems back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "problemsResults",
          problems,
          mentionsRequestId
        });
      }
    } catch (error) {
      console.error("Error getting problems:", error);
      
      // Send empty results back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "problemsResults",
          problems: [],
          mentionsRequestId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }
  
  private async _handleShowProblemsMenu(mentionsRequestId: string) {
    try {
      // Get current problems from VSCode diagnostics
      const problems = this._getCurrentProblems();
      
      // Transform problems into menu items with navigation support
      const menuItems = problems.map((problem, index) => ({
        id: index.toString(),
        label: `${problem.severity}: ${problem.file}:${problem.line}:${problem.column}`,
        description: problem.message,
        detail: problem.source ? `Source: ${problem.source}` : undefined,
        problem: problem
      }));
      
      // Send problems menu to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "problemsMenu",
          menuItems,
          mentionsRequestId
        });
      }
    } catch (error) {
      console.error("Error getting problems menu:", error);
      
      // Send empty menu back to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: "problemsMenu",
          menuItems: [],
          mentionsRequestId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }
  
  private async _handleSlashCommand(command: string): Promise<void> {
    // For all slash commands (including custom commands), 
    // send directly as-is to the terminal.
    // The Claude Code CLI will handle parsing and executing them
    await this._sendToTerminal(command);
  }
  

  /**
   * Unified method to handle messages with context (images and/or problems)
   * Gets images and problems from this._currentMessage
   */
  private async _handleMessageWithContext(text: string): Promise<void> {
    if (!this._currentMessage) {
      // Fallback to simple send if no current message context
      await this._sendToTerminal(text);
      return;
    }
    
    // Start with the base text
    let enhancedMessage = text;
    
    // Get selected problems if present
    let selectedProblems: Array<{
      file: string;
      line: number;
      column: number;
      severity: string;
      message: string;
      source?: string;
    }> = [];
    
    if (this._currentMessage.selectedProblemIds && this._currentMessage.selectedProblemIds.length > 0) {
      // Get current problems from VSCode diagnostics
      const allProblems = this._getCurrentProblems();
      
      // Filter problems based on selected IDs
      selectedProblems = allProblems.filter((_, index) => 
        this._currentMessage.selectedProblemIds.includes(index.toString())
      );
    }
    
    // If we have problems, add problems context
    if (selectedProblems.length > 0) {
      enhancedMessage = this._formatMessageWithProblems(enhancedMessage, selectedProblems);
    }
    
    // Get images from current message
    const images = this._currentMessage.images || [];
    
    // If we have images, handle them with the enhanced message
    if (images.length > 0) {
      await this._handleMessageWithImages(enhancedMessage, images);
    } else {
      // No images, just send the enhanced message to terminal
      await this._sendToTerminal(enhancedMessage);
    }
  }

  /**
   * Formats a message with problems context
   */
  private _formatMessageWithProblems(text: string, selectedProblems: Array<{
    file: string;
    line: number;
    column: number;
    severity: string;
    message: string;
    source?: string;
  }>): string {
    let enhancedMessage = text;
    
    if (selectedProblems.length > 0) {
      let problemsContext = `\n<problems>\n`;
      
      selectedProblems.forEach((problem, index) => {
        const location = `${problem.file}#L${problem.line} Column:${problem.column}`;
        const source = problem.source ? ` (${problem.source})` : '';
        problemsContext += `${index + 1}. @${location}${source}\n   ${problem.severity}: ${problem.message}\n\n`;
      });
      problemsContext += "</problems>\n\n";

      enhancedMessage = text + problemsContext;
    }
    
    return enhancedMessage;
  }

  /**
   * Gets current problems from VSCode's diagnostics
   */
  private _getCurrentProblems(): Array<{
    file: string;
    line: number;
    column: number;
    severity: string;
    message: string;
    source?: string;
  }> {
    const problems: Array<{
      file: string;
      line: number;
      column: number;
      severity: string;
      message: string;
      source?: string;
    }> = [];
    
    // Get diagnostics from all documents
    vscode.languages.getDiagnostics().forEach(([uri, diagnostics]) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      const relativePath = workspaceFolder 
        ? vscode.workspace.asRelativePath(uri, false)
        : uri.fsPath;

      diagnostics.forEach(diagnostic => {
        problems.push({
          file: relativePath,
          line: diagnostic.range.start.line + 1, // VSCode uses 0-based indexing
          column: diagnostic.range.start.character + 1,
          severity: this._severityToString(diagnostic.severity),
          message: diagnostic.message,
          source: diagnostic.source
        });
      });
    });

    // Sort by severity (errors first), then by file
    return problems.sort((a, b) => {
      const severityOrder = { 'Error': 0, 'Warning': 1, 'Information': 2, 'Hint': 3 };
      const aSeverity = severityOrder[a.severity as keyof typeof severityOrder] ?? 4;
      const bSeverity = severityOrder[b.severity as keyof typeof severityOrder] ?? 4;
      
      if (aSeverity !== bSeverity) {
        return aSeverity - bSeverity;
      }
      return a.file.localeCompare(b.file);
    });
  }

  /**
   * Converts VSCode diagnostic severity to string
   */
  private _severityToString(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'Error';
      case vscode.DiagnosticSeverity.Warning:
        return 'Warning';
      case vscode.DiagnosticSeverity.Information:
        return 'Information';
      case vscode.DiagnosticSeverity.Hint:
        return 'Hint';
      default:
        return 'Information';
    }
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
  
  private async _handleDroppedPaths(message: any) {
    try {
      const uris: string[] = [];
      
      console.log('Handling dropped paths:', message.uris);
      
      if (message.uris && message.uris.length > 0) {
        uris.push(...message.uris);
      }
      
      // Use FileService to get relative paths like cline does
      const response = await fileServiceClient.getRelativePaths({ uris });
      
      // Send resolved paths back to webview
      if (this._view) {
        this._view.webview.postMessage({
          command: 'droppedPathsResolved',
          paths: response.paths
        });
      }
    } catch (error) {
      console.error('Error resolving dropped paths:', error);
      // Send empty array as fallback
      if (this._view) {
        this._view.webview.postMessage({
          command: 'droppedPathsResolved',
          paths: []
        });
      }
    }
  }
  
  private async _handleDroppedImages(message: any) {
    try {
      const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
      const tempImagePaths: string[] = [];
      
      if (message.uris && message.uris.length > 0) {
        for (const uriString of message.uris) {
          try {
            // Parse the URI and get the file system path
            const uri = vscode.Uri.parse(uriString);
            const fsPath = uri.fsPath;
            
            // Verify this is an image file
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
            const hasImageExtension = imageExtensions.some(ext => fsPath.toLowerCase().endsWith(ext));
            
            if (hasImageExtension) {
              // Read the image file
              const imageBuffer = await fs.promises.readFile(fsPath);
              const base64Data = imageBuffer.toString('base64');
              const dataUri = `data:image/*;base64,${base64Data}`;
              
              // Extract file name
              const fileName = fsPath.split('/').pop() || fsPath.split('\\').pop() || 'image';
              
              // Save to temporary file
              const tempPath = await this._imageManager!.saveImage(dataUri, fileName, 'image/*');
              tempImagePaths.push(tempPath);
            }
          } catch (error) {
            console.error('Error processing image URI:', error);
          }
        }
      }
      
      // Send resolved temporary image paths back to webview
      if (this._view && tempImagePaths.length > 0) {
        this._view.webview.postMessage({
          command: 'droppedImagesResolved',
          imagePaths: tempImagePaths
        });
      }
    } catch (error) {
      console.error('Error resolving dropped images:', error);
    }
  }
  
  private async _resolveAbsolutePath(browserPath: string): Promise<string | null> {
    try {
      const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
      
      console.log('Resolving absolute path for:', browserPath);
      
      // Browser paths often start with "file://" or just "/"
      let cleanPath = browserPath;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }
      // On Windows, paths might have an extra slash that needs to be removed
      if (process.platform === 'win32' && cleanPath.startsWith('/')) {
        cleanPath = cleanPath.substring(1);
      }
      // Decode URI components (handle spaces and special characters)
      cleanPath = decodeURIComponent(cleanPath);
      
      console.log('Clean path:', cleanPath);
      
      // Check if the file/directory exists
      try {
        await fs.promises.access(cleanPath);
        console.log('Path exists:', cleanPath);
        return cleanPath;
      } catch {
        // Try without modifications
        try {
          await fs.promises.access(browserPath);
          console.log('Original path exists:', browserPath);
          return browserPath;
        } catch {
          console.log('Path not found:', browserPath);
          return null;
        }
      }
    } catch (error) {
      console.error('Error resolving absolute path:', error);
      return null;
    }
  }
  
  private async _resolveFileName(fileName: string, workspaceRoot: string | undefined): Promise<string> {
    try {
      const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
      const path = require('path');  // eslint-disable-line @typescript-eslint/no-var-requires
      
      if (!workspaceRoot) {
        // No workspace, just return the filename
        return fileName;
      }
      
      // First, try to find the file in the workspace
      const files = await vscode.workspace.findFiles(`**/${fileName}`, null, 1);
      
      if (files.length > 0) {
        // Found in workspace, return relative path
        const relativePath = path.relative(workspaceRoot, files[0].fsPath);
        return relativePath;
      }
      
      // Try to check if it's in the workspace root
      const possiblePath = path.join(workspaceRoot, fileName);
      try {
        await fs.promises.access(possiblePath);
        // File exists in workspace root, return just the filename
        return fileName;
      } catch {
        // File not found in workspace, return the original filename
        return fileName;
      }
    } catch (error) {
      console.error('Error resolving file name:', error);
      return fileName;
    }
  }
  
  private async _handleMessageWithImages(text: string, images: any[]): Promise<void> {
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
            const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
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
            const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
            try {
              await fs.promises.access(image.path, fs.constants.R_OK);
              imagePaths.push(image.path);
            } catch (error) {
              console.error(`Cannot access file: ${image.path}`, error);
              failedImages.push(image.name);
            }
          } else if (image.isExternalDrop && image.data) {
            // Handle external drops (from Finder/File Manager) that have data but no path
            const tempPath = await this._imageManager!.saveImage(image.data, image.name, image.type);
            
            // Verify the file was actually created
            const fs = require('fs');  // eslint-disable-line @typescript-eslint/no-var-requires
            if (fs.existsSync(tempPath)) {
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
        await this._sendToTerminal(enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling images:', error);
      vscode.window.showErrorMessage(`Failed to process images: ${error}`);
      // Fallback to sending just text if available
      if (text) {
        await this._sendToTerminal(text);
      }
    }
  }
  
  /**
   * Loads custom commands and syncs them to the webview
   */
  private async _loadCustomCommands() {
    try {
      // Scan for custom commands
      await customCommandService.scanCustomCommands();
      
      // Send the custom commands to the webview
      if (this._view) {
        const customCommands = customCommandService.getCustomCommands();
        
        console.log('Sending custom commands to webview:', customCommands);
        
        // Ensure we're not sending duplicates
        const commandMap = new Map();
        customCommands.forEach(cmd => {
          // Use command name as key to prevent duplicates
          commandMap.set(cmd.command, cmd);
        });
        
        // Convert back to array
        const uniqueCommands = Array.from(commandMap.values());
        
        this._view.webview.postMessage({
          command: 'customCommandsUpdated',
          customCommands: uniqueCommands
        });
      }
    } catch (error) {
      console.error('Error loading custom commands:', error);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Generate nonce for script security
    const nonce = getNonce();
    
    // Load custom commands in the background
    this._loadCustomCommands();
    
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
    const imageIconPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "image-svgrepo-com.svg")
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
                <img src="${imageIconPath}" width="20" height="20" alt="Attach Image" />
              </button>
            </div>
            <div id="contextMenuContainer" class="context-menu-container" style="display: none;"></div>
            <div id="imagePreviewContainer" class="image-preview-container"></div>
            <div id="problemPreviewContainer" class="problem-preview-container"></div>
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