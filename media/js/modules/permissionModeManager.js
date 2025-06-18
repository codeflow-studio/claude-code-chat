/**
 * Permission Mode Manager Module
 * Handles permission mode selector UI and communication with backend
 */

// VS Code API instance (will be set during initialization)
let vscode = null;

// Current permission mode
let currentPermissionMode = 'default';

/**
 * Initialize the permission mode manager with VS Code API instance
 */
export function initializePermissionModeManager(vscodeApi) {
  vscode = vscodeApi;
  setupPermissionModeHandlers();
}

/**
 * Sets up event handlers for the permission mode selector
 */
function setupPermissionModeHandlers() {
  const permissionModeSelect = document.getElementById('permissionModeSelect');
  
  if (permissionModeSelect) {
    permissionModeSelect.addEventListener('change', (event) => {
      const newMode = event.target.value;
      setPermissionMode(newMode);
    });
  }
}

/**
 * Sets the permission mode both in UI and backend
 */
export function setPermissionMode(mode) {
  currentPermissionMode = mode;
  
  // Update UI
  updatePermissionModeUI(mode);
  
  // Notify backend
  if (vscode) {
    vscode.postMessage({
      command: 'setPermissionMode',
      permissionMode: mode
    });
  }
  
  console.log(`Permission mode changed to: ${mode}`);
}

/**
 * Updates the permission mode UI to reflect the current mode
 */
export function updatePermissionModeUI(mode) {
  const permissionModeSelect = document.getElementById('permissionModeSelect');
  
  if (permissionModeSelect && permissionModeSelect.value !== mode) {
    permissionModeSelect.value = mode;
  }
  
  // Update any visual indicators based on mode
  updatePermissionModeIndicators(mode);
}

/**
 * Updates visual indicators based on the permission mode
 */
function updatePermissionModeIndicators(mode) {
  const permissionModeSelect = document.getElementById('permissionModeSelect');
  
  if (!permissionModeSelect) return;
  
  // Remove any existing mode classes
  permissionModeSelect.classList.remove('permission-default', 'permission-plan', 'permission-accept-edits', 'permission-bypass');
  
  // Add class based on current mode
  switch (mode) {
    case 'default':
      permissionModeSelect.classList.add('permission-default');
      permissionModeSelect.title = 'Ask Each Time - Claude will prompt for each tool permission';
      break;
    case 'plan':
      permissionModeSelect.classList.add('permission-plan');
      permissionModeSelect.title = 'Plan Only - Claude handles tool approval internally based on planning context';
      break;
    case 'acceptEdits':
      permissionModeSelect.classList.add('permission-accept-edits');
      permissionModeSelect.title = 'Auto-Accept Edits - Automatically approves file editing tools, but still asks for other tools';
      break;
    case 'bypassPermissions':
      permissionModeSelect.classList.add('permission-bypass');
      permissionModeSelect.title = 'Bypass All Permissions - Automatically approves all tools (DANGEROUS - use only in secure environments)';
      break;
    default:
      permissionModeSelect.title = 'Control how Claude handles tool permissions';
  }
}

/**
 * Gets the current permission mode
 */
export function getPermissionMode() {
  return currentPermissionMode;
}

/**
 * Handles permission mode updates from the backend
 */
export function handlePermissionModeUpdate(mode) {
  currentPermissionMode = mode;
  updatePermissionModeUI(mode);
  
  console.log(`Permission mode updated from backend: ${mode}`);
}

/**
 * Gets a user-friendly description for each permission mode
 */
export function getPermissionModeDescription(mode) {
  switch (mode) {
    case 'default':
      return 'Claude will ask for permission before using each tool. This is the safest option.';
    case 'plan':
      return 'Claude handles tool approval internally based on planning context. Designed for analysis and planning phases where Claude can explore appropriately.';
    case 'acceptEdits':
      return 'Claude will automatically approve file editing tools (Edit, Write, Read, MultiEdit) but still ask for other tools like Bash commands.';
    case 'bypassPermissions':
      return 'Claude will automatically approve ALL tools without asking. Use this only in secure, isolated environments.';
    default:
      return 'Unknown permission mode.';
  }
}

/**
 * Shows a tooltip or information about the current permission mode
 */
export function showPermissionModeInfo() {
  const description = getPermissionModeDescription(currentPermissionMode);
  
  // Create a temporary tooltip or use VS Code's information message
  if (vscode) {
    vscode.postMessage({
      command: 'showInformation',
      message: `Permission Mode: ${currentPermissionMode}\n\n${description}`
    });
  }
}