import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-metadata-panel',
  templateUrl: './metadata-panel.component.html',
  styleUrls: ['./metadata-panel.component.scss']
})
export class MetadataPanelComponent {
  @Input() selectedNode: any = null;
  @Input() selectedEdge: any = null;
  @Input() lastSelectionSnapshot: any = null;
  @Input() metadataHeight = 160;

  @Output() startMetaResizerDrag = new EventEmitter<MouseEvent>();
}
