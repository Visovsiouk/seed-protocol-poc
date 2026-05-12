import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // wagmi/viem are ESM; Next 15 handles them natively, but transpilePackages
  // smooths over any subpath import issues from RainbowKit.
  transpilePackages: ["@rainbow-me/rainbowkit"],
  // Silence "Module not found" warnings for optional peer deps that the wallet
  // stack pulls in transitively but never actually executes in a browser build:
  //   - @react-native-async-storage/async-storage — only used by @metamask/sdk
  //     when running on React Native.
  //   - pino-pretty — only used by @walletconnect/logger in dev pretty-printing.
  // Aliasing to `false` tells webpack "treat this as an empty module" so the
  // warnings disappear without us shipping unused packages.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
