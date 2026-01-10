import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './component.vue';

export default defineDisplay({
    id: 'video-display',
    name: 'Video Display',
    icon: 'video_library',
    description: 'Shows video thumbnail and provider badge in lists.',
    component: DisplayComponent,
    options: [
        {
            field: 'thumbnailWidth',
            name: 'Thumbnail Width',
            type: 'integer',
            meta: {
                interface: 'input',
                width: 'half',
                options: {
                    min: 50,
                    max: 300,
                    step: 10,
                },
            },
            schema: {
                default_value: 100,
            },
        },
        {
            field: 'showBadge',
            name: 'Show Provider Badge',
            type: 'boolean',
            meta: {
                interface: 'boolean',
                width: 'half',
            },
            schema: {
                default_value: true,
            },
        },
        {
            field: 'showLink',
            name: 'Show External Link',
            type: 'boolean',
            meta: {
                interface: 'boolean',
                width: 'half',
            },
            schema: {
                default_value: true,
            },
        },
    ],
    types: ['json', 'text'],
});
