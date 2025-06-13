import * as vscode from "vscode";
import { getNonce } from "../utils";
import { searchFiles, getGitCommits } from "../fileSystem";
import { ImageManager } from "../service/imageManager";
import { fileServiceClient } from "../api/FileService";
import { customCommandService } from "../service/customCommandService";
import { DirectModeService, MessageContext } from "../service/directModeService";
import { DirectModeResponse } from "../types/claude-message-types";
import { formatMessageWithProblems, processImagesForMessage, type ImageContext } from "../utils/messageUtils";

export class ClaudeTerminalInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeInputView";
  private _view?: vscode.WebviewView;
  private _isTerminalClosed: boolean = false;
  private _imageManager?: ImageManager;
  private _currentMessage?: any;
  private _isConnectedToExistingTerminal: boolean = false;
  private _shouldShowLaunchOptions: boolean = false;
  private _isDirectMode: boolean = false;
  private _directModeService?: DirectModeService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private _terminal: vscode.Terminal | undefined,
    private _context: vscode.ExtensionContext
  ) {
    this._imageManager = new ImageManager(_context);
    // If no terminal is provided, we should show launch options by default
    this._shouldShowLaunchOptions = !this._terminal;
    // If there's no terminal, consider it as "closed" for UI purposes
    this._isTerminalClosed = !this._terminal;
    
    // Restore saved Direct Mode state
    this._isDirectMode = this._context.globalState.get('claudeCode.isDirectMode', false);
    
    // Initialize Direct Mode service
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._directModeService = new DirectModeService(workspaceRoot);
    this._directModeService.setResponseCallback(this._handleDirectModeResponse.bind(this));
  }

  public updateTerminal(terminal: vscode.Terminal, isExistingTerminal: boolean = false) {
    this._terminal = terminal;
    this._isTerminalClosed = false;
    this._isConnectedToExistingTerminal = isExistingTerminal;
    // Hide launch options when terminal is assigned
    this._shouldShowLaunchOptions = false;
    
    // Update UI state if view exists
    if (this._view) {
      this._view.webview.postMessage({
        command: "terminalStatus",
        isTerminalClosed: false,
        isConnectedToExistingTerminal: isExistingTerminal,
        terminalName: terminal.name
      });
      
      // Hide launch options when terminal is available
      this._view.webview.postMessage({
        command: "hideLaunchOptions"
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
      
      // Show launch options when terminal is closed
      this._view.webview.postMessage({
        command: "showLaunchOptions"
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

  public postMessage(message: any) {
    // Public method to post messages to webview
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }
  
  public showLaunchOptions() {
    // Show launch options UI
    this._shouldShowLaunchOptions = true;
    if (this._view) {
      this._view.webview.postMessage({
        command: "showLaunchOptions"
      });
    }
  }
  
  public hideLaunchOptions() {
    // Hide launch options UI
    this._shouldShowLaunchOptions = false;
    if (this._view) {
      console.log('Explicitly hiding launch options');
      this._view.webview.postMessage({
        command: "hideLaunchOptions"
      });
    }
  }

  public async focusInput() {
    // Focus the Claude Code input view first
    await vscode.commands.executeCommand('claudeCodeInputView.focus');
    
    // Then send a focus message to the webview to focus the input field
    if (this._view) {
      this._view.webview.postMessage({
        command: "focusInput"
      });
    }
  }
  
  /**
   * Sends a command to the Claude terminal asynchronously
   * @param text The text to send to the terminal
   * @returns A promise that resolves when the command has been executed
   * @public Wrapper for sendTextSmart method
   */
  public async sendToTerminal(text: string): Promise<void> {
    // Log all commands for debugging the double execution issue
    console.log(`sendToTerminal called with: "${text}"`);
    
    return this.sendTextSmart(text);
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
      isTerminalClosed: this._isTerminalClosed || !this._terminal,
      isConnectedToExistingTerminal: this._isConnectedToExistingTerminal,
      terminalName: this._terminal?.name || 'No Terminal'
    });
    
    // Send initial Direct Mode state
    webviewView.webview.postMessage({
      command: "setDirectMode",
      isDirectMode: this._isDirectMode
    });
    
    // Show launch options only if no terminal exists AND should show (prevents race condition)
    if (this._shouldShowLaunchOptions && !this._terminal) {
      console.log('Showing launch options during webview initialization');
      webviewView.webview.postMessage({
        command: "showLaunchOptions"
      });
    } else if (this._terminal) {
      // Explicitly hide launch options if terminal exists
      console.log('Terminal exists during webview initialization - hiding launch options');
      webviewView.webview.postMessage({
        command: "hideLaunchOptions"
      });
    }
    
    // Handle message from webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "sendToTerminal":
          case "sendMessage": {
            // Store message context for _handleMessageWithContext to access
            this._currentMessage = message;
            
            // In Direct Mode, don't support slash commands - treat them as regular messages
            if (message.text.trim().startsWith('/') && !this._isDirectMode) {
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
            
          case "rescanCustomCommands":
            this._handleRescanCustomCommands();
            return;
            
          case "launchClaudeNew":
            this._handleLaunchClaude('claude');
            return;
            
          case "launchClaudeContinue":
            this._handleLaunchClaude('claude -c');
            return;
            
          case "launchClaudeHistory":
            this._handleLaunchClaudeHistory();
            return;
            
          case "toggleMode":
            this._handleModeToggle();
            return;
            
          case "toggleMainMode":
            this._isDirectMode = message.isDirectMode;
            // Save the mode state for next launch
            this._context.globalState.update('claudeCode.isDirectMode', this._isDirectMode);
            console.log(`Main mode toggled to: ${this._isDirectMode ? 'Direct' : 'Terminal'} (saved)`);
            return;
            
          case "stopDirectMode":
            this._handleStopDirectMode();
            return;
            
          case "clearDirectMode":
            this._handleClearDirectMode();
            return;
            
          case "pauseProcess":
            this._handlePauseProcess();
            return;
        }
      },
      undefined,
      []
    );
  }
  
  /**
   * Sends text to the terminal as a paste operation (triggers Claude Code's paste detection)
   * @param text The text to send to the terminal as a paste
   * @returns A promise that resolves when the command has been executed
   * @deprecated Use sendTextSmart instead
   */
  public async sendTextAsPaste(text: string): Promise<void> {
    return this.sendTextSmart(text);
  }

  /**
   * Sends text to the terminal with automatic paste detection
   * Uses paste mode for multi-line content or content over 100 characters
   * @param text The text to send to the terminal
   * @returns A promise that resolves when the command has been executed
   */
  public async sendTextSmart(text: string): Promise<void> {
    const shouldUsePaste = this._shouldUsePasteMode(text);
    return this._sendToTerminalInternal(text, shouldUsePaste);
  }

  /**
   * Determines if text should be sent as a paste operation
   * @param text The text to analyze
   * @returns True if paste mode should be used
   */
  private _shouldUsePasteMode(text: string): boolean {
    // Use paste mode for:
    // - Multi-line content (contains newlines)
    // - Long content (over 100 characters)
    // - Content that looks like code blocks (contains ```)
    return text.includes('\n') || text.length > 100 || text.includes('```');
  }

  /**
   * Internal method to send text to terminal with smart paste detection
   * @param text The text to send to the terminal
   * @param shouldUsePaste Whether to use paste mode based on content analysis
   * @returns A promise that resolves when the command has been executed
   */
  private async _sendToTerminalInternal(text: string, shouldUsePaste: boolean): Promise<void> {
    // Check if terminal is closed or doesn't exist
    if (this._isTerminalClosed || !this._terminal) {
      // Use command to recreate terminal and send message
      await vscode.commands.executeCommand('claude-code-extension.sendToClosedTerminal', text);
      return;
    }
    
    // Show the terminal in the background (preserves focus)
    this._terminal?.show(true);
    
    if (shouldUsePaste) {
      // Send bracketed paste start sequence
      this._terminal?.sendText('\x1b[200~', false);
      
      // Send the actual text
      this._terminal?.sendText(text + " ", false);

      // Send bracketed paste end sequence
      this._terminal?.sendText('\x1b[201~', false);
      
      // Keep bracketed paste mode enabled (Claude Code keeps it on)
    } else {
      // Send text to terminal normally
      this._terminal?.sendText(text + " ", false);
    }
    
    // Use the same delay logic for both paste and normal mode
    return new Promise<void>((resolve) => {
      // Add a delay to ensure the text is properly buffered
      setTimeout(() => {
        // Then explicitly send Enter key to execute the command
        this._terminal?.sendText('', true);
        
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
    await this.sendTextSmart(command);
  }
  

  /**
   * Unified method to handle messages with context (images, files, and problems)
   * Formats message with problems and images before sending to mode handlers
   * Works for both Terminal and Direct modes
   */
  private async _handleMessageWithContext(text: string): Promise<void> {
    try {
      // Prepare comprehensive message context
      const messageContext = await this._prepareMessageContext(text);
      
      // Start with the base text
      let enhancedMessage = messageContext.text;
      
      // Format message with problems first (if present)
      if (messageContext.selectedProblems.length > 0) {
        enhancedMessage = formatMessageWithProblems(enhancedMessage, messageContext.selectedProblems);
      }
      
      // Format message with images (if present)
      if (messageContext.images.length > 0) {
        // Convert to shared ImageContext format
        const imageContexts: ImageContext[] = messageContext.images.map(img => ({
          name: img.name,
          path: img.path,
          type: img.type,
          data: img.data,
          isFromClipboard: img.isFromClipboard,
          isExternalDrop: img.isExternalDrop
        }));
        
        // Use shared processing utility to format with images
        const imageResult = await processImagesForMessage(enhancedMessage, imageContexts, this._imageManager!);
        
        // Handle any failed images
        if (imageResult.failedImages.length > 0) {
          const failedList = imageResult.failedImages.join(', ');
          vscode.window.showWarningMessage(
            `Failed to process ${imageResult.failedImages.length} image(s): ${failedList}. Continuing with successfully processed images.`
          );
        }
        
        // Use the enhanced message with images
        enhancedMessage = imageResult.enhancedMessage;
        
        // Log successful image processing
        if (imageResult.imagePaths.length > 0) {
          console.log(`Successfully processed ${imageResult.imagePaths.length} image(s):`, imageResult.imagePaths);
        }
      }
      
      // Ensure we have content to send
      if (!enhancedMessage.trim()) {
        vscode.window.showErrorMessage('No content to send after processing.');
        return;
      }
      
      // Route the formatted message to appropriate handler based on mode
      if (this._isDirectMode) {
        await this._sendToDirectModeUnified(enhancedMessage, messageContext);
      } else {
        await this._sendToTerminalUnified(enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling message with context:', error);
      const errorMessage = `Failed to process message: ${error}`;
      
      if (this._isDirectMode) {
        this._handleDirectModeResponse({
          type: 'error',
          error: errorMessage
        });
      } else {
        vscode.window.showErrorMessage(errorMessage);
      }
    }
  }

  /**
   * Prepares comprehensive message context from current message data
   */
  private async _prepareMessageContext(text: string): Promise<{
    text: string;
    images: any[];
    filePaths: string[];
    selectedProblems: Array<{
      file: string;
      line: number;
      column: number;
      severity: string;
      message: string;
      source?: string;
    }>;
    selectedProblemIds: string[];
  }> {
    const context = {
      text,
      images: [] as any[],
      filePaths: [] as string[],
      selectedProblems: [] as Array<{
        file: string;
        line: number;
        column: number;
        severity: string;
        message: string;
        source?: string;
      }>,
      selectedProblemIds: [] as string[]
    };

    if (!this._currentMessage) {
      return context;
    }

    // Get images from current message
    context.images = this._currentMessage.images || [];

    // Get file paths from current message
    context.filePaths = this._currentMessage.filePaths || [];

    // Get selected problem IDs
    context.selectedProblemIds = this._currentMessage.selectedProblemIds || [];

    // Resolve problem details if we have selected problem IDs
    if (context.selectedProblemIds.length > 0) {
      const allProblems = this._getCurrentProblems();
      context.selectedProblems = allProblems.filter((_, index) => 
        context.selectedProblemIds.includes(index.toString())
      );
    }

    return context;
  }

  /**
   * Unified Direct Mode message sending
   * Receives pre-formatted message text and original context for metadata
   */
  private async _sendToDirectModeUnified(formattedMessage: string, messageContext: any): Promise<void> {
    if (!this._directModeService) {
      throw new Error('Direct Mode service not initialized');
    }
    // Track user input metadata for conversation history
    const userInputMetadata: {
      files_referenced?: string[];
      command_type?: string;
    } = {
      files_referenced: messageContext.filePaths.length > 0 ? messageContext.filePaths : undefined
    };

    // Determine message subtype based on original content
    let messageSubtype: 'prompt' | 'command' | 'file_reference' = 'prompt';
    if (messageContext.text.startsWith('/') || messageContext.text.startsWith('!')) {
      messageSubtype = 'command';
      userInputMetadata.command_type = 'slash_command';
    } else if (messageContext.text.includes('@') || messageContext.filePaths.length > 0) {
      messageSubtype = 'file_reference';
      userInputMetadata.command_type = 'file_analysis';
    }

    // Track user input with original text first
    this._directModeService.trackUserInput(formattedMessage, messageSubtype, userInputMetadata);

    // Send the pre-formatted message to Direct Mode service
    await this._directModeService.sendMessage(formattedMessage);
  }

  /**
   * Unified Terminal Mode message sending
   * Receives pre-formatted message text (already contains problems and images)
   */
  private async _sendToTerminalUnified(formattedMessage: string): Promise<void> {
    // Send the pre-formatted message using smart sending (paste mode for multi-line/long content)
    await this.sendTextSmart(formattedMessage);
  }

  /**
   * Unified image handling using shared utilities
   * Replaces the old _handleMessageWithImages method
   */
  private async _handleMessageWithImagesUnified(text: string, images: any[]): Promise<void> {
    try {
      // Convert to shared ImageContext format
      const imageContexts: ImageContext[] = images.map(img => ({
        name: img.name,
        path: img.path,
        type: img.type,
        data: img.data,
        isFromClipboard: img.isFromClipboard,
        isExternalDrop: img.isExternalDrop
      }));
      
      // Use shared processing utility
      const result = await processImagesForMessage(text, imageContexts, this._imageManager!);
      
      // Notify user about failed images
      if (result.failedImages.length > 0) {
        const failedList = result.failedImages.join(', ');
        const vscode = await import('vscode');
        vscode.window.showWarningMessage(
          `Failed to process ${result.failedImages.length} image(s): ${failedList}. Continuing with successfully processed images.`
        );
      }
      
      // Only proceed if we have successfully processed images or text
      if (result.imagePaths.length === 0 && !text) {
        const vscode = await import('vscode');
        vscode.window.showErrorMessage('No images were successfully processed and no text was provided.');
        return;
      }
      
      // Send to terminal only if we have content
      if (result.enhancedMessage) {
        await this.sendTextSmart(result.enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling images:', error);
      const vscode = await import('vscode');
      vscode.window.showErrorMessage(`Failed to process images: ${error}`);
      // Fallback to sending just text if available
      if (text) {
        await this.sendTextSmart(text);
      }
    }
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
  
  /**
   * @deprecated Use _handleMessageWithImagesUnified instead
   * Kept for backward compatibility, delegates to unified method
   */
  private async _handleMessageWithImages(text: string, images: any[]): Promise<void> {
    return this._handleMessageWithImagesUnified(text, images);
  }

  private async _handleMessageWithImagesOld(text: string, images: any[]): Promise<void> {
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
        await this.sendTextSmart(enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling images:', error);
      vscode.window.showErrorMessage(`Failed to process images: ${error}`);
      // Fallback to sending just text if available
      if (text) {
        await this.sendTextSmart(text);
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

  /**
   * Handles rescan request for custom commands from webview
   */
  private async _handleRescanCustomCommands() {
    // Delegate to _loadCustomCommands which already rescans and updates webview
    await this._loadCustomCommands();
  }

  /**
   * Uses the extension's unified terminal management for launch options
   */
  private async _ensureTerminalForLaunchOptions(): Promise<vscode.Terminal> {
    // Import the ensureClaudeTerminal function from extension
    const { ensureClaudeTerminal } = await import('../extension');
    
    // Use the unified terminal management
    const terminalResult = await ensureClaudeTerminal(this._context);
    const terminal = terminalResult.terminal;
    
    // Update our reference
    this.updateTerminal(terminal, terminalResult.isExisting);
    
    // Update the extension's global terminal reference
    vscode.commands.executeCommand('claude-code-extension.updateTerminalReference', terminal);
    
    return terminal;
  }

  /**
   * Handles launching Claude with a specific command
   */
  private async _handleLaunchClaude(command: string) {
    try {
      console.log(`Launching Claude with command: ${command}`);
      
      // Hide launch options UI
      if (this._view) {
        this._view.webview.postMessage({
          command: 'hideLaunchOptions'
        });
      }
      
      // Get terminal using unified terminal management
      const terminal = await this._ensureTerminalForLaunchOptions();
      
      // Show terminal
      terminal.show(false);
      
      // Send the command
      await this.sendToTerminal(command);
      
      // Update terminal status
      this._isTerminalClosed = false;
      this._shouldShowLaunchOptions = false;
      if (this._view) {
        this._view.webview.postMessage({
          command: "terminalStatus",
          isTerminalClosed: false,
          isConnectedToExistingTerminal: this._isConnectedToExistingTerminal,
          terminalName: terminal.name
        });
      }
      
    } catch (error) {
      console.error('Error launching Claude:', error);
      vscode.window.showErrorMessage(`Failed to launch Claude: ${error}`);
    }
  }

  /**
   * Handles launching Claude with conversation history selection
   */
  private async _handleLaunchClaudeHistory() {
    try {
      console.log('Launching Claude with -r option for conversation history');
      
      // Directly call claude -r - Claude Code CLI will handle the conversation selection
      await this._handleLaunchClaude('claude -r');
      
    } catch (error) {
      console.error('Error launching Claude history:', error);
      vscode.window.showErrorMessage(`Failed to launch Claude with conversation history: ${error}`);
    }
  }

  /**
   * Public method to toggle Claude Code mode (exposed for command palette access)
   */
  public async toggleMode(): Promise<void> {
    await this._handleModeToggle();
  }


  /**
   * Handles responses from the Direct Mode service
   */
  private _handleDirectModeResponse(response: DirectModeResponse): void {
    try {
      if (!this._view) {
        console.warn('No webview available for Direct Mode response');
        return;
      }

      // Handle special system messages for process state
      if (response.type === 'system' && response.subtype === 'process_state') {
        // Update UI based on process running state
        this._view.webview.postMessage({
          command: 'updateProcessState',
          isProcessRunning: response.metadata?.processRunning || false
        });
        return;
      }

      // Send response to webview for display
      this._view.webview.postMessage({
        command: 'directModeResponse',
        response: {
          type: response.type,
          subtype: response.subtype,
          content: response.content,
          error: response.error,
          timestamp: new Date().toISOString(),
          metadata: response.metadata,
          isUpdate: response.isUpdate,
          toolExecutionContext: response.toolExecutionContext,
          // Add display name for better UI presentation
          displayName: this._getDisplayNameForMessageType(response.type, response.subtype)
        }
      });

      // Log response for debugging
      if (response.type === 'error') {
        console.error('Direct Mode response error:', response.error);
      } else if (response.content) {
        console.log('Direct Mode response:', response.type, response.subtype);
      }
      
    } catch (error) {
      console.error('Error handling Direct Mode response:', error);
    }
  }

  /**
   * Gets user-friendly display name for message types
   */
  private _getDisplayNameForMessageType(type: string, _subtype?: string): string {
    switch (type) {
      case 'user_input':
        return 'You';
      case 'system':
        return 'Session';
      case 'assistant':
        return 'Claude';
      case 'user':
        return 'Tool Result';
      case 'result':
        return 'Result';
      case 'error':
        return 'Error';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  /**
   * Handles clearing the Direct Mode conversation and resetting session
   */
  private _handleClearDirectMode(): void {
    try {
      if (this._directModeService) {
        this._directModeService.clearConversation();
        console.log('Direct Mode conversation cleared and session reset');
        
        // Show confirmation message to user
        vscode.window.showInformationMessage('Conversation cleared and session reset');
      }
    } catch (error) {
      console.error('Error clearing Direct Mode conversation:', error);
      vscode.window.showErrorMessage(`Failed to clear conversation: ${error}`);
    }
  }

  /**
   * Handles stopping the Direct Mode service
   */
  private _handleStopDirectMode(): void {
    try {
      if (this._directModeService) {
        this._directModeService.stop();
        console.log('Direct Mode service stopped');
      }
    } catch (error) {
      console.error('Error stopping Direct Mode service:', error);
    }
  }

  /**
   * Handles pausing the currently running Claude Code process
   */
  private _handlePauseProcess(): void {
    try {
      if (this._directModeService) {
        const wasTerminated = this._directModeService.terminateCurrentProcess();
        if (wasTerminated) {
          console.log('Claude Code process terminated by user');
          vscode.window.showInformationMessage('Claude Code process terminated');
        } else {
          console.log('No Claude Code process is currently running');
          vscode.window.showWarningMessage('No Claude Code process is currently running');
        }
      }
    } catch (error) {
      console.error('Error pausing Claude Code process:', error);
      vscode.window.showErrorMessage(`Failed to pause process: ${error}`);
    }
  }

  /**
   * Handles mode toggle by sending Shift+Tab to Claude Code terminal
   */
  private async _handleModeToggle() {
    try {
      console.log('Toggling Claude Code mode (Shift+Tab)');
      
      // Check if terminal is available
      if (this._isTerminalClosed || !this._terminal) {
        vscode.window.showWarningMessage('Claude Code terminal is not active. Please start Claude Code first.');
        return;
      }
      
      // Show the terminal in the background (preserves focus)
      this._terminal?.show(true);
      
      // Send Shift+Tab key sequence to toggle mode
      // \x1b[Z is the escape sequence for Shift+Tab
      this._terminal?.sendText('\x1b[Z', false);
      
      console.log('Mode toggle command sent to Claude Code terminal');
      
    } catch (error) {
      console.error('Error toggling Claude mode:', error);
      vscode.window.showErrorMessage(`Failed to toggle Claude mode: ${error}`);
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
      vscode.Uri.joinPath(this._extensionUri, "media", "js", "main.js")
    );
    const claudeIconPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "claude-icon.svg")
    );
    const imageIconPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "image-svgrepo-com.svg")
    );
    const modeToggleIconPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "mode-toggle.svg")
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
            display: none;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            margin: 8px 0;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
          }
          .loading-dots {
            display: flex;
            gap: 4px;
          }
          .loading-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-progressBar-background);
            animation: loadingPulse 1.4s infinite ease-in-out;
          }
          .loading-dot:nth-child(1) {
            animation-delay: -0.32s;
          }
          .loading-dot:nth-child(2) {
            animation-delay: -0.16s;
          }
          .loading-dot:nth-child(3) {
            animation-delay: 0s;
          }
          .loading-text {
            font-style: italic;
          }
          /* Loading animation */
          @keyframes loadingPulse {
            0%, 80%, 100% {
              opacity: 0.3;
              transform: scale(0.8);
            }
            40% {
              opacity: 1;
              transform: scale(1);
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
            </div>
            <div class="input-bottom-actions">
              <button id="contextButton" title="Add Context (@)" class="context-button">
                @
              </button>
              <button id="imageButton" title="Attach image" class="image-button">
                <img src="${imageIconPath}" width="20" height="20" alt="Attach Image" />
              </button>
              <button id="modeToggleButton" title="Toggle Claude Mode (Shift+Tab)" class="mode-toggle-button">
                <img src="${modeToggleIconPath}" width="16" height="16" alt="Toggle Mode" />
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
              <img class="claude-flower" src="${claudeIconPath}" width="16" height="16" alt="Claude Icon" />
              <span>Interactive terminal for Claude Code</span>
            </div>
          </div>
        </div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}