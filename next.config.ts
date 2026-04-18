import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source:      '/:path*',
        has:         [{ type: 'host', value: 'fueling-sense.com' }],
        destination: 'https://www.fueling-sense.com/:path*',
        permanent:   true,
      },
    ];
  },
};

export default nextConfig;
