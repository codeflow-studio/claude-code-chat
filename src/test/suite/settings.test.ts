import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SettingsManager, PanelLocation } from '../../settings';

suite('SettingsManager Test Suite', () => {
  let settingsManager: SettingsManager;
  let getConfigurationStub: sinon.SinonStub;
  let mockConfiguration: any;
  
  setup(() => {
    // Create a mock configuration
    mockConfiguration = {
      get: sinon.stub(),
      update: sinon.stub().resolves()
    };
    
    // Stub the vscode.workspace.getConfiguration method
    getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockConfiguration);
    
    // Get the singleton instance
    settingsManager = SettingsManager.getInstance();
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should get autoStart setting with default', () => {
    // Configure mock to return undefined (use default)
    mockConfiguration.get.withArgs('autoStart', false).returns(undefined);
    
    const result = settingsManager.isAutoStartEnabled();
    
    assert.strictEqual(result, false);
    assert.strictEqual(mockConfiguration.get.calledWith('autoStart', false), true);
  });
  
  test('should get autoStart setting with value', () => {
    // Configure mock to return true
    mockConfiguration.get.withArgs('autoStart', false).returns(true);
    
    const result = settingsManager.isAutoStartEnabled();
    
    assert.strictEqual(result, true);
    assert.strictEqual(mockConfiguration.get.calledWith('autoStart', false), true);
  });
  
  test('should get cliPath setting with default', () => {
    // Configure mock to return undefined (use default)
    mockConfiguration.get.withArgs('cliPath', 'claude-code').returns(undefined);
    
    const result = settingsManager.getCliPath();
    
    assert.strictEqual(result, 'claude-code');
    assert.strictEqual(mockConfiguration.get.calledWith('cliPath', 'claude-code'), true);
  });
  
  test('should get cliPath setting with value', () => {
    // Configure mock to return a custom path
    mockConfiguration.get.withArgs('cliPath', 'claude-code').returns('/usr/local/bin/claude-code');
    
    const result = settingsManager.getCliPath();
    
    assert.strictEqual(result, '/usr/local/bin/claude-code');
    assert.strictEqual(mockConfiguration.get.calledWith('cliPath', 'claude-code'), true);
  });
  
  test('should get additionalCliArgs setting with default', () => {
    // Configure mock to return undefined (use default)
    mockConfiguration.get.withArgs('additionalCliArgs', []).returns(undefined);
    
    const result = settingsManager.getAdditionalCliArgs();
    
    assert.deepStrictEqual(result, []);
    assert.strictEqual(mockConfiguration.get.calledWith('additionalCliArgs', []), true);
  });
  
  test('should get additionalCliArgs setting with value', () => {
    // Configure mock to return custom args
    mockConfiguration.get.withArgs('additionalCliArgs', []).returns(['--verbose', '--log-level=debug']);
    
    const result = settingsManager.getAdditionalCliArgs();
    
    assert.deepStrictEqual(result, ['--verbose', '--log-level=debug']);
    assert.strictEqual(mockConfiguration.get.calledWith('additionalCliArgs', []), true);
  });
  
  test('should get panelLocation setting with default', () => {
    // Configure mock to return undefined (use default)
    mockConfiguration.get.withArgs('panelLocation', 'active').returns(undefined);
    
    const result = settingsManager.getPanelLocation();
    
    assert.strictEqual(result, PanelLocation.ACTIVE);
    assert.strictEqual(mockConfiguration.get.calledWith('panelLocation', 'active'), true);
  });
  
  test('should get panelLocation setting with values', () => {
    // Test each possible value
    
    // Left
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('left');
    assert.strictEqual(settingsManager.getPanelLocation(), PanelLocation.LEFT);
    
    // Right
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('right');
    assert.strictEqual(settingsManager.getPanelLocation(), PanelLocation.RIGHT);
    
    // Active (default)
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('active');
    assert.strictEqual(settingsManager.getPanelLocation(), PanelLocation.ACTIVE);
    
    // Invalid (should use default)
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('invalid');
    assert.strictEqual(settingsManager.getPanelLocation(), PanelLocation.ACTIVE);
  });
  
  test('should get panelViewColumn based on location', () => {
    // Test each possible location
    
    // Left
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('left');
    assert.strictEqual(settingsManager.getPanelViewColumn(), vscode.ViewColumn.One);
    
    // Right
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('right');
    assert.strictEqual(settingsManager.getPanelViewColumn(), vscode.ViewColumn.Two);
    
    // Active
    mockConfiguration.get.withArgs('panelLocation', 'active').returns('active');
    assert.strictEqual(settingsManager.getPanelViewColumn(), vscode.ViewColumn.Active);
  });
  
  test('should get preserveConversations setting with default', () => {
    // Configure mock to return undefined (use default)
    mockConfiguration.get.withArgs('preserveConversations', true).returns(undefined);
    
    const result = settingsManager.shouldPreserveConversations();
    
    assert.strictEqual(result, true);
    assert.strictEqual(mockConfiguration.get.calledWith('preserveConversations', true), true);
  });
  
  test('should get preserveConversations setting with value', () => {
    // Configure mock to return false
    mockConfiguration.get.withArgs('preserveConversations', true).returns(false);
    
    const result = settingsManager.shouldPreserveConversations();
    
    assert.strictEqual(result, false);
    assert.strictEqual(mockConfiguration.get.calledWith('preserveConversations', true), true);
  });
  
  test('should update setting', async () => {
    await settingsManager.updateSetting('autoStart', true);
    
    assert.strictEqual(
      mockConfiguration.update.calledWith('autoStart', true, vscode.ConfigurationTarget.Global),
      true
    );
  });
});