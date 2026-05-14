// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		react(),
		starlight({
			title: 'Tempblot',
			customCss: ['./src/styles/theme.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/crutchcorn/tempblot' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						{ label: 'Basic Usage', slug: 'guides/basic-usage' },
					],
				},
			],
		}),
	],
});
