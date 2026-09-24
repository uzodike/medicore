import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
            manifest: {
                name: 'MediCore HMS',
                short_name: 'MediCore',
                description: 'Hospital Management System',
                theme_color: '#1a6b5a',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/admin\//, /^\/media\//],
                runtimeCaching: [
                    {
                        // cache ONLY safe, slow-changing GETs; never live clinical queues
                        urlPattern: /\/api\/v1\/(lab\/tests|pharmacy\/drugs)\//i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'medicore-ref-cache',
                            expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
                            networkTimeoutSeconds: 5,
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        host: true,
        allowedHosts: ['daibi-hillsmedicalcentre.online', 'tangerine-heliotrope-189b3e.netlify.app',],
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
    },
    },
})
