import { defineEndpoint } from '@directus/extensions-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readable } from 'stream';
import { URL } from 'url';
import multer from 'multer';

// Type definitions
interface VideoMetadata {
    url: string;
    title: string;
    description: string;
    thumbnail: string;
    provider_name: string;
    html: string;
}

interface OEmbedResponse {
    title?: string;
    description?: string;
    thumbnail_url?: string;
    provider_name?: string;
    html?: string;
    author_name?: string;
    author?: string;
}

interface ProviderData {
    title: string;
    description: string;
    thumbnail_url: string;
    html: string | null;
    author_name?: string;
    provider_name: string;
}

interface InfoRequest {
    body: {
        url?: string;
    };
}

interface DownloadRequest {
    body: {
        url?: string;
        title?: string;
        folder?: string;
    };
    schema: unknown;
    accountability: unknown;
}

interface UploadRequest {
    file?: {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
    };
    body: {
        folder?: string;
        title?: string;
    };
    schema: unknown;
    accountability: unknown;
}

// SSRF Protection: Validate URL and block private/internal addresses
function isUrlSafe(urlString: string): { safe: boolean; error?: string } {
    try {
        const url = new URL(urlString);

        // Only allow HTTP(S)
        if (!['http:', 'https:'].includes(url.protocol)) {
            return { safe: false, error: 'Only HTTP(S) protocols are allowed' };
        }

        const hostname = url.hostname.toLowerCase();

        // Block localhost variations
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
            return { safe: false, error: 'Localhost is not allowed' };
        }

        // Block private IP ranges
        const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipv4Match) {
            const [, a, b, c] = ipv4Match.map(Number);
            // 10.x.x.x
            if (a === 10) return { safe: false, error: 'Private IP range is not allowed' };
            // 172.16.x.x - 172.31.x.x
            if (a === 172 && b >= 16 && b <= 31) return { safe: false, error: 'Private IP range is not allowed' };
            // 192.168.x.x
            if (a === 192 && b === 168) return { safe: false, error: 'Private IP range is not allowed' };
            // 169.254.x.x (link-local)
            if (a === 169 && b === 254) return { safe: false, error: 'Link-local IP is not allowed' };
            // 0.x.x.x
            if (a === 0) return { safe: false, error: 'Invalid IP range' };
        }

        // Block internal hostnames
        if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
            return { safe: false, error: 'Internal hostnames are not allowed' };
        }

        // Allow only known video providers for video URLs
        const allowedHosts = [
            // YouTube
            'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
            'img.youtube.com', 'i.ytimg.com', 'i9.ytimg.com',
            // Vimeo
            'vimeo.com', 'www.vimeo.com', 'player.vimeo.com', 'i.vimeocdn.com',
            // Rutube
            'rutube.ru', 'www.rutube.ru', 'pic.rutube.ru',
            // VK Video - all domains
            'vk.com', 'www.vk.com', 'm.vk.com',
            'vk.ru', 'www.vk.ru', 'm.vk.ru',
            'vkontakte.ru', 'www.vkontakte.ru',
            'vkvideo.ru', 'www.vkvideo.ru', 'm.vkvideo.ru',
        ];

        // CDN domains (thumbnails hosted on various subdomains)
        const isYouTubeCdn = hostname.endsWith('.ytimg.com') ||
                            hostname.endsWith('.youtube.com') ||
                            hostname.endsWith('.googlevideo.com') ||
                            hostname.endsWith('.ggpht.com');
        const isVimeoCdn = hostname.endsWith('.vimeocdn.com') ||
                          hostname.endsWith('.vimeo.com');
        const isRutubeCdn = hostname.endsWith('.rutube.ru') ||
                           hostname.endsWith('.rutubelist.ru') ||
                           hostname.endsWith('.rutubecdn.ru');
        const isVkCdn = hostname.endsWith('.userapi.com') ||
                        hostname.endsWith('.vk.com') ||
                        hostname.endsWith('.vk.ru') ||
                        hostname.endsWith('.vk.me') ||
                        hostname.endsWith('.vkontakte.ru') ||
                        hostname.endsWith('.vkvideo.ru') ||
                        hostname.endsWith('.vkuservideo.net') ||
                        hostname.endsWith('.vkuseraudio.net') ||
                        hostname.endsWith('.vkcdn.ru');

        const isAllowedHost = allowedHosts.some(host => hostname === host);
        const isAllowedCdn = isYouTubeCdn || isVimeoCdn || isRutubeCdn || isVkCdn;

        if (!isAllowedHost && !isAllowedCdn) {
            return { safe: false, error: `Host "${hostname}" is not in allowed list` };
        }

        return { safe: true };
    } catch (e) {
        return { safe: false, error: 'Invalid URL format' };
    }
}

