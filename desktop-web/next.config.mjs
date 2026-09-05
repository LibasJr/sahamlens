import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias['@'] = fileURLToPath(new URL('..', import.meta.url));
    return config;
  },
};

export default nextConfig;
