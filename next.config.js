/** @type {import('next').NextConfig} */
const isElectronBuild = process.env.ELECTRON_BUILD === '1';

const nextConfig = {
    ...(isElectronBuild ? {
        output: 'export'
    } : {}),
    images: {
        unoptimized: true
    },
    trailingSlash: true,
    devIndicators: false,
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    webpack: (config, { isServer }) => {
        // Prevent html2canvas (pulled in transitively by jspdf) from being
        // split into a vendor-chunk that gets dropped during `next export`.
        // Marking it as external for server renders avoids the module-not-found
        // crash in the packaged Electron app.
        if (isServer) {
            config.externals = [
                ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
                'html2canvas',
            ];
        }
        return config;
    },
}

module.exports = nextConfig
