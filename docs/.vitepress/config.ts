import { defineConfig } from 'vitepress';

// GitHub Pages project sites serve under /<repo>/; override with DOCS_BASE.
export default defineConfig({
  title: 'Rayact',
  description: 'Cross-platform React renderer with a native raylib + QuickJS backend.',
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  lastUpdated: true,
  // Maintainer-only notes stay in the repo but out of the published site.
  srcExclude: ['maintainer-prebuilts.md', 'dev-platform.md', 'README.md', '**/tools/**'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'llms.txt', link: '/llms.txt', target: '_blank' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/install' },
          { text: 'Native modules', link: '/native-modules' },
          { text: 'Deployment', link: '/deployment' },
          { text: 'Upgrades', link: '/upgrades' },
          { text: 'Recovery', link: '/recovery' },
          { text: 'Troubleshooting', link: '/troubleshooting' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI', link: '/reference/cli' },
          { text: 'Configuration', link: '/reference/config' },
          { text: 'Packages & platforms', link: '/reference/packages' },
          { text: 'Container format', link: '/reference/rayactpack' }
        ]
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Accessibility', link: '/accessibility' },
          { text: 'Crash privacy', link: '/crash-reporting' },
          { text: 'Security', link: '/security' },
          { text: 'Support policy', link: '/support' },
          { text: 'Rollback', link: '/rollback' },
          { text: 'Multi-window system', link: '/multi-window-system' }
        ]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/raythings/rayact' }],
    search: { provider: 'local' }
  }
});
