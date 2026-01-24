import type { NextConfig } from "next";
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/config",
    "@workspace/deployment",
    "@workspace/local",
    "@workspace/demo",
    "@workspace/whitelabel",
  ],
  // Enable standalone output for Docker deployment
  output: "standalone",
};

export default withPlausibleProxy()(nextConfig);
