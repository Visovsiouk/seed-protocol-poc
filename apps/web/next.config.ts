import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // wagmi/viem are ESM; Next 15 handles them natively, but transpilePackages
  // smooths over any subpath import issues from RainbowKit.
  transpilePackages: ["@rainbow-me/rainbowkit"],
};

export default nextConfig;
