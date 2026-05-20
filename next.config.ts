import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Static export for Capacitor (no server needed)
  output: 'export',
  distDir: 'dist',
  // Disable image optimization (requires server)
  images: {
    unoptimized: true,
  },
  // Server external packages not needed for static export
  // (API routes won't work in static export - they are handled natively)
  serverExternalPackages: [],
  // Headers not applicable for static export
  // CSP and security headers are handled in the web server or meta tags
};

export default nextConfig;
