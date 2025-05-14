import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as extension from '../../extension';
import { ClaudeCodeClient } from '../../api/claudeCodeClient';
import { ChatWebviewProvider } from '../../ui/chatWebviewProvider';
import { SelectionHandler } from '../../selectionHandler';

suite('Integration Test Suite', () => {
  // We're using sinon stubs heavily here to avoid actual process spawning
  // and VS Code UI interactions in tests
  let extensionContext: vscode.ExtensionContext;
  let showTextDocumentStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  
  // Define typesafe stubs for our classes
  interface ClientStubs {
    start: sinon.SinonStub;
    sendMessage: sinon.SinonStub;
    getConversationContext: sinon.SinonStub;
    clearConversationContext: sinon.SinonStub;
    stop: sinon.SinonStub;
    isActive: sinon.SinonStub;
  }
  
  interface WebviewStubs {
    createOrShow: sinon.SinonStub;
    addMessage: sinon.SinonStub;
    clearMessages: sinon.SinonStub;
    updateFromContext: sinon.SinonStub;
    setLoading: sinon.SinonStub;
  }
  
  interface SelectionHandlerStubs {
    getCurrentSelection: sinon.SinonStub;
    getCurrentFileContent: sinon.SinonStub;
    hasSelection: sinon.SinonStub;
    getSelectedFileInExplorer: sinon.SinonStub;
    applyChanges: sinon.SinonStub;
  }
  
  let clientStub: ClientStubs;
  let webviewStub: WebviewStubs;
  let selectionHandlerStub: SelectionHandlerStubs;
  
  setup(() => {
    // Create a properly typed mock extension context
    const mockGetStub = sinon.stub().returns(undefined);
    const mockUpdateStub = sinon.stub().resolves();

    // Create a more compatible mock context
    const mockContext = {
      subscriptions: [] as { dispose(): any }[],
      extensionPath: '/test/path',
      extensionUri: vscode.Uri.file('/test/path'),
      globalState: {
        get: mockGetStub,
        update: mockUpdateStub,
        setKeysForSync: sinon.stub(),
        keys: () => [] as readonly string[],
      },
      workspaceState: {
        get: mockGetStub,
        update: mockUpdateStub,
        keys: () => [] as readonly string[],
      },
      asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file('/test/path/global-storage'),
      logUri: vscode.Uri.file('/test/path/logs'),
      extensionMode: vscode.ExtensionMode.Test,
      environmentVariableCollection: {
        getScoped(): vscode.EnvironmentVariableCollection {
          return {} as vscode.EnvironmentVariableCollection;
        },
        replace(): void {},
        append(): void {},
        prepend(): void {},
        get(): vscode.EnvironmentVariableCollection | undefined { return undefined; },
        forEach(): void {},
        delete(): void {},
        clear(): void {},
        size: 0,
        persistent: false,
        description: '',
        [Symbol.iterator](): Iterator<[string, vscode.EnvironmentVariableMutator]> {
          return [][Symbol.iterator]();
        }
      } as vscode.GlobalEnvironmentVariableCollection,
      storagePath: '/test/path/storage',
      globalStoragePath: '/test/path/global-storage',
      logPath: '/test/path/logs',
      secrets: {
        get(_key: string): Thenable<string | undefined> { return Promise.resolve(undefined); },
        store(_key: string, _value: string): Thenable<void> { return Promise.resolve(); },
        delete(_key: string): Thenable<void> { return Promise.resolve(); },
        onDidChange: sinon.stub() as unknown as vscode.Event<vscode.SecretStorageChangeEvent>
      },
      // Add missing properties
      extension: {
        id: 'test-extension',
        extensionUri: vscode.Uri.file('/test/path'),
        extensionPath: '/test/path',
        isActive: true,
        packageJSON: {},
        exports: undefined,
        activate: () => Promise.resolve(),
        extensionKind: vscode.ExtensionKind.Workspace
      },
      // Mock languageModelAccessInformation with minimal implementation
      languageModelAccessInformation: {
        onDidChange: new vscode.EventEmitter<void>().event,
        canSendRequest: (_chat: vscode.LanguageModelChat) => false
      }
    };
    
    // Cast to the required type
    extensionContext = mockContext as vscode.ExtensionContext;
    
    // Stub various VS Code APIs
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
    
    // Create typesafe stubs for our classes
    // We need to use different approach than simply stubbing prototypes
    // Create stubs for individual methods instead
    const clientPrototype = ClaudeCodeClient.prototype;
    const webviewPrototype = ChatWebviewProvider.prototype;
    const selectionHandlerPrototype = SelectionHandler.prototype;
    
    // Stub individual methods
    clientStub = {
      start: sinon.stub(clientPrototype, 'start'),
      sendMessage: sinon.stub(clientPrototype, 'sendMessage'),
      getConversationContext: sinon.stub(clientPrototype, 'getConversationContext'),
      clearConversationContext: sinon.stub(clientPrototype, 'clearConversationContext'),
      stop: sinon.stub(clientPrototype, 'stop'),
      isActive: sinon.stub(clientPrototype, 'isActive')
    };
    
    webviewStub = {
      createOrShow: sinon.stub(webviewPrototype, 'createOrShow'),
      addMessage: sinon.stub(webviewPrototype, 'addMessage'),
      clearMessages: sinon.stub(webviewPrototype, 'clearMessages'),
      updateFromContext: sinon.stub(webviewPrototype, 'updateFromContext'),
      setLoading: sinon.stub(webviewPrototype, 'setLoading')
    };
    
    selectionHandlerStub = {
      getCurrentSelection: sinon.stub(selectionHandlerPrototype, 'getCurrentSelection'),
      getCurrentFileContent: sinon.stub(selectionHandlerPrototype, 'getCurrentFileContent'),
      hasSelection: sinon.stub(selectionHandlerPrototype, 'hasSelection'),
      getSelectedFileInExplorer: sinon.stub(selectionHandlerPrototype, 'getSelectedFileInExplorer'),
      applyChanges: sinon.stub(selectionHandlerPrototype, 'applyChanges')
    };
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('Should start chat and send a message', async () => {
    // Setup stubs for specific behaviors
    const createOrShowStub = webviewStub.createOrShow.returns({} as vscode.WebviewPanel);
    const startStub = clientStub.start.resolves(true);
    const isActiveStub = clientStub.isActive.returns(true);
    const sendMessageStub = clientStub.sendMessage.resolves({ message: 'Mock response' });
    const addMessageStub = webviewStub.addMessage.resolves();
    const setLoadingStub = webviewStub.setLoading.resolves();
    const getContextStub = clientStub.getConversationContext.returns({ messages: [] });
    const updateFromContextStub = webviewStub.updateFromContext.resolves();
    
    // Restore and override executeCommand to actually call our command implementations
    executeCommandStub.restore();
    
    // Activate the extension
    extension.activate(extensionContext);
    
    // Execute the startChat command
    await vscode.commands.executeCommand('claude-code.startChat');
    
    // Verify that the chat panel was created and shown
    assert.strictEqual(createOrShowStub.called, true);
    
    // Verify that the Claude Code client was started
    assert.strictEqual(startStub.called, true);
    
    // Verify that the conversation context was loaded
    assert.strictEqual(getContextStub.called, true);
    assert.strictEqual(updateFromContextStub.called, true);
    
    // Now send a test message
    const testMessage = 'Hello Claude!';
    await vscode.commands.executeCommand('claude-code.sendMessage', testMessage);
    
    // Verify that the message was sent to the client
    assert.strictEqual(sendMessageStub.calledWith(testMessage), true);
    
    // Verify that both the user message and response were added to the UI
    assert.strictEqual(addMessageStub.calledWith('user', testMessage), true);
    assert.strictEqual(addMessageStub.calledWith('claude', 'Mock response'), true);
    
    // Verify that loading state was properly handled
    assert.strictEqual(setLoadingStub.calledWith(true), true);
    assert.strictEqual(setLoadingStub.calledWith(false), true);
  });
  
  test('Should handle askAboutSelection flow', async () => {
    // Restore original executeCommand to allow proper command chaining
    executeCommandStub.restore();
    
    // Setup test data for selection
    const mockSelection = {
      text: 'const test = "Selected code";',
      fileName: '/test/file.ts',
      language: 'typescript',
      range: {
        start: { line: 5, character: 10 },
        end: { line: 10, character: 20 }
      }
    };
    
    // Setup stubs for specific behaviors
    const getCurrentSelectionStub = selectionHandlerStub.getCurrentSelection.returns(mockSelection);
    const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves('Explain this code');
    const createOrShowStub = webviewStub.createOrShow.returns({} as vscode.WebviewPanel);
    
    // We need to stub executeCommand again for the nested sendMessage call
    const executeNestedCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    
    // Activate the extension
    extension.activate(extensionContext);
    
    // Execute the askAboutSelection command
    await vscode.commands.executeCommand('claude-code.askAboutSelection', undefined);
    
    // Verify that getCurrentSelection was called
    assert.strictEqual(getCurrentSelectionStub.called, true);
    
    // Verify that the user was prompted for input
    assert.strictEqual(showInputBoxStub.called, true);
    
    // Verify that the chat panel was shown
    assert.strictEqual(createOrShowStub.called, true);
    
    // Verify that sendMessage was called with the correct format
    const expectedMessage = 'Explain this code\n\nHere\'s the code (typescript) from /test/file.ts:\n\n```typescript\nconst test = "Selected code";\n```';
    assert.strictEqual(executeNestedCommandStub.calledWith('claude-code.sendMessage', expectedMessage, undefined), true);
  });
  
  test('Should handle conversation management commands', async () => {
    // Setup stubs for specific behaviors
    const clearContextStub = clientStub.clearConversationContext.returns(undefined);
    const clearMessagesStub = webviewStub.clearMessages.resolves();
    
    // Restore original executeCommand
    executeCommandStub.restore();
    
    // Activate the extension
    extension.activate(extensionContext);
    
    // Execute the clearConversation command
    await vscode.commands.executeCommand('claude-code.clearConversation', undefined);
    
    // Verify that the conversation was cleared
    assert.strictEqual(clearContextStub.called, true);
    assert.strictEqual(clearMessagesStub.called, true);
    
    // Reset call counts
    clearContextStub.resetHistory();
    clearMessagesStub.resetHistory();
    
    // Execute the newConversation command
    await vscode.commands.executeCommand('claude-code.newConversation', undefined);
    
    // Verify that a new conversation was started
    assert.strictEqual(clearContextStub.called, true);
    assert.strictEqual(clearMessagesStub.called, true);
  });
});