export default defineEndpoint((router, { services }) => {
    const { FilesService } = services;

    function normalizeUrl(url: string): string {
        // Normalize all VK domains to vk.com
        if (url.includes('vkvideo.ru')) {
            return url.replace('vkvideo.ru', 'vk.com');
        }
        if (url.includes('vk.ru')) {
            return url.replace('vk.ru', 'vk.com');
        }
        if (url.includes('vkontakte.ru')) {
            return url.replace('vkontakte.ru', 'vk.com');
        }
        return url;
    }

    async function getOEmbed(url: string): Promise<OEmbedResponse | null> {
        let oembedUrl = '';
        // Use normalized URL for oEmbed query
        const fetchUrl = normalizeUrl(url);

        if (fetchUrl.includes('youtube.com') || fetchUrl.includes('youtu.be')) {
            oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(fetchUrl)}&format=json`;
        } else if (fetchUrl.includes('vimeo.com')) {
            oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(fetchUrl)}`;
        } else if (fetchUrl.includes('rutube.ru')) {
            oembedUrl = `https://rutube.ru/api/oembed/?url=${encodeURIComponent(fetchUrl)}&format=json`;
        } else if (fetchUrl.includes('vk.com')) {
            oembedUrl = `https://vk.com/oembed?url=${encodeURIComponent(fetchUrl)}`;
        }

        if (oembedUrl) {
            try {
                const response = await axios.get<OEmbedResponse>(oembedUrl, { timeout: 5000 });
                return response.data;
            } catch (e) {
                // Log concise error
                console.warn('[oEmbed Error]', oembedUrl, (e as Error).message);
            }
        }
        return null;
    }

    async function checkImageUrl(url: string) {
        try {
            const res = await axios.head(url, { timeout: 2000 });
            return res.status >= 200 && res.status < 400;
        } catch {
            return false;
        }
    }

    router.post('/info', async (req: InfoRequest, res) => {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }

        // SSRF Protection
        const urlCheck = isUrlSafe(url);
        if (!urlCheck.safe) {
            return res.status(400).json({ message: urlCheck.error || 'Invalid URL' });
        }

        try {
            // Normalize URL first
            const normalizedUrl = normalizeUrl(url);

            // Try oEmbed first
            const oembed = await getOEmbed(normalizedUrl);

            const result: VideoMetadata = {
                url,
                title: '',
                description: '',
                thumbnail: '',
                provider_name: '',
                html: '',
            };

            if (oembed) {
                result.title = oembed.title || '';
                result.description = oembed.description || '';
                result.thumbnail = oembed.thumbnail_url || '';
                result.provider_name = oembed.provider_name || '';
                result.html = oembed.html || '';
            }

            // Fallback or Supplement with Scraping
            try {
                const response = await axios.get(normalizedUrl, {
                    timeout: 5000,
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'ru,en;q=0.9',
                    },
                });

                let html = '';
                let charset = 'utf-8';

                // Try to detect charset from headers
                const contentType = response.headers['content-type']?.toLowerCase() || '';
                const match = contentType.match(/charset=([a-zA-Z0-9-]+)/);
                if (match) {
                    charset = match[1];
                }

                try {
                    const decoder = new TextDecoder(charset);
                    html = decoder.decode(response.data);
                } catch (e) {
                    // Fallback if charset is not supported or detection failed
                    const decoder = new TextDecoder('utf-8');
                    html = decoder.decode(response.data);
                }

                const $ = cheerio.load(html);

                if (!result.title) result.title = $('meta[property="og:title"]').attr('content') || $('title').text();
                if (!result.description) result.description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');
                if (!result.thumbnail) result.thumbnail = $('meta[property="og:image"]').attr('content');
                if (!result.provider_name) result.provider_name = $('meta[property="og:site_name"]').attr('content');
                if (!result.html) result.html = $('meta[property="og:video:url"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
            } catch (e) {
                // Ignore scraping errors if we have partial data or just fail gracefully to allow manual entry/fallbacks
                console.warn('[Video Parser] Scraping failed for:', normalizedUrl, (e as Error).message);
            }

            // Provider Specific Fixes (Applied even if scraping failed)
            // YouTube high resolution check
            if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
                const videoId = normalizedUrl.match(/(?:\?v=|&v=|youtu\.be\/|embed\/)([^&\n?#]+)/)?.[1];
                if (videoId) {
                    // Try to find a working high-res thumbnail
                    const resolutions = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
                    for (const resType of resolutions) {
                        const thumbUrl = `https://img.youtube.com/vi/${videoId}/${resType}.jpg`;
                        if (await checkImageUrl(thumbUrl)) {
                            result.thumbnail = thumbUrl;
                            break;
                        }
                    }
                    if (!result.html) result.html = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
                    result.provider_name = 'YouTube';
                }
            } else if (normalizedUrl.includes('rutube.ru')) {
                try {
                    const rutubeData = await fetchRutubeData(normalizedUrl);
                    result.title = rutubeData.title;
                    result.description = rutubeData.description;
                    result.thumbnail = rutubeData.thumbnail_url;
                    result.provider_name = 'Rutube';
                    if (rutubeData.html) result.html = rutubeData.html;
                } catch (rutubeError) {
                    console.warn('Rutube Fetch failed, falling back to basic embed', rutubeError);
                    result.provider_name = 'Rutube';
                    const videoId = normalizedUrl.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/)?.[1];
                    if (videoId && !result.html) {
                        result.html = `<iframe width="720" height="405" src="https://rutube.ru/play/embed/${videoId}/" frameBorder="0" allow="clipboard-write; autoplay" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>`;
                    }
                }
            } else if (normalizedUrl.includes('vk.com')) {
                try {
                    const vkData = await fetchVKData(normalizedUrl);
                    result.title = vkData.title;
                    result.description = vkData.description;
                    result.thumbnail = vkData.thumbnail_url;
                    result.provider_name = 'VK Video';
                    if (vkData.html) result.html = vkData.html;
                } catch (vkError) {
                    console.warn('VK Fetch failed, falling back to basic embed', vkError);
                    result.provider_name = 'VK Video';
                    const match = normalizedUrl.match(/video(-?\d+)_(\d+)/);
                    if (match && !result.html) {
                        result.html = `<iframe src="https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2" width="853" height="480" allow="autoplay; encrypted-media; fullscreen; picture-in-picture;" frameborder="0" allowfullscreen></iframe>`;
                    }
                }
            }

            res.json(result);
        } catch (error) {
            // Log concise error info
            console.error('[Video Parser Error]', (error as Error).message);
            res.status(500).json({ message: 'Failed to parse video information', error: (error as Error).message });
        }
    });

    router.post('/download', async (req: DownloadRequest, res) => {
        const { url, title, folder } = req.body;

        if (!url) {
            return res.status(400).json({ message: 'Thumbnail URL is required' });
        }

        // SSRF Protection for thumbnail download
        const urlCheck = isUrlSafe(url);
        if (!urlCheck.safe) {
            console.error('[Video Parser] Blocked thumbnail URL:', url, '- Reason:', urlCheck.error);
            return res.status(400).json({ message: urlCheck.error || 'Invalid thumbnail URL' });
        }

        try {
            // Pass accountability to ensure permissions are checked correctly
            const filesService = new FilesService({
                schema: req.schema,
                accountability: req.accountability
            });

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': new URL(url).origin, // Some CDNs check referrer
                },
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            const extension = contentType.split('/')[1] || 'jpg';
            const fileName = `video_preview_${Date.now()}.${extension}`;

            const payload = {
                title: title || 'Video Preview',
                folder: folder ? folder : undefined, // Ensure '' becomes undefined
                filename_download: fileName,
                type: contentType,
                storage: process.env.STORAGE_LOCATIONS ? process.env.STORAGE_LOCATIONS.split(',')[0] : 'local',
            };

            const fileId = await filesService.uploadOne(Readable.from(Buffer.from(response.data)), payload);

            res.json({ id: fileId });
        } catch (error) {
            // Extended error logging for debugging 500s
            console.error('[Video Parser Download Error] Full error:', error);
            res.status(500).json({
                message: 'Failed to download preview image',
                error: (error as Error).message,
                details: (error as any)?.response?.data ? 'Provider error' : 'Internal error'
            });
        }
    });

    // Upload custom image with folder support
    const upload = multer({ storage: multer.memoryStorage() });

    router.post('/upload', upload.single('file'), async (req: UploadRequest, res) => {
        const file = req.file;
        const { folder, title } = req.body;

        if (!file) {
            return res.status(400).json({ message: 'File is required' });
        }

        try {
            const filesService = new FilesService({
                schema: req.schema,
                accountability: req.accountability
            });

            const payload = {
                title: title || file.originalname,
                folder: folder && folder.trim() ? folder : undefined,
                filename_download: file.originalname,
                type: file.mimetype,
                storage: process.env.STORAGE_LOCATIONS ? process.env.STORAGE_LOCATIONS.split(',')[0] : 'local',
            };

            const fileId = await filesService.uploadOne(Readable.from(file.buffer), payload);

            res.json({ id: fileId });
        } catch (error) {
            console.error('[Video Parser Upload Error]', error);
            res.status(500).json({
                message: 'Failed to upload file',
                error: (error as Error).message
            });
        }
    });
});

