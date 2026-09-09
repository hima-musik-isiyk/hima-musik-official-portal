import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectPath = dirname(fileURLToPath(import.meta.url));

const locatorLoader = {
  loader: "@locator/webpack-loader",
  options: { env: "development" },
};

const enableLocator =
  process.env.NODE_ENV === "development" &&
  process.env.LOCATOR_ENABLED === "true";
const locatorProjectPath = enableLocator && process.env.WORKSPACE_ROOT
  ? resolve(projectPath, process.env.WORKSPACE_ROOT)
  : projectPath;

const nextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_PROJECT_PATH: locatorProjectPath,
    NEXT_PUBLIC_LOCATOR_ENABLED: enableLocator ? "true" : "false",
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
  webpack: (config) => {
    if (enableLocator) {
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
