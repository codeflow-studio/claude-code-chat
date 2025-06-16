# Permission Request Handling Test Guide

This document describes how to test the new permission request handling functionality in the DirectModeService.

## What Was Fixed

Previously, when Claude requested permission to use tools like Bash:
1. The UI would show a permission dialog
2. But the Claude Code process would continue running instead of waiting
3. The process would timeout or fail before the user could respond
4. User permission responses had no effect on the running process

## How It Works Now

1. **Permission Detection**: The DirectModeService detects permission requests in user messages
2. **Process Suspension**: When a permission request is detected, the Claude Code process is suspended (not terminated)
3. **Timeout Management**: A 5-minute timeout is set for permission responses
4. **User Response Handling**: User responses (approve/reject/approve-all) properly resume or terminate the suspended process

## Testing Steps

### Test 1: Basic Permission Request Flow

1. **Start Direct Mode**: Switch to Direct Mode in the extension
2. **Trigger Permission Request**: Send a message that requires a tool Claude doesn't have permission for:
   ```
   Can you run 'ls -la' to show me the files in this directory?
   ```
3. **Verify Suspension**: Check that:
   - A permission dialog appears in the UI
   - The process status shows as suspended
   - Console logs show "Claude process suspended, waiting for Bash permission"

4. **Test Approval**: Click "Approve" and verify:
   - Process resumes successfully
   - Claude executes the bash command
   - Console logs show "Claude process successfully resumed after permission grant"

### Test 2: Permission Rejection

1. Follow steps 1-3 from Test 1
2. **Test Rejection**: Click "Reject" and verify:
   - Process is terminated
   - UI shows "Permission denied. Process stopped."
   - Console logs show "Permission rejected - terminating suspended process"

### Test 3: Approve All

1. Follow steps 1-3 from Test 1
2. **Test Approve All**: Click "Approve All Bash" and verify:
   - Process resumes successfully
   - Permission is saved for future use
   - Subsequent bash commands don't require permission

### Test 4: Timeout Handling

1. Follow steps 1-3 from Test 1
2. **Wait for Timeout**: Don't respond to the permission dialog
3. **Verify Timeout**: After 5 minutes, verify:
   - Process is automatically terminated
   - UI shows timeout error message
   - Console logs show "Permission request for Bash timed out"

## Implementation Details

### Backend Changes (DirectModeService)

- Added `_isPermissionRequest()` method to detect permission requests
- Added `_suspendProcessForPermission()` to suspend processes safely
- Added timeout management with `_handlePermissionTimeout()`
- Enhanced `handlePermissionResponse()` to work with suspended processes
- Added `_resumeSuspendedProcess()` to properly resume suspended processes

### Type Definitions

- Extended `DirectModeResponse.metadata` to include:
  - `suspended?: boolean` - Track if process is suspended
  - `toolName?: string` - Tool name for permission requests  
  - `isPermissionRequest?: boolean` - Flag to identify permission requests
  - `action?: string` - Permission action type

### UI Integration

- Enhanced permission detection in `messageHandler.js`
- Added support for metadata-based permission detection
- Maintained existing permission dialog functionality

## Expected Console Output

### Permission Request Detected:
```
Permission request detected: { toolName: 'Bash', originalContent: '...' }
Suspending Claude process for Bash permission request
Claude process suspended, waiting for permission response (5 min timeout)
```

### Permission Approved:
```
Permission response: approve for Bash (session: abc123)
Permission approved (approve) - resuming suspended process
Sent permission approval to Claude process: Permission granted for Bash
Claude process successfully resumed after permission grant
```

### Permission Rejected:
```
Permission response: reject for Bash (session: abc123)
Permission rejected - terminating suspended process
```

### Timeout:
```
Permission request for Bash timed out
```

## Troubleshooting

If permission handling doesn't work:

1. **Check Console Logs**: Look for permission detection and suspension messages
2. **Verify Direct Mode**: Ensure you're in Direct Mode, not Terminal Mode
3. **Check Process State**: Use `hasPendingPermission()` and `getPendingPermissionInfo()` methods
4. **Verify UI Integration**: Ensure permission dialogs appear and send correct messages

## Files Modified

- `src/service/directModeService.ts` - Main implementation
- `src/types/claude-message-types.ts` - Type definitions
- `media/js/modules/messageHandler.js` - UI integration
- `src/ui/claudeTerminalInputProvider.ts` - Integration already existed

## Benefits

1. **Reliable Permission Handling**: Processes now properly wait for user responses
2. **No More Timeouts**: Permission workflows complete successfully
3. **Better User Experience**: Clear feedback on process state
4. **Robust Error Handling**: Comprehensive timeout and error management
5. **Backwards Compatibility**: Existing permission UI continues to work