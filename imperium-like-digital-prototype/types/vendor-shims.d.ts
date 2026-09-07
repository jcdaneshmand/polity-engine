declare namespace React {
  type ReactNode = unknown;
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: unknown;
  }

  interface IntrinsicElements {
    [elementName: string]: unknown;
  }
}

declare module "react" {
  export function lazy<T>(loader: () => Promise<{ default: T }>): T;
  export const Suspense: (props: { children?: unknown; fallback?: unknown }) => unknown;
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps?: unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void];
  const React: { StrictMode: (props: { children?: unknown }) => unknown };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare module "react-dom/client" {
  export function createRoot(element: Element | DocumentFragment): { render(node: unknown): void };
}

declare module "react-dom/server" {
  export function renderToStaticMarkup(node: unknown): string;
}

declare module "papaparse" {
  type ParseResult<T> = {
    data: T[];
    errors: Array<{ message: string }>;
  };

  const Papa: {
    parse<T>(input: string, config?: unknown): ParseResult<T>;
  };
  export default Papa;
}

interface ImportMeta {
  env: Record<string, string | boolean | undefined>;
}
