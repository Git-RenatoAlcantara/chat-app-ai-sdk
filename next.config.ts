import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse", 
    "canvas",
    "@llm-tools/embedjs",
    "@llm-tools/embedjs-openai",
    "@llm-tools/embedjs-loader-pdf",
    "@llm-tools/embedjs-loader-csv",
    "@llm-tools/embedjs-loader-docx",
    "@llm-tools/embedjs-loader-excel",
    "@llm-tools/embedjs-loader-ppt",
    "@llm-tools/embedjs-loader-web",
    "@llm-tools/embedjs-lancedb",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {},
};

export default nextConfig;
