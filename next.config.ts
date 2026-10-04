import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded dev database is only ever loaded locally; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
