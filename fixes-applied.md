# Fixes Applied

## Problem 1: ORPC Context - Main Window Not Set

### Root Cause
The `ipcContext.mainWindowContext` getter was being accessed during module import when the router was created, but `setMainWindow()` was never called to register the BrowserWindow.

### Solution Applied
1. **Register window with IPC context** - Modified `createEditorWindow()` in `src/main.ts` to call `ipcContext.setMainWindow(editorWindow)` after creating the window.

2. **Reorder initialization** - Changed the startup sequence in `app.whenReady()` to:
   - Create window first (which now registers it with IPC context)
   - Then setup ORPC (which can now safely access the context)

3. **Defer context access** - Modified `src/ipc/window/hadlers.ts` to use a function that creates the middleware at runtime rather than accessing the context during module import. This prevents eager evaluation issues.

## Problem 2: Codex Binary Resolution on Windows

### Root Cause
On Windows, npm creates wrapper scripts (`.cmd` files) for global CLI tools. The resolution logic was checking PATH candidates before npm-specific locations, and when it found `C:\Users\hp\AppData\Roaming\npm\codex` (the Unix-style shim), it tried to spawn that instead of the `.cmd` wrapper.

Additionally, `.cmd` and `.bat` files cannot be spawned directly on Windows - they must be executed through `cmd.exe` with the `/c` flag.

### Solution Applied
1. **Prioritize npm wrappers** - Reordered the candidate list in `resolveCodexBinary()` to check `getWindowsNpmCandidates()` before `getPathCandidates()`.

2. **Execute .cmd files through cmd.exe** - Modified the spawn logic to detect Windows script files (`.cmd`, `.bat`) and execute them through `cmd.exe /c` instead of spawning them directly.

3. **Add debug logging** - Added logging to show which candidates were checked, which one was resolved, and the actual spawn command used.

## Problem 3: Missing Model Field in Turn Start Request

### Root Cause
When sending a message via `codex:agent:send`, the `model` field was being set to `null` when the model lookup by label failed. The Codex app-server requires a valid `model` field in the `turn/start` request.

### Solution Applied
Modified `handleSubmit()` in `src/components/codex/codex-chat-panel.tsx` to:
1. **Fallback chain** - When looking up model by label fails, fallback to:
   - `session.defaultModel` (the model ID marked as default)
   - `session.models[0]?.id` (the first available model)
   - `null` (only if no models exist)

2. **Early validation** - If no model is available after the fallback chain, set an error state and return early instead of attempting to send the message.

This ensures that `window.codex.sendMessage()` is always called with a valid model ID, preventing the "Invalid request: missing field `model`" error.

## Expected Behavior After Fixes

1. ORPC initialization should complete successfully
2. Platform detection in the renderer should work
3. Codex process should spawn correctly using `codex.cmd` on Windows
4. Chat UI should be able to establish a working Codex session
5. No more "Main window is not set" errors
6. No more ENOENT spawn errors for Codex
7. Messages can be sent successfully with a valid model field

## Files Modified

- `src/main.ts` - Added window registration and reordered initialization
- `src/main/codex/CodexProcess.ts` - Fixed binary resolution priority for Windows
- `src/ipc/window/hadlers.ts` - Deferred context access to runtime
- `src/components/codex/codex-chat-panel.tsx` - Added model fallback chain and validation
