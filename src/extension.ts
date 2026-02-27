import * as vscode from 'vscode';
import * as path from 'path';
import { ImageDiffPanel } from './ImageDiffPanel';
import { SidebarDragAndDropController, SidebarNode, SidebarProvider } from './SidebarProvider';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const RENDER_MODE_KEY = 'vantage.renderMode';
const SIDEBAR_ROOT_KEY = 'vantage.sidebarRootPath';
const SIDEBAR_FILTER_KEY = 'vantage.sidebarFilterPattern';
const SIDEBAR_FILTER_ACTIVE_CONTEXT_KEY = 'vantage.sidebarFilterActive';
const LARGE_IMAGE_CONFIRM_THRESHOLD = 9;

type RenderMode = 'mosaic' | 'overlay';

interface StrictPairGroup {
    key: string;
    displayName: string;
    imageUris: vscode.Uri[];
}

interface StrictPairSession {
    folders: vscode.Uri[];
    groups: StrictPairGroup[];
    index: number;
    slotPermutation: number[];
}

interface FolderImageLookup {
    folder: vscode.Uri;
    imagesByKey: Map<string, vscode.Uri>;
    duplicateKeys: Set<string>;
}

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

function getFilenameFromUri(uri: vscode.Uri): string {
    if (uri.scheme === 'file') {
        return path.basename(uri.fsPath);
    }

    return path.posix.basename(uri.path);
}

function getParentAndFilenameLabel(uri: vscode.Uri): string {
    const normalized = uri.scheme === 'file'
        ? uri.fsPath.replace(/\\/g, '/')
        : uri.path;
    const parts = normalized.split('/').filter(part => part.length > 0);
    const filename = getFilenameFromUri(uri);
    const parent = parts.length > 1 ? parts[parts.length - 2] : '';

    if (!parent) {
        return filename;
    }

    return `.../${parent}/${filename}`;
}

function toMatchKey(name: string): string {
    const dotIndex = name.lastIndexOf('.');
    const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    return stem.toLowerCase();
}

function formatPairStatus(session: StrictPairSession): string {
    if (session.groups.length === 0) {
        return '';
    }

    return `Pair ${session.index + 1}/${session.groups.length}`;
}

function createIdentityPermutation(size: number): number[] {
    return Array.from({ length: size }, (_, index) => index);
}

function isValidPermutation(order: number[], size: number): boolean {
    if (order.length !== size) {
        return false;
    }

    const expected = createIdentityPermutation(size);
    const actual = [...order].sort((a, b) => a - b);
    return expected.every((value, index) => actual[index] === value);
}

function applyPermutationToUris(uris: vscode.Uri[], permutation: number[]): vscode.Uri[] {
    if (!isValidPermutation(permutation, uris.length)) {
        return [...uris];
    }

    return permutation
        .map(index => uris[index])
        .filter((uri): uri is vscode.Uri => uri !== undefined);
}

async function buildFolderImageLookup(folder: vscode.Uri): Promise<FolderImageLookup> {
    const images = await collectImagesRecursively(folder);
    const imagesByKey = new Map<string, vscode.Uri>();
    const duplicateKeys = new Set<string>();

    images.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    for (const image of images) {
        const filename = getFilenameFromUri(image);
        const key = toMatchKey(filename);
        if (!key) {
            continue;
        }

        if (duplicateKeys.has(key)) {
            continue;
        }

        if (imagesByKey.has(key)) {
            imagesByKey.delete(key);
            duplicateKeys.add(key);
            continue;
        }

        imagesByKey.set(key, image);
    }

    return {
        folder,
        imagesByKey,
        duplicateKeys
    };
}

