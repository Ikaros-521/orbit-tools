param([int]$W = 320, [int]$H = 320, [int]$Fps = 24, [int]$Q = 72)
# screen-cue magnifier feed (Windows): GDI BitBlt region capture around the
# OS cursor, JPEG-encoded per frame. Modeled on color-lab's gdi-cap.ps1 —
# GDI keeps delivering on still desktops / RDP where DXGI duplication stalls,
# and BitBlt skips our own layered overlay windows, so the feed never sees
# the magnifier itself (no feedback loop).
# Output per frame: cursorX,cursorY,originX,originY,base64(JPEG WxH)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class GdiRegion {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int nIndex);
  [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);
  // PowerShell defaults to DPI-unaware: GetCursorPos/CopyFromScreen then run
  // in virtualized 96-DPI units (= physical / scale), which desynchronizes
  // the feed from Electron's per-monitor coordinates by exactly the display
  // scale. Opting into per-monitor awareness makes every coordinate physical.
  public static void MakeDpiAware() {
    try { SetProcessDpiAwareness(2); } catch { /* older OS or already set */ }
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  const int SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77, SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;
  static Bitmap bmp;
  static Graphics g;
  static int w, h;
  static ImageCodecInfo jpg;
  static EncoderParameters ep;
  static ImageCodecInfo GetEncoder(ImageFormat fmt) {
    foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders())
      if (c.FormatID == fmt.Guid) return c;
    return null;
  }
  public static void Init(int iw, int ih, int quality) {
    w = iw; h = ih;
    bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    g = Graphics.FromImage(bmp);
    jpg = GetEncoder(ImageFormat.Jpeg);
    ep = new EncoderParameters(1);
    ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
  }
  public static string Grab() {
    POINT p;
    GetCursorPos(out p);
    int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN), vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    int x0 = Math.Max(vx, Math.Min(p.X - w / 2, vx + vw - w));
    int y0 = Math.Max(vy, Math.Min(p.Y - h / 2, vy + vh - h));
    g.CopyFromScreen(x0, y0, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
    using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
      bmp.Save(ms, jpg, ep);
      return p.X + "," + p.Y + "," + x0 + "," + y0 + "," + Convert.ToBase64String(ms.ToArray());
    }
  }
}
"@
[GdiRegion]::MakeDpiAware()
[GdiRegion]::Init($W, $H, $Q)
$sleep = [Math]::Max(1, [int](1000 / $Fps))
while ($true) {
  try {
    [Console]::WriteLine([GdiRegion]::Grab())
    [Console]::Out.Flush()
  } catch {
    [Console]::Error.WriteLine("gdi-region: " + $_.Exception.Message)
  }
  Start-Sleep -Milliseconds $sleep
}
