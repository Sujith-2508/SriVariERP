/** @type {import('next').NextConfig} */
const isElectronBuild = process.env.ELECTRON_BUILD === '1';

const nextConfig = {
    ...(isElectronBuild ? { output: 'export' } : {}),
    images: {
        unoptimized: true
    },
    trailingSlash: true,
    devIndicators: false
}

module.exports = nextConfig

