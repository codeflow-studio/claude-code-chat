import * as vscode from 'vscode';

/**
 * Panel location options for the chat panel
 */
export enum PanelLocation {
  LEFT = 'left',
  RIGHT = 'right',
  ACTIVE = 'active'
}

/**
 * Helper class to access extension settings
 */
export class SettingsManager {
  private static instance: SettingsManager;
  
  /**
   * Get the singleton instance of the SettingsManager
   * @returns The SettingsManager instance
   */
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }
  
  private constructor() {
    // Register a listener for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeCode')) {
        this.onConfigurationChanged();
      }
    });
  }
  
  /**
   * Check if the Claude Code process should start automatically
   * @returns true if auto-start is enabled, false otherwise
   */
  public isAutoStartEnabled(): boolean {
    return this.getConfiguration().get<boolean>('autoStart', false);
  }
  
  /**
   * Get the path to the Claude Code CLI executable
   * @returns The path to the Claude Code CLI executable
   */
  public getCliPath(): string {
    return this.getConfiguration().get<string>('cliPath', 'claude-code');
  }
  
  /**
   * Get additional CLI arguments for the Claude Code process
   * @returns An array of additional CLI arguments
   */
  public getAdditionalCliArgs(): string[] {
    return this.getConfiguration().get<string[]>('additionalCliArgs', []);
  }
  
  /**
   * Get the preferred panel location
   * @returns The preferred panel location enum
   */
  public getPanelLocation(): PanelLocation {
    const location = this.getConfiguration().get<string>('panelLocation', 'active');
    switch (location) {
      case 'left':
        return PanelLocation.LEFT;
      case 'right':
        return PanelLocation.RIGHT;
      case 'active':
      default:
        return PanelLocation.ACTIVE;
    }
  }
  
  /**
   * Get the ViewColumn for the panel based on the current settings
   * @returns The ViewColumn to use
   */
  public getPanelViewColumn(): vscode.ViewColumn {
    const location = this.getPanelLocation();
    switch (location) {
      case PanelLocation.LEFT:
        return vscode.ViewColumn.One;
      case PanelLocation.RIGHT:
        return vscode.ViewColumn.Two;
      case PanelLocation.ACTIVE:
      default:
        return vscode.ViewColumn.Active;
    }
  }
  
  /**
   * Check if conversations should be preserved between sessions
   * @returns true if conversations should be preserved, false otherwise
   */
  public shouldPreserveConversations(): boolean {
    return this.getConfiguration().get<boolean>('preserveConversations', true);
  }
  
  /**
   * Update a setting value
   * @param section The setting section to update
   * @param value The new value for the setting
   */
  public async updateSetting(section: string, value: any): Promise<void> {
    await this.getConfiguration().update(section, value, vscode.ConfigurationTarget.Global);
  }
  
  /**
   * Get the configuration object for the extension
   * @returns The configuration object
   */
  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('claudeCode');
  }
  
  /**
   * Callback for when the configuration changes
   */
  private onConfigurationChanged(): void {
    // In the future, we could emit an event or directly update the affected components
    console.log('Claude Code settings changed');
  }
}