import * as vscode from 'vscode';

const MIME_TYPES: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp'
};

export class ImageDiffPanel {
    public static currentPanel: ImageDiffPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _pendingImages?: vscode.Uri[];
    private _currentImages: vscode.Uri[] = [];
    private _pendingRenderMode: 'mosaic' | 'overlay';
    private readonly _onRenderModeChanged?: (mode: 'mosaic' | 'overlay') => void;
    private _onDroppedUris?: (uris: vscode.Uri[]) => void;
    private _webviewReady = false;
    private _fileWatchers: vscode.Disposable[] = [];
    private _pendingPairStatus = '';

    public static createOrShow(
        extensionUri: vscode.Uri,
        imageUris?: vscode.Uri[],
        initialRenderMode: 'mosaic' | 'overlay' = 'mosaic',
        onRenderModeChanged?: (mode: 'mosaic' | 'overlay') => void,
        onDroppedUris?: (uris: vscode.Uri[]) => void
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ImageDiffPanel.currentPanel) {
            ImageDiffPanel.currentPanel._panel.reveal(column);
            ImageDiffPanel.currentPanel._setRenderMode(initialRenderMode);
            ImageDiffPanel.currentPanel._onDroppedUris = onDroppedUris;
            if (imageUris && imageUris.length >= 2) {
                ImageDiffPanel.currentPanel.loadImages(imageUris);
            }
            return;
        }