async function fetchVKData(url: string): Promise<ProviderData> {
    // Normalize URL for VK (all domains to vk.com)
    let targetUrl = url;
    if (targetUrl.includes('vkvideo.ru')) {
        targetUrl = targetUrl.replace('vkvideo.ru', 'vk.com');
    } else if (targetUrl.includes('vk.ru')) {
        targetUrl = targetUrl.replace('vk.ru', 'vk.com');
    } else if (targetUrl.includes('vkontakte.ru')) {
        targetUrl = targetUrl.replace('vkontakte.ru', 'vk.com');
    }

    // Run oEmbed and Scraping in parallel to get best data
    const oEmbedPromise = axios.get(`https://vk.com/video_ext.php?oembed=1&url=${encodeURIComponent(targetUrl)}`, { timeout: 5000 });

    // Scraping request with arraybuffer for charset decoding
    const scrapePromise = axios.get(targetUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
        timeout: 8000
    });

    const [oEmbedResult, scrapeResult] = await Promise.allSettled([oEmbedPromise, scrapePromise]);

    let oEmbedData: any = {};
    let scrapeData: any = {};

    // Process oEmbed result
    if (oEmbedResult.status === 'fulfilled') {
        oEmbedData = oEmbedResult.value.data;
    }

    // Process Scarpe result (CharDet + Cheerio)
    if (scrapeResult.status === 'fulfilled') {
        try {
            const buffer = Buffer.from(scrapeResult.value.data);

            // Simple charset detection
            let charset = 'utf-8';
            const contentType = scrapeResult.value.headers['content-type'] || '';
            if (contentType.includes('windows-1251')) charset = 'windows-1251';

            // Fallback: peek at meta charset if content-type missing
            if (!contentType.includes('charset=')) {
                const head = buffer.toString('ascii', 0, 1000).toLowerCase();
                if (head.includes('windows-1251')) charset = 'windows-1251';
            }

            const decoder = new TextDecoder(charset);
            const html = decoder.decode(buffer);
            const $ = cheerio.load(html);

            scrapeData = {
                title: $('meta[property="og:title"]').attr('content') || $('title').text(),
                description: $('meta[property="og:description"]').attr('content'),
                thumbnail_url: $('meta[property="og:image"]').attr('content'),
                html: null // Use oEmbed for HTML usually
            };
        } catch (e) {
            console.warn('[VK Scraping] Failed to parse HTML:', e);
        }
    }

    // Merge strategies:
    // 1. Thumbnail: Scraping (og:image) is usually higher res than oEmbed
    // 2. Title/Desc: oEmbed is often cleaner, but Scraping is fine too. Let's prefer oEmbed for text if available.
    // 3. HTML: oEmbed is definitive source for player code.

    const title = oEmbedData.title || scrapeData.title;
    const description = oEmbedData.description || scrapeData.description;
    // Prefer scraped og:image for resolution, fallback to oEmbed
    const thumbnail_url = scrapeData.thumbnail_url || oEmbedData.thumbnail_url;
    const html = oEmbedData.html || scrapeData.html;
    const author_name = oEmbedData.author_name || oEmbedData.author;
    const provider_name = 'VK Video';

    if (!title && !thumbnail_url) {
        throw new Error('Failed to fetch data from VK (both oEmbed and Scraping failed)');
    }

    return {
        title,
        description,
        thumbnail_url,
        html,
        author_name,
        provider_name
    };
}

