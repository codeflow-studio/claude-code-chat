import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ErrorHandler, ClaudeCodeError, ErrorType } from '../../errorHandler';

suite('ErrorHandler Test Suite', () => {
  let errorHandler: ErrorHandler;
  let showErrorMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let mockChatProvider: any;
  
  setup(() => {
    // Get the singleton instance
    errorHandler = ErrorHandler.getInstance();
    
    // Stub VSCode window methods
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    
    // Mock chat provider
    mockChatProvider = {
      addMessage: sinon.stub().resolves()
    };
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should format ClaudeCodeError messages correctly', () => {
    // Test each error type
    const testCases = [
      {
        error: new ClaudeCodeError(ErrorType.CLAUDE_NOT_INSTALLED, 'Claude not installed'),
        expected: 'Claude Code CLI is not installed. Please install it first.'
      },
      {
        error: new ClaudeCodeError(ErrorType.CLAUDE_PROCESS_FAILED, 'Process failed'),
        expected: 'Failed to start Claude Code. Please check if it is properly installed.'
      },
      {
        error: new ClaudeCodeError(ErrorType.CONNECTION_ERROR, 'Connection error'),
        expected: 'Failed to connect to Claude Code. Please check your internet connection.'
      },
      {
        error: new ClaudeCodeError(ErrorType.TIMEOUT, 'Request timed out'),
        expected: 'The request to Claude Code timed out. Please try again later.'
      },
      {
        error: new ClaudeCodeError(ErrorType.AUTHENTICATION_ERROR, 'Auth failed'),
        expected: 'Authentication with Claude Code failed. Please run claude-code in your terminal to authenticate.'
      },
      {
        error: new ClaudeCodeError(ErrorType.INVALID_SELECTION, 'No selection'),
        expected: 'No valid code selection found. Please select some code first.'
      },
      {
        error: new ClaudeCodeError(ErrorType.UNKNOWN, 'Custom error message'),
        expected: 'Custom error message'
      }
    ];
    
    testCases.forEach(testCase => {
      const message = errorHandler.getErrorMessage(testCase.error);
      assert.strictEqual(message, testCase.expected);
    });
  });
  
  test('should format generic errors correctly', () => {
    const genericError = new Error('Generic error message');
    const message = errorHandler.getErrorMessage(genericError);
    assert.strictEqual(message, 'Generic error message');
    
    const stringError = 'String error';
    const stringMessage = errorHandler.getErrorMessage(stringError);
    assert.strictEqual(stringMessage, 'String error');
  });
  
  test('should show error message in UI', async () => {
    const error = new ClaudeCodeError(ErrorType.CLAUDE_NOT_INSTALLED, 'Claude not installed');
    
    await errorHandler.handleError(error);
    
    assert.strictEqual(showErrorMessageStub.calledOnce, true);
    assert.strictEqual(
      showErrorMessageStub.calledWith('Claude Code CLI is not installed. Please install it first.'),
      true
    );
  });
  
  test('should add error message to chat if provider is provided', async () => {
    const error = new ClaudeCodeError(ErrorType.TIMEOUT, 'Request timed out');
    
    await errorHandler.handleError(error, mockChatProvider);
    
    assert.strictEqual(mockChatProvider.addMessage.calledOnce, true);
    assert.strictEqual(
      mockChatProvider.addMessage.calledWith('claude', 'Error: The request to Claude Code timed out. Please try again later.'),
      true
    );
  });
  
  test('should show information message', () => {
    errorHandler.showInformation('Test information message');
    
    assert.strictEqual(showInformationMessageStub.calledOnce, true);
    assert.strictEqual(
      showInformationMessageStub.calledWith('Test information message'),
      true
    );
  });
});