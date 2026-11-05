# NovaVault – private offline photo & video vault (Android)

Your NovaStream UI, rebuilt as a phone app. No server, no Cloudinary, no internet.

## Features

**Security & privacy**
- **PIN lock** (6 digits, salted PBKDF2 hash, escalating lockout after 5 wrong tries)
- **Biometric unlock** (fingerprint/face), optional, toggle in Settings
- **Auto-lock** the moment the app goes to background
- **Screenshots & recent-apps preview blocked** (privacy screen)
- Photos & videos are copied into the app's **private storage**, not visible in Gallery or other apps
- **Zero network permission**: the build removes `INTERNET` from the manifest and disables backups

**Videos**
- **Playlists:** the Videos tab opens on a grid of playlists. Tap one to see its videos; tap Back (or the Videos tab again) to return.
  Set the playlist name when importing, change it later with the pencil icon on a video, and rename a playlist with the pencil in its header.
- **Custom thumbnails:** open a video, pause on the frame you like, tap the camera icon, fine-tune with the slider and tap "Use this frame" (or upload your own image).
- Duration, resume where you left off, autoplay next (within the playlist), like, search, sort, edit, delete

**Photos & GIFs**
- Masonry grid, albums, swipe between photos, double-tap zoom
- **GIFs:** import `.gif` files with the + button. They play animated in the grid with a GIF badge; use the GIF chip to filter them.
  (The app is offline, so GIFs can't be searched online. You add files from your phone.)

## Get the APK from GitHub (no Android Studio needed)
1. Create a **private** repo on GitHub.
2. Upload everything in this folder, including the hidden `.github` folder. On the GitHub website, create `.github/workflows/build-apk.yml` by hand via "Add file -> Create new file" if the uploader skips it.
   Or with Git: `git init`, `git add .`, `git commit -m "init"`, `git branch -M main`, `git remote add origin <your-repo-url>`, `git push -u origin main`.
3. Open the repo -> **Actions** tab. "Build Android APK" runs automatically (about 5-8 min) on every push.
4. Open the finished run -> **Artifacts** -> download `NovaVault-apk` -> unzip -> `NovaVault.apk`.
5. Copy the APK to your phone, tap it, and allow "Install unknown apps" when asked.

For a permanent download link, push a tag (`git tag v1.0 && git push origin v1.0`); the APK then appears under the repo's **Releases** page.
The APK is a debug build signed with a debug key, which is fine for personal use.

**Updating the app:** edit or replace files in the repo (for example `src/main.js`), commit, and the Action builds a new APK. Installing it over the old one keeps your vault as long as you don't uninstall first.

## Build on your own computer (optional; needs Node 18+ and Android Studio)
```bash
bash setup.sh        # installs, builds, creates android/, hardens manifest
npm run open         # opens Android Studio -> press Run with your phone plugged in
```
After editing code later: `npm run sync`, then Run again. For an APK: Android Studio -> Build -> Build APK(s).

## Project layout
```
.github/workflows/build-apk.yml   GitHub builds the APK
src/main.js                       screens, lock, playlists, viewers, thumbnail picker
src/storage.js                    private file storage, GIFs, playlists, thumbnails
src/auth.js                       PIN + biometric
src/style.css                     design
index.html, package.json, capacitor.config.json, vite.config.js, setup.sh
```

## Important notes
- **Forgot PIN = no recovery.** Offline means no reset. Reinstalling wipes the vault.
- **Uninstalling the app deletes everything in it.** Keep originals until you trust it.
- Files are protected by Android app sandboxing + the lock, but are **not encrypted at rest** (so large videos stream smoothly). On a rooted or forensically imaged phone they could be read.
- Importing **copies** files; delete the originals from your Gallery yourself afterwards.
- Many large GIFs on one screen can make scrolling heavy on older phones.
