import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss']
})
export class RightPanelComponent {
  @Input() selectedNode: any = null;
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

  // internal temp field to hold variable input before commit
  pendingVariable = '';

  // helpers to forward model-change events from template
  modelChangeUpdatedEdge() { this.updateSelectedEdge.emit(); }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedNode']) {
      this.pendingVariable = (this.selectedNode && (this.selectedNode.variable || this.selectedNode.label)) || '';
    }
  }

  onVariableInputChange(v: string) {
    this.pendingVariable = v;
    this.onValueInputChange.emit(v);
  }

  commitVariable() { this.updateSelectedNodeVariable.emit((this.pendingVariable || '').trim()); }

  commitLabel(v: string) { this.updateSelectedNodeLabel.emit((v || '').trim()); }
}
