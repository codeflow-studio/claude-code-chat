# Technical Context: Claude Code VSCode Extension

## Technology Stack
- **Language**: TypeScript
- **Platform**: Visual Studio Code Extension API
- **Testing**: Mocha, Sinon (for mocking)
- **Linting**: ESLint with TypeScript configuration
- **Build Tool**: TypeScript compiler (tsc)

## Development Environment
- **IDE**: Visual Studio Code
- **Node.js**: Required for extension development
- **Package Manager**: npm
- **Source Control**: Git

## Key Dependencies
- **@types/glob**: Type definitions for glob pattern matching
- **@types/mocha**: Type definitions for Mocha testing framework
- **@types/node**: Type definitions for Node.js
- **@types/sinon**: Type definitions for Sinon testing library
- **@types/vscode**: Type definitions for VSCode Extension API
- **@typescript-eslint**: ESLint support for TypeScript
- **mocha**: Testing framework
- **sinon**: Test spies, stubs and mocks
- **typescript**: TypeScript language and compiler
- **vscode-test**: Testing utilities for VSCode extensions

## Extension Architecture
- **Main Extension Module**: `./out/extension.js` (compiled from TypeScript)
- **Activation Events**: Various commands (startChat, sendMessage, askAboutSelection, etc.)
- **API Integration**: Claude Code CLI integration via child process
- **UI Components**: Chat webview, sidebar view

## Building and Packaging
- **Compilation**: TypeScript to JavaScript using `tsc`
- **Watch Mode**: Available for development with `npm run watch`
- **Packaging**: VSCode extension packaging process

## Testing Strategy
- **Unit Tests**: For individual components and utilities
- **Integration Tests**: For VSCode API integration
- **Mock Objects**: Extensive use of Sinon for mocking VS Code APIs
- **Test Runner**: Mocha with custom runner for VSCode environment

## Debug Configuration
- **Three debug configurations**:
  - `Run Extension`: Launches a new VSCode window with the extension
  - `Extension Tests`: Runs all tests
  - `Debug Specific Test File`: Runs specific tests with a grep pattern

## Deployment Targets
- **VS Code Marketplace**: Future publishing destination
- **Internal Distribution**: Current approach

## Known Technical Constraints
- VSCode Extension API limitations
- Process communication with Claude Code CLI
- Extension activation and lifecycle management
- WebView and VS Code UI integration challenges

## Development Commands
- `npm run compile`: Compile TypeScript
- `npm run watch`: Watch and compile on changes
- `npm run lint`: Run ESLint
- `npm run test`: Run tests (after compilation and linting)
- `npm run vscode:prepublish`: Prepare for publishing