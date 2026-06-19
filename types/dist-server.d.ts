declare module '../dist/server/prod.js' {
  import type http from 'http';
  import type { IncomingMessage, ServerResponse } from 'http';

  export interface JanusServer {
    server: http.Server;
    port: number;
    close: () => Promise<void>;
  }

  export function createJanusServer(distDir?: string, port?: number, promptsDir?: string): Promise<JanusServer>;

  export function configureApiRoutes(viteServer: {
    middlewares: {
      use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    };
  }): void;
}
