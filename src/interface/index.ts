import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './component.vue';

export default defineInterface({
    id: 'video-field',
    name: 'Video Field',
    icon: 'video_library',
    description: 'Rich video field with metadata parsing and preview download.',
    component: InterfaceComponent,
    options: [
        {
            field: 'folder',
            name: 'Preview Folder',
            type: 'uuid',
            meta: {
                interface: 'system-folder',
                width: 'half',
            },
            schema: {
                default_value: null,
            }
        },
        {
            field: 'size',
            name: 'Thumbnail Size',
            type: 'string',
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Small', value: 'small' },
                        { text: 'Medium', value: 'medium' },
                        { text: 'Large', value: 'large' },
                    ],
                },
                width: 'half',
            },
            schema: {
                default_value: 'medium',
            }
        }
    ],
    types: ['json', 'text'],
});
