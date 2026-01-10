<template>
	<div class="video-field" :class="{ disabled }">
		<v-input v-model="internalValue.url" :placeholder="t.placeholder" :disabled="disabled" @keyup.enter="fetchInfo">
			<template #append>
				<v-button v-tooltip="t.fetch_metadata" secondary icon @click="fetchInfo" :loading="loading" :disabled="disabled">
					<v-icon name="sync" />
				</v-button>
			</template>
		</v-input>

		<v-notice v-if="errorMessage" type="danger" icon="error">
			{{ errorMessage }}
		</v-notice>

		<div class="metadata-preview" :class="size">
			<div class="image-area">
				<v-notice v-if="!internalValue.thumbnail_file && !internalValue.thumbnail_remote" type="warning" icon="image_not_supported">
					{{ t.no_image }}
				</v-notice>
				
				<div v-else class="image-preview" :class="{ 'has-file': !!internalValue.thumbnail_file }">
					<v-image v-if="internalValue.thumbnail_file" :src="getFileUrl(internalValue.thumbnail_file)" />
					<img v-else-if="internalValue.thumbnail_remote" :src="internalValue.thumbnail_remote" />
					
					<div v-if="!disabled" class="actions-overlay">
						<template v-if="internalValue.thumbnail_file">
							<v-button v-tooltip="t.edit_image" icon small secondary @click="openFile(internalValue.thumbnail_file)">
								<v-icon name="open_in_new" />
							</v-button>
							<v-button v-tooltip="t.replace" icon small secondary @click="triggerUpload">
								<v-icon name="file_upload" />
							</v-button>
							<v-button v-tooltip="t.remove" icon small danger @click="internalValue.thumbnail_file = null">
								<v-icon name="close" />
							</v-button>
						</template>
						<template v-else-if="internalValue.thumbnail_remote">
							<v-button v-tooltip="t.download" icon small primary @click="downloadPreview" :loading="downloading">
								<v-icon name="download" />
							</v-button>
							<v-button v-tooltip="t.upload_custom" icon small secondary @click="triggerUpload">
								<v-icon name="file_upload" />
							</v-button>
						</template>
					</div>
				</div>
				<input type="file" ref="fileInput" accept="image/*" style="display: none;" @change="handleFileUpload" />
			</div>

			<div class="info">
				<v-input v-model="internalValue.title" :placeholder="t.title" class="title-input" :disabled="disabled" />
				<v-textarea v-model="internalValue.description" :placeholder="t.description" rows="2" :disabled="disabled" />
				<div class="provider-badge" v-if="internalValue.provider_name">
					<v-icon name="smart_display" size="x-small" />
					{{ internalValue.provider_name }}
				</div>
			</div>
		</div>

		<div v-if="effectiveEmbedHtml" class="video-embed" v-html="effectiveEmbedHtml"></div>

		<v-dialog v-model="confirmDialog" @confirm="applyFetchedData" @cancel="confirmDialog = false">
			<v-card>
				<v-card-title>{{ t.overwrite_title }}</v-card-title>
				<v-card-text>{{ t.overwrite_text }}</v-card-text>
				<v-card-actions>
					<v-button secondary @click="confirmDialog = false">{{ t.keep_current }}</v-button>
					<v-button @click="applyFetchedData">{{ t.overwrite }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-drawer v-model="fileDrawerOpen" :title="fileDetails?.title || t.image_preview" icon="image" @cancel="fileDrawerOpen = false">
			<div class="drawer-content" v-if="fileDetails">
				<div class="drawer-image">
					<v-image :src="getFileUrl(fileDetails.id)" />
				</div>
				<div class="drawer-meta">
					<div class="meta-item">
						<span class="label">{{ t.type }}</span>
						<span class="value">{{ fileDetails.type }}</span>
					</div>
					<div class="meta-item">
						<span class="label">{{ t.size }}</span>
						<span class="value">{{ formatSize(fileDetails.filesize) }}</span>
					</div>
					<div class="meta-item" v-if="fileDetails.width">
						<span class="label">{{ t.dimensions }}</span>
						<span class="value">{{ fileDetails.width }} x {{ fileDetails.height }}</span>
					</div>
					<div class="meta-item">
						<span class="label">{{ t.uploaded }}</span>
						<span class="value">{{ new Date(fileDetails.uploaded_on).toLocaleString() }}</span>
					</div>
				</div>
				<div class="drawer-actions">
					<v-button :to="`/admin/files/${fileDetails.id}`" full-width>{{ t.open_editor }}</v-button>
				</div>
			</div>
			<div v-else class="drawer-loading">
				<v-progress-circular indeterminate />
			</div>
		</v-drawer>
	</div>
</template>

<script setup>
import { ref, watch, computed, onUnmounted } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';

const props = defineProps({
	value: {
		type: [Object, String],
		default: () => ({})
	},
	folder: {
		type: String,
		default: null
	},
	size: {
		type: String,
		default: 'medium'
	},
	disabled: {
		type: Boolean,
		default: false
	}
});

const emit = defineEmits(['input']);

const api = useApi();
const { useUserStore } = useStores();
const userStore = useUserStore();

// Localization
const translations = {
	en: {
		placeholder: 'Paste YouTube, Vimeo, Rutube, or VK Video link',
		fetch_metadata: 'Fetch Metadata',
		no_image: 'No image',
		edit_image: 'Edit Image',
		replace: 'Replace',
		remove: 'Remove',
		download: 'Download',
		upload_custom: 'Upload Custom',
		title: 'Title',
		description: 'Description',
		overwrite_title: 'Overwrite existing data?',
		overwrite_text: 'This field already has metadata. Do you want to replace it with the newly fetched information?',
		keep_current: 'Keep Current',
		overwrite: 'Overwrite',
		image_preview: 'Image Preview',
		type: 'Type',
		size: 'Size',
		dimensions: 'Dimensions',
		uploaded: 'Uploaded',
		open_editor: 'Open Full Editor',
		error_fetch: 'Failed to fetch video information',
		error_download: 'Failed to download preview',
		error_upload: 'Failed to upload file',
	},
	ru: {
		placeholder: 'Вставьте ссылку на YouTube, Vimeo, Rutube или VK Видео',
		fetch_metadata: 'Получить данные',
		no_image: 'Нет изображения',
		edit_image: 'Редактировать',
		replace: 'Заменить',
		remove: 'Удалить',
		download: 'Скачать',
		upload_custom: 'Загрузить своё',
		title: 'Название',
		description: 'Описание',
		overwrite_title: 'Заменить данные?',
		overwrite_text: 'У этого поля уже есть данные. Заменить их на новые?',
		keep_current: 'Оставить',
		overwrite: 'Заменить',
		image_preview: 'Превью изображения',
		type: 'Тип',
		size: 'Размер',
		dimensions: 'Размеры',
		uploaded: 'Загружено',
		open_editor: 'Открыть редактор',
		error_fetch: 'Не удалось получить данные видео',
		error_download: 'Не удалось скачать превью',
		error_upload: 'Не удалось загрузить файл',
	}
};

const t = computed(() => {
	// Try multiple sources for language detection
	const userLang = userStore.currentUser?.language;
	const browserLang = typeof navigator !== 'undefined' ? navigator.language : null;
	const lang = userLang || browserLang || 'en';
	const shortLang = lang.split('-')[0].toLowerCase();
	return translations[shortLang] || translations.en;
});

const loading = ref(false);
const downloading = ref(false);
const confirmDialog = ref(false);
const fetchedData = ref(null);
const errorMessage = ref('');
const lastFetchedUrl = ref(''); // Track last fetched URL to avoid duplicate fetches

const internalValue = ref(parseValue(props.value));

function parseValue(val) {
	const defaultValue = {
		url: '',
		title: '',
		description: '',
		thumbnail_remote: '',
		thumbnail_file: '',
		html: '',
		provider_name: ''
	};

	if (typeof val === 'string' && val.trim()) {
		try {
			const parsed = JSON.parse(val);
			return { ...defaultValue, ...parsed };
		} catch {
			return { ...defaultValue, url: val };
		}
	}
	if (!val || typeof val !== 'object') return defaultValue;
	return { ...defaultValue, ...val };
}

watch(() => props.value, (newVal) => {
	const parsed = parseValue(newVal);
	if (JSON.stringify(parsed) !== JSON.stringify(internalValue.value)) {
		internalValue.value = parsed;
	}
}, { deep: true });

watch(internalValue, (newVal) => {
	emit('input', newVal);
}, { deep: true });

// Check if URL looks like a valid video URL
function isValidVideoUrl(url) {
	if (!url || typeof url !== 'string') return false;
	const patterns = [
		/youtube\.com\/watch\?v=/,
		/youtu\.be\//,
		/youtube\.com\/embed\//,
		/vimeo\.com\/\d+/,
		/rutube\.ru\/video\//,
		/vk\.com\/video/,
		/vk\.ru\/video/,
		/vkontakte\.ru\/video/,
		/vkvideo\.ru\/video/,
	];
	return patterns.some(pattern => pattern.test(url));
}

// Auto-fetch with debounce
let fetchTimeout = null;
watch(() => internalValue.value.url, (newUrl) => {
	// Clear previous timeout
	if (fetchTimeout) {
		clearTimeout(fetchTimeout);
		fetchTimeout = null;
	}

	// Skip if disabled, empty, same as last fetch, or already has data
	if (props.disabled || !newUrl || newUrl === lastFetchedUrl.value) return;

	// Check if URL looks like a valid video URL
	if (!isValidVideoUrl(newUrl)) return;

	// Debounce: wait 600ms after user stops typing
	fetchTimeout = setTimeout(() => {
		// Only auto-fetch if no existing data (to avoid overwriting user edits)
		if (!internalValue.value.title && !internalValue.value.thumbnail_file && !internalValue.value.thumbnail_remote) {
			fetchInfo();
		}
	}, 600);
});

// Cleanup timeout on unmount
onUnmounted(() => {
	if (fetchTimeout) {
		clearTimeout(fetchTimeout);
	}
});

function getFileUrl(id) {
	return `/assets/${id}`;
}

// Security: Always generate iframe from URL patterns, never use stored HTML (prevents XSS)
const effectiveEmbedHtml = computed(() => {
	const url = internalValue.value.url;
	if (!url) return null;

	// YouTube
	if (url.includes('youtube.com') || url.includes('youtu.be')) {
		const id = url.match(/(?:\?v=|&v=|youtu\.be\/|embed\/)([^&\n?#]+)/)?.[1];
		if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
			return `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" webkitallowfullscreen mozallowfullscreen></iframe>`;
		}
	}
	// Vimeo
	if (url.includes('vimeo.com')) {
		const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
		if (id && /^\d+$/.test(id)) {
			return `<iframe src="https://player.vimeo.com/video/${id}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" webkitallowfullscreen mozallowfullscreen></iframe>`;
		}
	}
	// Rutube
	if (url.includes('rutube.ru')) {
		const id = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/)?.[1];
		if (id && /^[a-zA-Z0-9]+$/.test(id)) {
			return `<iframe width="100%" height="100%" src="https://rutube.ru/play/embed/${id}/" frameBorder="0" allow="clipboard-write; autoplay; fullscreen" webkitAllowFullScreen mozallowfullscreen></iframe>`;
		}
	}
	// VK Video (vk.com, vk.ru, vkontakte.ru, vkvideo.ru)
	if (url.includes('vk.com') || url.includes('vk.ru') || url.includes('vkontakte.ru') || url.includes('vkvideo.ru')) {
		const match = url.match(/video(-?\d+)_(\d+)/);
		if (match && /^-?\d+$/.test(match[1]) && /^\d+$/.test(match[2])) {
			return `<iframe src="https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2" width="100%" height="100%" allow="autoplay; encrypted-media; fullscreen; picture-in-picture;" frameborder="0" webkitallowfullscreen mozallowfullscreen></iframe>`;
		}
	}
	return null;
});

async function fetchInfo() {
	if (!internalValue.value.url || props.disabled) return;
	const urlToFetch = internalValue.value.url;
	loading.value = true;
	errorMessage.value = '';
	try {
		const response = await api.post('/video-parser/info', { url: urlToFetch });
		fetchedData.value = response.data;
		lastFetchedUrl.value = urlToFetch; // Track successful fetch

		// Check if we have meaningful data that would be overwritten
		if (internalValue.value.title || internalValue.value.thumbnail_file || internalValue.value.thumbnail_remote) {
			confirmDialog.value = true;
		} else {
			applyFetchedData();
		}
	} catch (error) {
		console.error(error);
		errorMessage.value = t.value.error_fetch;
	} finally {
		loading.value = false;
	}
}

function applyFetchedData() {
	if (!fetchedData.value) return;
	
	// Explicitly reset fields before applying new ones to ensure reactive update
	internalValue.value.title = fetchedData.value.title || '';
	internalValue.value.description = fetchedData.value.description || '';
	internalValue.value.thumbnail_remote = fetchedData.value.thumbnail || '';
	internalValue.value.thumbnail_file = ''; // Reset local file on New URL fetch
	internalValue.value.provider_name = fetchedData.value.provider_name || '';
	internalValue.value.html = fetchedData.value.html || '';
	
	confirmDialog.value = false;
	fetchedData.value = null;
}

async function downloadPreview() {
	if (!internalValue.value.thumbnail_remote || props.disabled) return;
	downloading.value = true;
	errorMessage.value = '';
	try {
		const response = await api.post('/video-parser/download', {
			url: internalValue.value.thumbnail_remote,
			title: internalValue.value.title,
			folder: props.folder
		});
		internalValue.value.thumbnail_file = response.data.id;
	} catch (error) {
		console.error(error);
		errorMessage.value = t.value.error_download;
	} finally {
		downloading.value = false;
	}
}

const fileDrawerOpen = ref(false);
const fileDetails = ref(null);

const fileInput = ref(null);

function triggerUpload() {
	fileInput.value?.click();
}

async function handleFileUpload(event) {
	const file = event.target.files?.[0];
	if (!file || props.disabled) return;

	const formData = new FormData();
	formData.append('file', file);
	if (props.folder) {
		formData.append('folder', props.folder);
	}
	if (internalValue.value.title) {
		formData.append('title', internalValue.value.title);
	}

	loading.value = true;
	errorMessage.value = '';
	try {
		// Use our endpoint that properly handles folder via FilesService
		const response = await api.post('/video-parser/upload', formData);
		internalValue.value.thumbnail_file = response.data.id;
	} catch (error) {
		console.error('Upload failed:', error);
		errorMessage.value = t.value.error_upload;
	} finally {
		loading.value = false;
		if (fileInput.value) fileInput.value.value = '';
	}
}

async function openFile(id) {
	if (!id) return;
	fileDrawerOpen.value = true;
	fileDetails.value = null; // Clear prev

	try {
		const response = await api.get(`/files/${id}`);
		fileDetails.value = response.data.data;
	} catch (error) {
		console.error('Failed to fetch file details:', error);
		fileDrawerOpen.value = false;
	}
}

function formatSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
</script>

<style scoped>
.video-field {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.video-field.disabled {
	opacity: 0.6;
	pointer-events: none;
}

.metadata-preview {
	display: flex;
	gap: 16px;
	padding: 12px;
	border: 1px solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
	background-color: var(--theme--background-subdued);
}

.metadata-preview.small {
	gap: 8px;
	padding: 8px;
}

.image-area {
	position: relative;
	flex-shrink: 0;
}

.image-preview {
	position: relative;
	width: 160px;
	aspect-ratio: 16/9; /* Use aspect ratio for automatic height */
	background-color: var(--theme--background-normal);
	border-radius: 4px;
	overflow: hidden;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1px solid var(--theme--border-color-subdued);
}

.image-preview.has-file {
	border-color: var(--theme--primary);
}

.small .image-preview {
	width: 120px;
}

/* Large size: make the wrapper take 50% of the flex container */
.large .image-area {
	flex: 0 0 50%;
	min-width: 320px;
}

.large .image-preview {
	width: 100%; /* Fill the wrapper */
}

/* Ensure images fill the container */
.image-preview img, .image-preview :deep(img) {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.actions-overlay {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: rgba(0,0,0,0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	opacity: 0;
	transition: opacity 0.2s;
	backdrop-filter: blur(2px);
}

.image-preview:hover .actions-overlay {
	opacity: 1;
}

.drawer-content {
	padding: 24px;
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.drawer-image {
	background-color: var(--theme--background-normal);
	border-radius: var(--theme--border-radius);
	overflow: hidden;
	display: flex;
	justify-content: center;
	align-items: center;
	border: 1px solid var(--theme--border-color-subdued);
}

.drawer-image :deep(img) {
	max-width: 100%;
	max-height: 50vh;
	object-fit: contain;
}

.drawer-meta {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
}

.meta-item {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.meta-item .label {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
	text-transform: uppercase;
	font-weight: 600;
}

.drawer-loading {
	padding: 48px;
	display: flex;
	justify-content: center;
}

.drawer-actions {
	margin-top: auto;
}

.info {
	flex-grow: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 8px;
}

.title-input {
	--v-input-background-color: transparent;
	--v-input-border-color: transparent;
	font-weight: 600;
	font-size: 1.1em;
}

.provider-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--theme--foreground-subdued);
	background-color: var(--theme--background-normal);
	padding: 2px 8px;
	border-radius: 12px;
	align-self: flex-start;
}

.video-embed {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 9;
	background-color: #000;
	border-radius: var(--theme--border-radius);
	overflow: hidden;
	box-shadow: var(--theme--shadow-low);
}

.video-embed iframe, .video-embed :deep(iframe) {
	width: 100%;
	height: 100%;
	border: 0;
}
</style>
