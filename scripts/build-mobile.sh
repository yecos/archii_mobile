#!/bin/bash
# Build script for Archii Mobile (Capacitor)
# Excludes API routes from static export since Capacitor doesn't need a backend server

set -e

echo "[Archii Mobile] Starting build process..."

# Check if we're in the right directory
if [ ! -f "capacitor.config.ts" ]; then
  echo "[Archii Mobile] Error: capacitor.config.ts not found. Run from project root."
  exit 1
fi

# Backup API routes if they exist — move OUTSIDE src/app/ so TypeScript
# doesn't try to resolve @/app/api/... imports from the renamed folder
if [ -d "src/app/api" ]; then
  echo "[Archii Mobile] Backing up API routes..."
  mv src/app/api /tmp/archii_api_backup_build
fi

# Run Next.js build
echo "[Archii Mobile] Building Next.js static export..."
npm run build

# Restore API routes
if [ -d "/tmp/archii_api_backup_build" ]; then
  echo "[Archii Mobile] Restoring API routes..."
  mv /tmp/archii_api_backup_build src/app/api
fi

echo "[Archii Mobile] Build complete! Output is in the 'dist/' directory."
echo "[Archii Mobile] Next steps:"
echo "  npx cap sync         - Sync with native platforms"
echo "  npx cap open android - Open Android Studio"
echo "  npx cap open ios     - Open Xcode"
