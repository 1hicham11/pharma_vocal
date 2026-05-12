import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
const parentPublic = path.resolve(__dirname, '../public');

// Build dans ../public sans vider le dossier (session.html, assets/avatars, css/, …)
export default defineConfig(({ command }) => ({
    /** En dev uniquement : évite publicDir === outDir ; en build, fichiers déjà dans public/. */
    publicDir: command === 'serve' ? parentPublic : false,
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: {
            '/api': { target: apiTarget, changeOrigin: true },
        },
    },
    build: {
        outDir: path.resolve(__dirname, '../public'),
        emptyOutDir: false,
        assetsDir: 'react-assets',
    },
}));
