param([int]$Size = 19, [int]$Fps = 30)
# color-lab live sampler (Windows): GDI BitBlt around the OS cursor.
# DXGI desktop duplication (the getUserMedia screen path) stalls after a few
# frames on still desktops / RDP sessions; GDI keeps delivering exact pixels.
# Output per frame: cursorX,cursorY,originX,originY,base64(BGRA size*size)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class GdiCap {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int nIndex);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  const int SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77, SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;
  static Bitmap bmp;
  static Graphics g;
  static int size;
  public static void Init(int s) {
    size = s;
    bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb);
    g = Graphics.FromImage(bmp);
  }
  public static string Grab() {
    POINT p;
    GetCursorPos(out p);
    int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN), vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    int x0 = Math.Max(vx, Math.Min(p.X - size / 2, vx + vw - size));
    int y0 = Math.Max(vy, Math.Min(p.Y - size / 2, vy + vh - size));
    g.CopyFromScreen(x0, y0, 0, 0, new Size(size, size), CopyPixelOperation.SourceCopy);
    var rect = new Rectangle(0, 0, size, size);
    var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    var bytes = new byte[size * size * 4];
    Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
    bmp.UnlockBits(data);
    return p.X + "," + p.Y + "," + x0 + "," + y0 + "," + Convert.ToBase64String(bytes);
  }
}
"@
[GdiCap]::Init($Size)
$sleep = [Math]::Max(1, [int](1000 / $Fps))
while ($true) {
  try {
    [Console]::WriteLine([GdiCap]::Grab())
    [Console]::Out.Flush()
  } catch {
    [Console]::Error.WriteLine("gdi-cap: " + $_.Exception.Message)
  }
  Start-Sleep -Milliseconds $sleep
}
