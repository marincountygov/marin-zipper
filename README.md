# Marin Zipper

Browser-only MarinOS app for creating password-protected AES-encrypted ZIP files with the official vendored zip.js native browser build.

## Files

- `index.html` - MarinOS shell, form, drag-and-drop area, About tab, and Updates tab.
- `assets/app.css` - App-specific styles.
- `assets/app.js` - File selection, full-page drag-and-drop, query-driven ZIP filename fields, password handling, ZIP creation, progress, cancellation, automatic download, and fallback download logic.
- `assets/vendor/zip.js/zip-native.min.js` - Official vendored zip.js native browser build.
- `vendor/pico.min.css` - Local Pico CSS copy supplied through MarinOS UI assets.
- `shared/app-brand.css` - Local MarinOS brand CSS. It uses Jost for headings/display text and Open Sans for body/user-interface text.
- `shared/app-shell.js` - Local MarinOS app shell behavior. This app-specific copy does not fetch the MarinOS catalog or GitHub updates automatically.
- `vendor/fonts/open-sans/OFL.txt` - Open Sans license file.

## Local-first runtime assets

Marin Zipper serves required runtime CSS, JavaScript, and font references from local first-party paths. Do not add Google Fonts, Adobe Fonts, jsDelivr, unpkg, cdnjs, or other runtime CDN/static asset references.

Required local font files:

```text
vendor/fonts/Jost-wght.ttf
vendor/fonts/open-sans/OpenSans-VariableFont_wdth,wght.woff2
vendor/fonts/open-sans/OFL.txt
```

The Open Sans WOFF2 file and Jost TTF file must be present before publishing. They may be omitted from AI-generated transfer zips and then copied back into the paths above.

## Notes

- Files selected for ZIP creation are processed locally in the browser and are not uploaded by this page.
- `assets/vendor/zip.js/zip-native.min.js` is local to this bundle. No zip.js CDN dependency is required.
- The Updates page links to GitHub release history instead of fetching commit data automatically.

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