        const localResourceRoots: vscode.Uri[] = [vscode.Uri.joinPath(extensionUri, 'media')];

        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                localResourceRoots.push(folder.uri);
            }
        }

        const panel = vscode.window.createWebviewPanel(
            'vantagePanel',
            'Vantage',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: localResourceRoots,
                retainContextWhenHidden: true
            }
        );

        ImageDiffPanel.currentPanel = new ImageDiffPanel(panel, extensionUri, initialRenderMode, onRenderModeChanged, onDroppedUris);

        if (imageUris && imageUris.length >= 2) {
            ImageDiffPanel.currentPanel._pendingImages = imageUris;
            ImageDiffPanel.currentPanel._currentImages = [...imageUris];
        }
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        initialRenderMode: 'mosaic' | 'overlay',
        onRenderModeChanged?: (mode: 'mosaic' | 'overlay') => void,
        onDroppedUris?: (uris: vscode.Uri[]) => void
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._pendingRenderMode = initialRenderMode;
        this._onRenderModeChanged = onRenderModeChanged;
        this._onDroppedUris = onDroppedUris;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'webviewReady') {
                    this._webviewReady = true;
                    this._setRenderMode(this._pendingRenderMode);
                    this._postPairStatus(this._pendingPairStatus);
                    if (this._pendingImages) {
                        await this._loadImages(this._pendingImages);
                        this._pendingImages = undefined;
                    }
                    return;
                }

                if (message.command === 'renderModeChanged') {
                    if (message.mode === 'mosaic' || message.mode === 'overlay') {
                        this._pendingRenderMode = message.mode;
                        this._onRenderModeChanged?.(message.mode);
                    }
                    return;
                }

                if (message.command === 'loadImage') {
                    try {
                        const uri = vscode.Uri.parse(message.uri);
                        const fileData = await vscode.workspace.fs.readFile(uri);
                        const base64 = Buffer.from(fileData).toString('base64');
                        const mimeType = this._getMimeType(uri.fsPath);

                        this._panel.webview.postMessage({
                            command: 'imageLoaded',
                            data: `data:${mimeType};base64,${base64}`,
                            filename: uri.fsPath,
                            fileSizeBytes: fileData.byteLength,
                            index: message.index
                        });
                    } catch (e) {
                        console.error('Failed to load image:', e);
                        vscode.window.showErrorMessage(`Failed to load image: ${e}`);
                    }
                }

                if (message.command === 'pairedNext') {
                    void vscode.commands.executeCommand('vantage.pairedNext');
                    return;
                }

                if (message.command === 'pairedPrevious') {
                    void vscode.commands.executeCommand('vantage.pairedPrevious');
                    return;
                }

                if (message.command === 'droppedUris' && Array.isArray(message.uris)) {
                    const uris = message.uris
                        .map((raw: unknown) => typeof raw === 'string' ? raw.trim() : '')
                        .filter((raw: string) => raw.length > 0)
                        .map((raw: string) => {
                            try {
                                const normalizedRaw = raw.split(/\s+/)[0];
                                if (normalizedRaw.startsWith('file:') || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalizedRaw)) {
                                    return vscode.Uri.parse(normalizedRaw);
                                }
                                return vscode.Uri.file(normalizedRaw);
                            } catch {
                                return undefined;
                            }
                        })
                        .filter((uri: vscode.Uri | undefined): uri is vscode.Uri => uri !== undefined);

                    if (uris.length > 0) {
                        this._onDroppedUris?.(uris);
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public loadImages(imageUris: vscode.Uri[]): void {
        this._currentImages = [...imageUris];
        void this._loadImages(imageUris);
    }

    public appendImages(imageUris: vscode.Uri[]): void {
        const unique = new Map<string, vscode.Uri>();

        for (const uri of this._currentImages) {
            unique.set(uri.toString(), uri);
        }

        for (const uri of imageUris) {
            unique.set(uri.toString(), uri);
        }

        const merged = Array.from(unique.values());
        this._currentImages = merged;
        void this._loadImages(merged);
    }

    public getCurrentImageUris(): vscode.Uri[] {
        return [...this._currentImages];
    }

    public setPairStatus(status: string): void {
        this._pendingPairStatus = status;
        this._postPairStatus(status);
    }

    private _postPairStatus(status: string): void {
        if (!this._webviewReady) {
            return;
        }

        this._panel.webview.postMessage({
            command: 'pairStatus',
            text: status
        });
    }

    private _setRenderMode(mode: 'mosaic' | 'overlay'): void {
        this._pendingRenderMode = mode;
        if (!this._webviewReady) {
            return;
        }

        this._panel.webview.postMessage({
            command: 'setRenderMode',
            mode
        });
    }

    public selectImageIndex(index: number): void {
        if (!this._webviewReady) {
            return;
        }

        this._panel.webview.postMessage({
            command: 'selectImageIndex',
            index
        });
    }

    public cycleImage(): void {
        if (!this._webviewReady) {
            return;
        }

        this._panel.webview.postMessage({
            command: 'cycleImage'
        });
    }

    public cycleImagePrevious(): void {
        if (!this._webviewReady) {
            return;
        }

        this._panel.webview.postMessage({
            command: 'cycleImagePrevious'
        });
    }

    private _getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
        return MIME_TYPES[ext] ?? 'application/octet-stream';
    }

    private async _loadImages(imageUris: vscode.Uri[]): Promise<void> {
        if (!this._webviewReady) {
            this._pendingImages = imageUris;
            this._currentImages = [...imageUris];
            return;
        }

        try {
            this._panel.webview.postMessage({
                command: 'imagesCount',
                count: imageUris.length
            });

            for (let i = 0; i < imageUris.length; i++) {
                const uri = imageUris[i];
                const imageData = await vscode.workspace.fs.readFile(uri);
                const base64 = Buffer.from(imageData).toString('base64');
                const filePath = uri.path || uri.fsPath;
                const mimeType = this._getMimeType(filePath);

                this._panel.webview.postMessage({
                    command: 'imageLoaded',
                    data: `data:${mimeType};base64,${base64}`,
                    filename: filePath,
                    fileSizeBytes: imageData.byteLength,
                    index: i
                });
            }
        } catch (e) {
            console.error('Failed to load images:', e);
            vscode.window.showErrorMessage(`Failed to load images: ${e}`);
        }

        this._setupFileWatchers(imageUris);
    }

    private _setupFileWatchers(imageUris: vscode.Uri[]): void {
        // Dispose existing watchers
        for (const w of this._fileWatchers) {
            w.dispose();
        }
        this._fileWatchers = [];

        for (let i = 0; i < imageUris.length; i++) {
            const uri = imageUris[i];
            const index = i;
            const pattern = new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), uri.path.split('/').pop()!);
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            const reloadImage = async () => {
                try {
                    const fileData = await vscode.workspace.fs.readFile(uri);
                    const base64 = Buffer.from(fileData).toString('base64');
                    const filePath = uri.path || uri.fsPath;
                    const mimeType = this._getMimeType(filePath);

                    this._panel.webview.postMessage({
                        command: 'imageUpdated',
                        data: `data:${mimeType};base64,${base64}`,
                        filename: filePath,
                        fileSizeBytes: fileData.byteLength,
                        index
                    });
                } catch {
                    // File may be mid-write; ignore
                }
            };

            watcher.onDidChange(reloadImage);
            watcher.onDidCreate(reloadImage);

            this._fileWatchers.push(watcher);
        }
    }

    public dispose(): void {
        ImageDiffPanel.currentPanel = undefined;
        this._panel.dispose();

        for (const w of this._fileWatchers) {
            w.dispose();
        }
        this._fileWatchers = [];

        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Vantage</title>
</head>
<body>
    <div class="controls">
        <div id="zoom-level">100%</div>
        <div class="quick-controls">
            <button id="fitAllBtn" title="Fit all images">Fit</button>
            <button id="helpBtn" title="Show shortcuts">?</button>
        </div>
        <div id="renderModeControl" class="render-mode-control">
            <select id="renderModeSelector" class="render-mode-selector" aria-label="Render mode">
                <option value="mosaic">Mosaic</option>
                <option value="overlay">Overlay</option>
            </select>
        </div>
        <div id="status-line" class="status-line"></div>
        <button id="overlayBtn" title="Overlay Right on Left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5z"/>
            </svg>
        </button>
        <div class="mode-controls">
            <div id="dissolveControl" class="dissolve-control">
                <label for="dissolveSlider">Dissolve:</label>
                <input type="range" id="dissolveSlider" min="0" max="100" value="0">
                <span id="dissolveValue">0%</span>
            </div>
            <div id="differencesControl" class="differences-control active">
                <input type="checkbox" id="differencesCheckbox">
                <label for="differencesCheckbox">Differences</label>
            </div>
            <div id="referenceControl" class="reference-control">
                <details id="referenceDetails">
                    <summary id="referenceSummary">Reference: -</summary>
                    <div id="referenceList" class="overlay-active-list"></div>
                </details>
            </div>
            <div id="overlayActiveControl" class="overlay-active-control">
                <details id="overlayActiveDetails">
                    <summary id="overlayActiveSummary">Active: -</summary>
                    <div id="overlayActiveList" class="overlay-active-list"></div>
                </details>
            </div>
        </div>
    </div>
    <div class="container">
        <div id="images-container" class="images-container">
            <!-- All images will be dynamically added here in a mosaic -->
        </div>
    </div>
    <div id="helpOverlay" class="help-overlay hidden">
        <div class="help-card">
            <div class="help-header">
                <h3>Vantage Shortcuts</h3>
                <button id="closeHelpBtn" title="Close help">×</button>
            </div>
            <div id="helpContent" class="help-content"></div>
        </div>
    </div>
    <div id="contextMenu" class="context-menu hidden">
        <div class="context-menu-item" data-action="fit">Fit to View</div>
        <div class="context-menu-item" data-action="zoom100">Zoom to 100%</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="toggleMode">Toggle Mosaic / Overlay</div>
        <div class="context-menu-item" data-action="toggleDifferences">Toggle Differences</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="help">Keyboard Shortcuts</div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
