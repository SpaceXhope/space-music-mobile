# Space Music Mobile

Expo SDK 58 client for the current Space Music account and catalog.

## Current parity

- the same Space Music login session model as desktop;
- server-backed liked tracks and playlists;
- two-way library synchronization with desktop (15 second active refresh);
- catalog search, popular tracks, listening history and daily mixes;
- server playback resolution through `/v1/tracks/:id/playback`;
- background audio and lock-screen metadata through `expo-audio`;
- managed playback queue with shuffle, repeat-one/repeat-all and warm next-track resolution;
- responsive full-screen player with queue editing and adaptive seeking;
- synchronized LRC, TTML, QRC and RichSync lyrics with an offline SQLite cache;
- offline SQLite cache for the last synchronized library;
- playlist creation and native Android/iOS navigation.

SQLite is only a cache. The Space Music API remains the source of truth, so a like or
playlist created on mobile appears on desktop and vice versa.

## Development

```powershell
npm install
npx expo start
```

SDK 58 requires Node 22.13 or newer. There are no committed `android/` or `ios/`
directories; Expo Continuous Native Generation configures native projects from `app.json`.

## Verify

```powershell
npm run typecheck
npm run lint
npm run doctor
npx expo export --platform android --output-dir dist-android
```
