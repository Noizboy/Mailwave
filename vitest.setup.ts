import "@testing-library/jest-dom";

// jsdom shims for Radix UI components
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof globalThis.DOMRect === "undefined") {
  // Minimal shim for jsdom (Radix Select needs DOMRect.fromRect).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMRect = class DOMRect {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    top = 0;
    right = 0;
    bottom = 0;
    left = 0;
    static fromRect() {
      return new DOMRect();
    }
    toJSON() {
      return {};
    }
  };
}

if (typeof window !== "undefined") {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
}
