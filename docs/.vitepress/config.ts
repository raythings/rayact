import { defineConfig } from 'vitepress';

// GitHub Pages project sites serve under /<repo>/; override with DOCS_BASE.
const base = process.env.DOCS_BASE || '/';

export default defineConfig({
  title: 'Rayact',
  description: 'Cross-platform React renderer with a native raylib + QuickJS backend.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  // Maintainer-only notes stay in the repo but out of the published site.
  // public/** is VitePress's verbatim static dir — the generated raw-markdown
  // copies under public/md are served as .md for LLM consumers and must not
  // also be compiled into duplicate HTML routes.
  srcExclude: ['maintainer/**', 'public/**', 'README.md', '**/tools/**'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/components' },
      // Static file, not a router route — VitePress leaves target=_blank
      // links as-authored, so apply the base path here.
      { text: 'llms.txt', link: `${base}llms.txt`, target: '_blank' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/install' },
          { text: 'Styling', link: '/guide/styling' },
          { text: 'Tailwind CSS', link: '/guide/tailwind' },
          { text: 'Animation', link: '/guide/animation' },
          { text: 'Navigation', link: '/guide/navigation' },
          { text: 'File-based routing', link: '/guide/router' },
          { text: 'Fonts & icons', link: '/guide/fonts-and-icons' },
          { text: 'Workers & WASM', link: '/guide/workers' },
          { text: 'Native modules', link: '/native-modules' },
          { text: 'Dev platform', link: '/dev-platform' }
        ]
      },
      {
        text: 'Platforms',
        items: [
          { text: 'Desktop', link: '/guide/desktop' },
          { text: 'Windows', link: '/guide/windows' },
          { text: 'Android', link: '/guide/android' },
          { text: 'iOS', link: '/guide/ios' },
          { text: 'Web', link: '/guide/web' },
          { text: 'Linux', link: '/guide/linux' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Components', link: '/reference/components' },
          { text: 'API (rayact/react)', link: '/reference/api' },
          { text: 'CSS support', link: '/reference/css' },
          { text: 'CLI', link: '/reference/cli' },
          { text: 'Configuration', link: '/reference/config' },
          { text: 'Packages & platforms', link: '/reference/packages' },
          { text: 'Container format', link: '/reference/rayactpack' }
        ]
      },
      {
        text: 'Operations',
        items: [
          { text: 'Deployment', link: '/deployment' },
          { text: 'Upgrades', link: '/upgrades' },
          { text: 'Recovery', link: '/recovery' },
          { text: 'Rollback', link: '/rollback' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Security', link: '/security' },
          { text: 'Support policy', link: '/support' }
        ]
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Accessibility', link: '/accessibility' },
          { text: 'Crash privacy', link: '/crash-reporting' },
          { text: 'Multi-window system', link: '/multi-window-system' }
        ]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/raythings/rayact' }],
    search: { provider: 'local' }
  }
});
