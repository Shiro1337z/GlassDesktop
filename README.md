# Glass Desktop

A frosted glass theme for [Millennium](https://steambrew.app). Library, Store, Community,
Help, Settings, friends and menus share one soft backdrop. Cards, bars and menus are
translucent and blurred, and text stays sharp. Profile pages keep their own background.

**Pure CSS and JS.** No executables, no scripts to run, nothing downloaded.

## Install

1. Install [Millennium](https://steambrew.app).
2. Extract the theme into `Steam\millennium\themes\` (or install it from Millennium > Themes).
3. In Steam: **Millennium > Themes**, select **Glass Desktop**. Steam reloads.

That's it. To remove it, pick another theme.

## What it does

- **Frosted glass everywhere.** Dialogs, menus, the title bar, the sidebar and the
  Store/Community header blur what is behind them (`backdrop-filter`).
- **One backdrop.** Two faint glows (your Accent and Glass colour) over a dark gradient.
  It is drawn in CSS, with no images. Steam's own background art is removed, so every
  page looks like the Library.
- **Readable.** Text sits on smoked glass with a lit top edge and a soft outline.
- **Survives Steam updates.** No Steam hashed class names are hard-coded. The script
  reads Steam's own stylesheets at runtime.
- **Light.** No polling and no network requests. See [Performance](#performance).

## Settings guide

Millennium > Themes > Glass Desktop > Configure. Every slider works in every mode.

| Setting | What it does |
|---|---|
| **Mode** | **Glass** (default): frosted, see-through cards and bars. **Readable**: near-solid cards and bars. **Solid**: no glass, flat colour, lightest on the GPU |
| **Glass colour** | Smoke, Steam blue, Midnight, Slate, High contrast. Colours the glass, the backdrop, and the whole window in Solid |
| **Card darkness %** | Glass behind text. 100 = the mode's default, 200 = solid |
| **Bar darkness %** | Extra backing for the sidebar, title bar and Store/Community header |
| **Text outline %** | Soft dark rim around text. 0 = off |
| **Frost blur px** | How much the glass blurs what is behind it. 0 = clear glass |
| **Backdrop glow %** | Strength of the two backdrop glows. 0 = plain dark gradient |
| Corner radius px, Font, Accent, Accent glow, Window border, Dim game art | Style details. Fonts are Windows system fonts only |
| Reduce motion | Turns off transitions and animations |

Millennium has no `theme.json`. The theme version lives in `skin.json` (`"version"`).

## How it works

1. `css/glass.css` paints the backdrop on `html` and makes Steam's window layers
   transparent. Cards, menus and bars get a translucent Glass colour plus
   `backdrop-filter: blur() saturate()`.
2. `js/glass.js` reads Steam's stylesheets once and writes small override sheets that
   turn dark, opaque backgrounds translucent. Editing Steam's 5 MB stylesheet in place
   causes frame hitches, so the script never does.
3. The script also hit-tests the window edges to find bars and full-window background
   layers, and frosts or clears them. A light, throttled sweep follows page changes.
4. `css/web.css` themes Store, Community and Help pages the same way. Every value has a
   fallback, because web pages may not receive Millennium's slider values.

### Why not see-through to the desktop?

Making a Windows app see-through to the desktop needs a native program to change the
window. Themes on Millennium must be CSS and JS only, so Glass Desktop draws its own
backdrop and frosts on top of it.

## Performance

`backdrop-filter` costs GPU time on each blurred surface. The theme blurs only a few
large surfaces (dialogs, menus, bars). It never blurs repeated rows such as Market
listings or forum topics. If scrolling feels heavy, set **Frost blur px** to 0 or use
**Solid** mode. Windows "reduce transparency" also turns the blur off.

## Known limits

- Store and Help pages block theme scripts (Content Security Policy). The CSS still
  themes them, but the background sweep does not run there.
- Web pages may not receive slider values and then use the defaults.
- Windows HDR, cross-monitor DPI changes and running games were not tested.

## Troubleshooting

| Problem | Fix |
|---|---|
| Configure shows old or missing options | Fully exit Steam (Steam > Exit) and reopen. Millennium reads theme settings only at start |
| Theme switched itself to Default | Re-select Glass Desktop in Millennium > Themes |
| Text hard to read | Raise **Card darkness %** and **Bar darkness %**, or use **Readable** mode or the **High contrast** colour |
| Scrolling feels heavy | Lower **Frost blur px** or use **Solid** mode |

## Privacy

No telemetry, no network requests, and no files read or written. The welcome card's
"dismissed" flag is kept in Steam's own local storage.

## License

MIT. See [LICENSE](LICENSE).
