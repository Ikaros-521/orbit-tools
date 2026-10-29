Set sh = CreateObject("WScript.Shell")
' Give the user a moment to release the summon hotkey: a still-held Ctrl/Shift
' would turn this injected Ctrl+C into Ctrl+Shift+C, which many apps interpret
' as a different shortcut instead of copying the selection.
WScript.Sleep 100
sh.SendKeys "^c"
