# Changelog

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
