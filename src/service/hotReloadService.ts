/**
 * Hot Reload Service for Claude Code Extension Backend
 * Provides service hot-swapping capabilities with state preservation
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirectModeService } from './directModeService';

interface ModuleInfo {
  path: string;
  lastModified: number;
  exports?: any;
}

export class HotReloadService {
  private moduleMap: Map<string, ModuleInfo> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private isEnabled: boolean;
  private serviceInstances: Map<string, any> = new Map();
  private stateStore: Map<string, any> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    this.isEnabled = process.env.NODE_ENV === 'development';
    
    if (this.isEnabled) {
      this.setupHotReload();
    }
  }

  /**
   * Setup hot reload infrastructure
   */
  private setupHotReload(): void {
    console.log('🔥 Hot reload service initialized');
    
    // Watch key service files
    const serviceFiles = [
      'directModeService.ts',
      'permissionService.ts', 
      'processManager.ts',
      'messageProcessor.ts'
    ];

    serviceFiles.forEach(file => {
      this.watchServiceFile(file);
    });

    // Register file update command for webview communication
    const fileUpdateCommand = vscode.commands.registerCommand(
      'claude-code-extension.internal.fileUpdated',
      (filePath: string) => this.handleFileUpdate(filePath)
    );

    this.context.subscriptions.push(fileUpdateCommand);
  }

  /**
   * Watch a service file for changes
   */
  private watchServiceFile(fileName: string): void {
    const servicePath = path.join(__dirname, fileName);
    
    if (!fs.existsSync(servicePath)) {
      console.warn(`⚠️ Service file not found: ${servicePath}`);
      return;
    }

    // Get initial module info
    const stats = fs.statSync(servicePath);
    this.moduleMap.set(fileName, {
      path: servicePath,
      lastModified: stats.mtime.getTime()
    });

    // Setup file watcher
    const watcher = fs.watch(servicePath, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange(fileName);
      }
    });

    this.watchers.set(fileName, watcher);
    console.log(`👁️ Watching service file: ${fileName}`);
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(fileName: string): Promise<void> {
    try {
      const moduleInfo = this.moduleMap.get(fileName);
      if (!moduleInfo) return;

      const stats = fs.statSync(moduleInfo.path);
      const newModified = stats.mtime.getTime();

      // Check if file actually changed
      if (newModified > moduleInfo.lastModified) {
        console.log(`🔄 File changed: ${fileName}`);
        
        // Update timestamp
        moduleInfo.lastModified = newModified;
        
        // Reload the service
        await this.reloadService(fileName);
      }
    } catch (error) {
      console.error(`❌ Error handling file change for ${fileName}:`, error);
    }
  }

  /**
   * Handle file update from external trigger
   */
  private async handleFileUpdate(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    await this.handleFileChange(fileName);
  }

  /**
   * Reload a service module
   */
  private async reloadService(fileName: string): Promise<void> {
    try {
      console.log(`🔥 Hot reloading service: ${fileName}`);

      // Save current state
      await this.saveServiceState(fileName);

      // Clear module cache
      this.clearModuleCache(fileName);

      // Wait a bit for file system to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload and reinitialize service
      await this.reinitializeService(fileName);

      // Restore state
      await this.restoreServiceState(fileName);

      console.log(`✅ Hot reload completed for: ${fileName}`);
      
      // Notify UI about successful reload
      this.notifyUIReload(fileName);

    } catch (error) {
      console.error(`❌ Hot reload failed for ${fileName}:`, error);
      
      // Notify UI about failed reload
      this.notifyUIError(fileName, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Save service state before reload
   */
  private async saveServiceState(fileName: string): Promise<void> {
    try {
      const serviceName = this.getServiceName(fileName);
      const serviceInstance = this.serviceInstances.get(serviceName);

      if (serviceInstance) {
        const state: any = {};

        // Save DirectModeService state
        if (serviceName === 'directModeService' && serviceInstance instanceof DirectModeService) {
          state.isRunning = serviceInstance.isProcessRunning();
          state.sessionId = serviceInstance.getCurrentSessionId();
          // Save other relevant state properties
        }

        // Save other service states as needed
        this.stateStore.set(serviceName, state);
        console.log(`💾 Saved state for ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to save state for ${fileName}:`, error);
    }
  }

  /**
   * Restore service state after reload
   */
  private async restoreServiceState(fileName: string): Promise<void> {
    try {
      const serviceName = this.getServiceName(fileName);
      const state = this.stateStore.get(serviceName);
      const serviceInstance = this.serviceInstances.get(serviceName);

      if (state && serviceInstance) {
        // Restore DirectModeService state
        if (serviceName === 'directModeService') {
          if (state.sessionId && typeof serviceInstance.setCurrentSessionId === 'function') {
            serviceInstance.setCurrentSessionId(state.sessionId);
          }
          // Restore other state properties
        }

        console.log(`🔄 Restored state for ${serviceName}`);
      }
    } catch (error) {
      console.warn(`Failed to restore state for ${fileName}:`, error);
    }
  }

  /**
   * Clear module from require cache
   */
  private clearModuleCache(fileName: string): void {
    const moduleInfo = this.moduleMap.get(fileName);
    if (!moduleInfo) return;

    // Clear from Node.js require cache
    const modulePath = moduleInfo.path;
    delete require.cache[require.resolve(modulePath)];

    // Also clear any related compiled JavaScript files
    const jsPath = modulePath.replace('.ts', '.js');
    if (require.cache[jsPath]) {
      delete require.cache[jsPath];
    }

    console.log(`🗑️ Cleared module cache for: ${fileName}`);
  }

  /**
   * Reinitialize service after reload
   */
  private async reinitializeService(fileName: string): Promise<void> {
    const serviceName = this.getServiceName(fileName);
    
    try {
      // Dynamically reload the module
      const moduleInfo = this.moduleMap.get(fileName);
      if (!moduleInfo) return;

      // Import the new module (this will work after cache clearing)
      const newModule = await import(moduleInfo.path);
      
      // Update module exports
      moduleInfo.exports = newModule;

      // Reinitialize specific services
      await this.reinitializeSpecificService(serviceName, newModule);

    } catch (error) {
      console.error(`Failed to reinitialize ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Reinitialize specific service instances
   */
  private async reinitializeSpecificService(serviceName: string, _newModule: any): Promise<void> {
    // This method would be expanded based on specific service requirements
    switch (serviceName) {
      case 'directModeService':
        // Reinitialize DirectModeService with preserved dependencies
        break;
      case 'permissionService':
        // Reinitialize PermissionService
        break;
      case 'processManager':
        // Reinitialize ProcessManager
        break;
      case 'messageProcessor':
        // Reinitialize MessageProcessor
        break;
    }
  }

  /**
   * Get service name from filename
   */
  private getServiceName(fileName: string): string {
    return fileName.replace('.ts', '').replace('.js', '');
  }

  /**
   * Notify UI about successful reload
   */
  private notifyUIReload(fileName: string): void {
    // This could send a message to the webview about successful reload
    vscode.commands.executeCommand(
      'claude-code-extension.internal.notifyReload',
      { fileName, success: true }
    );
  }

  /**
   * Notify UI about reload error
   */
  private notifyUIError(fileName: string, error: Error): void {
    vscode.commands.executeCommand(
      'claude-code-extension.internal.notifyReload',
      { fileName, success: false, error: error.message }
    );
  }

  /**
   * Register a service instance for hot reload management
   */
  public registerService(name: string, instance: any): void {
    this.serviceInstances.set(name, instance);
    console.log(`📝 Registered service for hot reload: ${name}`);
  }

  /**
   * Unregister a service instance
   */
  public unregisterService(name: string): void {
    this.serviceInstances.delete(name);
    this.stateStore.delete(name);
  }

  /**
   * Check if hot reload is enabled
   */
  public get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Manually trigger reload for a service
   */
  public async triggerReload(serviceName: string): Promise<void> {
    const fileName = `${serviceName}.ts`;
    await this.reloadService(fileName);
  }

  /**
   * Dispose hot reload service
   */
  public dispose(): void {
    // Close all file watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();

    // Clear all maps
    this.moduleMap.clear();
    this.serviceInstances.clear();
    this.stateStore.clear();

    console.log('🛑 Hot reload service disposed');
  }
}