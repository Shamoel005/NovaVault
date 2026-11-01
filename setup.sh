#!/usr/bin/env bash
# One-time setup: creates the Android project and hardens it (no internet, no backups).
set -e
npm install
npm run build
npx cap add android
MANIFEST=android/app/src/main/AndroidManifest.xml

# 1. Remove the INTERNET permission so the app physically cannot send data anywhere.
sed -i '/android.permission.INTERNET/d' "$MANIFEST"

# 2. Stop Android cloud/ADB backups from copying your private media out.
sed -i 's/android:allowBackup="true"/android:allowBackup="false"/' "$MANIFEST"

npx cap sync android
echo ""
echo "Done. Next: npm run open   (opens Android Studio -> Run on your phone)"
