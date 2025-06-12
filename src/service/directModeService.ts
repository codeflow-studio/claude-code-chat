import { spawn } from 'child_process';

export interface MessageContext {
  images?: Array<{
    name: string;
    path: string;
    type: string;
  }>;
  selectedProblemIds?: string[];
  filePaths?: string[];
}

export interface DirectModeResponse {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: string;
  message?: any;
  content?: string;
  error?: string;
  metadata?: {
    sessionId?: string;
    cost?: number;
    duration?: number;
    usage?: any;
    tools?: string[];
    model?: string;
    mcpServers?: any[];
  };
}

export class DirectModeService {
  private _responseCallback?: (response: DirectModeResponse) => void;
  private _isActive: boolean = false;
  private _currentSessionId?: string;

  constructor(private _workspaceRoot?: string) {}

  /**
   * Sets the callback function to handle streaming responses
   */
  setResponseCallback(callback: (response: DirectModeResponse) => void) {
    this._responseCallback = callback;
  }

  /**
   * Prepares Direct Mode service for message sending
   * Note: We use claude -p for each message instead of persistent session
   */
  async startSession(_options?: { resume?: string }): Promise<void> {
    // For Direct Mode, we spawn claude -p for each message
    // This is more reliable than trying to maintain a persistent interactive session
    this._isActive = true;
    console.log('Direct Mode service ready (per-message claude -p mode)');
  }

  /**
   * Sends a message to Claude using claude -p with streaming JSON output
   * Each message spawns a separate claude -p process
   */
  async sendMessage(text: string, context?: MessageContext): Promise<void> {
    // Start session if not active
    if (!this._isActive) {
      await this.startSession();
    }

    try {
      // Build the enhanced message with context
      let enhancedMessage = text;

      // Add file paths as @ mentions
      if (context?.filePaths && context.filePaths.length > 0) {
        const fileMentions = context.filePaths.map(path => `@${path}`).join(' ');
        enhancedMessage = `${enhancedMessage} ${fileMentions}`;
      }

      // Add image paths
      if (context?.images && context.images.length > 0) {
        const imagePaths = context.images.map(img => img.path).join(' ');
        enhancedMessage = `${enhancedMessage} ${imagePaths}`;
      }

      // Build claude -p command with streaming JSON
      const args = [
        '-p', enhancedMessage,
        '--output-format', 'stream-json',
        '--verbose'
      ];

      // Add --resume if we have a session ID from previous messages
      if (this._currentSessionId) {
        args.push('--resume', this._currentSessionId);
        console.log('Resuming session with ID:', this._currentSessionId);
      } else {
        console.log('Starting new conversation (no session ID yet)');
      }

      console.log('Spawning claude -p with args:', args);

      // Spawn claude -p process for this specific message
      const claudeProcess = spawn('claude', args, {
        cwd: this._workspaceRoot || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin, capture stdout/stderr
      });

      let partialData = '';

      // Handle process output - capture streaming JSON
      claudeProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('Claude CLI stdout received:', output);
        
        partialData += output;

        // Process complete JSON lines
        const lines = partialData.split('\n');
        partialData = lines.pop() || ''; // Keep incomplete line for next chunk

        for (const line of lines) {
          if (line.trim()) {
            console.log('Processing line:', line);
            try {
              const jsonResponse = JSON.parse(line);
              console.log('Parsed JSON:', jsonResponse);
              this._processJsonResponse(jsonResponse);
            } catch (error) {
              console.error('Failed to parse JSON response:', line, error);
            }
          }
        }
      });

