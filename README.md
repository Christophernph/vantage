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
</p>

---

Compare two or more images side-by-side in an adaptive mosaic grid with synchronized zoom and pan, pixel-level difference highlighting, and an overlay mode for rapid A/B switching — all without leaving VS Code. Can also be used to view single images with all the same zoom and pan controls.

## ✨ Features

- View a single image or compare multiple images in one panel.
- Use **Mosaic** mode for side-by-side review or **Overlay** mode for quick A/B switching.
- Zoom and pan are synchronized so every image stays aligned while inspecting details.
- Optionally enable pixel-diff to highlight per-pixel changes against a reference image.
- Load images from Explorer context menu, the Vantage sidebar, or drag-and-drop into the panel.
- Optional paired-folder comparison lets you step through matched filenames across selected folders.

## 🚀 Getting Started

### From the Marketplace

1. Install **[Vantage Image Compare](https://marketplace.visualstudio.com/items?itemName=vantage-rd.vantage)** from the Extensions panel
2. Right-click one or more images → **Vantage: Open**

To use Vantage as your default image viewer, run **Vantage: Set as Default Image Viewer** from the Command Palette.

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
| `Ctrl+Alt+Down`                      | Next image                                                               |
| `Ctrl+Alt+Up`                        | Previous image                                                           |
| `Ctrl+Alt+Right`                     | Next matched pair (paired mode)                                          |
| `Ctrl+Alt+Left`                      | Previous matched pair (paired mode)                                      |
| **Zoom** input                       | Type a zoom percent (e.g., `125` or `125%`) and press Enter/blur to apply |
| **↺** button                         | Reset view to default pan/zoom                                           |
| **Fit** button                       | Toggle visual scale normalization across different resolutions            |
| **?** button                         | Show shortcut help overlay                                               |
| **Differences** checkbox             | Toggle pixel diff visualization                                          |
| **Reference / Active** dropdown      | Set the reference or active image, and remove images                     |

## 📂 Supported Formats

PNG · JPEG · GIF · WebP · BMP · SVG

---

## ⚙️ Configuration

### Default Image Viewer

Vantage can be set as your default image viewer in VS Code. By default, VS Code's built-in image viewer is used.

**To set Vantage as the default image viewer:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **Vantage: Set as Default Image Viewer**
3. Reload the window when prompted

**To disable it:**

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Vantage"
3. Uncheck **Default Image Viewer**
4. Reload the window when prompted

**Note:** When disabled, you can still use "Open With..." context menu to open images in Vantage.

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

No license has been specified yet.

---

<p align="center">
  Made with 🔍 for pixel perfectionists
</p>
