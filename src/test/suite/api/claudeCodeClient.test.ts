import * as assert from 'assert';
import * as sinon from 'sinon';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { ClaudeCodeClient } from '../../../api/claudeCodeClient';

import * as stream from 'stream';

// Create a more complete mock of the ChildProcess interface
interface MockChildProcess extends EventEmitter {
  // Core properties that our tests use
  kill: sinon.SinonStub;
  stdin: stream.Writable | null;
  stdout: stream.Readable | null;
  stderr: stream.Readable | null;
  
  // Additional properties required by the ChildProcess interface
  pid: number;
  connected: boolean;
  stdio: any[];
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;
  spawnargs: string[];
  spawnfile: string;
  disconnect(): boolean;
  unref(): void;
  ref(): void;
  send(message: any, callback?: (error: Error | null) => void): boolean;
  send(message: any, sendHandle?: any, options?: object, callback?: (error: Error | null) => void): boolean;
}

suite('ClaudeCodeClient Test Suite', () => {
  let client: ClaudeCodeClient;
  let execStub: sinon.SinonStub;
  let spawnStub: sinon.SinonStub;
  let mockChildProcess: MockChildProcess;

  setup(() => {
    client = new ClaudeCodeClient();
    
    // Create a properly typed mock child process
    const emitter = new EventEmitter();
    mockChildProcess = emitter as MockChildProcess;
    
    // Add all required properties and methods to make it match the ChildProcess interface
    mockChildProcess.kill = sinon.stub();
    
    // Create proper streams for stdin, stdout, stderr
    const mockStdin = new stream.Writable({
      write: (_chunk, _encoding, callback) => {
        if (callback) callback();
        return true;
      }
    });
    mockStdin.write = sinon.stub().returns(true);
    
    const mockStdout = new stream.Readable({
      read() { /* no-op */ }
    });
    
    const mockStderr = new stream.Readable({
      read() { /* no-op */ }
    });
    
    mockChildProcess.stdin = mockStdin;
    mockChildProcess.stdout = mockStdout;
    mockChildProcess.stderr = mockStderr;
    
    // Add the additional required properties
    mockChildProcess.pid = 12345;
    mockChildProcess.connected = true;
    mockChildProcess.killed = false;
    mockChildProcess.exitCode = null;
    mockChildProcess.signalCode = null;
    mockChildProcess.spawnargs = ['cmd', '--arg1', '--arg2'];
    mockChildProcess.spawnfile = 'cmd';
    mockChildProcess.stdio = [mockStdin, mockStdout, mockStderr, null, null] as any[];
    mockChildProcess.disconnect = sinon.stub().returns(true);
    mockChildProcess.unref = sinon.stub();
    mockChildProcess.ref = sinon.stub();
    mockChildProcess.send = sinon.stub().returns(true);

    execStub = sinon.stub(child_process, 'exec');
    spawnStub = sinon.stub(child_process, 'spawn').returns(mockChildProcess as unknown as child_process.ChildProcess);
  });

  teardown(() => {
    execStub.restore();
    spawnStub.restore();
  });

  test('should check if Claude Code is installed', async () => {
    // Mock successful installation
    execStub.callsFake((_cmd, callback) => {
      callback(null, '', '');
      return {} as any;
    });

    await client.start();
    
    // Check that the correct command was used based on platform
    const expectedCommand = process.platform === 'win32' ? 'where claude-code' : 'which claude-code';
    assert.strictEqual(execStub.calledWith(expectedCommand), true);
  });

  test('should start Claude Code process if installed', async () => {
    // Mock successful installation
    execStub.callsFake((_cmd, callback) => {
      callback(null, '', '');
      return {} as any;
    });

    const result = await client.start();
    assert.strictEqual(result, true);
    assert.strictEqual(spawnStub.calledWith('claude-code', ['--headless', '--json-output']), true);
    assert.strictEqual(client.isActive(), true);
  });

  test('should handle Claude Code process exit', async () => {
    // Mock successful installation
    execStub.callsFake((_cmd, callback) => {
      callback(null, '', '');
      return {} as any;
    });

    await client.start();
    mockChildProcess.emit('exit', 0);
    assert.strictEqual(client.isActive(), false);
  });

  test('should not start if Claude Code is not installed', async () => {
    // Mock installation failure
    execStub.callsFake((_cmd, callback) => {
      callback(new Error('Command not found'), '', '');
      return {} as any;
    });

    const result = await client.start();
    assert.strictEqual(result, false);
    assert.strictEqual(spawnStub.called, false);
    assert.strictEqual(client.isActive(), false);
  });

  test('should send message and update conversation context', async () => {
    const message = 'Hello Claude Code';
    const response = await client.sendMessage(message);
    
    // Check response
    assert.strictEqual(response.message.includes('Hello Claude Code'), true);
    
    // Check conversation context
    const context = client.getConversationContext();
    assert.strictEqual(context.messages.length, 2);
    assert.strictEqual(context.messages[0].role, 'user');
    assert.strictEqual(context.messages[0].content, message);
    assert.strictEqual(context.messages[1].role, 'assistant');
    assert.strictEqual(context.messages[1].content, response.message);
  });

  test('should clear conversation context', async () => {
    // Add some messages
    await client.sendMessage('Hello');
    await client.sendMessage('How are you?');
    
    // Check context has messages
    let context = client.getConversationContext();
    assert.strictEqual(context.messages.length > 0, true);
    
    // Clear context
    client.clearConversationContext();
    
    // Check context is empty
    context = client.getConversationContext();
    assert.strictEqual(context.messages.length, 0);
  });

  test('should stop Claude Code process', async () => {
    // Mock successful installation
    execStub.callsFake((_cmd, callback) => {
      callback(null, '', '');
      return {} as any;
    });

    await client.start();
    client.stop();
    assert.strictEqual(mockChildProcess.kill.called, true);
    assert.strictEqual(client.isActive(), false);
  });
});