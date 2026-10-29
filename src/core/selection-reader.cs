using System;
using System.Text;
using System.Windows.Automation;
using System.Windows.Automation.Text;

/* Reads the focused element's text selection through UI Automation and prints
   it as base64 (UTF-8) on stdout.
   Exit codes: 0 = selection printed, 3 = control supports text but nothing is
   selected (caller can skip the clipboard fallback), 2 = no TextPattern /
   failure (caller should fall back to the clipboard method). */
class OrbitSelectionReader {
    static int Main() {
        try {
            AutomationElement el = AutomationElement.FocusedElement;
            if (el == null) return 2;
            object pattern;
            if (!el.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return 2;
            TextPattern tp = (TextPattern)pattern;
            TextPatternRange[] ranges = tp.GetSelection();
            if (ranges == null || ranges.Length == 0) return 3;
            string text = ranges[0].GetText(-1);
            if (string.IsNullOrEmpty(text) || text.Trim().Length == 0) return 3;
            Console.OutputEncoding = Encoding.UTF8;
            Console.Write(Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
            return 0;
        } catch {
            return 2;
        }
    }
}
