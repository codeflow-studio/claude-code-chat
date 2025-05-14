import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatWebviewProvider } from '../../../ui/chatWebviewProvider';

suite('Response Rendering Test Suite', () => {
  let webviewProvider: ChatWebviewProvider;
  let context: vscode.ExtensionContext;
  let mockWebviewPanel: any;
  let mockWebview: any;
  let postMessageStub: sinon.SinonStub;
  
  setup(() => {
    // Create mocks
    postMessageStub = sinon.stub().resolves(true);
    
    mockWebview = {
      html: '',
      onDidReceiveMessage: sinon.stub(),
      postMessage: postMessageStub,
      asWebviewUri: sinon.stub().callsFake((uri) => uri)
    };
    
    mockWebviewPanel = {
      webview: mockWebview,
      onDidDispose: sinon.stub(),
      onDidChangeViewState: sinon.stub(),
      reveal: sinon.stub(),
      dispose: sinon.stub()
    };
    
    // Create a properly typed mock extension context
    const mockGetStub = sinon.stub().returns(undefined);
    const mockUpdateStub = sinon.stub().resolves();
    const mockAbsolutePathStub = sinon.stub().callsFake((path) => `/test/extension/path/${path}`);

    // Create a more compatible mock context
    const mockContext = {
      subscriptions: [] as { dispose(): any }[],
      extensionPath: '/test/extension/path',
      extensionUri: vscode.Uri.file('/test/extension/path'),
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
      asAbsolutePath: mockAbsolutePathStub,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file('/test/extension/path/global-storage'),
      logUri: vscode.Uri.file('/test/extension/path/logs'),
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
      storagePath: '/test/extension/path/storage',
      globalStoragePath: '/test/extension/path/global-storage',
      logPath: '/test/extension/path/logs',
      secrets: {
        get(_key: string): Thenable<string | undefined> { return Promise.resolve(undefined); },
        store(_key: string, _value: string): Thenable<void> { return Promise.resolve(); },
        delete(_key: string): Thenable<void> { return Promise.resolve(); },
        onDidChange: sinon.stub() as unknown as vscode.Event<vscode.SecretStorageChangeEvent>
      },
      // Add missing properties
      extension: {
        id: 'test-extension',
        extensionUri: vscode.Uri.file('/test/extension/path'),
        extensionPath: '/test/extension/path',
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
    context = mockContext as vscode.ExtensionContext;
    
    // Create stub for createWebviewPanel
    sinon.stub(vscode.window, 'createWebviewPanel').returns(mockWebviewPanel);
    
    // Create the provider
    webviewProvider = new ChatWebviewProvider(context);
    webviewProvider.createOrShow(); // Create the panel
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should send a user message to the webview', async () => {
    await webviewProvider.addMessage('user', 'Hello Claude!');
    
    assert.strictEqual(postMessageStub.calledOnce, true);
    const callArg = postMessageStub.firstCall.args[0];
    
    assert.strictEqual(callArg.type, 'addMessage');
    assert.strictEqual(callArg.message.sender, 'user');
    assert.strictEqual(callArg.message.text, 'Hello Claude!');
    assert.ok(callArg.message.timestamp);
  });
  
  test('should send a claude message to the webview', async () => {
    await webviewProvider.addMessage('claude', 'Hello User!');
    
    assert.strictEqual(postMessageStub.calledOnce, true);
    const callArg = postMessageStub.firstCall.args[0];
    
    assert.strictEqual(callArg.type, 'addMessage');
    assert.strictEqual(callArg.message.sender, 'claude');
    assert.strictEqual(callArg.message.text, 'Hello User!');
    assert.ok(callArg.message.timestamp);
  });
  
  test('should set loading state', async () => {
    await webviewProvider.setLoading(true);
    
    assert.strictEqual(postMessageStub.calledOnce, true);
    const callArg = postMessageStub.firstCall.args[0];
    
    assert.strictEqual(callArg.type, 'setLoading');
    assert.strictEqual(callArg.isLoading, true);
    
    // Set to false
    await webviewProvider.setLoading(false);
    
    assert.strictEqual(postMessageStub.calledTwice, true);
    const secondCallArg = postMessageStub.secondCall.args[0];
    
    assert.strictEqual(secondCallArg.type, 'setLoading');
    assert.strictEqual(secondCallArg.isLoading, false);
  });
  
  test('should clear messages', async () => {
    await webviewProvider.clearMessages();
    
    assert.strictEqual(postMessageStub.calledOnce, true);
    const callArg = postMessageStub.firstCall.args[0];
    
    assert.strictEqual(callArg.type, 'clearMessages');
  });
  
  test('should update from conversation context', async () => {
    // Create a properly typed context object
    const conversationContext = {
      messages: [
        {
          role: 'user' as const,  // Use const assertion for literal type
          content: 'Hello!',
          timestamp: Date.now()
        },
        {
          role: 'assistant' as const,  // Use const assertion for literal type
          content: 'Hi there!',
          timestamp: Date.now()
        }
      ]
    };
    
    await webviewProvider.updateFromContext(conversationContext);
    
    // Should call clearMessages once and addMessage twice
    assert.strictEqual(postMessageStub.callCount, 3);
    
    // First call should be clearMessages
    assert.strictEqual(postMessageStub.firstCall.args[0].type, 'clearMessages');
    
    // Second call should be the user message
    const secondCallArg = postMessageStub.secondCall.args[0];
    assert.strictEqual(secondCallArg.type, 'addMessage');
    assert.strictEqual(secondCallArg.message.sender, 'user');
    assert.strictEqual(secondCallArg.message.text, 'Hello!');
    
    // Third call should be the assistant message
    const thirdCallArg = postMessageStub.thirdCall.args[0];
    assert.strictEqual(thirdCallArg.type, 'addMessage');
    assert.strictEqual(thirdCallArg.message.sender, 'claude');
    assert.strictEqual(thirdCallArg.message.text, 'Hi there!');
  });
});