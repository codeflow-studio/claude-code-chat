/**
 * Hot Reload System for Claude Code Extension Frontend
 * Provides module hot reloading capabilities with state preservation
 */

class HotReloadManager {
  constructor() {
    this.moduleCache = new Map();
    this.stateStore = new Map();
    this.listeners = new Set();
    
    // Safe environment check for browser context
    // In VSCode webviews, process.env is not available, so check safely
    this.isEnabled = this.checkHotReloadEnabled();
    
    if (this.isEnabled) {
      try {
        this.setupHotReload();
      } catch (error) {
        console.warn('Hot reload setup failed, continuing without hot reload:', error);
        this.isEnabled = false;
      }
    }
  }

  /**
   * Safely check if hot reload is enabled
   */
  checkHotReloadEnabled() {
    try {
      // Check if we're in a development environment
      // This will work in both Node.js and browser contexts
      return (typeof process !== 'undefined' && 
              process.env && 
              process.env.HOT_RELOAD === 'true') ||
             (typeof window !== 'undefined' && 
              window.HOT_RELOAD_ENABLED === true);
    } catch (error) {
      // If any error occurs, default to disabled
      console.log('Hot reload environment check failed, disabling hot reload');
      return false;
    }
  }

  /**
   * Setup hot reload infrastructure
   */
  setupHotReload() {
    // Enable webpack HMR if available (safe check for browser environment)
    if (typeof module !== 'undefined' && module.hot) {
      module.hot.accept();
      
      // Listen for updates to all frontend modules
      const modulePatterns = [
        './messageHandler.js',
        './contextMenu.js',
        './slashCommands.js',
        './dragAndDrop.js',
        './modeManager.js',
        './uiManager.js',
        './utils.js',
        './messageFormatter.js',
        './toolFormatter.js',
        './eventHandlers.js',
        './permissionDialog.js',
        './toolExecutionHandler.js',
        './taskWorkflowHandler.js'
      ];

      modulePatterns.forEach(pattern => {
        module.hot.accept(pattern, () => {
          this.handleModuleUpdate(pattern);
        });
      });

      // Handle full reload if needed
      module.hot.dispose((data) => {
        this.saveState(data);
      });
    }

    // Setup manual reload detection for development
    this.setupManualReloadDetection();
  }

