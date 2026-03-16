export type UnlistenFn = () => void;

export interface Platform {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T = unknown>(
    event: string,
    handler: (payload: T) => void,
  ): Promise<UnlistenFn>;
  isFullscreen(): Promise<boolean>;
  onResized(handler: () => void): Promise<UnlistenFn>;
}
