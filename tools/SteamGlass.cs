// SteamGlass - makes every Steam window truly see-through.
//
// Steam draws its UI in opaque native windows, so CSS alone can never show what
// is behind them. This helper sets WS_EX_LAYERED on every top-level window owned
// by steamwebhelper.exe / steam.exe (library, store, community, settings,
// friends, menus, popups) with:
//   - colour key rgb(1, 14, 22): pixels the theme paints exactly that colour
//     become holes (100% see-through to the desktop and other windows);
//   - constant alpha for everything else, so text and art stay sharp.
// The theme filters images/video (contrast .98) so their red channel is always
// >= 2: game art can never contain the key and punch holes.
//
// When transparency is toggled off (hotkey) or the helper is not running, the
// key colour simply shows as itself: a solid dark navy background.
//
// Cost: zero polling. It sleeps in GetMessage and wakes only on WinEvents
// (window shown / foreground changed), a config.json file-change event, the
// hotkey, or steam.exe exiting.
//
// Lifetime: if Steam is not running, the helper starts it. It exits when Steam
// exits (after a single 15 s grace check, so Steam self-updates survive).
//
// Usage:  SteamGlass.exe              run; follows the theme's Mode, Transparency %
//                                     and Toggle hotkey settings (live)
//         SteamGlass.exe 180          run with a fixed opacity 40-255
//         SteamGlass.exe --restore    make Steam windows opaque again and exit
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

static class SteamGlass
{
    const int GWL_EXSTYLE = -20;
    const long WS_EX_LAYERED = 0x80000;
    const uint LWA_ALPHA = 0x2;
    const uint LWA_COLORKEY = 0x1;
    const uint KEY = 0x00160E01; // COLORREF 0x00BBGGRR = rgb(1, 14, 22); must match css --glass-key
    const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    const uint EVENT_OBJECT_SHOW = 0x8002;
    const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    const uint GA_ROOT = 2;
    const uint WM_HOTKEY = 0x0312;
    const uint WM_QUIT = 0x0012;
    const uint WM_APP_RELOAD = 0x8001;
    const int HOTKEY_ID = 0x6D5A;
    const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_NOREPEAT = 0x4000;

