/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental: { // Removed as asyncWebAssembly and topLevelAwait are no longer recognized in Next.js 15+
  //   asyncWebAssembly: true,
  //   topLevelAwait: true,
  // },
  // If you are aiming for a full static export, uncomment the line below
  output: 'export',
  // Note: Ensure any dynamic SSR/ISR features are compatible if using 'export'
  // GitHub Pages serves content from a subdirectory matching your repo name
  // If your repo is at username.github.io/board-game-ai, use:
  // basePath: process.env.NODE_ENV === 'production' ? '/board-game-ai' : '',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Disable server-side features since GitHub Pages is static
  trailingSlash: true,
  webpack: (config, { isServer, nextRuntime }) => {
    // Required for WASM support, especially if not using Edge runtime or if issues persist
    // For client-side WASM, ensure that experiments.asyncWebAssembly is true.
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    
    // For server-side WASM that needs to be bundled (e.g. when using App Router with Node.js runtime)
    if (isServer && nextRuntime === "nodejs") {
        config.output.webassemblyModuleFilename = "static/wasm/[modulehash].wasm";
    } else {
        config.output.webassemblyModuleFilename = "static/wasm/[modulehash].wasm";
    }

    return config;
  },
}

export default nextConfig;
