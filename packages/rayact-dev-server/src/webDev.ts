import {
  ensureWebHost,
  startCoepDevProxy,
  webDevOpenUrl,
  DEFAULT_WEB_ENGINE_PORT,
  type CoepServerHandle
} from '@rayact/prebuild';

export interface WebDevBridge {
  openUrl: string;
  proxyUrl: string;
  close(): Promise<void>;
}

export async function startWebDevBridge(
  devOrigin: string,
  opts: { port?: number; strictPort?: boolean } = {}
): Promise<WebDevBridge> {
  const hostDir = await ensureWebHost();
  const proxy = await startCoepDevProxy({
    engineDir: hostDir,
    devOrigin,
    port: opts.port ?? DEFAULT_WEB_ENGINE_PORT,
    strictPort: opts.strictPort
  });
  return {
    openUrl: webDevOpenUrl(proxy.url, devOrigin),
    proxyUrl: proxy.url,
    close: () => proxy.close()
  };
}

export type { CoepServerHandle };
