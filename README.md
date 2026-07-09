# JCL DS Rename Utility

A small web app for generating IDCAMS JCL to bulk-rename z/OS data sets.

## What it does

You enter a list of data set names (one per line) along with a search and replace pattern for a qualifier (e.g. `PROD` → `TEST`). The tool:

- replaces exactly matching qualifiers (name parts between the dots) in each data set name,
- validates the new names against z/OS naming rules (max. 44 characters total, max. 8 characters per qualifier, valid characters, no empty qualifiers),
- shows a preview of all changes, including any validation errors,
- generates ready-to-use IDCAMS JCL (`ALTER ... NEWNAME(...)`), which can be copied or downloaded as a `.jcl` file.

The generated JCL does not include a job card; you'll need to add one before running it.

## Technology

The project is built with [Angular](https://angular.dev) (CLI version 22.0.5) using signals and standalone components. The rename and JCL generation logic lives in `src/app/jcl.service.ts`, the UI in `src/app/app.ts` / `src/app/app.html`.

## Development

```bash
ng serve      # dev server at http://localhost:4200/ (live reload)
ng build      # production build to dist/
ng test       # unit tests with Vitest
```
