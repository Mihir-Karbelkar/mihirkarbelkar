import { detectCapability } from './capability';
import {
  isCached,
  loadModel,
  prefetchModel,
  unloadModel,
} from './local-engine';
import { ModelManager } from './model-manager';
let manager: ModelManager | null = null;
/** `?assistant-debug` (kept for the tab) shows the model picker and timings. */
export function assistantDebug(): boolean {
  try {
    if (new URLSearchParams(location.search).has('assistant-debug'))
      sessionStorage.setItem('assistant-debug', '1');
    return sessionStorage.getItem('assistant-debug') === '1';
  } catch {
    return false;
  }
}
/** The page-wide model manager (one per tab). */
export function models(): ModelManager {
  manager ??= new ModelManager({
    detect: detectCapability,
    load: loadModel,
    unload: unloadModel,
    prefetch: prefetchModel,
    isCached,
    debug: assistantDebug(),
    idle: (fn) =>
      'requestIdleCallback' in window
        ? requestIdleCallback(fn, { timeout: 30000 })
        : setTimeout(fn, 5000),
    storage: (() => {
      try {
        return localStorage;
      } catch {
        return undefined;
      }
    })(),
  });
  return manager;
}
