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
  @Output() debugMsg = new EventEmitter<string>();
  @Output() canvasReady = new EventEmitter<void>();
  @Output() canvasTapped = new EventEmitter<any>();

  @Input() nodes: NodeModel[] = [];
  @Input() edges: EdgeModel[] = [];
  @Input() selectedNodeId: string | null = null;
  @Input() bgPattern: 'plain' | 'dots' | 'grid' = 'dots';
  @Input() bgColor = '#ffffff';
  @Input() zoomLevel: number = 1.0;
  @Input() zoomSensitivity: number = 0.001;
  private _isRightPanning = false;
  private _panLast = { x: 0, y: 0 };
  private _panMoveHandler: any = null;
  private _panUpHandler: any = null;

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
        const payload: NodeModel = { id: data.id, label: data.label, type: data.type, variable: data.variable } as NodeModel;
        // immediate visual feedback: select the node in the engine cy
        try { if (node && node.select) node.select(); } catch (e) { /* ignore */ }
        try { if (console && console.debug) console.debug('[GraphCanvas] tapped node', payload && payload.id); } catch (e) { /* ignore */ }
        try { this.debugMsg.emit(`[GraphCanvas] tapped node ${payload && payload.id}`); } catch (e) { /* ignore */ }
        // double-click detection using originalEvent.detail (2 for dblclick)
        const orig = evt.originalEvent as MouseEvent | null;
        const isDouble = orig && (orig as any).detail === 2;
        this.zone.run(() => {
          try { this.debugMsg.emit(`[GraphCanvas] selectNode ${payload && payload.id}`); } catch (e) { /* ignore */ }
          try { this.graphStore.selectNode(payload && payload.id ? payload.id : null); } catch (e) { /* ignore */ }
          if (isDouble) this.nodeDoubleClicked.emit(payload);
          else this.nodeClicked.emit(payload);
        });
      });
        this.engine.on('tap', null, (evt: any) => {
          try {
            // if tap on core/canvas (not on a node/edge), emit canvasTapped with both rendered and model positions
            const cyInst = this.engine.getCy();
            if (evt && evt.target && cyInst && evt.target === cyInst) {
              const rendered = evt.renderedPosition || { x: 0, y: 0 };
              // prefer evt.position (model coords) if present; otherwise compute from rendered using pan/zoom
              let model = evt.position;
              try {
                if (!model) {
                  const pan = (cyInst && typeof cyInst.pan === 'function') ? cyInst.pan() : { x: 0, y: 0 };
                  const zoom = (cyInst && typeof cyInst.zoom === 'function') ? cyInst.zoom() : 1;
                  model = { x: (rendered.x - pan.x) / zoom, y: (rendered.y - pan.y) / zoom };
                }
              } catch (e) { model = { x: rendered.x, y: rendered.y }; }
              this.zone.run(() => this.canvasTapped.emit({ rendered: rendered, model: model }));
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
          // use slider-like incremental zoom steps so wheel feels like the gear slider
          const deltaNorm = (delta || 0) / 100; // normalize typical wheel delta
          const step = 0.05; // each wheel notch moves ~5%
          const next = Math.max(0.2, Math.min(3, Number(this.zoomLevel) - deltaNorm * step));
          try { cyInst.zoom({ level: next, position: { x: (ev as any).offsetX || 0, y: (ev as any).offsetY || 0 } }); } catch (e) { try { cyInst.zoom(next); } catch (ee) { /* ignore */ } }
          // sync local input so slider reflects new zoom
          this.zone.run(() => this.zoomLevel = next);
        } catch (e) { /* ignore */ }
      };
      try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('wheel', this._wheelHandler, { passive: false }); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }

    // apply initial zoom level
    try { const cyInst = this.engine.getCy(); if (cyInst && typeof cyInst.zoom === 'function') { try { cyInst.zoom({ level: Number(this.zoomLevel) }); } catch (e) { try { cyInst.zoom(this.zoomLevel); } catch (ee) { /* ignore */ } } } } catch (e) { /* ignore */ }

    // right-button panning: attach mousedown on container
    try {
      const downHandler = (ev: MouseEvent) => {
        if (ev.button !== 2) return;
        ev.preventDefault();
        this._isRightPanning = true;
        this._panLast = { x: ev.clientX, y: ev.clientY };
        this._panMoveHandler = (m: MouseEvent) => {
          try {
            if (!this._isRightPanning) return;
            const dx = m.clientX - this._panLast.x;
            const dy = m.clientY - this._panLast.y;
            this._panLast = { x: m.clientX, y: m.clientY };
            const cyInst = this.engine.getCy();
            if (cyInst && typeof cyInst.panBy === 'function') {
              try { cyInst.panBy({ x: dx, y: dy }); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
        };
        this._panUpHandler = (u: MouseEvent) => { try { this._isRightPanning = false; window.removeEventListener('mousemove', this._panMoveHandler); window.removeEventListener('mouseup', this._panUpHandler); } catch (e) { /* ignore */ } };
        window.addEventListener('mousemove', this._panMoveHandler);
        window.addEventListener('mouseup', this._panUpHandler);
      };
      try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('mousedown', downHandler); } catch (e) { /* ignore */ }
      try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('contextmenu', (e:any) => e.preventDefault()); } catch (e) { /* ignore */ }
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
    try {
      const cy = this.engine.getCy();
      if (!cy) return;

      // preserve viewport
      let prevPan: any = null;
      let prevZoom: number | null = null;
      try { prevPan = (typeof cy.pan === 'function') ? cy.pan() : null; } catch (e) { prevPan = null; }
      try { prevZoom = (typeof cy.zoom === 'function') ? cy.zoom() : null; } catch (e) { prevZoom = null; }

      const incomingNodeIds = new Set(nodes.map(n => n.id));
      const incomingEdgeIds = new Set(edges.map(e => e.id));

      // remove nodes that are no longer present
      try {
        cy.nodes().forEach((n: any) => {
          if (!incomingNodeIds.has(n.id())) n.remove();
        });
      } catch (e) { /* ignore */ }

      // add or update nodes
      nodes.forEach(n => {
        try {
          const el = cy.getElementById(n.id);
          if (el && el.length) {
            el.data('label', n.label);
            el.data('variable', n.variable);
            if (n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number') el.position({ x: n.position.x, y: n.position.y });
          } else {
            cy.add({ group: 'nodes', data: { id: n.id, label: n.label, variable: n.variable }, position: { x: (n.position && typeof n.position.x === 'number') ? n.position.x : 0, y: (n.position && typeof n.position.y === 'number') ? n.position.y : 0 } });
          }
        } catch (e) { /* ignore */ }
      });

      // remove edges not present
      try {
        cy.edges().forEach((e: any) => {
          if (!incomingEdgeIds.has(e.id())) e.remove();
        });
      } catch (e) { /* ignore */ }

      // add or update edges
      edges.forEach(ed => {
        try {
          const el = cy.getElementById(ed.id);
          if (el && el.length) {
            el.data('source', ed.source);
            el.data('target', ed.target);
          } else {
            cy.add({ group: 'edges', data: { id: ed.id, source: ed.source, target: ed.target, label: (ed as any).label } });
          }
        } catch (e) { /* ignore */ }
      });

      // run preset layout (positions preserved) and resize
      try { if (typeof cy.layout === 'function') cy.layout({ name: 'preset' }).run(); } catch (e) { /* ignore */ }
      try { if (typeof cy.resize === 'function') cy.resize(); } catch (e) { /* ignore */ }

      // reapply selection from model
      try {
        if (this.selectedNodeId) {
          const sel = cy.getElementById(this.selectedNodeId);
          if (sel && sel.length) {
            try { if (sel.select) sel.select(); } catch (e) { /* ignore */ }
            try { if (sel.addClass) sel.addClass('selected'); } catch (e) { /* ignore */ }
          }
        } else {
          try { cy.elements().unselect(); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      // restore viewport
      try { if (prevPan && typeof cy.pan === 'function') cy.pan(prevPan); } catch (e) { /* ignore */ }
      try { if (prevZoom != null && typeof cy.zoom === 'function') cy.zoom(prevZoom); else if (typeof cy.zoom === 'function') cy.zoom(Number(this.zoomLevel)); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }
}
