# System Patterns: Claude Code VSCode Extension

## Architecture Overview

The extension follows a modular architecture with clear separation of concerns:

```
extension.ts (main entry point)
├── api/
│   └── claudeCodeClient.ts (CLI interaction)
├── ui/
│   └── chatWebviewProvider.ts (UI components)
├── settings.ts (Configuration management)
├── selectionHandler.ts (Code selection utilities)
└── errorHandler.ts (Error management)
```

## Key Design Patterns

### Command Pattern
- VSCode extensions use a command-based architecture
- Commands are registered during activation and executed by the framework
- Commands include: startChat, sendMessage, askAboutSelection, clearConversation, newConversation

### Provider Pattern
- WebviewProvider handles UI rendering and interaction
- Providers are registered with VSCode and supply their UI components

### Observer Pattern
- Event listeners for various VSCode events
- Subscription management for cleanup on deactivation

### Dependency Injection
- Services are instantiated by the extension and injected where needed
- Facilitates testing through mock dependencies

### Child Process Communication
- Bidirectional communication with Claude Code CLI via Node.js child process
- Message passing for queries and responses

## Error Handling Strategy
- Centralized error handling through errorHandler.ts
- Error types are categorized and handled appropriately
- User-facing errors vs. logging errors

## State Management
- Conversation state managed by chatWebviewProvider
- Configuration state managed through settings.ts
- CLI process state managed by claudeCodeClient

## Extension Lifecycle
1. **Activation**: Triggered by registered activation events
2. **Service Initialization**: Setting up providers and clients
3. **Command Registration**: Making extension commands available to VSCode
4. **User Interaction**: Responding to commands and providing UI
5. **Deactivation**: Cleanup of resources and listeners

## Testing Strategy
- Unit tests for individual components
- Integration tests for VSCode API integration
- Extensive mocking of VSCode APIs and external dependencies
- Test isolation to prevent side effects

## Debug Configuration Pattern
- Multiple launch configurations for different debugging scenarios
- Debug-specific tasks in tasks.json
- Support for targeted test debugging

## Coding Standards
- TypeScript with strict type checking
- ESLint for code quality enforcement
- Clear module boundaries and dependencies
- Consistent error handling patterns