import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectPath = dirname(fileURLToPath(import.meta.url));

const locatorLoader = {
  loader: "@locator/webpack-loader",
  options: { env: "development" },
};

const locatorOverride =
  process.env.ENABLE_LOCATOR ?? process.env.NEXT_PUBLIC_ENABLE_LOCATOR;
const enableLocator =
  process.env.NODE_ENV === "development" && locatorOverride !== "false";

const nextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_PROJECT_PATH: projectPath,
  },
  async redirects() {
    return [
      { source: "/events", destination: "/agenda", permanent: true },
      {
        source: "/events/:slug",
        destination: "/agenda/:slug",
        permanent: true,
      },
      { source: "/about", destination: "/profil", permanent: true },
    ];
  },
  images: {
    localPatterns: [
      {
        pathname: "/api/notion-image",
      },
      {
        pathname: "/api/notion-image/**",
      },
    ],
  },
  turbopack: enableLocator
    ? {
        rules: {
          "**/*.{tsx,jsx}": {
            loaders: [locatorLoader],
          },
        },
      }
    : {},
  webpack: (config, { dev, isServer }) => {
    if (enableLocator && dev && !isServer) {
      config.module.rules.push({
        test: /\.(tsx|ts|jsx|js)$/,
        exclude: /node_modules/,
        use: [locatorLoader],
      });
    }

    return config;
  },
};

export default nextConfig;
