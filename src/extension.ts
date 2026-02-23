import * as vscode from 'vscode';
import { ImageDiffPanel } from './ImageDiffPanel';
import { SidebarDragAndDropController, SidebarNode, SidebarProvider } from './SidebarProvider';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const RENDER_MODE_KEY = 'vantage.renderMode';
const SIDEBAR_ROOT_KEY = 'vantage.sidebarRootPath';
const SIDEBAR_FILTER_KEY = 'vantage.sidebarFilterPattern';
const SIDEBAR_FILTER_ACTIVE_CONTEXT_KEY = 'vantage.sidebarFilterActive';
const LARGE_IMAGE_CONFIRM_THRESHOLD = 9;

type RenderMode = 'mosaic' | 'overlay';

function isImageFile(uri: vscode.Uri): boolean {
    const filePath = (uri.fsPath || uri.path).toLowerCase();
    const ext = filePath.match(/\.[^.]+$/)?.[0];
    return ext !== undefined && IMAGE_EXTENSIONS.includes(ext);
}

function getUriFromArgs(args: unknown[]): vscode.Uri | undefined {
    if (args.length > 0 && args[0] instanceof vscode.Uri) {
        return args[0];
    }
    return undefined;
}

function getUrisFromArgs(args: unknown[]): vscode.Uri[] {
    if (args.length > 1 && Array.isArray(args[1])) {
        return args[1];
    }
    const uri = getUriFromArgs(args);
    return uri ? [uri] : [];
}

async function confirmOpenLargeImageSet(imageCount: number): Promise<boolean> {
    if (imageCount <= LARGE_IMAGE_CONFIRM_THRESHOLD) {
        return true;
    }

    const selected = await vscode.window.showWarningMessage(
        `You are about to open ${imageCount} images. This can be slow and use significant memory. Continue?`,
        { modal: true },
        'Open Images'
    );

    return selected === 'Open Images';
}

export function activate(context: vscode.ExtensionContext): void {
    const initialSidebarRoot = getInitialSidebarRoot(context);
    const initialFilterPattern = context.workspaceState.get<string>(SIDEBAR_FILTER_KEY) ?? '';
    const sidebarProvider = new SidebarProvider(initialSidebarRoot);
    if (initialFilterPattern) {
        try {
            sidebarProvider.setFilterPattern(initialFilterPattern);
        } catch {
            // Ignore invalid persisted regex values.
        }
    }
    const sidebarDragAndDropController = new SidebarDragAndDropController();
    const sidebarTreeView = vscode.window.createTreeView<SidebarNode>('vantage-sidebar', {
        treeDataProvider: sidebarProvider,
        canSelectMany: true,
        showCollapseAll: true,
        dragAndDropController: sidebarDragAndDropController
    });
    updateSidebarUi(context, sidebarTreeView, sidebarProvider);
    context.subscriptions.push(sidebarTreeView);

    const getRenderMode = (): RenderMode => {
        const mode = context.workspaceState.get<RenderMode>(RENDER_MODE_KEY);
        return mode === 'overlay' ? 'overlay' : 'mosaic';
    };

    const setRenderMode = (mode: RenderMode): void => {
        void context.workspaceState.update(RENDER_MODE_KEY, mode);
    };

    const openPanel = (imageUris?: vscode.Uri[]): void => {
        ImageDiffPanel.createOrShow(
            context.extensionUri,
            imageUris,
            getRenderMode(),
            setRenderMode,
            async (droppedUris: vscode.Uri[]) => {
                const images = await collectImagesFromUris(droppedUris);
                if (images.length === 0) {
                    vscode.window.showWarningMessage('Drop did not contain any supported image files.');
                    return;
                }
                ImageDiffPanel.currentPanel?.appendImages(images);
            }
        );
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.start', () => {
            openPanel();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.compareImages', async (...args: unknown[]) => {
            const uris = getUrisFromArgs(args);

            if (uris.length < 2) {
                vscode.window.showErrorMessage('Please select at least 2 image files to compare.');
                return;
            }

            if (!uris.every(isImageFile)) {
                vscode.window.showErrorMessage('All selected files must be images.');
                return;
            }

            openPanel(uris);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarSetPath', async () => {
            const defaultUri = sidebarProvider.rootUri
                ?? vscode.workspace.workspaceFolders?.[0]?.uri;

            const selected = await vscode.window.showOpenDialog({
                title: 'Vantage: Set Sidebar Path',
                openLabel: 'Select Sidebar Folder',
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri
            });

            if (!selected || selected.length === 0) {
                return;
            }

            const candidateUri = selected[0];
            let stat: vscode.FileStat;
            try {
                stat = await vscode.workspace.fs.stat(candidateUri);
            } catch {
                vscode.window.showErrorMessage('Path does not exist or is not accessible.');
                return;
            }

            if (stat.type !== vscode.FileType.Directory) {
                vscode.window.showErrorMessage('Path must be a directory.');
                return;
            }

            sidebarProvider.setRootUri(candidateUri);
            updateSidebarUi(context, sidebarTreeView, sidebarProvider);
            void context.workspaceState.update(SIDEBAR_ROOT_KEY, candidateUri.toString());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarSetFilterPattern', async () => {
            const existing = sidebarProvider.getFilterPattern();
            const entered = await vscode.window.showInputBox({
                title: 'Vantage: Set Filter Pattern',
                prompt: 'Use wildcard pattern(s), e.g. *.png, *_mask.* or *.png,*.jpg. Leave empty to clear.',
                value: existing,
                ignoreFocusOut: true
            });

            if (entered === undefined) {
                return;
            }

            const pattern = entered.trim();
            if (!pattern) {
                sidebarProvider.setFilterPattern('');
                updateSidebarUi(context, sidebarTreeView, sidebarProvider);
                void context.workspaceState.update(SIDEBAR_FILTER_KEY, undefined);
                return;
            }

            sidebarProvider.setFilterPattern(pattern);
            updateSidebarUi(context, sidebarTreeView, sidebarProvider);
            void context.workspaceState.update(SIDEBAR_FILTER_KEY, pattern);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarClearFilterPattern', () => {
            sidebarProvider.setFilterPattern('');
            updateSidebarUi(context, sidebarTreeView, sidebarProvider);
            void context.workspaceState.update(SIDEBAR_FILTER_KEY, undefined);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarRefresh', () => {
            sidebarProvider.refresh();
            updateSidebarUi(context, sidebarTreeView, sidebarProvider);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarOpenInEditor', async (item?: SidebarNode) => {
            const selection = sidebarTreeView.selection.length > 0
                ? sidebarTreeView.selection
                : item
                    ? [item]
                    : [];

            if (selection.length === 0) {
                vscode.window.showWarningMessage('Select one or more folders/images in the Vantage sidebar.');
                return;
            }

            const images = await collectImagesFromNodes(selection);
            if (images.length < 2) {
                vscode.window.showErrorMessage('Please select folders/files that contain at least 2 images.');
                return;
            }

            const shouldOpen = await confirmOpenLargeImageSet(images.length);
            if (!shouldOpen) {
                return;
            }

            openPanel(images);
        })
    );

    const selectCommands = [
        'vantage.selectImage1',
        'vantage.selectImage2',
        'vantage.selectImage3',
        'vantage.selectImage4',
        'vantage.selectImage5',
        'vantage.selectImage6',
        'vantage.selectImage7',
        'vantage.selectImage8',
        'vantage.selectImage9'
    ];

    selectCommands.forEach((command, index) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, () => {
                ImageDiffPanel.currentPanel?.selectImageIndex(index);
            })
        );
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.cycleImage', () => {
            ImageDiffPanel.currentPanel?.cycleImage();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.cycleImagePrevious', () => {
            ImageDiffPanel.currentPanel?.cycleImagePrevious();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarRevealInExplorer', (item?: SidebarNode) => {
            const node = item ?? sidebarTreeView.selection[0];
            if (node) {
                void vscode.commands.executeCommand('revealFileInOS', node.uri);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarCopyPath', (item?: SidebarNode) => {
            const node = item ?? sidebarTreeView.selection[0];
            if (node) {
                void vscode.env.clipboard.writeText(node.uri.fsPath);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarOpenNative', (item?: SidebarNode) => {
            const node = item ?? sidebarTreeView.selection[0];
            if (node) {
                void vscode.env.openExternal(node.uri);
            }
        })
    );
}

