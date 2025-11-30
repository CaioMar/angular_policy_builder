import { Component, ViewChild, ElementRef } from '@angular/core';
import { GraphEditorComponent } from './graph-editor/graph-editor.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  @ViewChild('editor') editor!: GraphEditorComponent;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  fileMenuOpen = false;

  newPolicy(): void {
    try {
      if (!this.editor) return;
      this.editor.nodes = [];
      this.editor.edges = [];
      this.editor.reloadGraph();
    } catch (e) { alert('Unable to clear policy'); }
  }

  save(): void {
    try { if (!this.editor) return; this.editor.requestExportJSON(); } catch (e) { alert('Save failed'); }
  }

  downloadDot(): void {
    try { if (!this.editor) return; this.editor.requestExportDOT(); } catch (e) { alert('Download DOT failed'); }
  }

  downloadJson(): void {
    try { if (!this.editor) return; this.editor.requestExportJSON(); } catch (e) { alert('Download JSON failed'); }
  }

  triggerImport(): void {
    try { if (!this.fileInput) return; this.fileInput.nativeElement.value = ''; this.fileInput.nativeElement.click(); } catch (e) { alert('Import failed'); }
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement | null;
    if (!input || !input.files || !input.files.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      if (file.name.toLowerCase().endsWith('.json')) {
        try { this.editor.importJSON(txt); } catch (e) { alert('Invalid JSON import'); }
      } else if (file.name.toLowerCase().endsWith('.dot')) {
        alert('DOT import is not implemented yet.');
      } else {
        alert('Unsupported file type.');
      }
    };
    reader.readAsText(file);
  }
}
