# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run compile      # Build TypeScript → out/
npm run watch        # Rebuild on file changes
npx @vscode/vsce package --skip-license  # Package as .vsix
```

To test the extension, press **F5** in VS Code to launch the Extension Development Host, then run **Vantage: Start** from the Command Palette.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).

## Architecture

This is a VS Code extension for synchronized multi-image comparison. TypeScript source compiles to `out/` (CommonJS, ES2020 target, strict mode).

### Extension host (`src/`)

**`extension.ts`** — Entry point. Registers all VS Code commands, creates the `SidebarProvider` tree view, and wires up state persistence via `context.workspaceState` (sidebar root path, filter pattern, render mode). `openPanel()` is the central function that calls `ImageDiffPanel.createOrShow()`.

**`ImageDiffPanel.ts`** — Manages a singleton `WebviewPanel` (`ImageDiffPanel.currentPanel`). Images are loaded by reading files via `vscode.workspace.fs`, converting to base64, and posting them to the webview. A `_webviewReady` flag gates all post-panel-creation messages; pending images/mode are queued until the webview signals `webviewReady`. The panel uses `retainContextWhenHidden: true` for state preservation.

**`SidebarProvider.ts`** — Implements `TreeDataProvider<SidebarNode>`. Shows an image-only directory tree. Wildcard filter patterns (e.g. `*.png, *_mask.*`) are compiled to regexes via `_globToRegExp`. Folder nodes display a recursive image count (cached in `_folderCountCache`). `SidebarDragAndDropController` makes tree items draggable into the webview panel.

### Webview frontend (`media/`)

**`main.js`** — Vanilla JS running inside the webview. Communicates with the extension host via `vscode.postMessage()` / `window.addEventListener('message', ...)`. Handles all rendering (mosaic grid, overlay mode), synchronized zoom/pan (transform matrix), pixel-level difference computation (Canvas `getImageData`), dissolve slider, drag-and-drop intake, and keyboard shortcuts.

**`style.css`** — All styles for the webview UI.

### Message protocol (extension ↔ webview)

| Direction | Command | Purpose |
|---|---|---|
| Webview → Ext | `webviewReady` | Webview initialized |
| Webview → Ext | `renderModeChanged` | User switched mosaic/overlay |
| Webview → Ext | `droppedUris` | Files dropped onto webview |
| Ext → Webview | `imagesCount` | Total number of images to load |
| Ext → Webview | `imageLoaded` | Base64 image data + index |
| Ext → Webview | `setRenderMode` | Switch mosaic/overlay |
| Ext → Webview | `selectImageIndex` | Overlay: jump to image N |
| Ext → Webview | `cycleImage` / `cycleImagePrevious` | Overlay navigation |

### Publishing

Publishing to the VS Code Marketplace is done via the `publish.yml` GitHub Actions workflow (manual trigger), which bumps version, compiles, and runs `vsce publish` using the `VSCE_PAT` repository secret.
