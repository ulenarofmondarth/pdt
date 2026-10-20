/** Values Vite writes into the bundle at build time (see `define` in vite.config.ts). */
declare global {
  /** The version in pdt's package.json. */
  const __PDT_VERSION__: string;
}

export {};
