# Hot Reload System for Claude Code VSCode Extension

This document describes the comprehensive hot reload system implemented for the Claude Code VSCode Extension, providing instant feedback during development with state preservation.

## Overview

The hot reload system consists of three main components:

1. **Frontend Hot Module Replacement (HMR)** - Live reloading of JavaScript modules in the webview
2. **Backend Service Hot-Swapping** - Dynamic reloading of TypeScript services with state preservation  
3. **Development Workflow Integration** - Enhanced build tasks and debugging configurations

## Features

### ✨ Frontend Hot Reload
- **Module Hot Replacement**: Instant updates to JavaScript modules without page refresh
- **State Preservation**: Maintains form inputs, UI state, and conversation history during reloads
- **Error Boundaries**: Graceful error handling with visual feedback
- **CSS Hot Reload**: Live CSS updates without full page refresh
- **Visual Notifications**: Success/error indicators for reload status

### ⚡ Backend Hot Reload  
- **Service Hot-Swapping**: Dynamic reloading of TypeScript services without extension restart
- **State Migration**: Preserves critical service state across reloads
- **Process Preservation**: Maintains Claude CLI connections during backend updates
- **Dependency Injection**: Clean service reinitialization with preserved dependencies

### 🛠️ Development Workflow
- **Enhanced Build Tasks**: Specialized tasks for hot reload development
- **Debug Configurations**: Multiple debugging setups for different scenarios
- **Performance Optimizations**: Faster compilation and efficient file watching
- **Error Reporting**: Comprehensive error handling and reporting

## Getting Started

### Prerequisites

Install the required development dependencies:

```bash
npm install
```

### Development Scripts

#### Hot Reload Development
```bash
# Start backend hot reload with file watching
npm run dev

# Start frontend hot reload server (optional)
npm run dev:hot
```

#### VSCode Tasks
- **Hot Reload Development**: `Ctrl+Shift+P` → "Tasks: Run Task" → "Hot Reload Development"
- **Run Extension with Hot Reload**: `Ctrl+Shift+P` → "Tasks: Run Task" → "Run Extension with Hot Reload"
- **Full Rebuild with Hot Reload**: Clean build followed by hot reload setup

#### Debug Configurations
- **Run Extension (Hot Reload)**: Standard extension debugging with hot reload enabled
- **Debug Frontend (Hot Reload)**: Chrome debugging for webview components
- **Full Stack Debug (Hot Reload)**: Simultaneous backend and frontend debugging
- **Debug Full Stack with Hot Reload** (Compound): Launches both configurations together

## How It Works

### Frontend Hot Reload

The frontend hot reload system uses a combination of webpack HMR and custom module management:

```javascript
// Hot reload manager automatically detects changes
import hotReloadManager from './modules/hotReload.js';

// Modules are automatically reloaded with state preservation
hotReloadManager.addUpdateListener((modulePath, updatedModule) => {
  // Reinitialize affected components
  this.handleModuleReload(modulePath, updatedModule);
});
```

#### State Preservation
- Form inputs and cursor positions
- UI mode state (Terminal/Direct)
- Conversation history
- Pending operations and images

### Backend Hot Reload

The backend system watches TypeScript service files and performs intelligent reloading:

```typescript
// Services are automatically registered for hot reload
hotReloadService.registerService('directModeService', directModeServiceInstance);

// State is preserved across reloads
await hotReloadService.saveServiceState('directModeService');
await hotReloadService.reloadService('directModeService.ts');
await hotReloadService.restoreServiceState('directModeService');
```

#### Supported Services
- `DirectModeService` - Main coordination service
- `PermissionService` - Tool permission management
- `ProcessManager` - Claude CLI process lifecycle
- `MessageProcessor` - Message processing and analysis

## Configuration

### Environment Variables

```bash
# Enable hot reload features
NODE_ENV=development
HOT_RELOAD=true

# Enable debug logging
DEBUG=claude-code-extension:*
```

### Webpack Configuration

The system uses different webpack configurations for development and production:

- **webpack.config.js** - Adaptive configuration based on mode
- **webpack.dev.js** - Specialized development configuration with HMR

### File Watching

Hot reload watches these file patterns:
- `src/**/*.ts` - Backend TypeScript files
- `media/js/**/*.js` - Frontend JavaScript modules
- `media/css/**/*.css` - Stylesheets

Excluded from watching:
- `node_modules/`
- `dist/`, `out/`
- `.git/`, `.vscode/`
- `test/`

## Usage Examples

### Basic Development Workflow

1. **Start Hot Reload Development**:
   ```bash
   npm run dev
   ```

2. **Launch Extension with Hot Reload**:
   - Press `F5` or use "Run Extension (Hot Reload)" debug configuration
   - Or use Command Palette: "Tasks: Run Task" → "Run Extension with Hot Reload"

3. **Make Changes**:
   - Edit any TypeScript service file → Backend automatically reloads
   - Edit any JavaScript module → Frontend automatically updates
   - Edit CSS files → Styles update instantly

4. **Observe State Preservation**:
   - Type in the input field → Text preserved during reloads
   - Start a conversation → History maintained across updates
   - Change modes → UI state preserved

### Debugging with Hot Reload

1. **Full Stack Debugging**:
   - Use "Debug Full Stack with Hot Reload" compound configuration
   - Set breakpoints in both backend services and frontend modules
   - Changes trigger reload while preserving debug session

2. **Frontend-Only Debugging**:
   - Use "Debug Frontend (Hot Reload)" configuration
   - Open Chrome DevTools at `http://localhost:3001`
   - Debug webview JavaScript with full source maps

### Manual Reload Triggers

For manual control over reloading:

