# Native Illustrator workflow

This isolated test repo prepares three canonical A1 scenes and hands those exact coordinates to Adobe Illustrator 2025 through ExtendScript/JSX.

1. Run `npm run illustrator:prepare`.
2. Run `cscript //nologo illustrator-native-runner.vbs illustrator-native/XIECHENG_A1_NATIVE_ROUNDTRIP.jsx` on Windows, or run the JSX through Illustrator **File → Scripts → Other Script**.
3. The JSX creates native editable paths and point text, saves `.ai`, closes it, reopens it, and writes `illustrator-native/roundtrip-report.json`.
4. Run `npm run illustrator:validate` to compare every path anchor and artboard against the canonical scenes at a tolerance of 0.01 mm. The same step verifies the scene-derived SVG and vector PDF artifacts.

The workflow is local-only. It does not use Adobe Cloud, Creative Cloud Libraries, ERP, Supabase, or the production Xiecheng website. A static GitHub Pages page cannot invoke a local Illustrator installation, so the website AI button remains disabled.
