# NISML Hub for Windows

v0.1.0 · Windows 10/11 x64 · Microsoft Edge required.

Download the executable and double-click it. No installation or administrator privilege is required. The existing laboratory logo is embedded in the executable; the window title comes from the site's NISML Hub title. A desktop shortcut may be created using Windows' normal shortcut menu.

This is a lightweight launcher for an Edge app window, not a separate embedded browser. Login, microphone permissions, downloads and cookies are handled by Edge. It opens only the fixed official dashboard URL and does not inspect or copy browser data. It does not modify registry settings or install services. Remove the executable and any user-created shortcut to remove the launcher; Edge login remains until the user signs out.

The website's meetings, files, summaries and browser recording features are available. macOS native floating controls, global recording hotkeys and background capture while the window is closed are not included. Keep the meeting window open during browser recording and transcription work.

Build with verified Zig 0.15.2: `ZIG_BIN=/path/to/zig bash build.sh`. Resource metadata, manifest, PE x64 target and imports are checked during release preparation. Windows device execution/login/microphone testing is required separately. This initial executable is not Authenticode-signed.
