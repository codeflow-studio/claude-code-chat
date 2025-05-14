import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SelectionHandler } from '../../selectionHandler';

suite('SelectionHandler Test Suite', () => {
  let selectionHandler: SelectionHandler;
  let mockEditor: any;
  let mockDocument: any;
  let mockSelection: vscode.Selection;
  
  setup(() => {
    // Create mock selection
    mockSelection = {
      start: new vscode.Position(5, 10),
      end: new vscode.Position(10, 20),
      active: new vscode.Position(10, 20),
      anchor: new vscode.Position(5, 10),
      isEmpty: false,
      isReversed: false,
      isSingleLine: false,
      contains: sinon.stub().returns(true),
      isEqual: sinon.stub().returns(false),
      intersection: sinon.stub().returns(mockSelection),
      union: sinon.stub().returns(mockSelection),
      with: sinon.stub().returns(mockSelection)
    } as unknown as vscode.Selection;
    
    // Create mock document
    mockDocument = {
      fileName: '/test/file.ts',
      languageId: 'typescript',
      getText: sinon.stub().returns('const test = "Selected code";'),
      uri: vscode.Uri.file('/test/file.ts'),
      getWordRangeAtPosition: sinon.stub(),
      lineAt: sinon.stub().returns({
        text: 'Line of code',
        range: new vscode.Range(0, 0, 0, 12),
        lineNumber: 0,
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: false,
        rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 13)
      }),
      offsetAt: sinon.stub()
    } as unknown as vscode.TextDocument;
    
    // Create mock editor
    mockEditor = {
      document: mockDocument,
      selection: mockSelection,
      selections: [mockSelection],
      visibleRanges: [],
      viewColumn: vscode.ViewColumn.One,
      edit: sinon.stub().resolves(true),
      insertSnippet: sinon.stub().resolves(true),
      setDecorations: sinon.stub()
    };
    
    // Stub the window.activeTextEditor getter
    sinon.stub(vscode.window, 'activeTextEditor').get(() => mockEditor);
    
    // Create the handler
    selectionHandler = new SelectionHandler();
  });
  
  teardown(() => {
    sinon.restore();
  });
  
  test('should get current selection', () => {
    const result = selectionHandler.getCurrentSelection();
    
    // Check if result is defined before accessing properties
    assert.ok(result, 'Result should be defined');
    assert.strictEqual(result!.text, 'const test = "Selected code";');
    assert.strictEqual(result!.fileName, '/test/file.ts');
    assert.strictEqual(result!.language, 'typescript');
    assert.deepStrictEqual(result!.range, {
      start: { line: 5, character: 10 },
      end: { line: 10, character: 20 }
    });
  });
  
  test('should handle no active editor', () => {
    // Restore and replace the stub to return undefined
    sinon.restore();
    sinon.stub(vscode.window, 'activeTextEditor').get(() => undefined);
    
    const result = selectionHandler.getCurrentSelection();
    
    assert.strictEqual(result, undefined);
  });
  
  test('should handle empty selection', () => {
    // Modify the selection to be empty
    mockSelection.isEmpty = true;
    
    const result = selectionHandler.getCurrentSelection();
    
    assert.strictEqual(result, undefined);
  });
  
  test('should get current file content', () => {
    mockDocument.getText = sinon.stub().returns('Full file content');
    
    const result = selectionHandler.getCurrentFileContent();
    
    // Check if result is defined before accessing properties
    assert.ok(result, 'Result should be defined');
    assert.strictEqual(result!.text, 'Full file content');
    assert.strictEqual(result!.fileName, '/test/file.ts');
    assert.strictEqual(result!.language, 'typescript');
  });
  
  test('should check if there is a selection', () => {
    assert.strictEqual(selectionHandler.hasSelection(), true);
    
    // Modify the selection to be empty
    mockSelection.isEmpty = true;
    
    assert.strictEqual(selectionHandler.hasSelection(), false);
  });
});