import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JclService, RenameResult } from './jcl.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Inputs (bound to the template).
  readonly datasetsRaw = signal(
    'PROD.PAYROLL.CNTL\nPROD.PAYROLL.LOAD\nPROD.PAYROLL.JCLLIB',
  );
  readonly search = signal('PROD');
  readonly replace = signal('TEST');
  readonly copied = signal(false);

  constructor(private readonly jcl: JclService) {}

  /** All parsed and renamed data sets, including validation errors. */
  readonly results = computed<Array<RenameResult & { error: string | null }>>(() => {
    const datasets = this.jcl.parseDatasets(this.datasetsRaw());
    const options = {
      search: this.search(),
      replace: this.replace(),
    };
    return this.jcl.applyRenameAll(datasets, options).map((r) => ({
      ...r,
      error: r.changed ? this.jcl.validateDsn(r.newName) : null,
    }));
  });

  /** Number of data sets that will actually be renamed. */
  readonly changedCount = computed(() => this.results().filter((r) => r.changed).length);

  /** Are there validation errors in the new names? */
  readonly hasErrors = computed(() => this.results().some((r) => r.error !== null));

  /** The generated IDCAMS JCL. */
  readonly jclOutput = computed(() => this.jcl.generateJcl(this.results()));

  /** Copies the generated JCL to the clipboard. */
  async copyJcl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.jclOutput());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard unavailable – fail silently.
    }
  }

  /** Downloads the generated JCL as a .jcl file. */
  downloadJcl(): void {
    const blob = new Blob([this.jclOutput()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'RENAME.jcl';
    link.click();
    URL.revokeObjectURL(url);
  }
}
