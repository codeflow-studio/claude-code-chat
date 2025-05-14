import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatWebviewProvider } from '../../../ui/chatWebviewProvider';

suite('ChatWebviewProvider Test Suite', () => {
  let webviewProvider: ChatWebviewProvider;
  let context: vscode.ExtensionContext;
  let mockWebviewPanel: any;
  let mockWebview: any;
  
  setup(() => {
    // Create mocks
    mockWebview = {
      html: '',
      onDidReceiveMessage: sinon.stub(),
      postMessage: sinon.stub().resolves(true),
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
    
    // Create stub for createWebviewPanel that can be used with calledWith
    sinon.stub(vscode.window, 'createWebviewPanel').returns(mockWebviewPanel);
    
    // Create the provider
    webviewProvider = new ChatWebviewProvider(context);
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should create a webview panel', () => {
    webviewProvider.createOrShow();
    
    // Verify the webview panel was created with the correct parameters
    const createWebviewStub = vscode.window.createWebviewPanel as sinon.SinonStub;
    assert.strictEqual(createWebviewStub.called, true);
    
    // Check the arguments
    const args = createWebviewStub.args[0];
    assert.strictEqual(args[0], 'claudeCodeChat');
    assert.strictEqual(args[1], 'Claude Code Chat');
    assert.strictEqual(args[2], vscode.ViewColumn.One);
    assert.deepStrictEqual(args[3].enableScripts, true);
    assert.deepStrictEqual(args[3].retainContextWhenHidden, true);
    assert.strictEqual(args[3].localResourceRoots.length, 1);
    
    assert.strictEqual(mockWebview.html !== '', true);
  });
  
  test('should add message to chat history', async () => {
    webviewProvider.createOrShow();
    
    await webviewProvider.addMessage('user', 'Hello Claude');
    
    assert.strictEqual(
      mockWebview.postMessage.calledWith({
        type: 'addMessage',
        message: {
          sender: 'user',
          text: 'Hello Claude',
          timestamp: sinon.match.number
        }
      }),
      true
    );
  });
  
  test('should clear chat history', async () => {
    webviewProvider.createOrShow();
    
    await webviewProvider.clearMessages();
    
    assert.strictEqual(
      mockWebview.postMessage.calledWith({
        type: 'clearMessages'
      }),
      true
    );
  });
  
  test('should handle panel disposal', () => {
    webviewProvider.createOrShow();
    
    // Get the callback passed to onDidDispose
    const onDidDisposeCallback = mockWebviewPanel.onDidDispose.args[0][0];
    
    // Call the callback to simulate disposal
    onDidDisposeCallback();
    
    // Try to add a message after disposal
    webviewProvider.addMessage('user', 'This should not be sent');
    
    // postMessage should not be called
    assert.strictEqual(mockWebview.postMessage.called, false);
  });
});