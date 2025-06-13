import * as vscode from "vscode";
import { searchFiles, getGitCommits } from "../../fileSystem";
import { fileServiceClient } from "../../api/FileService";
import { customCommandService } from "../../service/customCommandService";
import { ImageManager } from "../../service/imageManager";
import { formatMessageWithProblems, processImagesForMessage, type ImageContext } from "../../utils/messageUtils";

/**
 * Interface for message context preparation
 */
export interface MessageContext {
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
}

/**
 * Interface for message processing callbacks
 */
export interface MessageHandlerCallbacks {
  postMessage: (message: any) => void;
  showErrorMessage: (message: string) => void;
  showWarningMessage: (message: string) => void;
  showInformationMessage: (message: string) => void;
  showOpenDialog: (options: vscode.OpenDialogOptions) => Promise<vscode.Uri[] | undefined>;
}

/**
 * Service responsible for handling webview messages and context preparation
 * Extracted from ClaudeTerminalInputProvider to improve maintainability
 */
export class MessageHandler {
  constructor(
    private readonly _imageManager: ImageManager,
    private readonly _callbacks: MessageHandlerCallbacks
  ) {}

  /**
   * Handles file search requests
   */
  public async handleFileSearch(query: string, mentionsRequestId: string): Promise<void> {
    try {
      // Check if query looks like a git commit reference
      if (/^[a-f0-9]{7,40}$/i.test(query)) {
        // Search for git commits
        await this.handleCommitSearch(query, mentionsRequestId);
      } else {
        // Search for files matching the query
        const results = await searchFiles(query);
        
        // Send results back to webview
        this._callbacks.postMessage({
          type: "fileSearchResults",
          results,
          mentionsRequestId
        });
      }
    } catch (error) {
      console.error("Error searching files:", error);
      
      // Send empty results back to webview
      this._callbacks.postMessage({
        type: "fileSearchResults",
        results: [],
        mentionsRequestId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Handles commit search requests
   */
  public async handleCommitSearch(query: string, mentionsRequestId: string): Promise<void> {
    try {
      // Search for commits matching the query
      const commits = await getGitCommits(query);
      
      // Send results back to webview
      this._callbacks.postMessage({
        type: "commitSearchResults",
        commits,
        mentionsRequestId
      });
    } catch (error) {
      console.error("Error searching commits:", error);
      
      // Send empty results back to webview
      this._callbacks.postMessage({
        type: "commitSearchResults",
        commits: [],
        mentionsRequestId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Handles getting current problems/diagnostics
   */
  public async handleGetProblems(mentionsRequestId: string): Promise<void> {
    try {
      // Get current problems from VSCode diagnostics
      const problems = this.getCurrentProblems();
      
      // Send problems back to webview
      this._callbacks.postMessage({
        type: "problemsResults",
        problems,
        mentionsRequestId
      });
    } catch (error) {
      console.error("Error getting problems:", error);
      
      // Send empty results back to webview
      this._callbacks.postMessage({
        type: "problemsResults",
        problems: [],
        mentionsRequestId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Handles image file selection
   */
  public async handleImageFileSelection(): Promise<void> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: true,
      openLabel: 'Select Images',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      }
    };

    const fileUris = await this._callbacks.showOpenDialog(options);
    
    if (fileUris && fileUris.length > 0) {
      const imagePaths = fileUris.map(uri => uri.fsPath);
      
      // Send the paths to the webview
      this._callbacks.postMessage({
        command: 'imageFilesSelected',
        imagePaths: imagePaths
      });
    }
  }

  /**
   * Handles dropped file paths
   */
  public async handleDroppedPaths(message: any): Promise<void> {
    try {
      const uris: string[] = [];
      
      console.log('Handling dropped paths:', message.uris);
      
      if (message.uris && message.uris.length > 0) {
        uris.push(...message.uris);
      }
      
      // Use FileService to get relative paths like cline does
      const response = await fileServiceClient.getRelativePaths({ uris });
      
      // Send resolved paths back to webview
      this._callbacks.postMessage({
        command: 'droppedPathsResolved',
        paths: response.paths
      });
    } catch (error) {
      console.error('Error resolving dropped paths:', error);
      // Send empty array as fallback
      this._callbacks.postMessage({
        command: 'droppedPathsResolved',
        paths: []
      });
    }
  }

  /**
   * Handles dropped images
   */
  public async handleDroppedImages(message: any): Promise<void> {
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
              const tempPath = await this._imageManager.saveImage(dataUri, fileName, 'image/*');
              tempImagePaths.push(tempPath);
            }
          } catch (error) {
            console.error('Error processing image URI:', error);
          }
        }
      }
      
      // Send resolved temporary image paths back to webview
      if (tempImagePaths.length > 0) {
        this._callbacks.postMessage({
          command: 'droppedImagesResolved',
          imagePaths: tempImagePaths
        });
      }
    } catch (error) {
      console.error('Error resolving dropped images:', error);
    }
  }

  /**
   * Handles rescanning custom commands
   */
  public async handleRescanCustomCommands(): Promise<void> {
    try {
      // Scan for custom commands
      await customCommandService.scanCustomCommands();
      
      // Send the custom commands to the webview
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
      
      this._callbacks.postMessage({
        command: 'customCommandsUpdated',
        customCommands: uniqueCommands
      });
    } catch (error) {
      console.error('Error loading custom commands:', error);
    }
  }

  /**
   * Prepares comprehensive message context from current message data
   */
  public async prepareMessageContext(text: string, currentMessage?: any): Promise<MessageContext> {
    const context: MessageContext = {
      text,
      images: [],
      filePaths: [],
      selectedProblems: [],
      selectedProblemIds: []
    };

    if (!currentMessage) {
      return context;
    }

    // Get images from current message
    context.images = currentMessage.images || [];

    // Get file paths from current message
    context.filePaths = currentMessage.filePaths || [];

    // Get selected problem IDs
    context.selectedProblemIds = currentMessage.selectedProblemIds || [];

    // Resolve problem details if we have selected problem IDs
    if (context.selectedProblemIds.length > 0) {
      const allProblems = this.getCurrentProblems();
      context.selectedProblems = allProblems.filter((_, index) => 
        context.selectedProblemIds.includes(index.toString())
      );
    }

    return context;
  }

  /**
   * Processes message with context (images, files, and problems)
   */
  public async processMessageWithContext(messageContext: MessageContext): Promise<string> {
    try {
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
        const imageResult = await processImagesForMessage(enhancedMessage, imageContexts, this._imageManager);
        
        // Handle any failed images
        if (imageResult.failedImages.length > 0) {
          const failedList = imageResult.failedImages.join(', ');
          this._callbacks.showWarningMessage(
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
        throw new Error('No content to send after processing.');
      }
      
      return enhancedMessage;
      
    } catch (error) {
      console.error('Error processing message with context:', error);
      throw error;
    }
  }

  /**
   * Gets current problems from VSCode's diagnostics
   */
  public getCurrentProblems(): Array<{
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
}