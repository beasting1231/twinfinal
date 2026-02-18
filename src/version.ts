// Build version injected at build time via VITE_APP_VERSION.
// Falls back to "dev" for local development without an injected value.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
