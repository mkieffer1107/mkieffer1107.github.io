#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
# This ensures that the script will stop if any command fails.
set -e

# --- Determine Script's Location to Anchor Paths ---
# This makes the script runnable from any directory, as paths are absolute or relative to the script's dir.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

# --- Configuration ---
# Defines the core paths and names used throughout the script.
# Adjust these variables if your project structure or naming conventions differ.

# Path to the Rust Wasm crate (containing Cargo.toml for the Wasm project)
RUST_CRATE_DIR="${SCRIPT_DIR}/rust"

# Path to the frontend application directory (e.g., where package.json, src/, etc., are located)
FRONTEND_APP_DIR="${SCRIPT_DIR}/frontend"

# Subpath within the FRONTEND_APP_DIR where wasm-pack will place the compiled Wasm artifacts.
# For example, if FRONTEND_APP_DIR is "./frontend" and this is "lib/pkg",
# Wasm files will go into "./frontend/lib/pkg".
WASM_OUTPUT_SUBPATH_IN_FRONTEND="public/pkg"

# The desired output name for the Wasm module (passed to wasm-pack's --out-name).
WASM_MODULE_NAME="mcts_game_pkg"

# Name of the directory at the project root to store the final static site output
STATIC_SITE_OUTPUT_DIR_NAME="docs"

# --- Calculated Variables (Derived from Configuration) ---

# Extracts the base name of the frontend directory (e.g., "frontend" from "./frontend").
# This is used to construct the relative path for wasm-pack's --out-dir.
FRONTEND_APP_DIR_BASENAME=$(basename "${FRONTEND_APP_DIR}")

# Parameter for wasm-pack's --out-dir. This path is relative to the RUST_CRATE_DIR.
# It directs wasm-pack to output files to a location like '../frontend/public/pkg',
# which, from within RUST_CRATE_DIR, resolves to ${PROJECT_ROOT}/${FRONTEND_APP_DIR}/public/pkg.
WASM_PACK_OUT_DIR_PARAM_PUBLIC="../${FRONTEND_APP_DIR_BASENAME}/public/pkg"

# Path for TypeScript to find the package for type checking, relative to RUST_CRATE_DIR
WASM_PACK_OUT_DIR_PARAM_LIB="../${FRONTEND_APP_DIR_BASENAME}/lib/pkg"

# Absolute path (from project root) to where the Wasm artifacts will be placed for runtime.
WASM_PUBLIC_DESTINATION_FROM_ROOT="${FRONTEND_APP_DIR}/public/pkg"
# Absolute path for TypeScript/linting.
WASM_LIB_DESTINATION_FROM_ROOT="${FRONTEND_APP_DIR}/lib/pkg"

# Absolute path to the final static site output directory at the project root
STATIC_SITE_OUTPUT_DIR_ROOT="${SCRIPT_DIR}/${STATIC_SITE_OUTPUT_DIR_NAME}"

# --- Script Start ---
echo "🚀 Starting the full build process..."
echo "   This script will build the Rust WebAssembly package, then the frontend application, and finally export it as a static site."

# --- 1. Build the Rust WebAssembly package ---
echo "" # Adding a newline for better readability
echo "🛠️ Building Rust WebAssembly package..."
echo "   Rust Crate Directory: '${RUST_CRATE_DIR}'"
echo "   Wasm Module Output Name: '${WASM_MODULE_NAME}'"
echo "   Target Output Directory for Runtime (relative to project root): '${WASM_PUBLIC_DESTINATION_FROM_ROOT}'"
echo "   Target Output Directory for Types (relative to project root): '${WASM_LIB_DESTINATION_FROM_ROOT}'"

# Build for runtime (into frontend/public/pkg)
(
    cd "${RUST_CRATE_DIR}" && \
    wasm-pack build --release --target web --out-dir "${WASM_PACK_OUT_DIR_PARAM_PUBLIC}" --out-name "${WASM_MODULE_NAME}"
)
echo "✅📦 WebAssembly package built for runtime in: '${WASM_PUBLIC_DESTINATION_FROM_ROOT}'"

