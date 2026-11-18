import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLinksValidator from 'starlight-links-validator'

export default defineConfig({
  site: 'https://crobinson42.github.io',
  base: '/ts-pf',
  integrations: [
    starlight({
      title: 'ts-pf',
      description:
        'Contract-first TypeScript RPC. This procedure model, any pipe.',
      plugins: [starlightLinksValidator()],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/crobinson42/ts-pf',
        },
      ],
      sidebar: [
        {
          label: 'Start',
          items: ['index', 'getting-started', 'tutorial'],
        },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Packages',
          items: [{ autogenerate: { directory: 'packages' } }],
        },
        {
          label: 'Protocol',
          slug: 'protocol',
        },
      ],
    }),
  ],
})
