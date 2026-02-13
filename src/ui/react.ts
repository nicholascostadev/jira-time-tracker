import type { CliRenderer } from '@opentui/core';
import { createRoot, type Root } from '@opentui/react';
import type { ReactNode } from 'react';

const createCliRoot = createRoot as unknown as (renderer: CliRenderer) => Root;

const roots = new WeakMap<CliRenderer, Root>();

function getRoot(renderer: CliRenderer): Root {
  let root = roots.get(renderer);
  if (!root) {
    root = createCliRoot(renderer);
    roots.set(renderer, root);
  }
  return root;
}

export function renderUI(renderer: CliRenderer, node: ReactNode): void {
  getRoot(renderer).render(node);
}

export function clearUI(renderer: CliRenderer): void {
  renderUI(renderer, null);
}

export function destroyUI(renderer: CliRenderer): void {
  const root = roots.get(renderer);
  if (root) {
    root.unmount();
    roots.delete(renderer);
  }
  renderer.destroy();
}
