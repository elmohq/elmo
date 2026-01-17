import type { NextConfig } from "next";
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
};

export default withPlausibleProxy()(nextConfig);
