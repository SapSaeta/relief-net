import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the bundled ffmpeg binary resolvable at runtime.
  serverExternalPackages: ["ffmpeg-static"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
