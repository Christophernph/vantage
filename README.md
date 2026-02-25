<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Vantage Icon">
</p>

<h1 align="center">Vantage Image Compare</h1>

<p align="center">
  <strong>Synchronized multi-image comparison for Visual Studio Code</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=vantage-rd.vantage"><img src="https://img.shields.io/visual-studio-marketplace/v/vantage-rd.vantage?label=Marketplace&color=007acc" alt="VS Marketplace Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=vantage-rd.vantage"><img src="https://img.shields.io/visual-studio-marketplace/i/vantage-rd.vantage?color=007acc" alt="Installs"></a>
  <a href="https://github.com/Christophernph/vantage/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Christophernph/vantage?color=007acc" alt="License"></a>
</p>

---

Compare two or more images side-by-side in an adaptive mosaic grid with synchronized zoom and pan, pixel-level difference highlighting, and an overlay mode for rapid A/B switching — all without leaving VS Code.

## ✨ Features

### Multi-Image Mosaic

Compare 2+ images simultaneously in a responsive grid that adapts to your panel size. Every image stays in sync — zoom into a detail on one and all others follow.

### Overlay Mode

Switch to a single-viewport overlay and instantly jump between images with keyboard shortcuts. Perfect for rapid before/after comparisons.

### Pixel-Level Differences

Toggle difference visualization to see exactly what changed between the reference image and each comparison image, down to the pixel.

### Reference Image Selection

Designate any image as the reference with a clear blue border highlight. Press and hold the overlay button to temporarily flash the reference across all grid positions.

### Synchronized Zoom & Pan

Zoom to any point in any image — all viewports stay perfectly aligned. Drag to pan across all images simultaneously.

### Image Browser Sidebar

Browse image-only directory trees from the Activity Bar. Set a root path, filter with wildcard patterns (`*.png`, `*_mask.*`), multi-select files and folders, and open everything in the compare panel in one click.

### Paired Folder Comparison

Start a strict paired workflow across 2+ folders and step through matched filenames (stem-based matching, extension-agnostic). Navigate pairs with keyboard shortcuts while keeping all normal comparison tools.

### Reorderable Image Lists

Reorder images from the **Reference** / **Active** dropdown using drag-and-drop handles. In paired mode, reordering persists while stepping to next/previous pairs.

### Drag & Drop

Drag images or entire folders from the VS Code Explorer directly into the compare panel to add them to the current session.

### State Preservation

Your zoom level, pan position, view mode, and selections persist across tab switches. Pick up right where you left off.

## 🚀 Getting Started

### From the Marketplace

1. Install **[Vantage Image Compare](https://marketplace.visualstudio.com/items?itemName=vantage-rd.vantage)** from the Extensions panel
2. Select 2+ images in the File Explorer → Right-click → **Vantage: Compare Images**

### From the Command Palette

Run **Vantage: Start** (`Ctrl+Shift+P` / `Cmd+Shift+P`) to open an empty panel, then load images via right-click, sidebar, or drag & drop.

### From the Sidebar

1. Open the **Vantage** view in the Activity Bar
2. Set a folder path and optionally filter by pattern
3. Select images → Click **Open in Editor**
4. For paired mode, select 2+ folders → **Start Paired Comparison (Selected Folders)**

## 🎮 Controls

| Input                                | Action                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| **Scroll wheel**                     | Zoom in/out centered on image (synced)                                   |
| **Click + drag**                     | Pan all images                                                           |
| **Mode selector**                    | Toggle Mosaic ↔ Overlay                                                  |
| `Alt+1` – `Alt+9`                    | Jump to image 1–9                                                        |
| `Alt+Tab`                            | Next image                                                               |
| `Shift+Alt+Tab`                      | Previous image                                                           |
| `Ctrl+Alt+Right`                     | Next matched pair (paired mode)                                          |
| `Ctrl+Alt+Left`                      | Previous matched pair (paired mode)                                      |
| `Ctrl+Shift+PgDn` / `Ctrl+Shift+PgUp` | Next / previous matched pair fallback (paired mode)                    |
| **Fit** button                       | Reset zoom to fit view                                                   |
| **?** button                         | Show shortcut help overlay                                               |
| **Differences** checkbox             | Toggle pixel diff visualization                                          |
| **Reference / Active** dropdown      | Set reference/active image, drag-reorder image slots, remove image slot |
| **Hold overlay button**              | Flash reference image in all positions                                   |

## 📂 Supported Formats

PNG · JPEG · GIF · WebP · BMP · SVG

---

## 🛠 Development

### Prerequisites

- [VS Code](https://code.visualstudio.com/) `^1.80.0`
- [Node.js](https://nodejs.org/) 18+ and npm

### Setup

```bash
git clone https://github.com/Christophernph/vantage.git
cd vantage
npm install
npm run compile
```

Press **F5** to launch the Extension Development Host, then run **Vantage: Start** from the Command Palette.

### Scripts

| Command                                   | Description             |
| ----------------------------------------- | ----------------------- |
| `npm run compile`                         | Build the extension     |
| `npm run watch`                           | Rebuild on file changes |
| `npx @vscode/vsce package --skip-license` | Package as `.vsix`      |

### Project Structure

```
vantage/
├── src/
│   ├── extension.ts          # Extension entry point & command registration
│   ├── ImageDiffPanel.ts     # Webview panel for image comparison
│   └── SidebarProvider.ts    # Tree view sidebar provider
├── media/
│   ├── main.js               # Webview frontend logic
│   └── style.css             # Webview styles
├── .github/
│   └── workflows/
│       └── publish.yml       # CI/CD publish workflow
├── package.json
└── tsconfig.json
```

## 🤝 Contributing

Contributions are welcome! Here's how to get involved:

1. **Fork** the repository
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/my-feature
   ```
3. **Make your changes** and verify:
   ```bash
   npm run compile   # Must complete without errors
   ```
4. **Test** in the Extension Development Host (press `F5`)
5. **Commit** with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add support for TIFF images
   fix: prevent pan drift on zoom reset
   ```
6. **Push** and open a **Pull Request** against `main`

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/Christophernph/vantage/issues) with:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- VS Code version and OS


## 📄 License

TBD

---

<p align="center">
  Made with 🔍 for pixel perfectionists
</p>
