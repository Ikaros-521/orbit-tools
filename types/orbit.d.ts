/**
 * Orbit Toolbox - Type Declarations & Interface Contracts
 * Provides strict TypeScript type contracts, IntelliSense definitions,
 * and architectural contracts for Host, Plugins, and IPC channels.
 */

export type Platform = 'win32' | 'darwin' | 'linux';

export type I18nString = string | { zh?: string; en?: string };

export interface PluginAction {
  id: string;
  label: I18nString;
  hotkey?: string | null;
  desc?: I18nString;
}

export interface PluginCapability {
  type: string;
  pattern?: string;
  action: string;
  label?: I18nString;
}

export interface PluginPanel {
  script: string;
  style?: string | null;
}

export interface PluginManifest {
  id: string;
  name: I18nString;
  version: string;
  desc?: I18nString;
  author?: string;
  category?: 'dev' | 'system' | 'ai' | 'media' | 'utility' | 'other';
  icon?: string;
  keywords?: string[];
  panel?: PluginPanel;
  backend?: string;
  isolated?: boolean;
  actions?: PluginAction[];
  capabilities?: PluginCapability[];
}

export interface PluginDataContext<T = Record<string, any>> {
  get(): T;
  set(patch: Partial<T>): T;
}

export interface PluginIpcContext {
  handle(method: string, fn: (args: any, event?: any) => Promise<any> | any): void;
}

export interface PluginWindowsContext {
  create(opts?: Record<string, any>): any;
  closeAll(): void;
}

export interface PluginContext<TData = Record<string, any>> {
  id: string;
  root: string;
  url(relPath: string): string;
  send(channel: string, payload?: any): void;
  ipc: PluginIpcContext;
  data: PluginDataContext<TData>;
  callPlugin(targetId: string, method: string, args?: any): Promise<any>;
  onPluginEvent?(targetId: string, fn: (event: { channel: string; payload: any }) => void): () => void;
  openPluginPanel?(pluginId: string, payload?: any): boolean;
  addAssetRoot?(alias: string, dir: string): boolean;
  removeAssetRoot?(alias: string): boolean;
  windows: PluginWindowsContext;
}

export interface PluginModule {
  activate?(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface UpdateAsset {
  name: string;
  size: number;
  downloadUrl: string;
  expectedHash?: string | null;
  hashAlgorithm?: 'sha512' | 'sha256' | null;
  manifestUrl?: string | null;
}

export interface UpdateCheckResult {
  ok: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  tagName?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  releaseUrl?: string;
  asset?: UpdateAsset | null;
  error?: string;
  manual?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  scope: string;
  message: string;
  extra?: any;
}

export interface ScopedLogger {
  debug(message: string, extra?: any): void;
  info(message: string, extra?: any): void;
  warn(message: string, extra?: any): void;
  error(message: string, error?: any): void;
}
