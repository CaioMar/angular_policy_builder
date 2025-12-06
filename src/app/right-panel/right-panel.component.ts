import { Component, EventEmitter, Input, Output } from '@angular/core';

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

  // helpers to forward model-change events from template
  modelChangeUpdatedEdge() { this.updateSelectedEdge.emit(); }
}
