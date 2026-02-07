import type { HookRegistry, HookHandler } from './types.js';

/**
 * Hook Registry Implementation
 * Manages plugin hooks for extending functionality
 */
export class HookRegistryImpl implements HookRegistry {
  private hooks = new Map<string, HookHandler[]>();

  register<T = unknown>(hookPoint: string, handler: HookHandler<T>): void {
    if (!this.hooks.has(hookPoint)) {
      this.hooks.set(hookPoint, []);
    }
    this.hooks.get(hookPoint)!.push(handler as HookHandler);
  }

  unregister<T = unknown>(hookPoint: string, handler: HookHandler<T>): void {
    const handlers = this.hooks.get(hookPoint);
    if (!handlers) return;

    const index = handlers.indexOf(handler as HookHandler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  async execute<T = unknown>(hookPoint: string, context: T): Promise<T> {
    const handlers = this.hooks.get(hookPoint) || [];
    let result: unknown = context;

    for (const handler of handlers) {
      result = await handler(result);
    }

    return result as T;
  }

  has(hookPoint: string): boolean {
    const handlers = this.hooks.get(hookPoint);
    return handlers !== undefined && handlers.length > 0;
  }

  clear(hookPoint?: string): void {
    if (hookPoint) {
      this.hooks.delete(hookPoint);
    } else {
      this.hooks.clear();
    }
  }

  getHookPoints(): string[] {
    return Array.from(this.hooks.keys());
  }

  getHandlerCount(hookPoint: string): number {
    return this.hooks.get(hookPoint)?.length || 0;
  }
}
