Option Explicit

If WScript.Arguments.Count <> 1 Then
  WScript.Echo "Usage: cscript //nologo illustrator-native-runner.vbs <jsx-path>"
  WScript.Quit 2
End If

Dim jsxPath, stream, source, illustrator
jsxPath = WScript.Arguments(0)

Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.LoadFromFile jsxPath
source = stream.ReadText
stream.Close

' #target is useful when the JSX is launched directly, but DoJavaScript already
' targets the connected Illustrator.Application COM object.
source = Replace(source, "#target illustrator", "")

Set illustrator = CreateObject("Illustrator.Application")
illustrator.DoJavaScript source

WScript.Echo "Illustrator JSX completed: " & jsxPath
