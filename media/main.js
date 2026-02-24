(function () {
    const imagesContainer = document.getElementById('images-container');
    const overlayBtn = document.getElementById('overlayBtn');
    const fitAllBtn = document.getElementById('fitAllBtn');
    const helpBtn = document.getElementById('helpBtn');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const container = document.querySelector('.container');
    const zoomLevelEl = document.getElementById('zoom-level');
    const statusLine = document.getElementById('status-line');
    const differencesCheckbox = document.getElementById('differencesCheckbox');
    const referenceDetails = document.getElementById('referenceDetails');
    const referenceSummary = document.getElementById('referenceSummary');
    const referenceList = document.getElementById('referenceList');
    const renderModeSelector = document.getElementById('renderModeSelector');
    const overlayActiveDetails = document.getElementById('overlayActiveDetails');
    const overlayActiveSummary = document.getElementById('overlayActiveSummary');
    const overlayActiveList = document.getElementById('overlayActiveList');
    const modeControls = document.querySelector('.mode-controls');
    const dissolveControl = document.getElementById('dissolveControl');
    const differencesControl = document.getElementById('differencesControl');
    const referenceControl = document.getElementById('referenceControl');
    const helpOverlay = document.getElementById('helpOverlay');
    const helpContent = document.getElementById('helpContent');
    const contextMenu = document.getElementById('contextMenu');

    const vscode = acquireVsCodeApi();

    const dissolveSlider = document.getElementById('dissolveSlider');
    const dissolveValue = document.getElementById('dissolveValue');

    const state = {
        scale: 1,
        panning: false,
        pointX: 0,
        pointY: 0,
        startX: 0,
        startY: 0,
        showDifferences: false,
        dissolveAmount: 0,
        images: [],
        referenceIndex: 0,
        activeOverlayIndex: 0,
        renderMode: 'mosaic',
        imageContainers: [],
        expectedImageCount: 0,
        loadedImageCount: 0,
        pairStatus: ''
    };

    const detachedControls = {
        dissolve: null,
        differences: null
    };

    function getFilename(path) {
        return path.split(/[/\\]/).pop();
    }

    function getParentAndFilename(pathValue) {
        if (!pathValue || typeof pathValue !== 'string') {
            return '';
        }

        const parts = pathValue.split(/[/\\]/).filter(part => part.length > 0);
        if (parts.length === 0) {
            return '';
        }

        const filename = parts[parts.length - 1];
        const parent = parts.length > 1 ? parts[parts.length - 2] : '';
        if (!parent) {
            return filename;
        }

        return `.../${parent}/${filename}`;
    }

    function formatFileSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) {
            return '';
        }

        if (bytes < 1024) {
            return `${bytes} B`;
        }

        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = bytes / 1024;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }

        const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
        return `${value.toFixed(decimals)} ${units[unitIndex]}`;
    }

    function getImageMetadataParts(image) {
        if (!image) {
            return [];
        }

        const parts = [];
        if (Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0) {
            parts.push(`${image.width}×${image.height}`);
        }

        const fileSize = formatFileSize(image.fileSizeBytes);
        if (fileSize) {
            parts.push(fileSize);
        }

        return parts;
    }

    function updateFilenameLabel(labelEl, image) {
        if (!labelEl) {
            return;
        }

        labelEl.innerHTML = '';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'filename-name';
        nameSpan.textContent = image?.filename ? getFilename(image.filename) : 'Loading image…';
        labelEl.appendChild(nameSpan);

        if (!image || !image.filename) {
            return;
        }

        const metadata = getImageMetadataParts(image).join(' • ');
        if (metadata) {
            const metadataSpan = document.createElement('span');
            metadataSpan.className = 'filename-meta';
            metadataSpan.textContent = metadata;
            labelEl.appendChild(metadataSpan);
        }
    }

    function getImageListLabel(image, index) {
        if (image?.filename) {
            return getFilename(image.filename);
        }
        return `Loading image ${index + 1}…`;
    }

    function isPairedModeActive() {
        return Boolean(state.pairStatus);
    }

    function postImageOrderChanged() {
        const order = state.images.map((image, index) => {
            if (Number.isInteger(image?.slotIndex)) {
                return image.slotIndex;
            }
            return index;
        });

        vscode.postMessage({
            command: 'imageOrderChanged',
            order
        });
    }

    function remapIndexAfterMove(index, fromIndex, toIndex) {
        if (index === fromIndex) {
            return toIndex;
        }

        if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
            return index - 1;
        }

        if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
            return index + 1;
        }

        return index;
    }

    function moveImage(fromIndex, toIndex) {
        if (fromIndex === toIndex) {
            return;
        }

        if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.images.length || toIndex >= state.images.length) {
            return;
        }

        const [moved] = state.images.splice(fromIndex, 1);
        state.images.splice(toIndex, 0, moved);

        state.referenceIndex = remapIndexAfterMove(state.referenceIndex, fromIndex, toIndex);
        state.activeOverlayIndex = remapIndexAfterMove(state.activeOverlayIndex, fromIndex, toIndex);

        normalizeIndices();
        createImageContainers();
        updateStatusLine();
        postImageOrderChanged();
    }

    function updateZoomDisplay() {
        zoomLevelEl.textContent = `${Math.round(state.scale * 100)}%`;
    }

    function updateStatusLine() {
        if (!statusLine) {
            return;
        }

        const total = state.images.length;
        const activeImage = total > 0 ? state.images[state.activeOverlayIndex] : undefined;
        const activeLabel = activeImage?.filename ? getParentAndFilename(activeImage.filename) : '';

        if (state.pairStatus && activeLabel) {
            statusLine.textContent = `${state.pairStatus} · ${activeLabel}`;
            return;
        }

        statusLine.textContent = state.pairStatus || activeLabel || '';
    }

    function renderHelpContent() {
        if (!helpContent) {
            return;
        }

        helpContent.innerHTML = `
            <ul>
                <li><strong>Alt+1..9</strong>: Jump to image 1-9</li>
                <li><strong>Alt+Tab</strong>: Next image</li>
                <li><strong>Shift+Alt+Tab</strong>: Previous image</li>
                <li><strong>Ctrl+Alt+Right</strong>: Next matched pair</li>
                <li><strong>Ctrl+Alt+Left</strong>: Previous matched pair</li>
                <li><strong>Ctrl+Shift+PgDn/PgUp</strong>: Next/previous matched pair (fallback)</li>
                <li><strong>Reference dropdown</strong>: Set/remove images in Mosaic</li>
                <li><strong>Active dropdown</strong>: Set/remove active images in Overlay</li>
                <li><strong>Fit</strong>: Reset to fit all images</li>
                <li><strong>?</strong>: Toggle this help overlay</li>
                <li><strong>Esc</strong>: Close this help overlay</li>
            </ul>
        `;
    }

    function setHelpVisible(visible) {
        if (!helpOverlay) {
            return;
        }
        helpOverlay.classList.toggle('hidden', !visible);
    }

    function updateReferenceDropdown() {
        if (!referenceSummary || !referenceList) {
            return;
        }

        const total = state.images.length;
        referenceSummary.textContent = total > 0
            ? `Reference: ${state.referenceIndex + 1}/${total}`
            : 'Reference: -';

        referenceList.innerHTML = '';

        for (let index = 0; index < state.images.length; index++) {
            const img = state.images[index];
            const row = document.createElement('div');
            row.className = 'overlay-active-item';

            const selectBtn = document.createElement('button');
            selectBtn.className = 'overlay-active-select';
            const label = getImageListLabel(img, index);
            selectBtn.textContent = `${index + 1}. ${label}`;
            selectBtn.title = label;
            selectBtn.classList.toggle('active', index === state.referenceIndex);
            selectBtn.addEventListener('click', () => {
                setReferenceIndex(index, true);
                if (referenceDetails) {
                    referenceDetails.open = false;
                }
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'overlay-active-remove';
            removeBtn.textContent = '×';
            removeBtn.title = state.images.length <= 2
                ? 'At least 2 images are required'
                : `Remove ${label}`;
            removeBtn.disabled = state.images.length <= 2;
            removeBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (isPairedModeActive()) {
                    vscode.postMessage({ command: 'removeImageIndex', index });
                    return;
                }

                removeImageAt(index);
            });

            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'overlay-active-move';
            moveUpBtn.textContent = '↑';
            moveUpBtn.title = index === 0 ? 'Already first' : `Move ${label} up`;
            moveUpBtn.disabled = index === 0;
            moveUpBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveImage(index, index - 1);
            });

            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'overlay-active-move';
            moveDownBtn.textContent = '↓';
            moveDownBtn.title = index === state.images.length - 1 ? 'Already last' : `Move ${label} down`;
            moveDownBtn.disabled = index === state.images.length - 1;
            moveDownBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveImage(index, index + 1);
            });

            row.appendChild(selectBtn);
            row.appendChild(moveUpBtn);
            row.appendChild(moveDownBtn);
            row.appendChild(removeBtn);
            referenceList.appendChild(row);
        }
    }

    function updateSelectorDropdowns() {
        updateReferenceDropdown();
        updateOverlayActiveDropdown();
    }

    function setReferenceIndex(index, syncActive = true) {
        if (index < 0 || index >= state.images.length) {
            return;
        }

        state.referenceIndex = index;
        if (syncActive) {
            state.activeOverlayIndex = index;
        }

        updateReferenceHighlight();
        updateDissolve();
        updateSelectorDropdowns();
        updateStatusLine();
    }

    function selectImageIndex(index, syncReference = state.renderMode !== 'overlay') {
        if (index < 0 || index >= state.images.length) {
            return;
        }

        state.activeOverlayIndex = index;
        if (syncReference) {
            state.referenceIndex = index;
        }

        updateReferenceHighlight();
        updateDissolve();
        updateSelectorDropdowns();
        updateStatusLine();
    }

    function parseAltDigit(event) {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return -1;
        }

        if (event.code && event.code.startsWith('Digit')) {
            const digit = parseInt(event.code.slice(5), 10);
            return Number.isNaN(digit) ? -1 : digit;
        }

        if (event.key >= '1' && event.key <= '9') {
            return parseInt(event.key, 10);
        }

        return -1;
    }

    function getAltTabCycleDirection(event) {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.key !== 'Tab') {
            return 0;
        }

        return event.shiftKey ? -1 : 1;
    }

    function getNextVisibleIndex(direction) {
        const total = state.images.length;
        if (total === 0) {
            return -1;
        }

        const start = state.activeOverlayIndex;
        for (let offset = 1; offset <= total; offset++) {
            const candidate = (start + direction * offset + total) % total;
            return candidate;
        }

        return start;
    }

    function cycleOverlay(direction) {
        if (state.images.length === 0) {
            return;
        }

        const next = getNextVisibleIndex(direction);
        if (next >= 0) {
            selectImageIndex(next);
        }
    }

    function isAltTab(event) {
        return event.altKey
            && !event.ctrlKey
            && !event.metaKey
            && event.key === 'Tab';
    }

    function isInteractiveControlTarget(target) {
        if (!target || !(target instanceof Element)) {
            return false;
        }

        return Boolean(target.closest('input, select, textarea, button, summary, details, a'));
    }

    function handleAltDigitFallback(event) {
        if (isInteractiveControlTarget(event.target)) {
            return;
        }

        const cycleDirection = getAltTabCycleDirection(event);
        if (cycleDirection !== 0 && isAltTab(event)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            cycleOverlay(cycleDirection);
            return;
        }

        const digit = parseAltDigit(event);
        if (digit < 1 || digit > 9) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectImageIndex(digit - 1);
    }

    function handleGeneralShortcuts(event) {
        if (isInteractiveControlTarget(event.target)) {
            return;
        }

        const wantsPairedNext =
            (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowRight')
            || (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.key === 'PageDown');
        if (wantsPairedNext) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            vscode.postMessage({ command: 'pairedNext' });
            return;
        }

        const wantsPairedPrevious =
            (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowLeft')
            || (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.key === 'PageUp');
        if (wantsPairedPrevious) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            vscode.postMessage({ command: 'pairedPrevious' });
            return;
        }

        const isQuestion = event.key === '?' || (event.key === '/' && event.shiftKey);
        if (!event.altKey && !event.ctrlKey && !event.metaKey && isQuestion) {
            event.preventDefault();
            setHelpVisible(helpOverlay.classList.contains('hidden'));
            return;
        }

        if (event.key === 'Escape' && !helpOverlay.classList.contains('hidden')) {
            event.preventDefault();
            setHelpVisible(false);
        }
    }

    function parseDroppedUriList(rawValue) {
        return rawValue
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'))
            .map(line => line.split(/\s+/)[0]);
    }

    function parsePlainTextDrop(rawValue) {
        return rawValue
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.split(/\s+/)[0])
            .filter(value => value.startsWith('file:') || value.startsWith('/'));
    }

    function getDroppedUris(event) {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
            return [];
        }

        const sidebarJson = dataTransfer.getData('application/vnd.code.tree.vantage-sidebar');
        if (sidebarJson) {
            try {
                const parsed = JSON.parse(sidebarJson);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map(item => typeof item === 'string' ? item.trim() : '')
                        .filter(item => item.length > 0);
                }
            } catch {
                // Fall through to uri-list parsing.
            }
        }

        const uriListData = dataTransfer.getData('text/uri-list');
        if (uriListData) {
            return parseDroppedUriList(uriListData);
        }

        const plainTextData = dataTransfer.getData('text/plain');
        if (plainTextData) {
            return parsePlainTextDrop(plainTextData);
        }

        return [];
    }

    function normalizeIndices() {
        const maxIndex = Math.max(0, state.images.length - 1);
        state.activeOverlayIndex = Math.min(Math.max(state.activeOverlayIndex, 0), maxIndex);
        state.referenceIndex = Math.min(Math.max(state.referenceIndex, 0), maxIndex);
    }

    function removeImageAt(index) {
        if (state.images.length <= 2) {
            return;
        }

        state.images.splice(index, 1);

        if (state.activeOverlayIndex > index) {
            state.activeOverlayIndex--;
        } else if (state.activeOverlayIndex === index) {
            state.activeOverlayIndex = Math.max(0, state.activeOverlayIndex - 1);
        }

        if (state.referenceIndex > index) {
            state.referenceIndex--;
        } else if (state.referenceIndex === index) {
            state.referenceIndex = Math.max(0, state.referenceIndex - 1);
        }

        normalizeIndices();
        if (state.renderMode !== 'overlay') {
            state.activeOverlayIndex = state.referenceIndex;
        }
        updateSelectorDropdowns();
        createImageContainers();
        updateStatusLine();
        postImageOrderChanged();
    }

    function updateOverlayActiveDropdown() {
        if (!overlayActiveSummary || !overlayActiveList) {
            return;
        }

        const total = state.images.length;
        overlayActiveSummary.textContent = total > 0
            ? `Active: ${state.activeOverlayIndex + 1}/${total}`
            : 'Active: -';

        overlayActiveList.innerHTML = '';

        for (let index = 0; index < state.images.length; index++) {
            const img = state.images[index];
            const row = document.createElement('div');
            row.className = 'overlay-active-item';

            const selectBtn = document.createElement('button');
            selectBtn.className = 'overlay-active-select';
            const label = getImageListLabel(img, index);
            selectBtn.textContent = `${index + 1}. ${label}`;
            selectBtn.title = label;
            selectBtn.classList.toggle('active', index === state.activeOverlayIndex);
            selectBtn.addEventListener('click', () => {
                selectImageIndex(index, false);
                if (overlayActiveDetails) {
                    overlayActiveDetails.open = false;
                }
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'overlay-active-remove';
            removeBtn.textContent = '×';
            removeBtn.title = state.images.length <= 2
                ? 'At least 2 images are required'
                : `Remove ${label}`;
            removeBtn.disabled = state.images.length <= 2;
            removeBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (isPairedModeActive()) {
                    vscode.postMessage({ command: 'removeImageIndex', index });
                    return;
                }

                removeImageAt(index);
            });

            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'overlay-active-move';
            moveUpBtn.textContent = '↑';
            moveUpBtn.title = index === 0 ? 'Already first' : `Move ${label} up`;
            moveUpBtn.disabled = index === 0;
            moveUpBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveImage(index, index - 1);
            });

            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'overlay-active-move';
            moveDownBtn.textContent = '↓';
            moveDownBtn.title = index === state.images.length - 1 ? 'Already last' : `Move ${label} down`;
            moveDownBtn.disabled = index === state.images.length - 1;
            moveDownBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                moveImage(index, index + 1);
            });

            row.appendChild(selectBtn);
            row.appendChild(moveUpBtn);
            row.appendChild(moveDownBtn);
            row.appendChild(removeBtn);
            overlayActiveList.appendChild(row);
        }
    }

    function restoreModeSpecificControls() {
        if (!modeControls || !referenceControl) {
            return;
        }

        if (detachedControls.dissolve) {
            modeControls.insertBefore(detachedControls.dissolve, referenceControl);
            detachedControls.dissolve = null;
        }

        if (detachedControls.differences) {
            modeControls.insertBefore(detachedControls.differences, referenceControl);
            detachedControls.differences = null;
        }
    }

    function removeOverlayIncompatibleControls() {
        if (dissolveControl && dissolveControl.parentElement) {
            detachedControls.dissolve = dissolveControl;
            dissolveControl.remove();
        }

        if (differencesControl && differencesControl.parentElement) {
            detachedControls.differences = differencesControl;
            differencesControl.remove();
        }
    }

    function applyOverlayVisibility() {
        state.imageContainers.forEach((imgContainer, index) => {
            const isActive = index === state.activeOverlayIndex;
            imgContainer.container.style.display = isActive ? 'flex' : 'none';
            imgContainer.container.classList.toggle('active-overlay', isActive);
            imgContainer.image.style.display = 'block';
            imgContainer.diffCanvas.style.display = 'none';
            imgContainer.overlayImage.style.display = 'none';
        });
    }

    function applyMosaicVisibility() {
        state.imageContainers.forEach(imgContainer => {
            imgContainer.container.style.display = 'flex';
        });

        if (state.showDifferences) {
            toggleDifferences(true);
        } else {
            toggleDifferences(false);
        }

        updateDissolve();
    }

    function clearOverlayArtifacts() {
        state.showDifferences = false;
        differencesCheckbox.checked = false;
        state.dissolveAmount = 0;
        dissolveSlider.value = '0';
        dissolveValue.textContent = '0%';

        state.imageContainers.forEach(imgContainer => {
            imgContainer.diffCanvas.style.display = 'none';
            imgContainer.overlayImage.style.display = 'none';
        });
    }

    function applyRenderMode(options = {}) {
        const { closeOverlayDropdown = false } = options;
        const isOverlay = state.renderMode === 'overlay';
        document.body.classList.toggle('overlay-mode', isOverlay);
        imagesContainer.classList.toggle('overlay-mode', isOverlay);

        if (renderModeSelector) {
            renderModeSelector.value = state.renderMode;
        }

        if (isOverlay) {
            removeOverlayIncompatibleControls();
            clearOverlayArtifacts();
            if (closeOverlayDropdown) {
                if (overlayActiveDetails) {
                    overlayActiveDetails.open = false;
                }
                if (referenceDetails) {
                    referenceDetails.open = false;
                }
            }
            applyOverlayVisibility();
        } else {
            restoreModeSpecificControls();
            if (closeOverlayDropdown && referenceDetails) {
                referenceDetails.open = false;
            }
            applyMosaicVisibility();
        }

        updateStatusLine();
        updateSelectorDropdowns();
        renderHelpContent();
    }

    function setRenderMode(mode, notifyExtension = false) {
        const normalizedMode = mode === 'overlay' ? 'overlay' : 'mosaic';
        if (state.renderMode === normalizedMode && !notifyExtension) {
            return;
        }

        state.renderMode = normalizedMode;
        applyRenderMode({ closeOverlayDropdown: true });

        if (notifyExtension) {
            vscode.postMessage({
                command: 'renderModeChanged',
                mode: state.renderMode
            });
        }
    }

    function createImageContainers() {
        imagesContainer.innerHTML = '';
        state.imageContainers = [];
        imagesContainer.setAttribute('data-count', state.images.length.toString());

        for (let index = 0; index < state.images.length; index++) {
            const img = state.images[index];
            const containerDiv = document.createElement('div');
            containerDiv.className = 'image-item-container';
            containerDiv.id = `image-container-${index}`;

            if (index === state.referenceIndex) {
                containerDiv.classList.add('reference');
            }

            const filenameDiv = document.createElement('div');
            filenameDiv.className = 'filename';
            updateFilenameLabel(filenameDiv, img);
            filenameDiv.style.display = 'block';

            const imgElement = document.createElement('img');
            imgElement.className = 'sync-image';
            imgElement.draggable = false;
            imgElement.addEventListener('load', () => {
                const imageState = state.images[index];
                if (!imageState) {
                    return;
                }

                imageState.width = imgElement.naturalWidth;
                imageState.height = imgElement.naturalHeight;
                updateFilenameLabel(filenameDiv, imageState);
                placeholderDiv.style.display = 'none';
                imgElement.style.display = 'block';

                if (index === state.activeOverlayIndex) {
                    updateStatusLine();
                }
            });

            const placeholderDiv = document.createElement('div');
            placeholderDiv.className = 'placeholder loading-placeholder';
            placeholderDiv.textContent = 'Loading…';

            if (img?.data) {
                imgElement.src = img.data;
                imgElement.style.display = 'block';
                placeholderDiv.style.display = 'none';
            } else {
                imgElement.style.display = 'none';
                placeholderDiv.style.display = 'block';
            }

            const diffCanvas = document.createElement('canvas');
            diffCanvas.className = 'comparison-diff-canvas';

            const overlayImg = document.createElement('img');
            overlayImg.className = 'dissolve-overlay';
            overlayImg.draggable = false;

            containerDiv.appendChild(filenameDiv);
            containerDiv.appendChild(placeholderDiv);
            containerDiv.appendChild(imgElement);
            containerDiv.appendChild(overlayImg);
            containerDiv.appendChild(diffCanvas);
            imagesContainer.appendChild(containerDiv);

            state.imageContainers.push({
                container: containerDiv,
                image: imgElement,
                overlayImage: overlayImg,
                diffCanvas: diffCanvas,
                filenameLabel: filenameDiv,
                placeholder: placeholderDiv,
                imageIndex: index
            });
        }

        updateTransform();
        updateDissolve();
        applyRenderMode();
        updateStatusLine();

        if (state.showDifferences) {
            calculateAllDifferences();
        }
    }

    function updateDissolve() {
        if (state.renderMode === 'overlay') {
            return;
        }

        const referenceImg = state.images[state.referenceIndex];
        if (!referenceImg?.data) {
            state.imageContainers.forEach(imgContainer => {
                imgContainer.overlayImage.style.display = 'none';
            });
            return;
        }

        state.imageContainers.forEach(imgContainer => {
            if (imgContainer.imageIndex === state.referenceIndex) {
                imgContainer.overlayImage.style.display = 'none';
                return;
            }

            const comparisonImg = state.images[imgContainer.imageIndex];
            if (!comparisonImg?.data) {
                imgContainer.overlayImage.style.display = 'none';
                return;
            }

            imgContainer.overlayImage.src = referenceImg.data;
            imgContainer.overlayImage.style.opacity = state.dissolveAmount / 100;
            imgContainer.overlayImage.style.display = state.dissolveAmount > 0 ? 'block' : 'none';
            imgContainer.overlayImage.style.transform = getTransformString();
        });
    }

    function updateReferenceHighlight() {
        state.imageContainers.forEach((imgContainer, index) => {
            imgContainer.container.classList.toggle('reference', index === state.referenceIndex);
        });

        if (state.renderMode === 'overlay') {
            applyOverlayVisibility();
            updateStatusLine();
            return;
        }

        if (state.showDifferences) {
            calculateAllDifferences();
        }
    }

    function calculateAllDifferences() {
        if (state.renderMode === 'overlay') return;
        if (state.images.length < 2) return;

        const referenceImg = state.images[state.referenceIndex];
        if (!referenceImg?.data) return;

        state.imageContainers.forEach(imgContainer => {
            if (imgContainer.imageIndex === state.referenceIndex) {
                imgContainer.diffCanvas.style.display = 'none';
                imgContainer.image.style.display = 'block';
                return;
            }

            const comparisonImg = state.images[imgContainer.imageIndex];
            if (!comparisonImg?.data) return;

            calculateDifference(referenceImg, comparisonImg, imgContainer.diffCanvas);
        });
    }

    function calculateDifference(refImg, compImg, diffCanvas) {
        const img1 = new Image();
        const img2 = new Image();
        let loadedCount = 0;

        function onLoad() {
            loadedCount++;
            if (loadedCount === 2) {
                processDifferences(img1, img2, diffCanvas);
            }
        }

        img1.onload = onLoad;
        img2.onload = onLoad;
        img1.src = refImg.data;
        img2.src = compImg.data;
    }

    function processDifferences(img1, img2, diffCanvas) {
        const width = Math.max(img1.width, img2.width);
        const height = Math.max(img1.height, img2.height);

        diffCanvas.width = width;
        diffCanvas.height = height;

        const ctx = diffCanvas.getContext('2d');

        const canvas1 = document.createElement('canvas');
        const canvas2 = document.createElement('canvas');
        canvas1.width = width;
        canvas1.height = height;
        canvas2.width = width;
        canvas2.height = height;

        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');

        ctx1.drawImage(img1, 0, 0);
        ctx2.drawImage(img2, 0, 0);

        const imageData1 = ctx1.getImageData(0, 0, width, height);
        const imageData2 = ctx2.getImageData(0, 0, width, height);
        const diffData = ctx.createImageData(width, height);

        // Calculate pixel differences
        for (let i = 0; i < imageData1.data.length; i += 4) {
            const r1 = imageData1.data[i];
            const g1 = imageData1.data[i + 1];
            const b1 = imageData1.data[i + 2];

            const r2 = imageData2.data[i];
            const g2 = imageData2.data[i + 1];
            const b2 = imageData2.data[i + 2];

            const rDiff = Math.abs(r1 - r2);
            const gDiff = Math.abs(g1 - g2);
            const bDiff = Math.abs(b1 - b2);

            diffData.data[i] = Math.min(255, rDiff * 3);
            diffData.data[i + 1] = Math.min(255, gDiff * 3);
            diffData.data[i + 2] = Math.min(255, bDiff * 3);
            diffData.data[i + 3] = 255;
        }

        ctx.putImageData(diffData, 0, 0);
        diffCanvas.style.transform = getTransformString();
    }

    function toggleDifferences(show) {
        if (state.renderMode === 'overlay') {
            state.showDifferences = false;
            show = false;
        }

        state.showDifferences = show;

        if (show) {
            calculateAllDifferences();
        }

        state.imageContainers.forEach(imgContainer => {
            const isReference = imgContainer.imageIndex === state.referenceIndex;
            const showDiff = show && !isReference;
            imgContainer.image.style.display = showDiff ? 'none' : 'block';
            imgContainer.diffCanvas.style.display = showDiff ? 'block' : 'none';
        });
    }

    function getTransformString() {
        return `translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
    }

    function updateTransform() {
        const transform = getTransformString();
        state.imageContainers.forEach(imgContainer => {
            imgContainer.image.style.transform = transform;
            imgContainer.overlayImage.style.transform = transform;
            imgContainer.diffCanvas.style.transform = transform;
        });
    }

    function resetView() {
        state.scale = 1;
        state.panning = false;
        state.pointX = 0;
        state.pointY = 0;
        state.startX = 0;
        state.startY = 0;
        updateTransform();
        updateZoomDisplay();
    }


    // Zoom (centered on the current viewport center for consistent mosaic behavior)
    container.addEventListener('wheel', (e) => {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = state.scale * delta;

        if (newScale < 0.05 || newScale > 50) return;

        // Scale the pan offset so the point currently at the viewport center
        // stays at the viewport center after the zoom.
        const scaleChange = newScale / state.scale;
        state.pointX = state.pointX * scaleChange;
        state.pointY = state.pointY * scaleChange;

        state.scale = newScale;
        updateTransform();
        updateZoomDisplay();
    });

    // Pan
    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        state.startX = e.clientX - state.pointX;
        state.startY = e.clientY - state.pointY;
        state.panning = true;
    });

    container.addEventListener('mousemove', (e) => {
        if (!state.panning) return;
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
    });

    container.addEventListener('mouseup', () => {
        state.panning = false;
    });

    container.addEventListener('mouseleave', () => {
        state.panning = false;
    });

    function setDropTargetActive(active) {
        container.classList.toggle('drop-target-active', active);
    }

    container.addEventListener('dragenter', (event) => {
        event.preventDefault();
        setDropTargetActive(true);
    });

    container.addEventListener('dragover', (event) => {
        event.preventDefault();
        setDropTargetActive(true);
    });

    container.addEventListener('dragleave', (event) => {
        if (event.relatedTarget && container.contains(event.relatedTarget)) {
            return;
        }
        setDropTargetActive(false);
    });

    container.addEventListener('drop', (event) => {
        event.preventDefault();
        setDropTargetActive(false);

        const droppedUris = getDroppedUris(event);
        if (droppedUris.length === 0) {
            return;
        }

        vscode.postMessage({
            command: 'droppedUris',
            uris: droppedUris
        });
    });

    // Event listeners for controls
    differencesCheckbox.addEventListener('change', (e) => {
        toggleDifferences(e.target.checked);
    });

    dissolveSlider.addEventListener('input', (e) => {
        if (state.renderMode === 'overlay') {
            return;
        }
        state.dissolveAmount = parseInt(e.target.value);
        dissolveValue.textContent = `${state.dissolveAmount}%`;
        updateDissolve();
    });

    renderModeSelector.addEventListener('change', (e) => {
        setRenderMode(e.target.value, true);
    });

    fitAllBtn.addEventListener('click', () => {
        resetView();
    });

    helpBtn.addEventListener('click', () => {
        setHelpVisible(true);
    });

    closeHelpBtn.addEventListener('click', () => {
        setHelpVisible(false);
    });

    function restoreOriginalImages() {
        state.imageContainers.forEach(imgContainer => {
            if (imgContainer.originalSrc) {
                imgContainer.image.src = imgContainer.originalSrc;
                delete imgContainer.originalSrc;
            }
        });
    }

    overlayBtn.addEventListener('mousedown', () => {
        if (state.renderMode === 'overlay') return;
        const referenceImage = state.images[state.referenceIndex];
        if (!referenceImage?.data) return;

        state.imageContainers.forEach(imgContainer => {
            if (imgContainer.imageIndex !== state.referenceIndex) {
                imgContainer.originalSrc = imgContainer.image.src;
                imgContainer.image.src = referenceImage.data;
            }
        });
    });

    overlayBtn.addEventListener('mouseup', restoreOriginalImages);
    overlayBtn.addEventListener('mouseleave', restoreOriginalImages);

    window.addEventListener('message', event => {
        const message = event.data;

        if (message.command === 'imagesCount') {
            state.images = new Array(message.count);
            state.expectedImageCount = message.count;
            state.loadedImageCount = 0;
            state.referenceIndex = Math.min(state.referenceIndex, Math.max(0, message.count - 1));
            state.activeOverlayIndex = Math.min(state.activeOverlayIndex, Math.max(0, message.count - 1));
            createImageContainers();
            resetView();
            updateSelectorDropdowns();
            updateStatusLine();
            return;
        }

        if (message.command === 'setRenderMode') {
            setRenderMode(message.mode);
            return;
        }

        if (message.command === 'pairStatus') {
            state.pairStatus = typeof message.text === 'string' ? message.text : '';
            updateStatusLine();
            return;
        }

        if (message.command === 'selectImageIndex') {
            selectImageIndex(message.index);
            return;
        }

        if (message.command === 'cycleImage') {
            cycleOverlay(1);
            return;
        }

        if (message.command === 'cycleImagePrevious') {
            cycleOverlay(-1);
            return;
        }

        if (message.command === 'imageLoaded') {
            state.images[message.index] = {
                data: message.data,
                filename: message.filename,
                fileSizeBytes: message.fileSizeBytes,
                slotIndex: Number.isInteger(message.slotIndex) ? message.slotIndex : message.index
            };
            state.loadedImageCount++;

            const ic = state.imageContainers[message.index];
            if (ic) {
                ic.image.src = message.data;
                updateFilenameLabel(ic.filenameLabel, state.images[message.index]);
                if (ic.placeholder) {
                    ic.placeholder.style.display = 'none';
                }
                ic.image.style.display = 'block';
            }

            updateSelectorDropdowns();
            updateDissolve();

            if (state.showDifferences) {
                calculateAllDifferences();
            }

            updateStatusLine();
        }

        if (message.command === 'imageUpdated') {
            const idx = message.index;
            if (idx >= 0 && idx < state.images.length) {
                if (!state.images[idx]) {
                    state.images[idx] = {};
                }

                state.images[idx].data = message.data;
                state.images[idx].filename = message.filename;
                state.images[idx].fileSizeBytes = message.fileSizeBytes;
                delete state.images[idx].width;
                delete state.images[idx].height;

                // Update the img src in-place (preserves zoom/pan)
                const ic = state.imageContainers[idx];
                if (ic) {
                    ic.image.src = message.data;
                    updateFilenameLabel(ic.filenameLabel, state.images[idx]);
                    if (ic.placeholder) {
                        ic.placeholder.style.display = 'none';
                    }
                    ic.image.style.display = 'block';
                }

                updateStatusLine();

                // Recalculate differences if active
                if (state.showDifferences) {
                    calculateAllDifferences();
                }

                // Refresh dissolve overlay if needed
                updateDissolve();
            }
        }
    });

    window.addEventListener('keydown', handleAltDigitFallback, true);
    document.addEventListener('keydown', handleAltDigitFallback, true);
    window.addEventListener('keydown', handleGeneralShortcuts, true);
    document.addEventListener('keydown', handleGeneralShortcuts, true);

    renderHelpContent();
    updateStatusLine();

    // Context menu
    function showContextMenu(x, y) {
        // Update dynamic labels
        const diffItem = contextMenu.querySelector('[data-action="toggleDifferences"]');
        if (diffItem) {
            const checked = state.showDifferences ? '✓' : '  ';
            diffItem.innerHTML = `<span class="check-mark">${checked}</span> Differences`;
        }

        const modeItem = contextMenu.querySelector('[data-action="toggleMode"]');
        if (modeItem) {
            const nextMode = state.renderMode === 'mosaic' ? 'Overlay' : 'Mosaic';
            modeItem.textContent = `Switch to ${nextMode}`;
        }

        contextMenu.classList.remove('hidden');

        // Position and keep within viewport
        const menuRect = contextMenu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (x + menuRect.width > vw) x = vw - menuRect.width - 4;
        if (y + menuRect.height > vh) y = vh - menuRect.height - 4;
        if (x < 0) x = 4;
        if (y < 0) y = 4;

        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
    }

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
    }

    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    });

    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });

    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;

        const action = item.dataset.action;
        hideContextMenu();

        switch (action) {
            case 'fit':
                resetView();
                break;
            case 'zoom100':
                state.scale = 1;
                state.pointX = 0;
                state.pointY = 0;
                updateTransform();
                updateZoomDisplay();
                break;
            case 'toggleMode': {
                const nextMode = state.renderMode === 'mosaic' ? 'overlay' : 'mosaic';
                renderModeSelector.value = nextMode;
                setRenderMode(nextMode, true);
                break;
            }
            case 'toggleDifferences':
                differencesCheckbox.checked = !differencesCheckbox.checked;
                toggleDifferences(differencesCheckbox.checked);
                break;
            case 'help':
                setHelpVisible(true);
                break;
        }
    });

    vscode.postMessage({ command: 'webviewReady' });

})();
