import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (the UI test runner) needs its own build directory,
  // otherwise the two fight over .next and neither starts.
  distDir: process.env.KITAAB_DIST_DIR ?? ".next",
};

export default nextConfig;
