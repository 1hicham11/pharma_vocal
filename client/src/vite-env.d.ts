/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LEGACY_STATIC_ORIGIN: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
