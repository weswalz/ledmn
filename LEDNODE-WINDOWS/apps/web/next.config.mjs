import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  transpilePackages: ["@lednode/shared"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  devIndicators: false
};

export default nextConfig;