function updateSidebarUi(
    context: vscode.ExtensionContext,
    sidebarTreeView: vscode.TreeView<SidebarNode>,
    sidebarProvider: SidebarProvider
): void {
    const pathLabel = sidebarProvider.getRootPathLabel();
    const filterLabel = sidebarProvider.getFilterLabel();
    const hasActiveFilter = sidebarProvider.getFilterPattern().trim().length > 0;

    sidebarTreeView.description = filterLabel ? `${pathLabel} · ${filterLabel}` : pathLabel;
    sidebarTreeView.badge = hasActiveFilter
        ? {
            value: 1,
            tooltip: `Sidebar filter active: ${sidebarProvider.getFilterPattern()}`
        }
        : undefined;

    void vscode.commands.executeCommand('setContext', SIDEBAR_FILTER_ACTIVE_CONTEXT_KEY, hasActiveFilter);

    // Keep workspace state aligned when invalid/empty persisted values are ignored at startup.
    if (!hasActiveFilter) {
        void context.workspaceState.update(SIDEBAR_FILTER_KEY, undefined);
    }
}

function getInitialSidebarRoot(context: vscode.ExtensionContext): vscode.Uri | undefined {
    const persisted = context.workspaceState.get<string>(SIDEBAR_ROOT_KEY);
    if (persisted) {
        try {
            return vscode.Uri.parse(persisted, true);
        } catch {
            return vscode.Uri.file(persisted);
        }
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function collectImagesFromNodes(nodes: readonly SidebarNode[]): Promise<vscode.Uri[]> {
    const unique = new Map<string, vscode.Uri>();

    for (const node of nodes) {
        if (node.nodeType === 'image') {
            unique.set(node.uri.toString(), node.uri);
            continue;
        }

        const childImages = await collectImagesRecursively(node.uri);
        for (const imageUri of childImages) {
            unique.set(imageUri.toString(), imageUri);
        }
    }

    return Array.from(unique.values()).sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

async function collectImagesFromUris(uris: readonly vscode.Uri[]): Promise<vscode.Uri[]> {
    const unique = new Map<string, vscode.Uri>();

    for (const uri of uris) {
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            continue;
        }

        if (stat.type === vscode.FileType.File) {
            if (isImageFile(uri)) {
                unique.set(uri.toString(), uri);
            }
            continue;
        }

        if (stat.type === vscode.FileType.Directory) {
            const nested = await collectImagesRecursively(uri);
            for (const nestedUri of nested) {
                unique.set(nestedUri.toString(), nestedUri);
            }
        }
    }

    return Array.from(unique.values()).sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

async function collectImagesRecursively(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = [];

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(folderUri);
    } catch {
        return results;
    }

    for (const [name, type] of entries) {
        const uri = vscode.Uri.joinPath(folderUri, name);
        if (type === vscode.FileType.File) {
            if (isImageFile(uri)) {
                results.push(uri);
            }
            continue;
        }

        if (type === vscode.FileType.Directory) {
            const nested = await collectImagesRecursively(uri);
            results.push(...nested);
        }
    }

    return results;
}

export function deactivate() { }
