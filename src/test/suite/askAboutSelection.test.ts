import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SelectionHandler } from '../../selectionHandler';

suite('Ask About Selection Command Test Suite', () => {
  let mockSelectionHandler: SelectionHandler;
  let mockGetCurrentSelection: sinon.SinonStub;
  let mockShowInputBox: sinon.SinonStub;
  let mockExecuteCommand: sinon.SinonStub;
  
  setup(() => {
    // Create stubs for all the functions we need to test
    mockGetCurrentSelection = sinon.stub(SelectionHandler.prototype, 'getCurrentSelection');
    mockShowInputBox = sinon.stub(vscode.window, 'showInputBox');
    mockExecuteCommand = sinon.stub(vscode.commands, 'executeCommand');
    
    // Create a new selection handler instance
    mockSelectionHandler = new SelectionHandler();
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should handle no selection', async () => {
    // Simulate no selection
    mockGetCurrentSelection.returns(undefined);
    
    // Mock error message
    const mockShowErrorMessage = sinon.stub(vscode.window, 'showErrorMessage');
    
    // Execute the command
    await vscode.commands.executeCommand('claude-code.askAboutSelection');
    
    // Verify error message was shown
    assert.strictEqual(mockShowErrorMessage.calledWith('No code selected. Please select some code first.'), true);
    
    // Verify other functions weren't called
    assert.strictEqual(mockShowInputBox.called, false);
    assert.strictEqual(mockExecuteCommand.calledWith('claude-code.sendMessage'), false);
    
    // Clean up
    mockShowErrorMessage.restore();
  });
  
  test('should handle user cancellation', async () => {
    // Simulate a selection
    mockGetCurrentSelection.returns({
      text: 'const test = "Selected code";',
      fileName: '/test/file.ts',
      language: 'typescript',
      range: {
        start: { line: 5, character: 10 },
        end: { line: 10, character: 20 }
      }
    });
    
    // Simulate user cancelling the input
    mockShowInputBox.resolves(undefined);
    
    // Execute the command
    await vscode.commands.executeCommand('claude-code.askAboutSelection');
    
    // Verify the flow stopped and sendMessage wasn't called
    assert.strictEqual(mockShowInputBox.called, true);
    assert.strictEqual(mockExecuteCommand.calledWith('claude-code.sendMessage'), false);
  });
  
  test('should send message with selection', async () => {
    // Simulate a selection
    const mockSelection = {
      text: 'const test = "Selected code";',
      fileName: '/test/file.ts',
      language: 'typescript',
      range: {
        start: { line: 5, character: 10 },
        end: { line: 10, character: 20 }
      }
    };
    mockGetCurrentSelection.returns(mockSelection);
    
    // Simulate user query
    const query = 'Explain this code';
    mockShowInputBox.resolves(query);
    
    // Execute the command
    await vscode.commands.executeCommand('claude-code.askAboutSelection');
    
    // Expected message format
    const expectedMessage = `${query}\n\nHere's the code (${mockSelection.language}) from ${mockSelection.fileName}:\n\n\`\`\`${mockSelection.language}\n${mockSelection.text}\n\`\`\``;
    
    // Verify sendMessage was called with the correct message
    assert.strictEqual(mockExecuteCommand.calledWith('claude-code.sendMessage', expectedMessage), true);
  });
});