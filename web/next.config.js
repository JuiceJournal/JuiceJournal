/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
