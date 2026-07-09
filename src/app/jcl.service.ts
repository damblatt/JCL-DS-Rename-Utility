import { Injectable } from '@angular/core';

/** Settings for the rename operation. */
export interface RenameOptions {
  /** The qualifier to replace. */
  search: string;
  /** The new qualifier. */
  replace: string;
}

/** Name of the EXEC step in the generated JCL. */
const STEP_NAME = 'RENAME';

/** Result of renaming a single data set. */
export interface RenameResult {
  /** Original data set name (trimmed, uppercased). */
  oldName: string;
  /** New data set name after the replacement. */
  newName: string;
  /** true if the name changed as a result of the replacement. */
  changed: boolean;
}

/** Maximum length of a qualified data set name on z/OS. */
const MAX_DSN_LENGTH = 44;
/** IDCAMS control statements end at column 72 at the latest. */
const MAX_CONTROL_COL = 72;

@Injectable({ providedIn: 'root' })
export class JclService {
  /**
   * Splits the entered text into a list of data set names.
   * Empty lines are ignored, whitespace is trimmed, and everything is uppercased.
   */
  parseDatasets(raw: string): string[] {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim().toUpperCase())
      .filter((line) => line.length > 0);
  }

  /**
   * Replaces whole qualifiers (name parts between the dots) in a data set name
   * that exactly match the search term.
   */
  applyRename(dsn: string, options: RenameOptions): RenameResult {
    const oldName = dsn.trim().toUpperCase();
    const search = options.search.toUpperCase();
    const replace = options.replace.toUpperCase();

    let newName = oldName;

    if (search.length > 0) {
      newName = oldName
        .split('.')
        .map((qualifier) => (qualifier === search ? replace : qualifier))
        .join('.');
    }

    return { oldName, newName, changed: newName !== oldName };
  }

  /**
   * Applies the rename to a list of data set names.
   */
  applyRenameAll(datasets: string[], options: RenameOptions): RenameResult[] {
    return datasets.map((dsn) => this.applyRename(dsn, options));
  }

  /**
   * Roughly validates a data set name against z/OS naming rules.
   * Returns an error message, or null if the name is valid.
   */
  validateDsn(dsn: string): string | null {
    if (dsn.length === 0) {
      return 'Empty name';
    }
    if (dsn.length > MAX_DSN_LENGTH) {
      return `Name longer than ${MAX_DSN_LENGTH} characters`;
    }
    const qualifiers = dsn.split('.');
    for (const qualifier of qualifiers) {
      if (qualifier.length === 0) {
        return 'Empty qualifier (double dot or dot at the edge)';
      }
      if (qualifier.length > 8) {
        return `Qualifier "${qualifier}" longer than 8 characters`;
      }
      if (!/^[A-Z#@$][A-Z0-9#@$-]*$/.test(qualifier)) {
        return `Invalid characters in qualifier "${qualifier}"`;
      }
    }
    return null;
  }

  /**
   * Generates the IDCAMS JCL (without a job card) from the rename results.
   * Produces an EXEC step with SYSPRINT and SYSIN DD statements containing
   * an ALTER ... NEWNAME(...) for each changed data set.
   */
  generateJcl(results: RenameResult[]): string {
    const changed = results.filter((r) => r.changed);

    const lines: string[] = [];
    lines.push(`//${STEP_NAME.padEnd(6)} EXEC PGM=IDCAMS`);
    lines.push('//SYSPRINT DD SYSOUT=*');
    lines.push('//SYSIN    DD *');

    if (changed.length === 0) {
      lines.push('/* No data sets to rename */');
    } else {
      for (const result of changed) {
        lines.push(...this.buildAlter(result));
      }
    }

    lines.push('/*');
    return lines.join('\n');
  }

  /**
   * Builds the (possibly multi-line) IDCAMS ALTER control statements for a rename.
   * Control statements start at column 2 and continue with "-" if needed.
   */
  private buildAlter(result: RenameResult): string[] {
    const first = `  ALTER ${result.oldName} -`;
    const second = `        NEWNAME(${result.newName})`;

    // If a line extends past column 72, IDCAMS would truncate it.
    // In practice, 44-character DSNs fit here; we check anyway.
    const safeFirst = first.length > MAX_CONTROL_COL ? `  ALTER -\n        ${result.oldName} -` : first;
    return [safeFirst, second];
  }

  /**
   * Renders the generated JCL as syntax-highlighted HTML.
   */
  highlightJcl(jcl: string): string {
    return jcl
      .split('\n')
      .map((line) => this.highlightLine(line))
      .join('\n');
  }

  private highlightLine(line: string): string {
    if (line.length === 0) {
      return '';
    }

    // Comment / terminator lines, e.g. "/*" or "/* No data sets to rename */".
    if (line.startsWith('/*')) {
      return `<span class="jcl-comment">${escapeHtml(line)}</span>`;
    }

    // JCL statement lines, e.g. "//RENAME EXEC PGM=IDCAMS" or "//SYSPRINT DD SYSOUT=*".
    const stmt = line.match(/^(\/\/)(\S+)?(\s+)(EXEC|DD)(\s+)(.*)$/);
    if (stmt) {
      const [, slashes, name, ws1, verb, ws2, rest] = stmt;
      const nameHtml = name ? `<span class="jcl-name">${escapeHtml(name)}</span>` : '';
      return `<span class="jcl-slashes">${slashes}</span>${nameHtml}${ws1}<span class="jcl-keyword">${verb}</span>${ws2}${this.highlightParams(rest)}`;
    }

    // IDCAMS control statements: ALTER / NEWNAME(...) / continuation lines.
    const [, indent, rawBody] = line.match(/^(\s*)(.*)$/)!;
    let body = rawBody;
    let contWs = '';
    let cont = '';
    if (body.endsWith('-')) {
      cont = '-';
      body = body.slice(0, -1);
      contWs = body.match(/\s*$/)![0];
      body = body.slice(0, body.length - contWs.length);
    }

    const alter = body.match(/^(ALTER)(\s+)(.*)$/);
    const newname = body.match(/^(NEWNAME)(\()(.*)(\))$/);
    let bodyHtml: string;
    if (alter) {
      const [, kw, ws, dsn] = alter;
      bodyHtml = `<span class="jcl-keyword">${kw}</span>${ws}<span class="jcl-dsn">${escapeHtml(dsn)}</span>`;
    } else if (newname) {
      const [, kw, lp, dsn, rp] = newname;
      bodyHtml = `<span class="jcl-keyword">${kw}</span>${lp}<span class="jcl-dsn">${escapeHtml(dsn)}</span>${rp}`;
    } else if (/^[A-Z0-9.#@$-]+$/.test(body)) {
      bodyHtml = `<span class="jcl-dsn">${escapeHtml(body)}</span>`;
    } else {
      bodyHtml = escapeHtml(body);
    }

    return `${indent}${bodyHtml}${contWs}${cont ? `<span class="jcl-cont">${cont}</span>` : ''}`;
  }

  /** Highlights "KEY=VALUE" parameters, e.g. "PGM=IDCAMS" or "SYSOUT=*". */
  private highlightParams(rest: string): string {
    return escapeHtml(rest).replace(
      /([A-Z]+)=(\S+)/g,
      (_m, key: string, value: string) => `<span class="jcl-param">${key}</span>=<span class="jcl-value">${value}</span>`,
    );
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
