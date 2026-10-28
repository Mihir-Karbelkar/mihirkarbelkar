import { detectCapability } from './capability';
import {
  isCached,
  loadModel,
  prefetchModel,
  unloadModel,
} from './local-engine';
import { ModelManager } from './model-manager';
let manager: ModelManager | null = null;
/** The page-wide model manager (one per tab). */
export function models(): ModelManager {
  manager ??= new ModelManager({
    detect: detectCapability,
    load: loadModel,
    unload: unloadModel,
    prefetch: prefetchModel,
    isCached,
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
