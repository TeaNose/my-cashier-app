# My Cashier App

## Development build

This project uses native modules (Bluetooth thermal printing) and cannot run in Expo Go.

**One-time setup:**

```bash
npm install
npx expo prebuild --clean --platform android
```

**Daily dev:**

```bash
npm run android
```

This builds and installs a dev APK on the connected Android device or emulator. Reloading JS still works the same — only native changes require a fresh build.

The generated `android/` and `ios/` folders are gitignored; they are reproducible from `app.json` plus the config plugins in `plugins/`.
