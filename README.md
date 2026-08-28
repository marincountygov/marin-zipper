# Marin Zipper

Browser-only MarinOS-style prototype for creating password-protected AES-encrypted ZIP files with the official vendored zip.js native browser build.

## Files

- `index.html` - MarinOS shell, form, drag-and-drop area, About tab, and Updates tab.
- `assets/app.css` - App-specific styles.
- `assets/app.js` - File selection, full-page drag-and-drop, query-driven ZIP filename fields, password handling, ZIP creation, progress, cancellation, automatic download, and fallback download logic.
- `assets/vendor/zip.js/zip-native.min.js` - Official vendored zip.js native browser build.

## Notes

- The app currently loads MarinOS brand assets from `https://marincountygov.github.io/marin-os/` so the bundle runs as-is.
- `assets/vendor/zip.js/zip-native.min.js` is local to this bundle. No zip.js CDN dependency is required.
- Change `data-updates-repo="marin-os"` in the Updates section to this app's repository slug after it is added to MarinOS.

## Query-driven file naming

When the page URL includes supported filename parameters, Marin Zipper reveals matching filename fields and generates the ZIP name from populated values in this order:

```text
currentdate_county_lastname_dob.zip
```

Example:

```text
index.html?currentdate&county=Marin&lastname=Garcia&dob=1980-01-01
```

If today's date were 2026-08-28, that example creates a generated ZIP filename like:

```text
2026-08-28_Marin_Garcia_1980-01-01.zip
```

Behavior:

- `currentdate` is presence-based and prepopulates the current browser date as `yyyy-mm-dd`.
- `county`, `lastname`, and `dob` are value-based and prepopulate only when values are supplied.
- Empty filename fields are skipped.
- Filename values are sanitized for Windows/macOS-safe filenames before the ZIP is downloaded.

Do not include sensitive information in file names unless the naming format has been approved for the workflow.

## Encrypted ZIP compatibility

Marin Zipper creates AES-encrypted ZIP files. Windows File Explorer cannot reliably extract encrypted archives. Use 7-Zip, WinRAR, WinZip, PeaZip, or another AES ZIP-compatible extractor.
