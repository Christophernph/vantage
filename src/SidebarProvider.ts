import * as vscode from 'vscode';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

function isImageUri(uri: vscode.Uri): boolean {
    const ext = uri.path.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext !== undefined && IMAGE_EXTENSIONS.has(ext);
}

export class SidebarNode extends vscode.TreeItem {
    public readonly uri: vscode.Uri;
    public readonly nodeType: 'folder' | 'image';

    constructor(uri: vscode.Uri, nodeType: 'folder' | 'image', imageCount?: number) {
        const name = uri.path.split('/').pop() || uri.path;
        super(
            name,
            nodeType === 'folder'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.uri = uri;
        this.nodeType = nodeType;
        this.resourceUri = uri;
        this.contextValue = nodeType;
        this.iconPath = nodeType === 'folder'
            ? new vscode.ThemeIcon('folder')
            : new vscode.ThemeIcon('file-media');
        this.tooltip = uri.fsPath;

        if (nodeType === 'folder' && typeof imageCount === 'number') {
            this.description = `${imageCount}`;
        }

        if (nodeType === 'image') {
            this.command = {
                command: 'vscode.open',
                title: 'Open Image',
                arguments: [uri, {
                    preview: true,
                    preserveFocus: false
                }]
            };
        }
    }
}

export class SidebarDragAndDropController implements vscode.TreeDragAndDropController<SidebarNode> {
    public static readonly SIDEBAR_MIME = 'application/vnd.code.tree.vantage-sidebar';
    public readonly dragMimeTypes: readonly string[] = [
        'text/uri-list',
        'text/plain',
        SidebarDragAndDropController.SIDEBAR_MIME
    ];
    public readonly dropMimeTypes: readonly string[] = [];

    public async handleDrag(
        source: readonly SidebarNode[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const unique = new Set<string>();
        source.forEach(node => {
            unique.add(node.uri.toString());
        });

        if (unique.size > 0) {
            const uriValues = Array.from(unique);
            const uriList = uriValues.join('\r\n');
            const filePathList = uriValues
                .map(value => {
                    try {
                        return vscode.Uri.parse(value).fsPath;
                    } catch {
                        return value;
                    }
                })
                .join('\n');

            dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uriList));
            dataTransfer.set('text/plain', new vscode.DataTransferItem(filePathList));
            dataTransfer.set(
                SidebarDragAndDropController.SIDEBAR_MIME,
                new vscode.DataTransferItem(JSON.stringify(uriValues))
            );
        }
    }

    public async handleDrop(
        _target: SidebarNode | undefined,
        _dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // No-op. Sidebar supports drag source only.
    }
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarNode> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<SidebarNode | undefined | null | void> = new vscode.EventEmitter<SidebarNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SidebarNode | undefined | null | void> = this._onDidChangeTreeData.event;
    private _rootUri?: vscode.Uri;
    private _filterPattern = '';
    private _filterMatchers: RegExp[] = [];
    private _folderCountCache = new Map<string, number>();

    constructor(initialRootUri?: vscode.Uri) {
        this._rootUri = initialRootUri;
    }

    public get rootUri(): vscode.Uri | undefined {
        return this._rootUri;
    }

    public getRootPathLabel(): string {
        if (!this._rootUri) {
            return 'No path selected';
        }
        return this._rootUri.fsPath;
    }

    public getFilterLabel(): string {
        if (!this._filterPattern) {
            return '';
        }
        return this._filterPattern;
    }

    public getFilterPattern(): string {
        return this._filterPattern;
    }

    public setFilterPattern(pattern: string): void {
        this._filterPattern = pattern.trim();
        this._filterMatchers = this._compilePatternMatchers(this._filterPattern);
        this.refresh();
    }

    public setRootUri(uri?: vscode.Uri): void {
        this._rootUri = uri;
        this.refresh();
    }

    public refresh(): void {
        this._folderCountCache.clear();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SidebarNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SidebarNode): Promise<SidebarNode[]> {
        const baseUri = element?.uri ?? this._rootUri;
        if (!baseUri) {
            return [];
        }

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(baseUri);
        } catch {
            return [];
        }

        const sorted = [...entries].sort((a, b) => {
            const typeDiff = this._entrySortRank(a[1]) - this._entrySortRank(b[1]);
            if (typeDiff !== 0) {
                return typeDiff;
            }
            return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
        });

        const children: SidebarNode[] = [];

        for (const [name, type] of sorted) {
            const childUri = vscode.Uri.joinPath(baseUri, name);

            if (type === vscode.FileType.Directory) {
                const folderCount = await this._countImagesInFolder(childUri);
                if (folderCount > 0) {
                    children.push(new SidebarNode(childUri, 'folder', folderCount));
                }
                continue;
            }

            if (type === vscode.FileType.File && isImageUri(childUri) && this._matchesFilter(name, childUri.fsPath)) {
                children.push(new SidebarNode(childUri, 'image'));
            }
        }

        return children;
    }

    private _entrySortRank(type: vscode.FileType): number {
        if (type === vscode.FileType.Directory) {
            return 0;
        }
        if (type === vscode.FileType.File) {
            return 1;
        }
        return 2;
    }

    private _matchesFilter(name: string, fullPath: string): boolean {
        if (this._filterMatchers.length === 0) {
            return true;
        }

        const normalizedPath = fullPath.replace(/\\/g, '/');
        return this._filterMatchers.some(matcher => matcher.test(name) || matcher.test(normalizedPath));
    }

    private _compilePatternMatchers(pattern: string): RegExp[] {
        if (!pattern) {
            return [];
        }

        return pattern
            .split(/[\s,]+/)
            .map(token => token.trim())
            .filter(token => token.length > 0)
            .map(token => this._globToRegExp(token));
    }

    private _globToRegExp(glob: string): RegExp {
        const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        return new RegExp(`^${escaped}$`, 'i');
    }

    private async _countImagesInFolder(folderUri: vscode.Uri): Promise<number> {
        const key = folderUri.toString();
        const cached = this._folderCountCache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        let count = 0;
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(folderUri);
        } catch {
            this._folderCountCache.set(key, 0);
            return 0;
        }

        for (const [name, type] of entries) {
            const childUri = vscode.Uri.joinPath(folderUri, name);
            if (type === vscode.FileType.File && isImageUri(childUri) && this._matchesFilter(name, childUri.fsPath)) {
                count++;
            }
        }

        for (const [name, type] of entries) {
            if (type !== vscode.FileType.Directory) {
                continue;
            }
            const childUri = vscode.Uri.joinPath(folderUri, name);
            count += await this._countImagesInFolder(childUri);
        }

        this._folderCountCache.set(key, count);
        return count;
    }
}
