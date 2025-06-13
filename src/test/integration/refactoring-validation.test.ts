/**
 * Integration test to validate the refactored ClaudeTerminalInputProvider
 * and its extracted services work correctly together
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { WebviewTemplateGenerator } from '../../ui/services/WebviewTemplateGenerator';
import { MessageHandler } from '../../ui/services/MessageHandler';
import { TerminalManager } from '../../ui/services/TerminalManager';
import { ModeManager } from '../../ui/services/ModeManager';

suite('Refactoring Validation Tests', () => {
    
    test('WebviewTemplateGenerator generates valid HTML', () => {
        const generator = new WebviewTemplateGenerator();
        
        // Mock webview and extension URI
        const mockWebview = {
            cspSource: 'vscode-webview:',
            asWebviewUri: (uri: vscode.Uri) => uri
        } as any;
        
        const mockExtensionUri = vscode.Uri.file('/test/extension');
        
        const html = generator.generateHtml(mockWebview, mockExtensionUri);
        
        // Validate HTML structure
        assert.ok(html.includes('<!DOCTYPE html>'), 'Should contain DOCTYPE declaration');
        assert.ok(html.includes('Claude Terminal Input'), 'Should contain title');
        assert.ok(html.includes('class="chat-container"'), 'Should contain chat container');
        assert.ok(html.includes('id="messageInput"'), 'Should contain message input');
        assert.ok(html.includes('id="directModeContainer"'), 'Should contain direct mode container');
    });

    test('MessageHandler initializes without errors', () => {
        const mockCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            showWarningMessage: () => {},
            showInformationMessage: () => {},
            showOpenDialog: () => Promise.resolve(undefined)
        };
        
        // Should not throw
        assert.doesNotThrow(() => {
            new MessageHandler({} as any, mockCallbacks);
        });
    });

    test('TerminalManager initializes without errors', () => {
        const mockCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            executeCommand: () => Promise.resolve(),
            focusInput: () => {}
        };
        
        // Should not throw
        assert.doesNotThrow(() => {
            new TerminalManager(mockCallbacks);
        });
    });

    test('ModeManager initializes with correct default state', () => {
        const mockContext = {
            globalState: {
                get: (key: string, defaultValue: any) => defaultValue,
                update: () => Promise.resolve()
            }
        } as any;
        
        const mockCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            showInformationMessage: () => {},
            showWarningMessage: () => {}
        };
        
        const modeManager = new ModeManager(mockContext, mockCallbacks);
        
        // Should default to Terminal mode (false)
        assert.strictEqual(modeManager.isDirectMode, false, 'Should default to Terminal mode');
    });

    test('ModeManager can toggle modes', () => {
        const mockContext = {
            globalState: {
                get: (key: string, defaultValue: any) => defaultValue,
                update: () => Promise.resolve()
            }
        } as any;
        
        const mockCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            showInformationMessage: () => {},
            showWarningMessage: () => {}
        };
        
        const modeManager = new ModeManager(mockContext, mockCallbacks);
        
        // Initial state should be Terminal mode
        assert.strictEqual(modeManager.isDirectMode, false);
        
        // Toggle to Direct mode
        modeManager.setDirectMode(true);
        assert.strictEqual(modeManager.isDirectMode, true);
        
        // Toggle back to Terminal mode
        modeManager.setDirectMode(false);
        assert.strictEqual(modeManager.isDirectMode, false);
    });

    test('Services can be instantiated together without conflicts', () => {
        const mockContext = {
            globalState: {
                get: (key: string, defaultValue: any) => defaultValue,
                update: () => Promise.resolve()
            }
        } as any;
        
        const messageCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            showWarningMessage: () => {},
            showInformationMessage: () => {},
            showOpenDialog: () => Promise.resolve(undefined)
        };
        
        const terminalCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            executeCommand: () => Promise.resolve(),
            focusInput: () => {}
        };
        
        const modeCallbacks = {
            postMessage: () => {},
            showErrorMessage: () => {},
            showInformationMessage: () => {},
            showWarningMessage: () => {}
        };
        
        // Should not throw when instantiating all services together
        assert.doesNotThrow(() => {
            const templateGenerator = new WebviewTemplateGenerator();
            const messageHandler = new MessageHandler({} as any, messageCallbacks);
            const terminalManager = new TerminalManager(terminalCallbacks);
            const modeManager = new ModeManager(mockContext, modeCallbacks);
            
            // Verify all services are properly instantiated
            assert.ok(templateGenerator);
            assert.ok(messageHandler);
            assert.ok(terminalManager);
            assert.ok(modeManager);
        });
    });
});