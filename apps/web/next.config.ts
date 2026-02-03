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
  // DBOS SDK cannot be bundled; keep it external for server runtime
  serverExternalPackages: ["@dbos-inc/dbos-sdk", "@dbos-inc/otel"],
  // Enable standalone output for Docker deployment
  output: "standalone",
};

export default withPlausibleProxy()(nextConfig);
