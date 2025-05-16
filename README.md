# Claude Code Assistant for VSCode

A VSCode extension that integrates Anthropic's Claude Code command-line AI coding assistant directly into Visual Studio Code.

## Features

- Seamless integration of Claude Code into VSCode
- Dedicated chat panel in the sidebar
- Maintain persistent Claude Code sessions
- Context-aware interactions with your workspace

## Prerequisites

- VSCode 1.70.0 or newer
- Claude Code CLI installed on your system
- Authentication with Anthropic services

## Building the Extension

To build the extension, follow these steps:

1. Install dependencies:
   ```
   npm install
   ```

2. Build the extension:
   ```
   npm run build
   ```

This will generate a .vsix file in the project root directory.

## Installing the Extension

### From the VSIX file

1. Open VSCode
2. Go to the Extensions view
3. Click the "..." menu (top-right of Extensions view)
4. Select "Install from VSIX..."
5. Browse to the .vsix file generated in the build step
6. Select the file and click "Install"

### From the Command Line

You can also install the extension using the VSCode CLI:

```
code --install-extension claude-code-extension-0.0.1.vsix
```

## Development

- `npm run compile` - Compile the extension
- `npm run watch` - Watch for changes and recompile
- `npm run package` - Package the extension for production (webpack)
- `npm run lint` - Run ESLint on source files
- `npm run test` - Run tests
- `npm run vsix` - Create VSIX package for installation

## License

[Add license information here]