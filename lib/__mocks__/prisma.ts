import { vi } from "vitest";

// Auto-mocking Prisma stand-in: any `prisma.<model>.<method>` access lazily
// creates a vi.fn(), so tests only stub what they use.
function createModelMock(): Record<string | symbol, ReturnType<typeof vi.fn>> {
  return new Proxy({} as Record<string | symbol, ReturnType<typeof vi.fn>>, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn();
      return target[prop];
    },
  });
}

export const prisma = new Proxy(
  {} as Record<string | symbol, ReturnType<typeof createModelMock>>,
  {
    get(target, prop) {
      if (!(prop in target)) target[prop] = createModelMock();
      return target[prop];
    },
  }
) as unknown as typeof import("../prisma").prisma;
