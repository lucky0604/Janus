/**
 * Server entry — re-exports from prod.ts for Vite dev integration
 *
 * In dev: vite.config.ts imports configureApiRoutes() from this file
 * In prod/Electron: prod.ts createKavisServer() is used directly
 */

export { configureApiRoutes } from './prod';
