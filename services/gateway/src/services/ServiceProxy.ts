import httpProxy from 'http-proxy';
import { logger } from '@stage7-nextgen/shared';

export class ServiceProxy {
  private proxies: Map<string, httpProxy> = new Map();

  registerProxy(serviceId: string, targetUrl: string): void {
    if (this.proxies.has(serviceId)) {
      this.removeProxy(serviceId);
    }

    const proxy = httpProxy.createProxyServer({
      target: targetUrl,
      changeOrigin: true,
    });

    proxy.on('error', (err: Error, req: any, res: any) => {
      logger.error({ serviceId, err: err.message }, 'Proxy error');
      if (res && !res.headersSent) {
        res.status(502).json({ error: 'Bad gateway', details: err.message });
      }
    });

    this.proxies.set(serviceId, proxy);
  }

  getProxy(serviceId: string): httpProxy | undefined {
    return this.proxies.get(serviceId);
  }

  removeProxy(serviceId: string): boolean {
    const proxy = this.proxies.get(serviceId);
    if (proxy) {
      proxy.close();
      return this.proxies.delete(serviceId);
    }
    return false;
  }
}
