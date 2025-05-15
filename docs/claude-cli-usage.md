# Claude CLI Usage Guide

This document provides information about using the Claude CLI, specifically focusing on print mode which will be utilized in our VSCode extension.

## Print Mode Overview

Print mode enables non-interactive, programmatic usage of Claude Code. Instead of starting an interactive session, Claude will process the input and return the response directly, making it ideal for integration with other applications like our VSCode extension.

### Basic Usage

Print mode is enabled with the `-p` or `--print` flag:

```bash
claude -p "What is the capital of France?"
```

You can also pipe input through stdin:

```bash
echo "What is the capital of France?" | claude -p
```

### Output Formats

Claude CLI's print mode supports different output formats:

1. **Text (default)**: Returns only the response text
   ```bash
   claude -p "Explain recursion"
   ```

2. **JSON**: Returns structured data including cost, duration, session ID, and response
   ```bash
   claude -p --output-format json "Explain recursion"
   ```

3. **Streaming JSON**: Returns separate JSON objects for each step
   ```bash
   claude -p --output-format streaming-json "Explain recursion"
   ```

### Additional Options

Print mode can be combined with other Claude CLI options:

- `--max-turns`: Limit the number of agentic turns
  ```bash
  claude -p --max-turns 3 "Solve this problem step by step"
  ```

- `--verbose`: Enable detailed logging
  ```bash
  claude -p --verbose "Debug this code"
  ```

- `--permission-prompt-tool`: Control permission handling
  ```bash
  claude -p --permission-prompt-tool never "Execute this command"
  ```

- `--resume`: Continue a specific session
  ```bash
  claude -p --resume session_id "Continue from previous point"
  ```

## Integration Pattern for VSCode Extension

For our VSCode extension, we'll use the following pattern:

1. Spawn a Claude CLI process with print mode and JSON output format
2. Send the user's query as input
3. Capture and parse the JSON response
4. Display the response in the extension UI

Example implementation pattern:

```typescript
import { spawn } from 'child_process';

function executeClaudeCommand(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const claudeProcess = spawn('claude', ['-p', '--output-format', 'json']);
    let output = '';
    
    claudeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claudeProcess.stderr.on('data', (data) => {
      console.error(`Claude CLI error: ${data}`);
    });
    
    claudeProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Claude output: ${error}`));
        }
      } else {
        reject(new Error(`Claude process exited with code ${code}`));
      }
    });
    
    claudeProcess.stdin.write(query);
    claudeProcess.stdin.end();
  });
}
```

## Benefits of Print Mode for VSCode Extension

1. **Simplicity**: No need to maintain an interactive session
2. **Reliability**: Each request is independent, reducing state management complexity
3. **Structured data**: JSON output provides clear structure for parsing
4. **Error handling**: Better isolation of failures
5. **Resource efficiency**: Processes terminate after completion

## Limitations

1. No persistent context between requests unless using the `--resume` flag
2. Each request spawns a new process, which may have performance implications
3. Authentication needs to be handled for each request

## Best Practices

1. Use JSON output format for predictable parsing
2. Include error handling for process failures
3. Consider implementing a lightweight caching mechanism for recent responses
4. Monitor process resource usage
5. Provide clear feedback to users during processing

---

For more detailed information, refer to the [official Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code/cli-usage).