async function buildStrictPairGroups(folders: vscode.Uri[]): Promise<{ groups: StrictPairGroup[]; duplicateKeyCount: number }> {
    const lookups = await Promise.all(folders.map(folder => buildFolderImageLookup(folder)));
    if (lookups.length === 0) {
        return {
            groups: [],
            duplicateKeyCount: 0
        };
    }

    const duplicateKeyUnion = new Set<string>();
    lookups.forEach(lookup => {
        lookup.duplicateKeys.forEach(key => duplicateKeyUnion.add(key));
    });

    let commonKeys = new Set<string>(lookups[0].imagesByKey.keys());
    for (let i = 1; i < lookups.length; i++) {
        const keys = lookups[i].imagesByKey;
        commonKeys = new Set(Array.from(commonKeys).filter(key => keys.has(key)));
    }

    duplicateKeyUnion.forEach(key => {
        commonKeys.delete(key);
    });

    const sortedKeys = Array.from(commonKeys).sort((a, b) => a.localeCompare(b));
    const groups: StrictPairGroup[] = sortedKeys.map(key => {
        const imageUris = lookups
            .map(lookup => lookup.imagesByKey.get(key))
            .filter((uri): uri is vscode.Uri => uri !== undefined);

        return {
            key,
            displayName: getParentAndFilenameLabel(imageUris[0]),
            imageUris
        };
    });

    return {
        groups,
        duplicateKeyCount: duplicateKeyUnion.size
    };
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

    let activeStrictPairSession: StrictPairSession | undefined;

    const clearStrictPairSession = (): void => {
        activeStrictPairSession = undefined;
        ImageDiffPanel.currentPanel?.setPairStatus('');
    };

    const startStrictPairComparison = async (folders: vscode.Uri[]): Promise<void> => {
        if (folders.length < 2) {
            vscode.window.showErrorMessage('Select at least 2 folders to start paired comparison.');
            return;
        }

        const uniqueFolders = new Map<string, vscode.Uri>();
        folders.forEach(folder => {
            uniqueFolders.set(folder.toString(), folder);
        });

        if (uniqueFolders.size < 2) {
            vscode.window.showErrorMessage('Select at least 2 different folders to start paired comparison.');
            return;
        }

        const selectedFolders = Array.from(uniqueFolders.values());
        const { groups, duplicateKeyCount } = await buildStrictPairGroups(selectedFolders);
        if (groups.length === 0) {
            vscode.window.showWarningMessage('No matching image filenames were found across all selected folders.');
            return;
        }

        activeStrictPairSession = {
            folders: selectedFolders,
            groups,
            index: 0,
            slotPermutation: createIdentityPermutation(selectedFolders.length)
        };

        if (duplicateKeyCount > 0) {
            vscode.window.showWarningMessage(
                `Skipped ${duplicateKeyCount} duplicated filename key(s) found more than once in at least one folder.`
            );
        }

        await openPanel(groups[0].imageUris, {
            pairStatus: formatPairStatus(activeStrictPairSession),
            preserveStrictPairSession: true
        });
    };

    const loadStrictPairAtIndex = async (targetIndex: number): Promise<void> => {
        if (!activeStrictPairSession || activeStrictPairSession.groups.length === 0) {
            vscode.window.showWarningMessage('No paired comparison session is active. Start one from folders first.');
            return;
        }

        if (targetIndex < 0 || targetIndex >= activeStrictPairSession.groups.length) {
            return;
        }

        activeStrictPairSession.index = targetIndex;
        const group = activeStrictPairSession.groups[targetIndex];
        const orderedUris = applyPermutationToUris(group.imageUris, activeStrictPairSession.slotPermutation);

        if (ImageDiffPanel.currentPanel) {
            ImageDiffPanel.currentPanel.loadImages(orderedUris, [...activeStrictPairSession.slotPermutation]);
            ImageDiffPanel.currentPanel.setPairStatus(formatPairStatus(activeStrictPairSession));
            return;
        }

        await openPanel(orderedUris, {
            pairStatus: formatPairStatus(activeStrictPairSession),
            preserveStrictPairSession: true,
            pairSlotOrder: [...activeStrictPairSession.slotPermutation]
        });
    };

    const updateStrictPairPermutation = (order: number[]): void => {
        if (!activeStrictPairSession) {
            return;
        }

        const size = activeStrictPairSession.slotPermutation.length;
        if (!isValidPermutation(order, size)) {
            return;
        }

        activeStrictPairSession.slotPermutation = [...order];
    };

    const removeStrictPairSlot = (displayIndex: number): void => {
        if (!activeStrictPairSession) {
            return;
        }

        const currentSize = activeStrictPairSession.slotPermutation.length;
        if (currentSize <= 2) {
            vscode.window.showWarningMessage('At least 2 folders are required for paired comparison.');
            return;
        }

        if (displayIndex < 0 || displayIndex >= currentSize) {
            return;
        }

        const originalSlotIndex = activeStrictPairSession.slotPermutation[displayIndex];

        activeStrictPairSession.folders = activeStrictPairSession.folders.filter((_, index) => index !== originalSlotIndex);
        activeStrictPairSession.groups = activeStrictPairSession.groups.map(group => ({
            ...group,
            imageUris: group.imageUris.filter((_, index) => index !== originalSlotIndex)
        }));

        const updatedPermutation = activeStrictPairSession.slotPermutation
            .filter((_, index) => index !== displayIndex)
            .map(index => index > originalSlotIndex ? index - 1 : index);

        activeStrictPairSession.slotPermutation = updatedPermutation;

        if (activeStrictPairSession.folders.length < 2) {
            clearStrictPairSession();
            vscode.window.showWarningMessage('Paired comparison ended because fewer than 2 folders remain.');
            return;
        }

        void loadStrictPairAtIndex(activeStrictPairSession.index);
    };

    const openPanel = async (
        imageUris?: vscode.Uri[],
        options?: {
            pairStatus?: string;
            preserveStrictPairSession?: boolean;
            pairSlotOrder?: number[];
        }
    ): Promise<void> => {
        if (imageUris && imageUris.length > 0) {
            const shouldOpen = await confirmOpenLargeImageSet(imageUris.length);
            if (!shouldOpen) {
                return;
            }
        }

        if (!options?.preserveStrictPairSession) {
            activeStrictPairSession = undefined;
        }

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

                const existingImages = ImageDiffPanel.currentPanel?.getCurrentImageUris() ?? [];
                const merged = new Map<string, vscode.Uri>();
                for (const uri of existingImages) {
                    merged.set(uri.toString(), uri);
                }
                for (const uri of images) {
                    merged.set(uri.toString(), uri);
                }

                const shouldAppend = await confirmOpenLargeImageSet(merged.size);
                if (!shouldAppend) {
                    return;
                }

                clearStrictPairSession();
                ImageDiffPanel.currentPanel?.appendImages(images);
            },
            (order: number[]) => {
                updateStrictPairPermutation(order);
            },
            (index: number) => {
                removeStrictPairSlot(index);
            },
            options?.pairSlotOrder
        );

        ImageDiffPanel.currentPanel?.setPairStatus(options?.pairStatus ?? '');
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.start', () => {
            clearStrictPairSession();
            void openPanel();
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

            clearStrictPairSession();
            void openPanel(uris);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.startPairedComparison', async () => {
            const selectedFolders = await vscode.window.showOpenDialog({
                title: 'Vantage: Select Folders for Paired Comparison',
                openLabel: 'Start Paired Comparison',
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: true,
                defaultUri: sidebarProvider.rootUri ?? vscode.workspace.workspaceFolders?.[0]?.uri
            });

            if (!selectedFolders || selectedFolders.length === 0) {
                return;
            }

            await startStrictPairComparison(selectedFolders);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.sidebarStartPairedComparison', async (item?: SidebarNode) => {
            const baseSelection = sidebarTreeView.selection.length > 0
                ? sidebarTreeView.selection
                : item
                    ? [item]
                    : [];

            const folderUris = baseSelection
                .filter(node => node.nodeType === 'folder')
                .map(node => node.uri);

            if (folderUris.length < 2) {
                vscode.window.showWarningMessage('Select at least 2 folders in the Vantage sidebar to start paired comparison.');
                return;
            }

            await startStrictPairComparison(folderUris);
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

            clearStrictPairSession();
            void openPanel(images);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.pairedNext', () => {
            if (!activeStrictPairSession) {
                vscode.window.showWarningMessage('No paired comparison session is active.');
                return;
            }

            const nextIndex = activeStrictPairSession.index + 1;
            if (nextIndex >= activeStrictPairSession.groups.length) {
                vscode.window.showInformationMessage('Already at the last matched pair.');
                return;
            }

            void loadStrictPairAtIndex(nextIndex);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vantage.pairedPrevious', () => {
            if (!activeStrictPairSession) {
                vscode.window.showWarningMessage('No paired comparison session is active.');
                return;
            }

            const prevIndex = activeStrictPairSession.index - 1;
            if (prevIndex < 0) {
                vscode.window.showInformationMessage('Already at the first matched pair.');
                return;
            }

            void loadStrictPairAtIndex(prevIndex);
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
