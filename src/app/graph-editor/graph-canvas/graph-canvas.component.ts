import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { GraphEngineService } from '../engine/graph-engine.service';
import { NodeModel } from '../models/node.model';
import { EdgeModel } from '../models/edge.model';
import { GraphStoreService } from '../services/graph-store.service';

@Component({
  selector: 'app-graph-canvas',
  templateUrl: './graph-canvas.component.html',
  styleUrls: ['./graph-canvas.component.scss']
})
export class GraphCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) cyContainer!: ElementRef<HTMLDivElement>;
  @Output() nodeClicked = new EventEmitter<NodeModel>();
  @Output() nodeDoubleClicked = new EventEmitter<NodeModel>();
  @Output() canvasReady = new EventEmitter<void>();
  @Output() canvasTapped = new EventEmitter<{ x: number; y: number }>();

  @Input() nodes: NodeModel[] = [];
  @Input() edges: EdgeModel[] = [];
  @Input() bgPattern: 'plain' | 'dots' | 'grid' = 'dots';
  @Input() bgColor = '#ffffff';
  @Input() zoomLevel: number = 1.0;
  @Input() zoomSensitivity: number = 0.004;

  private _nodesSub: Subscription | null = null;
  private _edgesSub: Subscription | null = null;
  private _latestNodes: NodeModel[] = [];
  private _latestEdges: EdgeModel[] = [];
  private _wheelHandler: any = null;

  private cy: any;

  constructor(private engine: GraphEngineService, private zone: NgZone, private graphStore: GraphStoreService) {}

  ngOnInit(): void {
    // initialize cytoscape inside Angular zone runOutsideAngular to avoid change detection storms
    this.zone.runOutsideAngular(() => {
      // Initialize engine without passing an empty `style` which would overwrite defaults
      this.cy = this.engine.init(this.cyContainer.nativeElement, { layout: { name: 'preset' } });
      this.engine.on('tap', 'node', (evt: any) => {
        const node = evt.target; const data = node.data() || {};
        // double-click detection using originalEvent.detail (2 for dblclick)
        const orig = evt.originalEvent as MouseEvent | null;
        const isDouble = orig && (orig as any).detail === 2;
        const payload: NodeModel = { id: data.id, label: data.label, type: data.type } as NodeModel;
        this.zone.run(() => {
          if (isDouble) this.nodeDoubleClicked.emit(payload);
          else this.nodeClicked.emit(payload);
        });
      });
        this.engine.on('tap', null, (evt: any) => {
          try {
            // if tap on core/canvas (not on a node/edge), emit canvasTapped with position
            const cyInst = this.engine.getCy();
            if (evt && evt.target && cyInst && evt.target === cyInst) {
              const pos = evt.position || evt.renderedPosition || { x: 0, y: 0 };
              this.zone.run(() => this.canvasTapped.emit({ x: pos.x, y: pos.y }));
            }
          } catch (e) { /* ignore */ }
        });
    });
    this.canvasReady.emit();

    // apply background initially
    setTimeout(() => this.applyBackground(), 0);

    // add wheel handler to support zooming via mouse wheel inside the visible canvas
    try {
      this._wheelHandler = (ev: WheelEvent) => {
        try {
          ev.preventDefault();
          const cyInst = this.engine.getCy();
          if (!cyInst) return;
          const current = (typeof cyInst.zoom === 'function') ? cyInst.zoom() : 1;
          const delta = ev.deltaY || (ev as any).wheelDelta || 0;
          const factor = 1 - (delta * (this.zoomSensitivity || 0.004));
          const next = Math.max(0.2, Math.min(3, current * factor));
          try { cyInst.zoom({ level: next }); } catch (e) { try { cyInst.zoom(next); } catch (ee) { /* ignore */ } }
          // sync local input so slider reflects new zoom
          this.zone.run(() => this.zoomLevel = next);
        } catch (e) { /* ignore */ }
      };
      try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('wheel', this._wheelHandler, { passive: false }); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }

    // subscribe to store and keep canvas in sync (safe incremental migration)
    try {
      this._nodesSub = this.graphStore.nodes$.subscribe(ns => {
        this._latestNodes = ns || [];
        this.syncGraph(this._latestNodes, this._latestEdges);
      });
      this._edgesSub = this.graphStore.edges$.subscribe(es => {
        this._latestEdges = es || [];
        this.syncGraph(this._latestNodes, this._latestEdges);
      });
    } catch (e) { /* ignore */ }
  }

  ngOnDestroy(): void {
    try { if (this._nodesSub) this._nodesSub.unsubscribe(); } catch (e) { /* ignore */ }
    try { if (this._edgesSub) this._edgesSub.unsubscribe(); } catch (e) { /* ignore */ }
    try { if (this._wheelHandler) this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.removeEventListener('wheel', this._wheelHandler); } catch (e) { /* ignore */ }
    this.engine.destroy();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['bgPattern'] || changes['bgColor']) {
      this.applyBackground();
    }
    if (changes['zoomLevel'] && !changes['zoomLevel'].firstChange) {
      try { const cyInst = this.engine.getCy(); if (cyInst && typeof cyInst.zoom === 'function') cyInst.zoom({ level: Number(this.zoomLevel) }); } catch (e) { /* ignore */ }
    }
  }

  private applyBackground(): void {
    try {
      const el = this.cyContainer && this.cyContainer.nativeElement ? this.cyContainer.nativeElement : null;
      if (!el) return;
      el.style.backgroundColor = this.bgColor || '#ffffff';
      if (this.bgPattern === 'plain') {
        el.style.backgroundImage = 'none';
      } else if (this.bgPattern === 'dots') {
        el.style.backgroundImage = 'radial-gradient(' + (this._mixColor('#cfcfcf', this.bgColor) || '#cfcfcf') + ' 1px, transparent 1px)';
        el.style.backgroundSize = '10px 10px';
        el.style.backgroundRepeat = 'repeat';
      } else if (this.bgPattern === 'grid') {
        const line = this._mixColor('#e6e6e6', this.bgColor) || '#e6e6e6';
        el.style.backgroundImage = `linear-gradient(0deg, transparent 23px, ${line} 24px), linear-gradient(90deg, transparent 23px, ${line} 24px)`;
        el.style.backgroundSize = '24px 24px';
        el.style.backgroundRepeat = 'repeat';
      }
    } catch (e) { /* ignore */ }
  }

  // small helper to mix two hex colors (copied from editor)
  private _mixColor(a: string, b: string): string | null {
    try {
      const pa = this._hexToRgb(a);
      const pb = this._hexToRgb(b);
      if (!pa || !pb) return null;
      const r = Math.round((pa.r + pb.r) / 2);
      const g = Math.round((pa.g + pb.g) / 2);
      const bl = Math.round((pa.b + pb.b) / 2);
      return `rgb(${r}, ${g}, ${bl})`;
    } catch (e) { return null; }
  }

  private _hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    try {
      const h = hex.replace('#', '');
      const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return { r, g, b };
    } catch (e) { return null; }
  }

  private syncGraph(nodes: NodeModel[], edges: EdgeModel[]): void {
    const cy = this.engine.getCy();
    if (!cy) return;
    this.zone.runOutsideAngular(() => {
      try {
        // remove all existing elements and re-add current model
        try { cy.elements().remove(); } catch (e) { /* ignore */ }
        // add nodes
        nodes && nodes.forEach(n => {
          try {
            cy.add({ group: 'nodes', data: Object.assign({}, n), position: (n as any).position || undefined });
          } catch (e) { /* ignore */ }
        });
        // add edges
        edges && edges.forEach(ed => {
          try {
            cy.add({ group: 'edges', data: { id: ed.id, source: ed.source, target: ed.target, label: (ed as any).label } });
          } catch (e) { /* ignore */ }
        });
        // re-run preset layout if positions exist
        try { if (typeof cy.layout === 'function') cy.layout({ name: 'preset' }).run(); } catch (e) { /* ignore */ }
        try { if (typeof cy.resize === 'function') cy.resize(); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    });
  }
}
