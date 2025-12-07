import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss']
})
export class RightPanelComponent {
  @Input() selectedNode: any = null;
  @Input() availableVariables: string[] = [];
  @Input() selectedEdge: any = null;
  @Input() edgeDraft: any = null;
  @Input() conflictingEdges: any[] = [];
  @Input() exportInvalidNodes: string[] = [];
  @Input() exportDOTRoots: string[] = [];
  @Input() canvasSettingsVisible = false;
  @Input() bgPattern: string | null = null;
  @Input() bgColor: string | null = null;
  @Input() zoomLevel: number | null = null;

  @Output() addNode = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();
  @Output() updateSelectedEdge = new EventEmitter<void>();
  @Output() cancelEdgeEdit = new EventEmitter<void>();
  @Output() confirmEdgeDraft = new EventEmitter<void>();
  @Output() cancelEdgeDraft = new EventEmitter<void>();
  @Output() replaceConflictsAndConfirm = new EventEmitter<void>();
  @Output() cancelConflictModal = new EventEmitter<void>();
  @Output() requestExportJSON = new EventEmitter<void>();
  @Output() requestExportDOT = new EventEmitter<void>();
  @Output() focusFirstInvalid = new EventEmitter<void>();
  @Output() closeExportInvalidModal = new EventEmitter<void>();
  @Output() focusFirstRoot = new EventEmitter<void>();
  @Output() closeExportMultipleRootsModal = new EventEmitter<void>();
  @Output() toggleCanvasSettings = new EventEmitter<MouseEvent>();
  @Output() setZoomLevel = new EventEmitter<number>();
  @Output() applyBackground = new EventEmitter<void>();
  @Output() onValueInputChange = new EventEmitter<string>();
  @Output() onVarDrag = new EventEmitter<any>();
  // emit when the user commits a variable name for the selected node
  @Output() updateSelectedNodeVariable = new EventEmitter<string>();
  // emit when the user commits a label change for the selected node
  @Output() updateSelectedNodeLabel = new EventEmitter<string>();
  @Output() deselectNode = new EventEmitter<void>();

  // internal temp field to hold variable input before commit
  pendingVariable = '';
  pendingVariableFocus = false;
  private origVariable: string | null = null;
  private pendingCommitted = false;
  private pendingCleared = false;

  // helpers to forward model-change events from template
  modelChangeUpdatedEdge() { this.updateSelectedEdge.emit(); }

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedNode']) {
      try { if (console && console.debug) console.debug('[RightPanel] selectedNode change', this.selectedNode); } catch (e) { /* ignore */ }
      this.pendingVariable = (this.selectedNode && (this.selectedNode.variable || this.selectedNode.label)) || '';
      this.origVariable = this.pendingVariable || null;
      this.pendingCommitted = false;
      this.pendingCleared = false;
      try { this.cdr.detectChanges(); } catch (e) { /* ignore */ }
    }
  }

  onVariableInputChange(v: string) {
    this.pendingVariable = v;
    this.onValueInputChange.emit(v);
  }

  commitVariable() {
    const val = (this.pendingVariable || '').trim();
    this.pendingCommitted = true;
    this.origVariable = val || this.origVariable;
    this.updateSelectedNodeVariable.emit(val);
  }

  commitLabel(v: string) { this.updateSelectedNodeLabel.emit((v || '').trim()); }

  // suggestions filtered from availableVariables based on pendingVariable
  get filteredVariables(): string[] {
    const q = (this.pendingVariable || '').trim().toLowerCase();
    if (!q) return (this.availableVariables || []).slice(0, 20);
    return (this.availableVariables || []).filter(v => v.toLowerCase().includes(q)).slice(0, 20);
  }

  selectSuggestion(v: string) {
    this.pendingVariable = v;
    this.commitVariable();
  }

  showVariableSuggestions(): boolean {
    // show suggestions only when the variable input is focused
    return !!this.pendingVariableFocus;
  }

  onVariableFocus() {
    this.pendingVariableFocus = true;
    if (!this.pendingCleared && this.origVariable) {
      this.pendingVariable = '';
      this.pendingCleared = true;
      this.pendingCommitted = false;
    }
  }

  onVariableBlur() {
    this.pendingVariableFocus = false;
    if (!this.pendingCommitted) {
      this.pendingVariable = this.origVariable || '';
      // notify parent to deselect the node since the user didn't commit a change
      // but only if focus moved outside the right panel. This prevents a
      // click into another control inside the right panel (for example the
      // variable input or suggestions) from immediately deselecting the node.
      try {
        const active = document.activeElement as HTMLElement | null;
        const rightPanelEl = (document.querySelector('app-right-panel') as HTMLElement) || (document.querySelector('.right-pane') as HTMLElement) || (document.querySelector('.right-pane-inner') as HTMLElement) || null;
        if (!(active && rightPanelEl && rightPanelEl.contains(active))) {
          try { this.deselectNode.emit(); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }
    this.pendingCommitted = false;
    this.pendingCleared = false;
  }
}
