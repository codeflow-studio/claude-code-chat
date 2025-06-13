import * as vscode from "vscode";

/**
 * Interface for problem data
 */
export interface Problem {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source?: string;
}

/**
 * Interface for problem manager callbacks
 */
export interface ProblemManagerCallbacks {
  postMessage: (message: any) => void;
}

/**
 * Service responsible for managing VSCode diagnostics and problems
 * Extracted from ClaudeTerminalInputProvider to improve maintainability
 */
export class ProblemManager {
  constructor(private readonly _callbacks: ProblemManagerCallbacks) {}

  /**
   * Handles showing problems menu
   */
  public async handleShowProblemsMenu(mentionsRequestId: string): Promise<void> {
    try {
      // Get current problems from VSCode diagnostics
      const problems = this.getCurrentProblems();
      
      // Transform problems into menu items with navigation support
      const menuItems = problems.map((problem, index) => ({
        id: index.toString(),
        label: `${problem.severity}: ${problem.file}:${problem.line}:${problem.column}`,
        description: problem.message,
        detail: problem.source ? `Source: ${problem.source}` : undefined,
        problem: problem
      }));
      
      // Send problems menu to webview
      this._callbacks.postMessage({
        type: "problemsMenu",
        menuItems,
        mentionsRequestId
      });
    } catch (error) {
      console.error("Error getting problems menu:", error);
      
      // Send empty menu back to webview
      this._callbacks.postMessage({
        type: "problemsMenu",
        menuItems: [],
        mentionsRequestId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Gets current problems from VSCode's diagnostics
   */
  public getCurrentProblems(): Problem[] {
    const problems: Problem[] = [];
    
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
   * Gets problems count by severity
   */
  public getProblemsCount(): {
    errors: number;
    warnings: number;
    info: number;
    hints: number;
    total: number;
  } {
    const problems = this.getCurrentProblems();
    const count = {
      errors: 0,
      warnings: 0,
      info: 0,
      hints: 0,
      total: problems.length
    };

    problems.forEach(problem => {
      switch (problem.severity) {
        case 'Error':
          count.errors++;
          break;
        case 'Warning':
          count.warnings++;
          break;
        case 'Information':
          count.info++;
          break;
        case 'Hint':
          count.hints++;
          break;
      }
    });

    return count;
  }

  /**
   * Filters problems by severity
   */
  public getProblemsBySeverity(severity: string): Problem[] {
    return this.getCurrentProblems().filter(problem => problem.severity === severity);
  }

  /**
   * Filters problems by file
   */
  public getProblemsByFile(fileName: string): Problem[] {
    return this.getCurrentProblems().filter(problem => 
      problem.file.includes(fileName) || problem.file.endsWith(fileName)
    );
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