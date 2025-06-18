/**
 * Permission Service
 * Handles tool permission management, storage, and approval workflows
 */

import * as path from 'path';
import * as fs from 'fs/promises';

export interface PendingPermissionState {
  sessionId: string;
  toolName: string;
  commandContext?: string;
  toolUseId?: string;
  process: any;
  suspendedAt: Date;
  timeoutId?: NodeJS.Timeout;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface PermissionSettings {
  permissionMode: PermissionMode;
  allowedTools: string[];
}

export class PermissionService {
  private _pendingPermissionState?: PendingPermissionState;
  private _currentPermissionMode: PermissionMode = 'default';

  constructor(private _workspaceRoot?: string) {}

  /**
   * Gets allowed tools from default + saved permissions
   */
  async getAllowedTools(): Promise<string[]> {
    const defaultTools: string[] = [];
    
    try {
      const savedPermissions = await this._loadSavedPermissions();
      return [...defaultTools, ...savedPermissions];
    } catch (error) {
      console.log('No saved permissions found, using default tools');
      return defaultTools;
    }
  }

  /**
   * Sets the current permission mode
   */
  setPermissionMode(mode: PermissionMode): void {
    this._currentPermissionMode = mode;
    console.log(`Permission mode set to: ${mode}`);
  }

  /**
   * Gets the current permission mode
   */
  getPermissionMode(): PermissionMode {
    return this._currentPermissionMode;
  }

  /**
   * Checks if a tool should be automatically approved based on permission mode
   */
  shouldAutoApprove(toolName: string): boolean {
    switch (this._currentPermissionMode) {
      case 'bypassPermissions':
        return true;
      case 'acceptEdits': {
        // Auto-approve common file editing tools
        const editingTools = ['Edit', 'Write', 'Read', 'MultiEdit'];
        return editingTools.includes(toolName);
      }
      case 'plan':
      case 'default':
      default:
        return false;
    }
  }

  /**
   * Gets the Claude CLI arguments for the current permission mode
   */
  getPermissionModeArgs(): string[] {
    switch (this._currentPermissionMode) {
      case 'bypassPermissions':
        return ['--permission-mode', 'bypassPermissions'];
      case 'acceptEdits':
        return ['--permission-mode', 'acceptEdits'];
      case 'plan':
        return ['--permission-mode', 'plan'];
      case 'default':
      default:
        return [];
    }
  }

  /**
   * Loads permission settings including mode from saved settings
   */
  async loadPermissionSettings(): Promise<PermissionSettings> {
    try {
      const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
      const settingsFile = path.join(claudeDir, 'settings.local.json');
      
      const settingsContent = await fs.readFile(settingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);
      
      const permissionSettings: PermissionSettings = {
        permissionMode: settings.permissionMode || 'default',
        allowedTools: settings.allowedTools || []
      };
      
      // Update current permission mode
      this._currentPermissionMode = permissionSettings.permissionMode;
      
      return permissionSettings;
    } catch (error) {
      // File doesn't exist or invalid JSON, return defaults
      return {
        permissionMode: 'default',
        allowedTools: []
      };
    }
  }

  /**
   * Saves permission settings including mode
   */
  async savePermissionSettings(settings: PermissionSettings): Promise<void> {
    try {
      const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
      const settingsFile = path.join(claudeDir, 'settings.local.json');
      
      // Ensure .claude directory exists
      try {
        await fs.access(claudeDir);
      } catch {
        await fs.mkdir(claudeDir, { recursive: true });
      }
      
      // Load existing settings
      let existingSettings: any = {};
      try {
        const settingsContent = await fs.readFile(settingsFile, 'utf8');
        existingSettings = JSON.parse(settingsContent);
      } catch {
        // File doesn't exist or invalid JSON, start fresh
      }
      
      // Update settings
      existingSettings.permissionMode = settings.permissionMode;
      existingSettings.allowedTools = settings.allowedTools;
      
      // Save settings
      await fs.writeFile(settingsFile, JSON.stringify(existingSettings, null, 2));
      
      // Update current permission mode
      this._currentPermissionMode = settings.permissionMode;
      
      console.log(`Saved permission settings: mode=${settings.permissionMode}, tools=${settings.allowedTools.length}`);
      
    } catch (error) {
      console.error('Error saving permission settings:', error);
      throw error;
    }
  }

  /**
   * Sets up pending permission state
   */
  setPendingPermissionState(state: PendingPermissionState): void {
    this._pendingPermissionState = state;
  }

  /**
   * Gets pending permission state
   */
  getPendingPermissionState(): PendingPermissionState | undefined {
    return this._pendingPermissionState;
  }

