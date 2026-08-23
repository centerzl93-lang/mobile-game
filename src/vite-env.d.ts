/// <reference types="vite/client" />

/**
 * Build stamp injected by Vite (`define` in vite.config.ts): version, short commit and build date,
 * e.g. `v0.2.123 · a1b2c3d · 2026-07-27`. Shown on the main menu so it is possible to tell whether
 * the device is running the newest deploy or a cached service-worker copy of an older one.
 */
declare const __BUILD_STAMP__: string;
/** Short commit of the build, appended to runtime-fetched asset URLs to bust the SW cache. */
declare const __ASSET_VERSION__: string;
