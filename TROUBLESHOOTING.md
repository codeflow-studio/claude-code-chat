# Claude Code Extension Troubleshooting Guide

## Service Worker Registration Error

If you're seeing this error:
```
Error loading webview: Error: Could not register service worker: InvalidStateError: Failed to register a ServiceWorker: The document is in an invalid state.
```

**Don't worry!** This is a known VSCode issue, not a problem with the Claude Code extension itself.

## Quick Fix (Works 95% of the time)

### Option 1: Reinstall VSCode (Recommended - Easiest)

**This is the most reliable solution:**

1. **Uninstall VSCode**
   - macOS: Move VSCode from Applications to Trash
   - Windows: Use "Add or Remove Programs"
   - Linux: Use your package manager (`sudo apt remove code`)

2. **Download fresh VSCode**
   - Go to [code.visualstudio.com](https://code.visualstudio.com)
   - Download and install the latest version

3. **Restore your setup**
   - Your extensions will sync automatically if you use Settings Sync
   - Otherwise, reinstall your extensions

✅ **The error should be completely resolved!**

### Option 2: Manual Cache Clearing

If you prefer not to reinstall:

1. **Close VSCode completely**
   - Close all VSCode windows
   - Make sure no VSCode processes are running

2. **Clear VSCode cache**
   **On macOS:**
   ```bash
   rm -rf "$HOME/Library/Application Support/Code/Service Worker"
   ```

   **On Linux:**
   ```bash
   rm -rf "$HOME/.config/Code/Service Worker"
   ```

   **On Windows (PowerShell):**
   ```powershell
   Remove-Item "$env:APPDATA\Code\Service Worker" -Recurse -Force
   ```

3. **Restart VSCode**
   Open VSCode normally - the error should be resolved.

## Alternative Solutions

If the quick fix doesn't work, try these in order:

### Option 1: Use --no-sandbox flag
```bash
code --no-sandbox
```

### Option 2: Clear all VSCode cache
**On macOS:**
```bash
rm -rf "$HOME/Library/Application Support/Code/Cache"
rm -rf "$HOME/Library/Application Support/Code/Service Worker"
```

**On Linux:**
```bash
rm -rf "$HOME/.config/Code/Cache"
rm -rf "$HOME/.config/Code/Service Worker"
```

**On Windows:**
```powershell
Remove-Item "$env:APPDATA\Code\Cache" -Recurse -Force
Remove-Item "$env:APPDATA\Code\Service Worker" -Recurse -Force
```

### Option 3: Reload VSCode window
1. Open Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
2. Type and select "Developer: Reload Window"

### Option 4: Kill all VSCode processes
**On macOS/Linux:**
```bash
killall code
```

**On Windows:**
- Open Task Manager
- Find all "Visual Studio Code" processes
- End each task
- Restart VSCode

## Why This Happens

This error occurs due to a VSCode internal issue where:
1. VSCode automatically tries to register service workers for webview content
2. Sometimes the document gets into an "invalid state" during this process
3. Corrupted cache files can cause persistent problems

**This affects many extensions with webviews, not just Claude Code.**

## Prevention

To reduce the likelihood of this error:

1. **Update VSCode regularly** - newer versions have fixes for some cases
2. **Clear cache occasionally** - run the cache clearing command monthly
3. **Close VSCode properly** - don't force-quit or kill the process unless necessary

## Still Having Issues?

If none of these solutions work:

1. **Check your VSCode version**: Some versions (1.82.2, 1.100.3) are more prone to this issue
2. **Try a different workspace**: Open VSCode in a different folder to test
3. **Report to VSCode team**: This is ultimately a VSCode platform issue
4. **Contact us**: Open an issue at [github.com/codeflow-studio/claude-code-chat/issues](https://github.com/codeflow-studio/claude-code-chat/issues)

## Technical Details

For developers and advanced users:

- The error originates from VSCode's webview service worker registration system
- The Claude Code extension doesn't contain any service worker code
- The issue is related to document state timing and cache corruption
- Content Security Policy restrictions may contribute to the problem

## Related Issues

This same error has been reported for:
- Julia VSCode extension
- Jupyter notebooks
- Sourcegraph extension  
- Postman extension
- Many other webview-based extensions

You're not alone - this is a widespread VSCode platform issue!