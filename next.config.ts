import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (the UI test runner) needs its own build directory,
  // otherwise the two fight over .next and neither starts.
  distDir: process.env.KITAAB_DIST_DIR ?? ".next",

  // @libsql/client reaches a native module for `file:` URLs. Left to the
  // bundler it gets traced into the server bundle and breaks at runtime; kept
  // external it is required normally and resolves its own prebuilt binary.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
