import * as vscode from "vscode";
import { ImageManager } from "../service/imageManager";
import { WebviewTemplateGenerator } from "./services/WebviewTemplateGenerator";
import { MessageHandler, type MessageHandlerCallbacks } from "./services/MessageHandler";
import { TerminalManager, type TerminalManagerCallbacks } from "./services/TerminalManager";
import { ModeManager, type ModeManagerCallbacks } from "./services/ModeManager";

export class ClaudeTerminalInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claudeCodeInputView";
  private _view?: vscode.WebviewView;
  private _imageManager: ImageManager;
  private _currentMessage?: any;
  private _shouldShowLaunchOptions: boolean = false;

  // Service instances
  private _templateGenerator: WebviewTemplateGenerator;
  private _messageHandler: MessageHandler;
  private _terminalManager: TerminalManager;
  private _modeManager: ModeManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private _terminal: vscode.Terminal | undefined,
    private _context: vscode.ExtensionContext
  ) {
    this._imageManager = new ImageManager(_context);
    
    // If no terminal is provided, we should show launch options by default
    this._shouldShowLaunchOptions = !this._terminal;
    
    // Initialize services
    this._templateGenerator = new WebviewTemplateGenerator();
    
    // Create callback interfaces for services
    const messageHandlerCallbacks: MessageHandlerCallbacks = {
      postMessage: (message) => this._view?.webview.postMessage(message),
      showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      showWarningMessage: (message) => vscode.window.showWarningMessage(message),
      showInformationMessage: (message) => vscode.window.showInformationMessage(message),
      showOpenDialog: (options) => Promise.resolve(vscode.window.showOpenDialog(options))
    };

    const terminalManagerCallbacks: TerminalManagerCallbacks = {
      postMessage: (message) => this._view?.webview.postMessage(message),
      showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      executeCommand: (command, ...args) => Promise.resolve(vscode.commands.executeCommand(command, ...args)),
      focusInput: () => this.focusInput()
    };

    const modeManagerCallbacks: ModeManagerCallbacks = {
      postMessage: (message) => this._view?.webview.postMessage(message),
      showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      showInformationMessage: (message) => vscode.window.showInformationMessage(message),
      showWarningMessage: (message) => vscode.window.showWarningMessage(message)
    };

    // Initialize services
    this._messageHandler = new MessageHandler(this._imageManager, messageHandlerCallbacks);
    this._terminalManager = new TerminalManager(terminalManagerCallbacks, this._terminal);
    
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._modeManager = new ModeManager(this._context, modeManagerCallbacks, workspaceRoot);
  }

  public updateTerminal(terminal: vscode.Terminal, isExistingTerminal: boolean = false) {
    this._terminal = terminal;
    this._terminalManager.updateTerminal(terminal, isExistingTerminal);
    
    // Hide launch options when terminal is assigned
    this._shouldShowLaunchOptions = false;
    
    // Hide launch options when terminal is available
    if (this._view) {
      this._view.webview.postMessage({
        command: "hideLaunchOptions"
      });
    }
  }
  
  public notifyTerminalClosed() {
    this._terminalManager.notifyTerminalClosed();
    
    // Show launch options when terminal is closed
    if (this._view) {
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
    return this._terminalManager.sendToTerminal(text);
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
    
    // Set HTML content using template generator
    webviewView.webview.html = this._templateGenerator.generateHtml(webviewView.webview, this._extensionUri);
    
    // Send initial terminal status using TerminalManager
    const terminalStatus = this._terminalManager.getTerminalStatus();
    webviewView.webview.postMessage({
      command: "terminalStatus",
      ...terminalStatus
    });
    
    // Send initial Direct Mode state using ModeManager
    this._modeManager.sendInitialModeState();
    
    // Send initial permission mode state
    this._modeManager.sendInitialPermissionModeState();
    
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
            // Store message context for handling
            this._currentMessage = message;
            
            // In Direct Mode, don't support slash commands - treat them as regular messages
            if (message.text.trim().startsWith('/') && !this._modeManager.isDirectMode) {
                await this._handleSlashCommand(message.text.trim());
              } else {
                await this._handleMessageWithContext(message.text);
              }
            
            // Clear message context
            this._currentMessage = undefined;
            return;
          }
            
          case "searchFiles":
            this._messageHandler.handleFileSearch(message.query, message.mentionsRequestId);
            return;
            
          case "searchCommits":
            this._messageHandler.handleCommitSearch(message.query, message.mentionsRequestId);
            return;
            
          case "getProblems":
            this._messageHandler.handleGetProblems(message.mentionsRequestId);
            return;
            
          case "showError":
            vscode.window.showErrorMessage(message.message);
            return;
            
          case "selectImageFiles":
            this._messageHandler.handleImageFileSelection();
            return;
            
          case "resolveDroppedPaths":
            this._messageHandler.handleDroppedPaths(message);
            return;
            
          case "resolveDroppedImages":
            this._messageHandler.handleDroppedImages(message);
            return;
            
          case "rescanCustomCommands":
            this._messageHandler.handleRescanCustomCommands();
            return;
            
          case "launchClaudeNew":
            this._terminalManager.handleLaunchClaude('claude');
            return;
            
          case "launchClaudeContinue":
            this._terminalManager.handleLaunchClaude('claude -c');
            return;
            
          case "launchClaudeHistory":
            this._terminalManager.handleLaunchClaudeHistory();
            return;
            
          case "toggleMode":
            this._terminalManager.handleModeToggle();
            return;
            
          case "toggleMainMode":
            this._modeManager.setDirectMode(message.isDirectMode);
            return;
            
          case "stopDirectMode":
            await this._modeManager.stopDirectMode();
            return;
            
          case "clearDirectMode":
            await this._modeManager.clearDirectMode();
            return;
            
          case "pauseProcess":
            await this._modeManager.pauseProcess();
            return;
            
          case "permissionResponse":
            await this._handlePermissionResponse(message);
            return;
            
          case "setPermissionMode":
            await this._modeManager.setPermissionMode(message.permissionMode);
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
    return this._terminalManager.sendTextAsPaste(text);
  }

  /**
   * Sends text to the terminal with automatic paste detection
   * Uses paste mode for multi-line content or content over 100 characters
   * @param text The text to send to the terminal
   * @returns A promise that resolves when the command has been executed
   */
  public async sendTextSmart(text: string): Promise<void> {
    return this._terminalManager.sendTextSmart(text);
  }

  /**
   * Handles slash commands by sending them directly to the terminal
   */
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
      const messageContext = await this._messageHandler.prepareMessageContext(text, this._currentMessage);
      
      // Process message with context (handles images, problems, etc.)
      const enhancedMessage = await this._messageHandler.processMessageWithContext(messageContext);
      
      // Route the formatted message to appropriate handler based on mode
      if (this._modeManager.isDirectMode) {
        await this._modeManager.sendToDirectMode(enhancedMessage, messageContext);
      } else {
        await this._terminalManager.sendTextSmart(enhancedMessage);
      }
      
    } catch (error) {
      console.error('Error handling message with context:', error);
      const errorMessage = `Failed to process message: ${error}`;
      
      if (this._modeManager.isDirectMode) {
        // Handle Direct Mode error through ModeManager
        this._modeManager.getDirectModeService()?.clearConversation();
        vscode.window.showErrorMessage(errorMessage);
      } else {
        vscode.window.showErrorMessage(errorMessage);
      }
    }
  }

  /**
   * Handles permission response from user
   */
  private async _handlePermissionResponse(message: any): Promise<void> {
    try {
      const { action, toolName, sessionId } = message;
      
      console.log(`Received permission response: ${action} for ${toolName} (session: ${sessionId})`);
      
      // Get the Direct Mode service to handle the permission
      const directModeService = this._modeManager.getDirectModeService();
      if (directModeService) {
        await directModeService.handlePermissionResponse(action, toolName, sessionId);
      } else {
        console.error('Direct Mode service not available for permission handling');
        vscode.window.showErrorMessage('Permission handling failed: Direct Mode service not available');
      }
      
    } catch (error) {
      console.error('Error handling permission response:', error);
      vscode.window.showErrorMessage(`Permission handling failed: ${error}`);
    }
  }

  /**
   * Public method to toggle Claude Code mode (exposed for command palette access)
   */
  public async toggleMode(): Promise<void> {
    await this._terminalManager.handleModeToggle();
  }
}