  /**
   * Clears pending permission state
   */
  clearPendingPermissionState(): void {
    if (this._pendingPermissionState?.timeoutId) {
      clearTimeout(this._pendingPermissionState.timeoutId);
    }
    this._pendingPermissionState = undefined;
  }

  /**
   * Checks if there's a pending permission request
   */
  hasPendingPermission(): boolean {
    return !!this._pendingPermissionState;
  }

  /**
   * Gets information about the pending permission request
   */
  getPendingPermissionInfo(): { toolName: string; sessionId: string; suspendedAt: Date } | null {
    if (!this._pendingPermissionState) {
      return null;
    }
    
    return {
      toolName: this._pendingPermissionState.toolName,
      sessionId: this._pendingPermissionState.sessionId,
      suspendedAt: this._pendingPermissionState.suspendedAt
    };
  }

  /**
   * Saves tool permission to .claude/settings.local.json for approve-all actions
   */
  async saveToolPermission(toolName: string): Promise<void> {
    try {
      const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
      const settingsFile = path.join(claudeDir, 'settings.local.json');
      
      // Ensure .claude directory exists
      try {
        await fs.access(claudeDir);
      } catch {
        await fs.mkdir(claudeDir, { recursive: true });
      }
      
      // Load existing settings or create new
      let settings: any = {};
      try {
        const settingsContent = await fs.readFile(settingsFile, 'utf8');
        settings = JSON.parse(settingsContent);
      } catch {
        // File doesn't exist or invalid JSON, start fresh
      }
      
      // Add tool to allowed tools if not already present
      if (!settings.allowedTools) {
        settings.allowedTools = [];
      }
      
      if (!settings.allowedTools.includes(toolName)) {
        settings.allowedTools.push(toolName);
      }
      
      // Save settings
      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      console.log(`Saved permission for ${toolName} to ${settingsFile}`);
      
    } catch (error) {
      console.error('Error saving tool permission:', error);
      throw error;
    }
  }

  /**
   * Detects if content contains a permission request
   */
  isPermissionRequest(content: string): { toolName: string; originalContent: string } | null {
    if (typeof content !== 'string') return null;
    
    // Match permission request patterns
    const permissionPattern = /Claude requested permissions to use (.+?), but you haven't granted it yet/i;
    const match = content.match(permissionPattern);
    
    if (match) {
      return {
        toolName: match[1].trim(),
        originalContent: content
      };
    }
    
    return null;
  }

  /**
   * Extracts command context and tool_use_id from the last assistant message if it contains tool usage
   */
  extractCommandContext(toolName: string, lastAssistantMessage?: any): { commandContext?: string; toolUseId?: string } {
    if (!lastAssistantMessage || lastAssistantMessage.type !== 'assistant') {
      return {};
    }

    const assistantMessage = lastAssistantMessage as any;
    const messageContent = assistantMessage.message?.content;
    
    if (Array.isArray(messageContent)) {
      for (const item of messageContent) {
        if (item.type === 'tool_use' && item.name === toolName) {
          const result: { commandContext?: string; toolUseId?: string } = {
            toolUseId: item.id
          };
          
          // Extract command context for Bash tools
          if (item.input?.command && typeof item.input.command === 'string') {
            const mainCommand = this._parseMainCommand(item.input.command);
            result.commandContext = mainCommand;
          }
          
          return result;
        }
      }
    }
    
    return {};
  }

  /**
   * Loads saved tool permissions from .claude/settings.local.json
   */
  private async _loadSavedPermissions(): Promise<string[]> {
    const claudeDir = path.join(this._workspaceRoot || process.cwd(), '.claude');
    const settingsFile = path.join(claudeDir, 'settings.local.json');
    
    try {
      const settingsContent = await fs.readFile(settingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);
      return settings.allowedTools || [];
    } catch (error) {
      // File doesn't exist or invalid JSON
      return [];
    }
  }

  /**
   * Parses the main command from a full bash command string
   */
  private _parseMainCommand(fullCommand: string): string {
    // Handle common patterns:
    // "git commit -m ..." -> "git commit"
    // "ls -la" -> "ls"
    // "npm install package" -> "npm install"
    
    const parts = fullCommand.trim().split(/\s+/);
    if (parts.length === 0) return fullCommand;
    
    // For common multi-word commands
    const firstWord = parts[0];
    const secondWord = parts[1];
    
    if (firstWord === 'git' && secondWord) {
      return `${firstWord} ${secondWord}`;
    } else if (firstWord === 'npm' && (secondWord === 'install' || secondWord === 'run' || secondWord === 'start')) {
      return `${firstWord} ${secondWord}`;
    } else {
      return firstWord;
    }
  }
}