    delegate bool EnumProc(IntPtr h, IntPtr l);
    delegate void WinEventProc(IntPtr hook, uint ev, IntPtr h, int idObject, int idChild, uint thread, uint time);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint key, out byte alpha, out uint flags);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc cb, uint pid, uint tid, uint flags);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr h; public uint msg; public IntPtr w, l; public uint time; public int x, y; }

    // ---- state (touched under `gate`) ----
    static readonly object gate = new object();
    static byte alpha = 245;
    static bool paused;               // hotkey: transparency off
    static string hotkey = "Ctrl+Alt+T";
    static readonly Dictionary<uint, bool> steamPid = new Dictionary<uint, bool>();
    static WinEventProc keepAlive;    // stop the GC collecting the callback
    static uint mainThread;

    static readonly string Dir = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string ConfigPath = Path.GetFullPath(Path.Combine(Dir, "..", "..", "..", "config", "config.json"));
    static readonly string StatusPath = Path.Combine(Dir, "helper-status.json");

    static bool IsSteam(uint pid)
    {
        bool yes;
        if (steamPid.TryGetValue(pid, out yes)) return yes;
        try
        {
            string n = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
            yes = n == "steamwebhelper" || n == "steam";
        }
        catch { yes = false; }
        if (steamPid.Count > 512) steamPid.Clear(); // pids get reused
        steamPid[pid] = yes;
        return yes;
    }

    static void Apply(IntPtr h, bool restore)
    {
        if (h == IntPtr.Zero || GetAncestor(h, GA_ROOT) != h || !IsWindowVisible(h)) return;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (!IsSteam(pid)) return;
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        if (restore)
        {
            if ((ex & WS_EX_LAYERED) != 0)
            {
                SetLayeredWindowAttributes(h, 0, 255, LWA_ALPHA);
                SetWindowLongPtr(h, GWL_EXSTYLE, new IntPtr(ex & ~WS_EX_LAYERED));
            }
            return;
        }
        // Paused: fully solid, no colour key -> key pixels show as dark navy.
        uint wantFlags = paused ? LWA_ALPHA : (LWA_ALPHA | LWA_COLORKEY);
        byte wantAlpha = paused ? (byte)255 : alpha;
        uint wantKey = paused ? 0 : KEY;
        if ((ex & WS_EX_LAYERED) != 0)
        {
            uint k, f; byte a;
            if (GetLayeredWindowAttributes(h, out k, out a, out f) && f == wantFlags && a == wantAlpha && (paused || k == wantKey)) return;
        }
        else SetWindowLongPtr(h, GWL_EXSTYLE, new IntPtr(ex | WS_EX_LAYERED));
        SetLayeredWindowAttributes(h, wantKey, wantAlpha, wantFlags);
    }

    static void ApplyAll(bool restore)
    {
        EnumWindows((h, l) => { Apply(h, restore); return true; }, IntPtr.Zero);
    }

    // ---- settings from millennium\config\config.json (values are strings) ----
    static readonly Regex PctRx = new Regex(@"""Transparency %""\s*:\s*""?(\d+)");
    static readonly Regex ModeRx = new Regex(@"""Mode""\s*:\s*""([^""]*)""");
    static readonly Regex HotkeyRx = new Regex(@"""Toggle hotkey""\s*:\s*""([^""]*)""");
    static int argAlpha = -1;

    static string ReadThemeBlock()
    {
        try
        {
            string text;
            using (var fs = new FileStream(ConfigPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var sr = new StreamReader(fs)) text = sr.ReadToEnd();
            int at = text.IndexOf("\"GlassDesktop\"", StringComparison.Ordinal);
            return at >= 0 ? text.Substring(at) : "";
        }
        catch { return ""; }
    }

    static void ReadSettings(out byte a, out string hk)
    {
        string text = ReadThemeBlock();
        Match hm = HotkeyRx.Match(text);
        hk = hm.Success ? hm.Groups[1].Value : "Ctrl+Alt+T";
        a = 245; // default: 4 % transparency
        if (argAlpha >= 0) { a = (byte)argAlpha; return; }
        Match mode = ModeRx.Match(text);
        if (mode.Success)
        {
            string m = mode.Groups[1].Value;
            if (m == "Normal" || m == "Opaque" || m == "OLED Black") { a = 255; return; }
        }
        Match pct = PctRx.Match(text);
        int t;
        if (pct.Success && int.TryParse(pct.Groups[1].Value, out t))
            a = (byte)Math.Round(255 * (100 - Math.Max(0, Math.Min(60, t))) / 100.0);
    }

    // "Ctrl+Alt+T" -> (mods, vk). "Off" -> false.
    static bool ParseHotkey(string s, out uint mods, out uint vk)
    {
        mods = 0; vk = 0;
        if (string.IsNullOrEmpty(s) || s == "Off") return false;
        foreach (string raw in s.Split('+'))
        {
            string p = raw.Trim().ToUpperInvariant();
            if (p == "CTRL") mods |= MOD_CONTROL;
            else if (p == "ALT") mods |= MOD_ALT;
            else if (p == "SHIFT") mods |= MOD_SHIFT;
            else if (p.Length == 1 && char.IsLetterOrDigit(p[0])) vk = p[0];
            else if (p.StartsWith("F") && p.Length <= 3) { int n; if (int.TryParse(p.Substring(1), out n) && n >= 1 && n <= 24) vk = (uint)(0x6F + n); }
        }
        return vk != 0;
    }

    static void RegisterHotkey() // main thread only
    {
        UnregisterHotKey(IntPtr.Zero, HOTKEY_ID);
        uint mods, vk;
        if (ParseHotkey(hotkey, out mods, out vk)) RegisterHotKey(IntPtr.Zero, HOTKEY_ID, mods | MOD_NOREPEAT, vk);
    }

    static void WriteStatus()
    {
        try
        {
            File.WriteAllText(StatusPath, string.Format(
                "{{\"running\":true,\"pid\":{0},\"paused\":{1},\"alpha\":{2},\"hotkey\":\"{3}\",\"started\":\"{4:o}\"}}",
                Process.GetCurrentProcess().Id, paused ? "true" : "false", alpha, hotkey, DateTime.UtcNow));
        }
        catch { }
    }

    static Timer debounce;
    static FileSystemWatcher watcher;

    static void WatchConfig()
    {
        watcher = new FileSystemWatcher(Path.GetDirectoryName(ConfigPath), "config.json");
        watcher.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.FileName;
        FileSystemEventHandler h = (s, e) => debounce.Change(250, Timeout.Infinite);
        watcher.Changed += h; watcher.Created += h;
        watcher.Renamed += (s, e) => debounce.Change(250, Timeout.Infinite);
        watcher.EnableRaisingEvents = true;
    }

    // ---- Steam lifetime: start it if needed, exit when it exits ----
    static Process steam;
    static Timer grace;

    static Process FindSteam() { return Process.GetProcessesByName("steam").FirstOrDefault(); }

    static Process StartSteamIfNeeded()
    {
        Process p = FindSteam();
        if (p != null) return p;
        try
        {
            string exe = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamExe", null) as string;
            if (string.IsNullOrEmpty(exe)) exe = Path.GetFullPath(Path.Combine(Dir, "..", "..", "..", "..", "steam.exe"));
            if (File.Exists(exe)) return Process.Start(exe);
        }
        catch { }
        return null;
    }

    static void AttachSteam(Process p)
    {
        steam = p ?? FindSteam();
        if (steam == null) { PostThreadMessage(mainThread, WM_QUIT, IntPtr.Zero, IntPtr.Zero); return; }
        try
        {
            steam.EnableRaisingEvents = true;
            steam.Exited += (s, e) => grace.Change(15000, Timeout.Infinite); // one check, not a loop
        }
        catch { PostThreadMessage(mainThread, WM_QUIT, IntPtr.Zero, IntPtr.Zero); }
    }

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--restore") { ApplyAll(true); return; }

        bool first;
        using (var mutex = new Mutex(true, "Local\\SteamGlassHelper", out first))
        {
            if (!first) return; // already running
            mainThread = GetCurrentThreadId();
            int v;
            if (args.Length > 0 && int.TryParse(args[0], out v)) argAlpha = Math.Max(40, Math.Min(255, v));

            Process started = StartSteamIfNeeded();

            ReadSettings(out alpha, out hotkey);
            ApplyAll(false);
            RegisterHotkey();
            WriteStatus();

            debounce = new Timer(_ =>
            {
                byte a; string hk;
                ReadSettings(out a, out hk);
                bool hkChanged;
                lock (gate)
                {
                    hkChanged = hk != hotkey;
                    hotkey = hk;
                    if (a != alpha) { alpha = a; ApplyAll(false); }
                }
                if (hkChanged) PostThreadMessage(mainThread, WM_APP_RELOAD, IntPtr.Zero, IntPtr.Zero);
                WriteStatus();
            }, null, Timeout.Infinite, Timeout.Infinite);
            WatchConfig();

            grace = new Timer(_ =>
            {
                if (FindSteam() != null) AttachSteam(null); // Steam restarted itself (update)
                else PostThreadMessage(mainThread, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            }, null, Timeout.Infinite, Timeout.Infinite);
            AttachSteam(started);

            keepAlive = (hook, ev, h, idObject, idChild, thread, time) =>
            {
                if (idObject == 0 && idChild == 0) lock (gate) Apply(h, false); // OBJID_WINDOW
            };
            uint fl = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
            SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, IntPtr.Zero, keepAlive, 0, 0, fl);
            SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, keepAlive, 0, 0, fl);

            MSG m;
            while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0)
            {
                if (m.msg == WM_HOTKEY && m.w.ToInt32() == HOTKEY_ID)
                {
                    lock (gate) { paused = !paused; ApplyAll(false); }
                    WriteStatus();
                    continue;
                }
                if (m.msg == WM_APP_RELOAD) { RegisterHotkey(); continue; }
                TranslateMessage(ref m); DispatchMessage(ref m);
            }

            UnregisterHotKey(IntPtr.Zero, HOTKEY_ID);
            try { File.Delete(StatusPath); } catch { }
        }
    }
}