async function fetchRutubeData(url: string): Promise<ProviderData> {
    let videoId = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/)?.[1];

    // Run oEmbed and Scraping in parallel
    const oEmbedPromise = axios.get(`https://rutube.ru/api/oembed/?url=${encodeURIComponent(url)}&format=json`, { timeout: 5000 });
    const scrapePromise = axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });

    // Try to get max resolution thumbnail from API if ID is available
    let apiThumbnailPromise = Promise.resolve(null as string | null);
    if (videoId) {
        apiThumbnailPromise = axios.head(`https://rutube.ru/api/video/${videoId}/thumbnail/?redirect=1`, {
            timeout: 5000,
            maxRedirects: 5
        }).then(res => {
            // Axios in Node follows redirects, so the final URL is in the request result
            return res.request?.res?.responseUrl || res.request?.responseURL || null;
        }).catch(() => null);
    }

    const [oEmbedResult, scrapeResult, apiThumbnailResult] = await Promise.allSettled([oEmbedPromise, scrapePromise, apiThumbnailPromise]);

    let oEmbedData: any = {};
    let scrapeData: any = {};
    let apiThumbnail = (apiThumbnailResult.status === 'fulfilled') ? apiThumbnailResult.value : null;

    if (oEmbedResult.status === 'fulfilled') {
        oEmbedData = oEmbedResult.value.data;
    }

    if (scrapeResult.status === 'fulfilled') {
        try {
            const html = scrapeResult.value.data;
            const $ = cheerio.load(html);

            scrapeData = {
                title: $('meta[property="og:title"]').attr('content') || $('title').text(),
                description: $('meta[property="og:description"]').attr('content'),
                thumbnail_url: $('meta[property="og:image"]').attr('content'),
                html: null
            };
        } catch (e) {
            console.warn('[Rutube Scraping] Failed to parse HTML:', e);
        }
    }

    // Prioritize API thumbnail -> Scraping -> oEmbed
    const title = oEmbedData.title || scrapeData.title;
    const description = oEmbedData.description || scrapeData.description;
    const thumbnail_url = apiThumbnail || scrapeData.thumbnail_url || oEmbedData.thumbnail_url;
    const html = oEmbedData.html || scrapeData.html;
    const author_name = oEmbedData.author_name || oEmbedData.author;
    const provider_name = 'Rutube';

    if (!title && !thumbnail_url) {
        throw new Error('Failed to fetch data from Rutube');
    }

    return {
        title,
        description,
        thumbnail_url,
        html,
        author_name,
        provider_name
    };
}
