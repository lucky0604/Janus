declare module '../dist/server/prod.js' {
  import type http from 'http';
  import type { IncomingMessage, ServerResponse } from 'http';

  export interface KavisServer {
    server: http.Server;
    port: number;
    close: () => Promise<void>;
  }

  export function createKavisServer(distDir?: string, port?: number, promptsDir?: string): Promise<KavisServer>;

  export function configureApiRoutes(viteServer: {
    middlewares: {
      use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    };
  }): void;
}
