<template>
	<div class="video-display">
		<div v-if="thumbnailUrl" class="thumbnail" :style="thumbnailStyle">
			<img :src="thumbnailUrl" />
		</div>
		<div v-else class="thumbnail placeholder" :style="thumbnailStyle">
			<v-icon name="video_library" />
		</div>
		<span v-if="providerBadge && showBadge" class="provider-badge" :class="providerClass">{{ providerBadge }}</span>
		<a v-if="videoUrl && showLink" :href="videoUrl" target="_blank" rel="noopener noreferrer" class="external-link" @click.stop>
			<v-icon name="open_in_new" small />
		</a>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	value: {
		type: [Object, String],
		default: null
	},
	thumbnailWidth: {
		type: Number,
		default: 100
	},
	showBadge: {
		type: Boolean,
		default: true
	},
	showLink: {
		type: Boolean,
		default: true
	}
});

const parsed = computed(() => {
	if (typeof props.value === 'string') {
		try {
			return JSON.parse(props.value);
		} catch {
			return { url: props.value };
		}
	}
	return props.value || {};
});

const thumbnailUrl = computed(() => {
	if (parsed.value.thumbnail_file) return `/assets/${parsed.value.thumbnail_file}?width=300&fit=cover`;
	if (parsed.value.thumbnail_remote) return parsed.value.thumbnail_remote;
	return null;
});

const providerBadge = computed(() => {
	const provider = parsed.value.provider_name?.toLowerCase() || '';
	if (provider.includes('youtube')) return 'YouTube';
	if (provider.includes('rutube')) return 'Rutube';
	if (provider.includes('vk')) return 'VK Video';
	if (provider.includes('vimeo')) return 'Vimeo';

	// Try to detect from URL if provider_name is missing
	const url = parsed.value.url || '';
	if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
	if (url.includes('rutube.ru')) return 'Rutube';
	if (url.includes('vk.com') || url.includes('vk.ru') || url.includes('vkontakte.ru') || url.includes('vkvideo.ru')) return 'VK Video';
	if (url.includes('vimeo.com')) return 'Vimeo';

	return null;
});

const providerClass = computed(() => {
	const badge = providerBadge.value?.toLowerCase().replace(/\s+/g, '-');
	return badge ? `provider-${badge}` : '';
});

const videoUrl = computed(() => parsed.value.url || null);

const thumbnailStyle = computed(() => {
	const width = props.thumbnailWidth || 100;
	const height = Math.round(width * 9 / 16); // 16:9 aspect ratio
	return {
		width: `${width}px`,
		height: `${height}px`
	};
});
</script>

<style scoped>
.video-display {
	display: flex;
	align-items: center;
	gap: 8px;
	overflow: hidden;
}

.thumbnail {
	border-radius: var(--theme--border-radius);
	overflow: hidden;
	flex-shrink: 0;
	background-color: var(--theme--background-subdued);
}

.thumbnail.placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme--foreground-subdued);
}

.thumbnail img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.provider-badge {
	font-size: 11px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 4px;
	white-space: nowrap;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	background-color: var(--theme--background-subdued);
	color: var(--theme--foreground-subdued);
}

.external-link {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme--foreground-subdued);
	transition: color 0.15s ease;
}

.external-link:hover {
	color: var(--theme--primary);
}
</style>
