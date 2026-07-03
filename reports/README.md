# Reports

Auditor-facing reports for the project.

## `accessibility-audit-response.{html,pdf}`

Response to the MODULUS website accessibility audit (report 02) — the status and
resolution of all 33 findings. The companion working tracker is
[`docs/ACCESSIBILITY-AUDIT.md`](../docs/ACCESSIBILITY-AUDIT.md).

- **`accessibility-audit-response.html`** is the source of truth. It is
  self-contained (inline CSS, no external assets) and theme-aware (light/dark).
- **`accessibility-audit-response.pdf`** is generated from the HTML — **do not
  edit it by hand**. Regenerate it after any change to the HTML.

Hosted (private) version: <https://claude.ai/code/artifact/fa8a4333-40be-4363-a705-48559fd74e77>

### Regenerating the PDF

The HTML has an `@media print` block that forces the light theme and preserves
background colours, so the PDF is produced by printing the file with headless
Chrome. From the repo root:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/reports/accessibility-audit-response.pdf" \
  "file://$PWD/reports/accessibility-audit-response.html"
```

Notes:
- The `file://` URL must be absolute (hence `$PWD`).
- `--no-pdf-header-footer` drops Chrome's date/URL page chrome (Chrome ≥ 118).
- Any Chromium-based browser works; adjust the binary path accordingly.
