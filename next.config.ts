import type { NextConfig } from "next";
import { withPlausibleProxy } from 'next-plausible';

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPlausibleProxy()(nextConfig);
