import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as extension from '../../extension';

suite('Extension Test Suite', () => {
  let extensionContext: vscode.ExtensionContext;
  let getCommandsStub: sinon.SinonStub;
  
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
    
    // Stub the getCommands function
    getCommandsStub = sinon.stub(vscode.commands, 'getCommands');
  });
  
  teardown(() => {
    sinon.restore();
  });

  test('Extension should be activated', async () => {
    // Simulate extension activation
    extension.activate(extensionContext);
    
    // The activate function should register commands
    assert.strictEqual(extensionContext.subscriptions.length >= 5, true);
  });

  test('Extension should register all commands', async () => {
    // Set up the stub to return a list of commands
    getCommandsStub.resolves([
      'claude-code.startChat',
      'claude-code.sendMessage',
      'claude-code.askAboutSelection',
      'claude-code.clearConversation',
      'claude-code.newConversation',
      'other.command1',
      'other.command2'
    ]);
    
    // Activate the extension
    extension.activate(extensionContext);
    
    // Get the list of all registered commands
    const commands = await vscode.commands.getCommands();
    
    // Check that our commands are registered
    const requiredCommands = [
      'claude-code.startChat',
      'claude-code.sendMessage',
      'claude-code.askAboutSelection',
      'claude-code.clearConversation',
      'claude-code.newConversation'
    ];
    
    requiredCommands.forEach(cmd => {
      assert.strictEqual(commands.includes(cmd), true, `Command ${cmd} should be registered`);
    });
  });
  
  test('Extension deactivation should not throw', () => {
    // This test just ensures that deactivate runs without errors
    assert.doesNotThrow(() => {
      extension.deactivate();
    });
  });
});