[README.md](https://github.com/user-attachments/files/34236767/README.md)
# NovaVault – private offline photo & video vault (Android)

Your NovaStream UI, rebuilt as a phone app. No server, no Cloudinary, no internet.

## What it does
- **PIN lock** (6 digits, salted PBKDF2 hash, escalating lockout after 5 wrong tries)
- **Biometric unlock** (fingerprint/face) – optional, toggle in Settings
- **Auto-lock** the moment the app goes to background
- **Screenshots & recent-apps preview blocked** (privacy screen)
- Photos & videos copied into the app's **private storage** – not visible in Gallery or other apps
- Videos: thumbnails, duration, resume-where-you-left-off, autoplay next, like, search, sort, edit, delete
- Photos: masonry grid, albums (your old "collections"), swipe between photos, double-tap zoom
- **Zero network permission** – `setup.sh` removes `INTERNET` from the manifest and disables backups

## Build (needs Node 18+ and Android Studio)
```bash
bash setup.sh        # installs, builds, creates android/, hardens manifest
npm run open         # opens Android Studio -> press Run with your phone plugged in (USB debugging on)
```
After editing code later: `npm run sync`, then Run again.
To get an installable APK: Android Studio -> Build -> Build APK(s).

## Important notes
- **Forgot PIN = no recovery.** Offline means no reset. Reinstalling wipes the vault.
- **Uninstalling the app deletes everything in it.** Keep originals until you trust it.
- Files are protected by Android app sandboxing + the lock, but are **not encrypted at rest**
  (so large videos can stream smoothly). On a rooted/forensically-imaged phone they could be read.
- Importing **copies** files; delete the originals from your Gallery yourself afterwards.

## Get the APK from GitHub (no Android Studio needed)
1. Create a **private** repo on GitHub (private matters: keep your app code to yourself).
2. Upload everything in this folder, including the hidden `.github` folder
   (easiest: install Git, then `git init`, `git add .`, `git commit -m "init"`,
   `git branch -M main`, `git remote add origin <your-repo-url>`, `git push -u origin main`).
3. Open the repo -> **Actions** tab -> "Build Android APK" runs automatically (~5-8 min).
4. Click the finished run -> **Artifacts** -> download `NovaVault-apk` -> unzip -> `NovaVault.apk`.
5. Copy the APK to your phone, tap it, allow "Install unknown apps" when asked.

For a permanent download link: push a tag (`git tag v1.0 && git push origin v1.0`);
the APK then appears under the repo's **Releases** page.
Note: the APK is a debug build signed with a debug key - fine for personal use.
