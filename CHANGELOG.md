# Changelog

## 5.0.0 (store resubmission: no executables)

The theme is now **pure CSS and JS**. Extract it, enable it in Millennium, done.
Nothing to build, run or install.

- **Removed the companion app.** `tools/` is gone: `SteamGlass.exe`, its C# source and
  every `.ps1`/`.cmd` script (start, build, uninstall, settings import/export).
- **New look: frosted glass.** Real desktop see-through needs a native program, so it is
  gone. The window background is now the theme's own soft backdrop (two faint glows
  over a dark gradient in the Glass colour, no images). Cards, menus, dialogs, the title
  bar and the sidebar are translucent and blurred with `backdrop-filter`.
- Mode: **Glass** (default), **Readable**, **Solid**. See-through and Tinted are gone
  (both needed the app). Saved See-through/Tinted settings fall back to Glass.
- New sliders: **Frost blur px** (0 = clear glass) and **Backdrop glow %**.
- Removed: Window fade % and Toggle hotkey (both were applied by the app).
- Removed the colour-key guard (`filter: contrast(.98)` on every image). Images render
  untouched again, which is also cheaper.
- The welcome card only says where the settings are. It reads no files.
- No blur on repeated Store/Community rows (market, forums), to keep scrolling smooth.

## 4.0.0 (store release)

**Simpler settings.** 15 overlapping controls became 14 that each do one thing, and every
slider now works in every mode (the old Custom sliders did nothing outside Custom).
- Mode: See-through, Readable, Tinted, Solid. Clear became See-through, Frosted became Readable,
  and Ghost/Custom became See-through. Normal, Opaque and OLED Black became Solid, coloured by
  Glass colour (Steam blue, Smoke = charcoal, High contrast = black).
- Preset is now **Glass colour**, with a new **Steam blue**. Light glass is now **Slate**.
- Glass tint strength % is now **Card darkness %**. The new **Bar darkness %** finally gives
  the sidebar, title bar and Store/Community header a backing on bright wallpapers.
- Transparency % is now **Window fade %**, default 0 (was 4, which faded text for everyone).
  Tinted mode uses 20 % when it is left at 0.
- Font list trimmed to 5. The Custom tab is gone.

**Store-ready install.**
- Double-click `tools\start.cmd` (and `uninstall.cmd`): no PowerShell policy changes needed.
- The helper builds itself on first run and rebuilds after a theme update.
- The helper and the settings scripts read the theme's folder name instead of assuming
  `GlassDesktop`, so a store install under any folder name keeps its settings.

**Helper.**
- Stays running across Steam restarts, updates and crashes (idle, no polling).
- Turns itself off (Steam solid, hotkey released) while another Millennium theme is selected.
- start/build delete the status file, so a killed helper is never reported as running.

**Honest status.** The welcome card checks the helper before it says anything, shows your
real hotkey and fades out. Later starts show a small notice when the helper is off or paused.
It stays 20 s (longer while hovered) and has an OK button.

**Fixes and polish.**
- Dim game art no longer breaks the colour-key guard, which could punch holes in dark game art.
- Cards and menus get a 1 px lit top edge (crisp cut glass).
- Stronger ease-out, instant menu highlights, buttons press down slightly.
- Windows "reduce transparency" now beats the slider values.

## 3.0.0 (first public release, tagged v1.0.0 on Codeberg)

- Colour key moved to rgb(1, 14, 22). If transparency is paused or the helper is not
  running, the background is a solid dark navy, never a raw key colour.
- Colour-key guard: images, video and canvas get `filter: contrast(.98)`, so no
  picture can contain the key colour and punch holes (verified pixel by pixel).
- New settings: Glass tint strength % (independent of Transparency %), Preset
  (Default, Midnight, Light glass, High contrast), Toggle hotkey.
- Global hotkey (default Ctrl+Alt+T) turns transparency off and on, for screenshots
  and screen sharing. It applies live.
- The helper starts Steam if needed and exits when Steam exits (no orphan process).
  It writes `tools/helper-status.json`, which the welcome card shows.
- A welcome card is shown once in the main window, with helper status.
- Polish: rounded, see-through-cornered context menus, dropdowns and tooltips;
  visible selected navigation; smooth hover/focus transitions that respect reduce
  motion; matching thin scrollbars on Store and Community; card shadows.
- Fonts are Windows system fonts only. The theme makes no network requests.
- Settings import/export: `tools/export-settings.ps1`, `tools/import-settings.ps1`.
- `tools/build.ps1` builds the helper with the C# compiler that ships with Windows.
- Re-sweeps back off to 3 s when the page has nothing new.

## 2.3.0

- Mode presets (Normal, Opaque, Clear, Frosted, Ghost, Readable, Tinted, OLED Black,
  Custom) and the Transparency % slider, applied live.
- Blur and Acrylic were tested and are not possible (see README).

## 2.2.0

- Percent sliders, fonts and accent colours in the Millennium settings.

## 2.1.0

- Store, Community and Help pages themed (URL patterns must match the whole URL).
- Library sub-pages re-sweep on DOM changes.

## 2.0.0

- Real see-through with the layered-window colour key (replaced the wallpaper backdrop).
