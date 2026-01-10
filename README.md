# Directus Extension: Video Field

A Directus bundle extension for managing video content with automatic metadata parsing from YouTube, Vimeo, Rutube, and VK Video.

![Directus 10.0+](https://img.shields.io/badge/Directus-10.0%2B-purple)
![License MIT](https://img.shields.io/badge/License-MIT-green)

## Features

- **Auto Metadata** — Automatically fetch title, description, and thumbnail from video URL
- **Multiple Providers** — Support for YouTube, Vimeo, Rutube, and VK Video
- **Thumbnail Management** — Download remote thumbnails or upload custom images
- **Live Preview** — Embedded video preview in the editor
- **Display Component** — Show video thumbnail with provider badge in lists
- **Localization** — English and Russian interface

## Supported Providers

| Provider | URL Patterns |
|----------|-------------|
| YouTube | youtube.com, youtu.be |
| Vimeo | vimeo.com |
| Rutube | rutube.ru |
| VK Video | vk.com, vk.ru, vkvideo.ru |

## Installation

### NPM

```bash
npm install directus-extension-video-field
```

### Manual

1. Download the latest release
2. Extract to `extensions/directus-extension-video-field/`
3. Restart Directus

## Usage

### 1. Create Field

1. Add a new field to your collection
2. Choose type: **JSON** or **Text**
3. Choose interface: **Video Field**

### 2. Interface Options

| Option | Description | Default |
|--------|-------------|---------|
| Folder | Folder for downloaded thumbnails | — |
| Size | Thumbnail preview size | medium |

### 3. Display Options

Use **Video Display** to show thumbnails in lists:

| Option | Description | Default |
|--------|-------------|---------|
| Thumbnail Width | Width in pixels | 100 |
| Show Badge | Display provider badge | true |
| Show Link | Display external link icon | true |

## Data Structure

The field stores JSON with the following structure:

```json
{
  "url": "https://youtube.com/watch?v=...",
  "title": "Video Title",
  "description": "Video description",
  "thumbnail_remote": "https://i.ytimg.com/...",
  "thumbnail_file": "uuid-of-directus-file",
  "provider_name": "YouTube"
}
```

## Bundle Contents

This extension includes:

- **Interface: `video-field`** — Video URL editor with metadata
- **Display: `video-display`** — Thumbnail preview for lists
- **Endpoint: `/video-parser`** — API for metadata fetching

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/video-parser/info` | Fetch video metadata |
| POST | `/video-parser/download` | Download thumbnail to Directus |
| POST | `/video-parser/upload` | Upload custom thumbnail |

### Example: Fetch Metadata

```bash
curl -X POST https://your-directus/video-parser/info \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Security

- **SSRF Protection** — URL validation blocks private IPs and internal hosts
- **XSS Protection** — Embed HTML is generated client-side from URL patterns only

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

Miša ([@bulkmaker](https://github.com/bulkmaker))

## Links

- [Directus](https://directus.io)
- [Report Issues](https://github.com/bulkmaker/directus-extension-video-field/issues)
