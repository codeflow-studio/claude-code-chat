import * as vscode from 'vscode';

/**
 * Code Action Provider that adds "Fix with Claude Code" to the Quick Fix menu
 * Activates when there are diagnostics (errors, warnings, etc.) in the code
 */
export class ClaudeCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    private _claudeTerminalInputProvider: any;

    constructor(claudeTerminalInputProvider: any) {
        this._claudeTerminalInputProvider = claudeTerminalInputProvider;
    }

    /**
     * Provide code actions for the given document and range
     */
    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        
        // Only provide actions if there are diagnostics (errors/warnings)
        if (context.diagnostics.length === 0) {
            return [];
        }

        const actions: vscode.CodeAction[] = [];

        // Create a "Fix with Claude Code" action for each diagnostic
        for (const diagnostic of context.diagnostics) {
            const action = this.createClaudeFixAction(document, range, diagnostic);
            if (action) {
                actions.push(action);
            }
        }

        return actions;
    }

    /**
     * Create a Claude Code fix action for a specific diagnostic
     */
    private createClaudeFixAction(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | undefined {
        
        const action = new vscode.CodeAction(
            'Fix with Claude Code', 
            vscode.CodeActionKind.QuickFix
        );

        // Set the action's edit to nothing (we'll handle it in the command)
        action.command = {
            command: 'claude-code-extension.fixWithClaude',
            title: 'Fix with Claude Code',
            arguments: [document, range, diagnostic]
        };

        // Mark this as preferred if it's an error (not just a warning)
        action.isPreferred = diagnostic.severity === vscode.DiagnosticSeverity.Error;

        return action;
    }

    /**
     * Handle the fix with Claude command
     */
    public static async handleFixWithClaude(
        claudeTerminalInputProvider: any,
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        diagnostic: vscode.Diagnostic
    ): Promise<void> {
        try {
            // Get the workspace folder for relative path
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let relativePath = document.fileName;
            
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                if (relativePath.startsWith(workspaceRoot)) {
                    relativePath = relativePath.substring(workspaceRoot.length);
                    // Remove leading slash if present
                    if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
                        relativePath = relativePath.substring(1);
                    }
                }
            } else {
                // If no workspace, just use the filename
                const pathParts = relativePath.split(/[/\\]/);
                relativePath = pathParts[pathParts.length - 1];
            }

            // Get the line numbers (VSCode uses 0-based indexing, convert to 1-based)
            const startLine = diagnostic.range.start.line + 1;
            const endLine = diagnostic.range.end.line + 1;
            
            // Create line range string
            const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
            
            // Get the error context - a few lines around the error
            const contextStartLine = Math.max(0, diagnostic.range.start.line - 3);
            const contextEndLine = Math.min(document.lineCount - 1, diagnostic.range.end.line + 3);
            const contextRange = new vscode.Range(contextStartLine, 0, contextEndLine, document.lineAt(contextEndLine).text.length);
            const contextCode = document.getText(contextRange);

            // Format the message to Claude Code
            const claudeMessage = `Please fix this ${this.getSeverityText(diagnostic.severity)} in my code:

File: @${relativePath}#L${lineRange}
Error: ${diagnostic.message}
Source: ${diagnostic.source || 'Unknown'}

Context (lines ${contextStartLine + 1}-${contextEndLine + 1}):
\`\`\`${this.getLanguageId(document)}
${contextCode}
\`\`\`

Please analyze the error and provide a fix.`;

            // Show the Claude Code input panel and add the formatted message
            await vscode.commands.executeCommand('claudeCodeInputView.focus');
            
            // Add the message to the input field
            if (claudeTerminalInputProvider && claudeTerminalInputProvider.addTextToInput) {
                claudeTerminalInputProvider.addTextToInput(claudeMessage);
            } else {
                // Fallback: show the message in an info message
                vscode.window.showInformationMessage(
                    'Claude Code input not available. Please copy this message manually.',
                    'Copy Message'
                ).then(selection => {
                    if (selection === 'Copy Message') {
                        vscode.env.clipboard.writeText(claudeMessage);
                    }
                });
            }
            
        } catch (error) {
            console.error('Error in Claude Code fix action:', error);
            vscode.window.showErrorMessage(`Failed to send error to Claude Code: ${error}`);
        }
    }

    /**
     * Convert diagnostic severity to readable text
     */
    private static getSeverityText(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error';
            case vscode.DiagnosticSeverity.Warning:
                return 'warning';
            case vscode.DiagnosticSeverity.Information:
                return 'info';
            case vscode.DiagnosticSeverity.Hint:
                return 'hint';
            default:
                return 'issue';
        }
    }

    /**
     * Get language identifier for syntax highlighting
     */
    private static getLanguageId(document: vscode.TextDocument): string {
        return document.languageId;
    }
}