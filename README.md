# YDI (YouTube Download Injector) - v1.3.1

A fast, clean, and lightweight Firefox/WebExtension browser extension designed solely to inject a download interface on YouTube and handle media downloads. This extension does not track users, bypass premium walls, or perform any background activities unrelated to downloading.

> [!WARNING]
> **Disclaimer & Fair Use**: This tool is created strictly for educational purposes and personal archive/offline viewing of public domain or creative-commons/right-to-use content. Downloader tools may violate YouTube's Terms of Service. Use at your own risk. The authors are not responsible for any misuse, copyright infringement, or account actions taken by third-party platforms.

## Core Scope

This extension is built with a singular, minimal focus:
1. **Inject Download Controls**: Add clean download buttons on YouTube pages.
2. **Download & Process**: Retrieve and merge streams locally in the browser.

## Features

- **Advanced Extraction**: Powered by `wymd.js` to retrieve high-quality video/audio streams and subtitle tracks.
- **Sub Remuxing**: Merges high-definition video-only and audio-only streams directly in the browser using `libav.js` and `lame.min.js`.
- **Format Options**: Download as Muxed Video (MP4/WebM), Audio-only (MP3/M4A), or Subtitles (SRT/VTT/SRV1).
- **Responsive Interface**: Modern Material Design UI (using MDUI) with support for light/dark themes.
- **Fast Chunked Downloader**: Custom background download manager (`download.js`) for optimized parallel downloading and Native File System saving.

## Directory Structure

```text
├── LICENSE.md
├── README.md
└── src/
    ├── _locales/                   # Localization (en, id)
    ├── icons/                      # Extension icons (SVG format)
    ├── libraries/                  # Third-party & helper libs
    │   ├── lame.min.js             # MP3 Audio encoder
    │   ├── libav.js                # WebAssembly FFmpeg/Libav build
    │   ├── mdui.global.js          # Material Design components library
    │   └── wymd.js                 # YouTube Multi-track extraction utility (Minified)
    ├── styles/                     # UI styles
    │   ├── mdui.css                # MDUI core styles
    │   └── popup.css               # Popup customizations
    ├── background.js               # Service Worker coordinator
    ├── content.js                  # YouTube page content injector
    ├── download.html               # Main download & remuxing dashboard
    ├── download.js                 # Chunked download & muxing logic
    ├── manifest.json               # Manifest V3 extension configuration
    ├── popup.html                  # Popup extension UI
    ├── popup.js                    # Popup controller
    └── rules.json                  # Declarative Net Request rules
```

## How to Install (Firefox)

1. Download the `.xpi` file from this release's assets.
2. Open Firefox and go to `about:addons`.
3. Click the gear icon and select **Install Add-on From File...**.
4. Select the downloaded `.xpi` file.

## License

This project is licensed under the GNU General Public License v3 - see the [LICENSE.md](LICENSE.md) file for details.

