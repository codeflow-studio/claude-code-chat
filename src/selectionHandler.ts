import * as vscode from 'vscode';
import { ErrorHandler, ClaudeCodeError, ErrorType } from './errorHandler';

/**
 * Represents a code selection or file content
 */
export interface CodeSelection {
  text: string;
  fileName: string;
  language: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Handles code selection and file content retrieval
 */
export class SelectionHandler {
  private errorHandler: ErrorHandler;
  
  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }
  
  /**
   * Gets the currently selected code in the active editor
   * @returns The selected code, or undefined if no selection exists
   */
  public getCurrentSelection(): CodeSelection | undefined {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return undefined;
      }
      
      const selection = editor.selection;
      if (selection.isEmpty) {
        return undefined;
      }
      
      const document = editor.document;
      const text = document.getText(selection);
      
      return {
        text,
        fileName: document.fileName,
        language: document.languageId,
        range: {
          start: {
            line: selection.start.line,
            character: selection.start.character
          },
          end: {
            line: selection.end.line,
            character: selection.end.character
          }
        }
      };
    } catch (error) {
      this.errorHandler.handleError(
        new ClaudeCodeError(
          ErrorType.INVALID_SELECTION,
          `Failed to get current selection: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
      return undefined;
    }
  }
  
  /**
   * Gets the entire content of the active file
   * @returns The file content, or undefined if no file is open
   */
  public getCurrentFileContent(): CodeSelection | undefined {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return undefined;
      }
      
      const document = editor.document;
      const text = document.getText();
      
      return {
        text,
        fileName: document.fileName,
        language: document.languageId
      };
    } catch (error) {
      this.errorHandler.handleError(
        new ClaudeCodeError(
          ErrorType.UNKNOWN,
          `Failed to get current file content: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
      return undefined;
    }
  }
  
  /**
   * Checks if there's an active selection in the editor
   * @returns true if there's a non-empty selection, false otherwise
   */
  public hasSelection(): boolean {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return false;
      }
      
      return !editor.selection.isEmpty;
    } catch (error) {
      this.errorHandler.handleError(
        new ClaudeCodeError(
          ErrorType.UNKNOWN,
          `Failed to check selection: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
      return false;
    }
  }
  
  /**
   * Gets the currently selected file in the explorer, if any
   * @returns The selected file path, or undefined if no file is selected
   */
  public getSelectedFileInExplorer(): string | undefined {
    // This would require additional filesystem API usage
    // For MVP, we'll leave this unimplemented
    return undefined;
  }
  
  /**
   * Applies changes to a file
   * @param fileName The file to modify
   * @param range The range to replace
   * @param newText The replacement text
   * @returns true if the edit was successful, false otherwise
   */
  public async applyChanges(
    fileName: string,
    range: vscode.Range,
    newText: string
  ): Promise<boolean> {
    try {
      // Find or open the document
      let document: vscode.TextDocument;
      let editor: vscode.TextEditor | undefined;
      
      // Check if the document is already open
      const openDocuments = vscode.workspace.textDocuments;
      const existingDocument = openDocuments.find(doc => doc.fileName === fileName);
      
      if (existingDocument) {
        document = existingDocument;
        
        // Find the editor for this document
        editor = vscode.window.visibleTextEditors.find(
          e => e.document.fileName === fileName
        );
        
        // If no editor is found, open one
        if (!editor) {
          editor = await vscode.window.showTextDocument(document);
        }
      } else {
        // Open the document
        const uri = vscode.Uri.file(fileName);
        document = await vscode.workspace.openTextDocument(uri);
        editor = await vscode.window.showTextDocument(document);
      }
      
      // Apply the edit
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, newText);
      
      // Show success message
      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        this.errorHandler.showInformation('Changes applied successfully.');
      }
      
      return success;
    } catch (error) {
      this.errorHandler.handleError(
        new ClaudeCodeError(
          ErrorType.UNKNOWN,
          `Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
      );
      return false;
    }
  }
}