# Vantage

Synchronized image comparison with mosaic layout for VS Code.

## Features

- **Multi-Image Mosaic**: Compare 2+ images simultaneously in an adaptive grid layout
- **Overlay Mode**: Switch to a single-viewport overlay mode and jump between images instantly
- **Smart Grid Layout**: Automatically arranges images in a responsive mosaic grid
- **Reference Image Selection**: Designate any image as the reference with visual highlighting (blue border)
- **Quick Comparison**: Press and hold the overlay button to instantly show the reference image in all positions
- **Synchronized Zoom & Pan**: Zoom to any point in any image - all images stay perfectly aligned
- **Difference Highlighting**: Toggle pixel-level difference visualization between the reference and each comparison image
- **Keyboard Shortcuts**: Use `Alt+1-9` for quick jump in the Vantage panel (first 9 images), `Alt+Tab` next, and `Shift+Alt+Tab` previous
- **Quick Tools**: Fit, 1:1 zoom, status line, and in-panel shortcut help overlay
- **Image Browser Sidebar**: Pick a folder path, browse image-only tree, multi-select folders/files, and open in editor
- **Pattern Sidebar Filter**: Filter sidebar image tree with wildcard patterns like `*.png` or `*_mask.*`
- **Folder Count Badges**: Sidebar folders show image counts
- **Drag & Drop Intake**: Drop images/folders from Explorer into compare panel
- **Mode Persistence**: The extension remembers your last selected view mode
- **State Preservation**: Your zoom, pan, and selections are preserved when switching tabs

## Usage

### Method 1: Compare Multiple Images (2+)
1. Select 2 or more images in the VS Code File Explorer (hold `Ctrl` or `Cmd` to select multiple)
2. Right-click and choose **Vantage: Compare Images**
3. All images appear in a mosaic grid with the first image as the reference (highlighted with a blue border)
4. Focus the Vantage panel, then use `Alt+1` through `Alt+9` for quick jump (first 9 images)
5. Use `Alt+Tab` to cycle forward through all loaded images
6. Use `Shift+Alt+Tab` to cycle backward through all loaded images
6. Use the **Mode** selector to switch between **Mosaic** and **Overlay**

### Method 2: Sidebar Image Browser
1. Open the **Vantage** view in the Activity Bar
2. Use **Set Sidebar Path** from the view title (defaults to workspace path)
3. Optional: use **Set Sidebar Filter Pattern** to filter by filename/path wildcard patterns (for example `*.png`)
4. Multi-select image files and/or folders in the tree (folders are image-only filtered)
5. Folder items display image count badges
4. Click **Open in Editor** in the view title to compare all images found

### Method 3: Drag & Drop into Compare
1. Open the compare panel
2. Drag image files/folders from Explorer into the compare canvas
3. Drop to append images/folders to the current compare set

### Method 4: Open Empty Editor
1. Run **Vantage: Start** from Command Palette
2. Then load images using Explorer context menu or sidebar workflow

> Tip: In Command Palette, search for `Vantage`, `filter`, or `refresh` to find sidebar actions quickly.

## Controls

- **Mouse Wheel**: Zoom in/out at cursor position (synchronized across all images)
- **Mouse Drag**: Pan images (synchronized across all images)
- **Mode Selector**: Toggle between **Mosaic** and **Overlay** rendering
- **Blue Overlay Button** (Mosaic mode): Press and hold to temporarily show the reference image in all positions
- **Alt+1-9** (focused Vantage panel): Quick-jump to image index 1-9
- **Alt+Tab**: Cycle forward through all loaded images
- **Shift+Alt+Tab**: Cycle backward through all loaded images
- **Fit**: Reset to fit all images in view
- **1:1**: Set zoom to 100%
- **?**: Open shortcut help overlay
- **Differences Checkbox**: Toggle pixel difference visualization (reference vs each comparison image)
- **Reference Dropdown**: In Mosaic mode it sets the reference; in Overlay mode it changes active image

> Note: In **Overlay** mode, only one image is shown at a time and dissolve/differences controls are removed.