```typescript
// Trigger specific service reload
await hotReloadService.triggerReload('directModeService');

// Trigger frontend module reload
hotReloadManager.handleModuleUpdate('./modules/messageHandler.js');
```

## Performance Considerations

### Build Performance
- **Development**: Faster compilation with `transpileOnly: true`
- **File System Cache**: Webpack filesystem caching for improved rebuild speeds
- **Incremental Compilation**: Only recompiles changed files
- **Source Maps**: Optimized source maps for debugging (`eval-source-map`)

### Runtime Performance
- **State Preservation**: Minimal serialization overhead
- **Module Isolation**: Clean module boundaries prevent memory leaks
- **Error Boundaries**: Failed reloads don't crash the application

### Resource Usage
- **File Watching**: Efficient polling with intelligent ignore patterns
- **Memory Management**: Automatic cleanup of old module references
- **Process Management**: Claude CLI processes preserved across backend reloads

## Troubleshooting

### Common Issues

#### Hot Reload Not Working
```bash
# Check if development dependencies are installed
npm list chokidar nodemon webpack-dev-server

# Verify environment variables
echo $NODE_ENV $HOT_RELOAD

# Check file permissions
ls -la src/ media/js/
```

#### Frontend Modules Not Reloading
- Ensure import paths use `.js` extensions
- Check browser console for module loading errors
- Verify webpack dev server is running on port 3001

#### Backend Services Not Hot-Swapping
- Check that services are registered with `hotReloadService.registerService()`
- Verify TypeScript compilation is successful
- Look for circular dependency issues

#### State Not Preserved
- Check console for state preservation errors
- Verify state serialization/deserialization logic
- Ensure DOM elements exist before state restoration

### Debug Logging

Enable detailed logging:

```bash
# Full debug output
DEBUG=claude-code-extension:* npm run dev

# Hot reload specific logs
DEBUG=claude-code-extension:hotreload npm run dev
```

### Performance Issues

Monitor hot reload performance:

```javascript
// Frontend performance monitoring
console.time('Hot Reload');
hotReloadManager.handleModuleUpdate(modulePath);
console.timeEnd('Hot Reload');

// Backend performance monitoring
console.time('Service Reload');
await hotReloadService.reloadService(serviceName);
console.timeEnd('Service Reload');
```

## Advanced Usage

### Custom Module Reinitialization

Add custom reinitialization logic for specific modules:

```javascript
// In main.js
handleModuleReload(modulePath, updatedModule) {
  if (modulePath.includes('customModule')) {
    // Custom reinitialization logic
    this.reinitializeCustomModule(updatedModule);
  }
}
```

### State Migration Hooks

Implement custom state migration for services:

```typescript
// In hotReloadService.ts
private async saveServiceState(fileName: string): Promise<void> {
  const serviceName = this.getServiceName(fileName);
  
  if (serviceName === 'customService') {
    // Custom state saving logic
    const customState = this.extractCustomState(serviceInstance);
    this.stateStore.set(serviceName, customState);
  }
}
```

### Custom File Watchers

Add additional file patterns to watch:

```typescript
// In hotReloadService.ts
const additionalFiles = [
  'config/*.json',
  'templates/*.html',
  'schemas/*.ts'
];

additionalFiles.forEach(pattern => {
  this.watchFilePattern(pattern);
});
```

## Best Practices

### Development Workflow
1. **Always use hot reload during development** - Significantly faster iteration
2. **Test state preservation** - Ensure critical state survives reloads
3. **Monitor performance impact** - Watch for memory leaks or slow reloads
4. **Use proper debug configurations** - Leverage the enhanced debugging setups

### Code Organization
1. **Keep modules small and focused** - Easier to reload and debug
2. **Minimize cross-module dependencies** - Reduces reload complexity
3. **Use proper error boundaries** - Prevent failed reloads from crashing the app
4. **Document state requirements** - Clear about what state needs preservation

### Testing
1. **Test both hot and cold starts** - Ensure functionality works in both scenarios
2. **Verify state preservation** - Critical for user experience
3. **Test error scenarios** - Ensure graceful degradation when reloads fail
4. **Performance testing** - Monitor reload times and resource usage

## Technical Details

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Hot Reload System                       │
├─────────────────────────────────────────────────────────────┤
│  Frontend (JavaScript)          │  Backend (TypeScript)     │
│  ├─ HotReloadManager            │  ├─ HotReloadService       │
│  ├─ Module Cache                │  ├─ Service Registry       │
│  ├─ State Store                 │  ├─ State Store            │
│  └─ Visual Notifications        │  └─ File Watchers          │
├─────────────────────────────────────────────────────────────┤
│                    Build System                             │
│  ├─ Webpack (Development)       │  ├─ TypeScript Compiler   │
│  ├─ HMR Plugin                  │  ├─ File System Cache     │
│  ├─ Source Maps                 │  └─ Watch Mode            │
│  └─ Dev Server                  │                            │
├─────────────────────────────────────────────────────────────┤
│                 VSCode Integration                          │
│  ├─ Debug Configurations        │  ├─ Task Definitions      │
│  ├─ Compound Launches           │  ├─ Problem Matchers      │
│  └─ Environment Variables       │  └─ Build Tasks           │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
claude-code-extension/
├── webpack.config.js              # Adaptive webpack configuration
├── webpack.dev.js                 # Development-specific webpack config
├── package.json                   # Enhanced scripts and dev dependencies
├── .vscode/
│   ├── tasks.json                 # Hot reload tasks
│   └── launch.json                # Debug configurations
├── src/service/
│   └── hotReloadService.ts        # Backend hot reload service
└── media/js/modules/
    └── hotReload.js               # Frontend hot reload manager
```

This hot reload system significantly improves the development experience while maintaining the robust, modular architecture of the Claude Code VSCode Extension.