# --- Optimize Wasm with wasm-opt (if available) ---
echo ""
echo "⚙️ Attempting to optimize Wasm with wasm-opt..."
WASM_FILE_TO_OPTIMIZE="${WASM_PUBLIC_DESTINATION_FROM_ROOT}/${WASM_MODULE_NAME}_bg.wasm"
if command -v wasm-opt &> /dev/null; then
    if [ -f "${WASM_FILE_TO_OPTIMIZE}" ]; then
        echo "   Optimizing '${WASM_FILE_TO_OPTIMIZE}' with wasm-opt -Oz (for maximum size reduction)..."
        wasm-opt -Oz "${WASM_FILE_TO_OPTIMIZE}" -o "${WASM_FILE_TO_OPTIMIZE}" # Optimize in place
        echo "   ✅ Wasm optimization successful."
    else
        echo "   ⚠️ Wasm file '${WASM_FILE_TO_OPTIMIZE}' not found. Skipping wasm-opt."
    fi
else
    echo "   ⚠️ wasm-opt command not found. Skipping Wasm optimization."
    echo "      For smaller Wasm binaries, install Binaryen: https://github.com/WebAssembly/binaryen"
fi

# Create the lib/pkg directory if it doesn't exist
mkdir -p "${WASM_LIB_DESTINATION_FROM_ROOT}"

# Copy the generated package from public/pkg to lib/pkg for TypeScript type resolution
echo "   Copying WASM package from '${WASM_PUBLIC_DESTINATION_FROM_ROOT}' to '${WASM_LIB_DESTINATION_FROM_ROOT}' for type information..."
cp -r "${WASM_PUBLIC_DESTINATION_FROM_ROOT}/." "${WASM_LIB_DESTINATION_FROM_ROOT}/"
echo "✅📦 WebAssembly package copied for type information to: '${WASM_LIB_DESTINATION_FROM_ROOT}'"

# --- 2. Build the Frontend Application ---
echo "" # Adding a newline for better readability
echo "💻 Building frontend application..."
echo "   Frontend Application Directory: '${FRONTEND_APP_DIR}'"

# This section navigates to the frontend directory, installs dependencies,
# and then runs the frontend's build script (as defined in its package.json).
# This assumes your frontend project uses npm.
# If you use Yarn or pnpm, you'll need to change 'npm install && npm run build'
# to 'yarn install && yarn build' or 'pnpm install && pnpm run build' respectively.
echo "   Running 'pnpm install' to ensure all dependencies are up to date..."
echo "   Running 'pnpm run build' to compile the frontend application..."
echo "   (This typically includes 'next build'. Ensure your package.json scripts are set up.)"
(
    cd "${FRONTEND_APP_DIR}" && \
    pnpm install && \
    pnpm run build # This should run 'next build', which now also exports due to next.config.js
)
echo "✅🏠 Frontend application built and exported successfully (Next.js build completed)."

# Next.js exports to an 'out' directory inside the frontend app directory.
FRONTEND_EXPORT_DIR="${FRONTEND_APP_DIR}/out"

# --- 4. Prepare Final Static Site Output Directory ---
echo ""
echo "📦 Preparing final static site output directory..."
echo "   Target directory: '${STATIC_SITE_OUTPUT_DIR_ROOT}'"

# Remove the target directory if it exists to ensure a clean copy
if [ -d "${STATIC_SITE_OUTPUT_DIR_ROOT}" ]; then
    echo "   Removing existing directory: '${STATIC_SITE_OUTPUT_DIR_ROOT}'"
    rm -rf "${STATIC_SITE_OUTPUT_DIR_ROOT}"
fi

# Create the target directory
echo "   Creating directory: '${STATIC_SITE_OUTPUT_DIR_ROOT}'"
mkdir -p "${STATIC_SITE_OUTPUT_DIR_ROOT}"

# Copy the contents of the frontend export directory to the target directory
echo "   Copying exported files from '${FRONTEND_EXPORT_DIR}' to '${STATIC_SITE_OUTPUT_DIR_ROOT}'"
cp -r "${FRONTEND_EXPORT_DIR}"/. "${STATIC_SITE_OUTPUT_DIR_ROOT}/"

# Clean up the temporary frontend export directory
echo "   Removing temporary frontend export directory: '${FRONTEND_EXPORT_DIR}'"
rm -rf "${FRONTEND_EXPORT_DIR}"

echo "✅📦 Final static site output prepared successfully in '${STATIC_SITE_OUTPUT_DIR_ROOT}'."

# --- Script End ---
echo "" # Adding a newline for better readability
echo "🎉 Full build process completed successfully!"
echo "💡 Your application is ready."
echo "   - WebAssembly artifacts are in '${WASM_PUBLIC_DESTINATION_FROM_ROOT}' and '${WASM_LIB_DESTINATION_FROM_ROOT}'."
echo "   - Frontend build artifacts are in '${FRONTEND_APP_DIR}/dist' (or similar, depending on your frontend setup)."