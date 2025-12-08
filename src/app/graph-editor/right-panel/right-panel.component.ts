import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss']
})
export class RightPanelComponent {
  @Input() rightPaneWidth: number = 360;
  @Input() selectedNode: any = null;
  @Input() selectedEdge: any = null;
  @Input() edgeDraft: any = null;
  @Input() edgeDraftParseError: string | null = null;
  @Input() conflictModalVisible: boolean = false;
  @Input() conflictingEdges: any[] = [];
  @Input() exportInvalidModalVisible: boolean = false;
  @Input() exportInvalidNodes: string[] = [];
  @Input() exportMultipleRootsModalVisible: boolean = false;
  @Input() exportDOTRoots: string[] = [];

  @Output() addNode = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();
  @Output() replaceConflictsAndConfirm = new EventEmitter<void>();
  @Output() cancelConflictModal = new EventEmitter<void>();
  @Output() updateSelectedEdge = new EventEmitter<void>();
  @Output() cancelEdgeEdit = new EventEmitter<void>();
  @Output() updateSelectedNode = new EventEmitter<void>();
  @Output() confirmEdgeDraft = new EventEmitter<void>();
  @Output() cancelEdgeDraft = new EventEmitter<void>();
  @Output() onValueInputChange = new EventEmitter<any>();
  @Output() varDrag = new EventEmitter<{ event: DragEvent; varName: string }>();
  @Output() resizerMouseDown = new EventEmitter<MouseEvent>();
  @Output() focusFirstInvalid = new EventEmitter<void>();
  @Output() closeExportInvalidModal = new EventEmitter<void>();
  @Output() focusFirstRoot = new EventEmitter<void>();
  @Output() closeExportMultipleRootsModal = new EventEmitter<void>();

  onResizerMouseDown(ev: MouseEvent) {
    ev.preventDefault();
    this.resizerMouseDown.emit(ev);
  }
}
