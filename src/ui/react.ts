import type { CliRenderer } from '@opentui/core';
import { createElement, createRoot, type Root } from '@opentui/react';
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

type UIProps = Record<string, unknown>;

export function Box(props: UIProps, ...children: ReactNode[]): ReactNode {
  return createElement('box' as any, props, ...children);
}

export function Text(props: UIProps, ...children: ReactNode[]): ReactNode {
  return createElement('text' as any, props, ...children);
}

export function Input(props: UIProps, ...children: ReactNode[]): ReactNode {
  return createElement('input' as any, props, ...children);
}

export function Select(props: UIProps, ...children: ReactNode[]): ReactNode {
  return createElement('select' as any, props, ...children);
}

export function ASCIIFont(props: UIProps, ...children: ReactNode[]): ReactNode {
  return createElement('ascii-font' as any, props, ...children);
}