  /**
   * Setup manual reload detection using file timestamps
   */
  setupManualReloadDetection() {
    if (!this.isEnabled) return;

    this.lastCheck = Date.now();
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, 1000); // Check every second
  }

  /**
   * Check for file updates manually
   */
  async checkForUpdates() {
    try {
      // Send request to extension to check file timestamps
      if (window.vscode) {
        window.vscode.postMessage({
          command: 'checkForUpdates',
          timestamp: this.lastCheck
        });
      }
    } catch (error) {
      console.warn('Hot reload: Failed to check for updates', error);
    }
  }

  /**
   * Handle module update
   */
  async handleModuleUpdate(modulePath) {
    console.log(`🔥 Hot reloading module: ${modulePath}`);
    
    try {
      // Save current state
      this.preserveApplicationState();
      
      // Clear module from cache
      this.clearModuleCache(modulePath);
      
      // Reimport the module
      const updatedModule = await this.reimportModule(modulePath);
      
      // Update module cache
      this.moduleCache.set(modulePath, updatedModule);
      
      // Notify listeners about the update
      this.notifyListeners(modulePath, updatedModule);
      
      // Restore state
      this.restoreApplicationState();
      
      console.log(`✅ Hot reload completed for: ${modulePath}`);
      
      // Show visual feedback
      this.showReloadNotification(modulePath);
      
    } catch (error) {
      console.error(`❌ Hot reload failed for ${modulePath}:`, error);
      this.showErrorNotification(modulePath, error);
    }
  }

  /**
   * Preserve application state before reload
   */
  preserveApplicationState() {
    try {
      // Save form state
      const inputElement = document.querySelector('textarea#messageInput');
      if (inputElement) {
        this.stateStore.set('inputValue', inputElement.value);
        this.stateStore.set('cursorPosition', inputElement.selectionStart);
      }

      // Save UI state
      const isDirectMode = window.claudeCodeUI?.getIsDirectMode?.();
      if (isDirectMode !== undefined) {
        this.stateStore.set('isDirectMode', isDirectMode);
      }

      // Save conversation history
      const messageContainer = document.querySelector('.message-container');
      if (messageContainer) {
        this.stateStore.set('conversationHTML', messageContainer.innerHTML);
      }

      // Save pending operations
      if (window.claudeCodeUI) {
        this.stateStore.set('pendingImages', window.claudeCodeUI.pendingImages || []);
        this.stateStore.set('pendingProblems', window.claudeCodeUI.pendingProblems || []);
      }

      console.log('🔄 Application state preserved for hot reload');
    } catch (error) {
      console.warn('Failed to preserve application state:', error);
    }
  }

  /**
   * Restore application state after reload
   */
  restoreApplicationState() {
    try {
      // Restore form state
      const inputValue = this.stateStore.get('inputValue');
      const cursorPosition = this.stateStore.get('cursorPosition');
      
      if (inputValue !== undefined) {
        const inputElement = document.querySelector('textarea#messageInput');
        if (inputElement) {
          inputElement.value = inputValue;
          if (cursorPosition !== undefined) {
            inputElement.setSelectionRange(cursorPosition, cursorPosition);
          }
        }
      }

      // Restore UI state
      const isDirectMode = this.stateStore.get('isDirectMode');
      if (isDirectMode !== undefined && window.claudeCodeUI?.setDirectMode) {
        window.claudeCodeUI.setDirectMode(isDirectMode);
      }

      // Restore conversation (if needed)
      const conversationHTML = this.stateStore.get('conversationHTML');
      if (conversationHTML) {
        const messageContainer = document.querySelector('.message-container');
        if (messageContainer && messageContainer.innerHTML.trim() === '') {
          messageContainer.innerHTML = conversationHTML;
        }
      }

      // Restore pending operations
      if (window.claudeCodeUI) {
        const pendingImages = this.stateStore.get('pendingImages');
        const pendingProblems = this.stateStore.get('pendingProblems');
        
        if (pendingImages) {
          window.claudeCodeUI.pendingImages = pendingImages;
        }
        if (pendingProblems) {
          window.claudeCodeUI.pendingProblems = pendingProblems;
        }
      }

      console.log('🔄 Application state restored after hot reload');
    } catch (error) {
      console.warn('Failed to restore application state:', error);
    }
  }

  /**
   * Clear module from cache
   */
  clearModuleCache(modulePath) {
    // Clear from our cache
    this.moduleCache.delete(modulePath);
    
    // Clear from browser module cache if possible
    if (typeof require !== 'undefined' && require.cache) {
      Object.keys(require.cache).forEach(key => {
        if (key.includes(modulePath)) {
          delete require.cache[key];
        }
      });
    }
  }

  /**
   * Reimport a module
   */
  async reimportModule(modulePath) {
    // Add timestamp to bypass cache
    const timestamp = Date.now();
    const cacheBreaker = `${modulePath}?t=${timestamp}`;
    
    try {
      const module = await import(cacheBreaker);
      return module;
    } catch (error) {
      console.error(`Failed to reimport ${modulePath}:`, error);
      throw error;
    }
  }

  /**
   * Save state for webpack hot disposal
   */
  saveState(data) {
    data.stateStore = Array.from(this.stateStore.entries());
    data.moduleCache = Array.from(this.moduleCache.entries());
  }

  /**
   * Restore state from webpack hot data
   */
  restoreState(data) {
    if (data.stateStore) {
      this.stateStore = new Map(data.stateStore);
    }
    if (data.moduleCache) {
      this.moduleCache = new Map(data.moduleCache);
    }
  }

  /**
   * Add listener for module updates
   */
  addUpdateListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners about module update
   */
  notifyListeners(modulePath, updatedModule) {
    this.listeners.forEach(listener => {
      try {
        listener(modulePath, updatedModule);
      } catch (error) {
        console.error('Hot reload listener error:', error);
      }
    });
  }

  /**
   * Show reload notification
   */
  showReloadNotification(modulePath) {
    if (!this.isEnabled) return;

    const notification = document.createElement('div');
    notification.className = 'hot-reload-notification success';
    notification.textContent = `🔥 Reloaded ${modulePath.split('/').pop()}`;
    
    this.showNotification(notification);
  }

  /**
   * Show error notification
   */
  showErrorNotification(modulePath, error) {
    if (!this.isEnabled) return;

    const notification = document.createElement('div');
    notification.className = 'hot-reload-notification error';
    notification.textContent = `❌ Failed to reload ${modulePath.split('/').pop()}: ${error.message}`;
    
    this.showNotification(notification);
  }

  /**
   * Show notification with auto-dismiss
   */
  showNotification(notification) {
    // Add styles if not present
    if (!document.querySelector('#hot-reload-styles')) {
      const styles = document.createElement('style');
      styles.id = 'hot-reload-styles';
      styles.textContent = `
        .hot-reload-notification {
          position: fixed;
          top: 10px;
          right: 10px;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 10000;
          transition: opacity 0.3s ease;
        }
        .hot-reload-notification.success {
          background: #28a745;
          color: white;
        }
        .hot-reload-notification.error {
          background: #dc3545;
          color: white;
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(notification);
    
    // Auto dismiss after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Cleanup hot reload
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.listeners.clear();
    this.moduleCache.clear();
    this.stateStore.clear();
  }
}

// Create global hot reload manager with error boundaries
let hotReloadManager;
try {
  hotReloadManager = new HotReloadManager();
  window.hotReloadManager = hotReloadManager;
} catch (error) {
  console.error('Failed to initialize HotReloadManager, creating safe fallback:', error);
  // Create a safe fallback that won't break the application
  hotReloadManager = {
    isEnabled: false,
    moduleCache: new Map(),
    stateStore: new Map(),
    listeners: new Set(),
    checkHotReloadEnabled: () => false,
    setupHotReload: () => {},
    addUpdateListener: () => () => {},
    handleModuleUpdate: () => {},
    destroy: () => {},
    showReloadNotification: () => {},
    showErrorNotification: () => {}
  };
  window.hotReloadManager = hotReloadManager;
}

// Export for module use
export default hotReloadManager;