      // Handle process errors
      claudeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('Claude CLI stderr:', data.toString());
        this._handleError(`CLI Error: ${data.toString()}`);
      });

      // Handle process exit
      claudeProcess.on('exit', (code: number | null) => {
        console.log(`Claude CLI process exited with code ${code}`);
        if (code !== 0) {
          this._handleError(`Claude CLI exited with code ${code}`);
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        console.error('Claude CLI process error:', error);
        this._handleError(`Failed to start Claude CLI: ${error.message}`);
      });

      console.log('Message sent to Claude CLI (claude -p mode):', enhancedMessage);

    } catch (error) {
      console.error('Error sending message:', error);
      this._handleError(`Failed to send message: ${error}`);
    }
  }

  /**
   * Stops the current direct mode session
   */
  stop(): void {
    this._isActive = false;
    this._currentSessionId = undefined; // Clear session ID
    console.log('Direct Mode service stopped (session cleared)');
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this._currentSessionId;
  }

  /**
   * Checks if the service is currently active
   */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Processes a parsed JSON response from Claude CLI
   */
  private _processJsonResponse(jsonResponse: any): void {
    try {
      // Extract session ID from all responses that have it
      if (jsonResponse.session_id) {
        this._currentSessionId = jsonResponse.session_id;
        console.log(`Session ID captured from ${jsonResponse.type} response:`, this._currentSessionId);
      }

      // Process different response types
      const responseType = jsonResponse.type as 'system' | 'assistant' | 'user' | 'result';
      
      switch (responseType) {
        case 'system':
          this._handleSystemResponse(jsonResponse);
          break;
        case 'assistant':
          this._handleAssistantResponse(jsonResponse);
          break;
        case 'user':
          this._handleUserResponse(jsonResponse);
          break;
        case 'result':
          this._handleResultResponse(jsonResponse);
          break;
        default:
          console.warn('Unknown response type:', jsonResponse.type);
          this._handleGenericResponse(jsonResponse);
      }

    } catch (error) {
      console.error('Error processing JSON response:', error);
      this._handleError(`Response processing error: ${error}`);
    }
  }

  /**
   * Handles system type responses (initialization, configuration)
   */
  private _handleSystemResponse(jsonResponse: any): void {
    const content = this._extractSystemContent(jsonResponse);
    
    if (this._responseCallback) {
      this._responseCallback({
        type: 'system',
        subtype: jsonResponse.subtype,
        content: content,
        metadata: {
          sessionId: jsonResponse.session_id,
          tools: jsonResponse.tools,
          model: jsonResponse.model,
          mcpServers: jsonResponse.mcp_servers
        }
      });
    }
  }

  /**
   * Handles assistant type responses (Claude's messages and tool usage)
   */
  private _handleAssistantResponse(jsonResponse: any): void {
    const content = this._extractAssistantContent(jsonResponse);
    
    if (this._responseCallback) {
      this._responseCallback({
        type: 'assistant',
        subtype: jsonResponse.subtype,
        message: jsonResponse.message,
        content: content,
        metadata: {
          sessionId: jsonResponse.session_id,
          usage: jsonResponse.message?.usage
        }
      });
    }
  }

  /**
   * Handles user type responses (tool results)
   */
  private _handleUserResponse(jsonResponse: any): void {
    const content = this._extractUserContent(jsonResponse);
    
    if (this._responseCallback) {
      this._responseCallback({
        type: 'user',
        subtype: jsonResponse.subtype,
        message: jsonResponse.message,
        content: content,
        metadata: {
          sessionId: jsonResponse.session_id
        }
      });
    }
  }

  /**
   * Handles result type responses (final summary)
   */
  private _handleResultResponse(jsonResponse: any): void {
    if (this._responseCallback) {
      this._responseCallback({
        type: 'result',
        subtype: jsonResponse.subtype,
        content: jsonResponse.result,
        metadata: {
          sessionId: jsonResponse.session_id,
          cost: jsonResponse.cost_usd,
          duration: jsonResponse.duration_ms,
          usage: jsonResponse.usage
        }
      });
    }
  }

  /**
   * Handles unknown response types
   */
  private _handleGenericResponse(jsonResponse: any): void {
    if (this._responseCallback) {
      this._responseCallback({
        type: jsonResponse.type || 'assistant',
        subtype: jsonResponse.subtype,
        message: jsonResponse.message,
        content: this._extractContent(jsonResponse),
        metadata: {
          sessionId: jsonResponse.session_id
        }
      });
    }
  }

  /**
   * Extracts content from system responses
   */
  private _extractSystemContent(jsonResponse: any): string | undefined {
    if (jsonResponse.subtype === 'init') {
      const parts: string[] = [];
      
      if (jsonResponse.model) {
        parts.push(`Model: ${jsonResponse.model}`);
      }
      
      if (jsonResponse.tools && jsonResponse.tools.length > 0) {
        parts.push(`Available tools: ${jsonResponse.tools.length}`);
      }
      
      if (jsonResponse.mcp_servers && jsonResponse.mcp_servers.length > 0) {
        const connectedServers = jsonResponse.mcp_servers
          .filter((server: any) => server.status === 'connected')
          .map((server: any) => server.name)
          .join(', ');
        if (connectedServers) {
          parts.push(`MCP servers: ${connectedServers}`);
        }
      }
      
      return parts.length > 0 ? `Session initialized\n${parts.join('\n')}` : 'Session initialized';
    }
    
    return jsonResponse.content || 'System message';
  }

  /**
   * Extracts content from assistant responses
   */
  private _extractAssistantContent(jsonResponse: any): string | undefined {
    if (jsonResponse.message?.content) {
      if (Array.isArray(jsonResponse.message.content)) {
        const contentParts: string[] = [];
        
        jsonResponse.message.content.forEach((item: any) => {
          if (item.type === 'text' && item.text) {
            contentParts.push(item.text);
          } else if (item.type === 'tool_use') {
            const toolName = item.name || 'unknown';
            const input = item.input ? ` (${Object.keys(item.input).join(', ')})` : '';
            contentParts.push(`🔧 Using tool: ${toolName}${input}`);
          }
        });
        
        return contentParts.length > 0 ? contentParts.join('\n') : undefined;
      }
      
      if (typeof jsonResponse.message.content === 'string') {
        return jsonResponse.message.content;
      }
    }
    
    return undefined;
  }

  /**
   * Extracts content from user responses (tool results)
   */
  private _extractUserContent(jsonResponse: any): string | undefined {
    if (jsonResponse.message?.content && Array.isArray(jsonResponse.message.content)) {
      const toolResults: string[] = [];
      
      jsonResponse.message.content.forEach((item: any) => {
        if (item.type === 'tool_result') {
          const toolId = item.tool_use_id;
          let content = item.content;
          
          // Truncate very long tool results for better display
          if (typeof content === 'string' && content.length > 500) {
            content = content.substring(0, 500) + '...[truncated]';
          }
          
          toolResults.push(`📊 Tool result${toolId ? ` (${toolId.slice(-8)})` : ''}:\n${content}`);
        }
      });
      
      return toolResults.length > 0 ? toolResults.join('\n\n') : undefined;
    }
    
    return undefined;
  }

  /**
   * Extracts content from various response formats (fallback)
   */
  private _extractContent(jsonResponse: any): string | undefined {
    // Try specific extractors first
    switch (jsonResponse.type) {
      case 'system':
        return this._extractSystemContent(jsonResponse);
      case 'assistant':
        return this._extractAssistantContent(jsonResponse);
      case 'user':
        return this._extractUserContent(jsonResponse);
      case 'result':
        return jsonResponse.result;
    }

    // Fallback for unknown types
    if (typeof jsonResponse.content === 'string') {
      return jsonResponse.content;
    }

    if (typeof jsonResponse.result === 'string') {
      return jsonResponse.result;
    }

    return undefined;
  }

  /**
   * Handles errors and notifies via callback
   */
  private _handleError(error: string): void {
    console.error('DirectModeService error:', error);
    if (this._responseCallback) {
      this._responseCallback({
        type: 'error',
        error: error
      });
    }
  }
}