import { Component, ElementRef, OnDestroy, OnInit, ViewChild, NgZone } from '@angular/core';
import * as cytoscape from 'cytoscape';

interface NodeModel {
  id: string;
  label: string;
  type?: string;
  expr?: string;
}

interface EdgeModel {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: { variable: string; op: string; value: string };
  output?: string;
}

@Component({
  selector: 'app-graph-editor',
  templateUrl: './graph-editor.component.html',
  styleUrls: ['./graph-editor.component.scss']
})
export class GraphEditorComponent implements OnInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) cyContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('rootContainer', { static: true }) rootContainer!: ElementRef<HTMLDivElement>;

  cy: any;
  nodes: NodeModel[] = [];
  edges: EdgeModel[] = [];
  selectedNode: NodeModel | null = null;
  selectedEdge: EdgeModel | null = null;
  // right pane width (px)
  rightPaneWidth = 360;
  // keep a snapshot of the last selected entity so metadata remains visible after deselect
  lastSelectionSnapshot: { kind: 'node' | 'edge'; data: any } | null = null;

  // draft while connecting by clicking two nodes (or creating a leaf)
  edgeDraft: { source: string; target: string; parentVar?: string; op?: string; value?: string; tempEdgeId?: string; isLeaf?: boolean; output?: string; leafPosition?: { x: number; y: number } } | null = null;
  // drag-to-create-edge state
  isEdgeDragging = false;
  dragSourceId = '';
  dragCurrent = { x: 0, y: 0 };
  // simple counter for ids
  private nodeCounter = 1;

  // UI fields for connecting nodes
  connectSource = '';
  connectTarget = '';
  edgeLabel = '';

  // conflict modal state
  conflictModalVisible = false;
  conflictingEdges: EdgeModel[] = [];
  // export validation modal state
  exportInvalidModalVisible = false;
  exportInvalidNodes: string[] = [];
  // DOT export: ensure single root
  exportMultipleRootsModalVisible = false;
  exportDOTRoots: string[] = [];
  // search modal when creating node via canvas click
  searchModalVisible = false;
  searchModalPos = { x: 0, y: 0 };
  searchQuery = '';
  private searchModalNodeId: string | null = null;
  // available variables for autocomplete
  availableVariables: string[] = [
    'age','income','country','employment_status','credit_score','marital_status','dependents','education_level','occupation','home_ownership','loan_amount','loan_term','interest_rate','monthly_payment','savings_balance','checking_balance','assets_total','liabilities_total','net_worth','transaction_count','last_login_days','account_age_days','overdue_payments','payment_history_score','risk_score','location_region','city','postal_code','device_type','browser','os','signup_source','referral_code','customer_tier','churn_risk','avg_session_length','purchase_count','last_purchase_days','preferred_language','currency','tax_id','company_size','industry','annual_revenue','monthly_revenue','quarterly_growth','subscription_plan','trial_ends_in_days','coupon_used','loyalty_points','has_active_support_ticket','profile_complete'
  ];
    // placement for the search modal: 'center' or 'anchor' (near click)
    searchModalPlacement: 'center' | 'anchor' = 'center';
    // modal drag state
    private _isModalDragging = false;
    private _modalDragOffset = { x: 0, y: 0 };
    private _modalMoveHandler: any = null;
    private _modalUpHandler: any = null;
  searchError: string | null = null;
  // track whether the search input is focused (for UI styling)
  searchHasFocus = false;
  // track currently-created temporary edge id so we only ever have one
  currentTempEdgeId: string | null = null;
  // track a temporary node created when dropping an edge into empty canvas (leaf preview)
  currentTempNodeId: string | null = null;
  // parsing/validation for the condition input
  edgeDraftParseError: string | null = null;
  private _conditionParseTimer: any = null;
  // inline editor element for editing leaf labels directly on canvas
  private _inlineEditorEl: HTMLInputElement | null = null;
  // box selection state (left-drag)
  private _isBoxSelecting = false;
  private _boxStart = { x: 0, y: 0 };
  private _boxEl: HTMLDivElement | null = null;
  private _boxMoveHandler: any = null;
  private _boxUpHandler: any = null;
  // flag to prevent node creation after a drag-select
  private _wasBoxSelecting = false;
  private _tooltipEl: HTMLDivElement | null = null;
  // bound key handler so we can remove it on destroy
  private _boundKeyHandler: any = null;
  // bound outside-click handler to deselect nodes when clicking outside canvas
  private _boundOutsideClickHandler: any = null;
  // resizer drag state
  private _isResizerDragging = false;
  private _resizerMoveHandler: any = null;
  private _resizerUpHandler: any = null;
  // metadata resizer state (vertical)
  metadataHeight = 160;
  private _isMetaResizerDragging = false;
  private _metaResizerMoveHandler: any = null;
  private _metaResizerUpHandler: any = null;
  private _metaStartY: number | null = null;
  private _metaStartHeight: number = 160;
  // canvas settings
  canvasSettingsVisible = false;
  bgPattern: 'plain' | 'dots' | 'grid' = 'dots';
  bgColor = '#ffffff';
  // zoom sensitivity controls how fast zoom responds to wheel deltas; smaller = slower
  zoomSensitivity = 0.004;
  // explicit zoom level (1.0 == 100%) controlled by slider
  zoomLevel = 1.0;
  private _wheelHandler: any = null;
  // right-button pan state
  private _isRightPanning = false;
  private _panLast = { x: 0, y: 0 };
  private _panMoveHandler: any = null;
  private _panUpHandler: any = null;
  private _rightDownHandler: any = null;
  private _resizeWindowHandler: any = null;

  constructor(private zone: NgZone) { }
  onHamburgerOpen(): void {
    try { console.log('[GraphEditor] hamburger menu open'); } catch (e) { /* ignore */ }
  }
  ngOnInit(): void {
    const cyFactory = (cytoscape as any) && ((cytoscape as any).default || (cytoscape as any));
    this.cy = (cyFactory as any)({
      container: this.cyContainer.nativeElement,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'roundrectangle',
            // unselected node style: white fill with gray stroke
            'background-color': '#ffffff',
            'label': 'data(label)',
            // dark text for contrast
            'color': '#16191f',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'width': 160,
            'height': 44,
            'padding-left': 12,
            'padding-right': 12,
            'font-size': 15,
            'font-weight': 400,
            'font-family': '"Amazon Ember", Inter, Roboto, Arial, sans-serif',
            // unselected stroke
            'border-width': 1,
            'border-radius': 12,
            'border-color': 'rgb(104, 112, 120)',
            'text-outline-width': 0,
            'text-outline-color': '#ffffff'
          }
        },
        // leaf node style: small circular output nodes
        {
          selector: 'node[type="leaf"]',
          style: {
            'shape': 'ellipse',
            'background-color': 'rgb(255, 249, 204)',
            'border-color': 'var(--color-text-form-secondary-btuye6, #687078)',
            'border-width': 0.6,
            'width': 72,
            'height': 72,
            'font-size': 14,
            'text-wrap': 'ellipsis',
            'text-max-width': 56,
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#16191f'
          }
        },
        {
          selector: '.temp-leaf',
          style: {
            'opacity': 0.65
          }
        },
        {
          selector: 'node.temp-drag-node',
          style: {
            'opacity': 0,
            'width': 1,
            'height': 1,
            'label': ''
          }
        },
        {
          selector: 'node:selected',
          style: {
            // selected node: AWS-like highlighted look
            'background-color': '#f1faff',
            'border-color': '#0073bb',
            'border-width': 1
          }
        },
        {
          selector: '.new-look-state-node',
          style: {
            'font-weight': 400,
            'font-family': '"Amazon Ember", Inter, Roboto, Arial, sans-serif',
            'text-shadow': 'none',
            // center labels and allow wrapping so text stays inside the box
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': 110,
            'text-margin-y': 0,
            'font-size': 15,
            'color': '#16191f'
          }
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'line-color': '#0073bb',
            'target-arrow-color': '#0073bb',
            'width': 1
          }
        },
        {
          selector: '.temp-edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'line-color': '#0073bb',
            'target-arrow-color': '#0073bb',
            'line-style': 'dashed',
            'opacity': 0.85,
            'width': 2
          }
        },
        {
          selector: '.needs-fix',
          style: {
            'border-color': '#d32f2f',
            'border-width': 2,
            'background-color': '#fff7f7'
          }
        },
        { selector: ':selected', style: { 'overlay-opacity': 0.25, 'overlay-color': '#ffc107' } }
      ],
      layout: { name: 'grid' },
      // enable box selection so left-drag can multi-select. Disable user panning
      // so only our custom right-button panning works via programmatic panBy().
      boxSelectionEnabled: true,
      panningEnabled: true,
      userPanningEnabled: false
    });

    // disable cytoscape's default wheel zoom and install our custom handler
    try { if (this.cy && typeof this.cy.userZoomingEnabled === 'function') this.cy.userZoomingEnabled(false); } catch (e) { /* ignore */ }
    // ensure cytoscape does not allow user panning gestures (we handle right-button panning manually)
    try { if (this.cy && typeof this.cy.userPanningEnabled === 'function') this.cy.userPanningEnabled(false); } catch (e) { /* ignore */ }
    this._wheelHandler = (ev: WheelEvent) => this._onWheel(ev);
    try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('wheel', this._wheelHandler, { passive: false }); } catch (e) { /* ignore */ }
    // prevent context menu on right-click inside cy container so right-drag panning feels native
    try { this._rightDownHandler = (ev: MouseEvent) => this._onCyMouseDown(ev); this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('mousedown', this._rightDownHandler); } catch (e) { /* ignore */ }
    try { this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.addEventListener('contextmenu', (e:any) => e.preventDefault()); } catch (e) { /* ignore */ }
    // apply initial background and zoom level
    setTimeout(() => { this.applyBackground(); this.setZoomLevel(this.zoomLevel); }, 0);

    this.cy.on('tap', 'node', (evt: any) => {
      const node = evt.target;
      const id = node.id();
      const orig = (evt.originalEvent as MouseEvent) || (evt.originalEvent ? evt.originalEvent : null);
      const isDouble = orig && (orig as any).detail === 2;
      if (isDouble) {
        try {
          const data = node.data() || {};
          if (data && data.type === 'leaf') {
            this.zone.run(() => this.startInlineEdit(id));
            return;
          }
        } catch (e) { /* ignore */ }
      }
      this.selectNodeById(id);
    });

    // allow selecting edges by clicking them
    this.cy.on('tap', 'edge', (evt: any) => {
      try {
        const edgeEl = evt.target;
        const id = edgeEl.id();
        this.zone.run(() => this.selectEdgeById(id));
      } catch (e) { /* ignore */ }
    });

    // show tooltip on hover for leaf nodes
    this.cy.on('mouseover', 'node', (evt: any) => {
      try {
        const node = evt.target;
        const data = node.data() || {};
        // when dragging an edge, change cursor to indicate invalid target if needed
        if (this.isEdgeDragging && this.dragSourceId) {
          const tid = node.id();
          if (tid && tid !== this.dragSourceId) {
            if (this.edgeExists(this.dragSourceId, tid) || this.wouldCreateCycle(this.dragSourceId, tid)) {
              try { this.cyContainer.nativeElement.style.cursor = 'not-allowed'; } catch (e) { /* ignore */ }
            } else {
              try { this.cyContainer.nativeElement.style.cursor = 'crosshair'; } catch (e) { /* ignore */ }
            }
          }
        }
        if (data && data.type === 'leaf') {
          const p = evt.renderedPosition || (node && node.renderedPosition ? node.renderedPosition() : undefined);
          // show a hint rather than the full output value
          const text = 'Double-click to edit';
          if (p) this.showTooltip(text, p.x, p.y);
        }
      } catch (e) { /* ignore */ }
    });
    this.cy.on('mouseout', 'node', (evt: any) => { this.hideTooltip(); try { this.cyContainer.nativeElement.style.cursor = ''; } catch (e) { /* ignore */ } });
    this.cy.on('mousemove', 'node', (evt: any) => {
      try {
        if (!this._tooltipEl) return;
        const node = evt.target;
        const rp = evt.renderedPosition || evt.position || (node && node.renderedPosition ? node.renderedPosition() : undefined);
        if (rp && rp.x != null) this.moveTooltip(rp.x, rp.y);
      } catch (e) { /* ignore */ }
    });

    this.cy.on('tap', (evt: any) => {
      if (evt.target === this.cy) {
        // ignore canvas tap if it was just a box-select drag
        if (this._wasBoxSelecting) { this._wasBoxSelecting = false; return; }
        // click on empty canvas: create a new input node at click position and open search modal
        try {
          const pos = evt.position || evt.renderedPosition || { x: 100, y: 100 };
          const id = 'n' + (this.nodeCounter++);
          const node: NodeModel = { id, label: id, type: 'input' };
          (node as any).position = { x: pos.x, y: pos.y };
          this.nodes.push(node);
          try {
            const el = this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label, type: node.type }, position: (node as any).position });
            try { el.addClass('new-look-state-node'); } catch (e) { /* ignore */ }
          } catch (e) { /* ignore */ }
          // select the new node
          this.clearSelection();
          this.selectedNode = node;
          try { const el = this.cy.getElementById(node.id); if (el) { try { if (el.select) el.select(); } catch (e) { } try { el.addClass && el.addClass('selected'); } catch (ee) { } } } catch (e) { /* ignore */ }
          // open search modal so user can type variable name
          const rect = this.cyContainer.nativeElement.getBoundingClientRect();
          this.searchModalPos = { x: pos.x, y: pos.y };
          this.searchModalVisible = true;
          this.searchModalNodeId = node.id;
          this.searchQuery = '';
          // prefer anchor placement by default for canvas-click
          this.searchModalPlacement = 'anchor';
          setTimeout(() => this.focusSearchInput(), 0);
        } catch (e) {
          this.clearSelection();
        }
        return;
      }
    });

    // Left-button drag box selection on empty canvas: create overlay and select nodes inside
    this.cy.on('mousedown', (evt: any) => {
      try {
        const orig = (evt.originalEvent as MouseEvent) || null;
        if (!(orig && orig.button === 0)) return; // only left button
        if (evt.target !== this.cy) return; // only start when clicking on background/core
        this._boxStart = { x: orig.clientX, y: orig.clientY };
        this._isBoxSelecting = false;
        this._boxMoveHandler = (m: MouseEvent) => this._onBoxMouseMove(m);
        this._boxUpHandler = (u: MouseEvent) => this._onBoxMouseUp(u);
        window.addEventListener('mousemove', this._boxMoveHandler);
        window.addEventListener('mouseup', this._boxUpHandler);
      } catch (e) { /* ignore */ }
    });

    // Drag-to-create-edge: start when user presses mouse on an already-selected node and moves
    this.cy.on('mousedown', 'node', (evt: any) => {
      const orig = evt.originalEvent as MouseEvent;
      if (!(orig && orig.button === 0)) return; // only left button
      const nodeId = evt.target.id();
      // Start edge creation only when the clicked node is currently selected
      if (!this.selectedNode || this.selectedNode.id !== nodeId) return;
      // Do not allow starting an edge drag from a leaf node
      try {
        const n = this.cy.getElementById(nodeId);
        const dt = n && n.data ? n.data() : {};
        if (dt && dt.type === 'leaf') return;
      } catch (e) { /* ignore */ }
      // begin drag-to-create-edge and lock the source node to prevent moving it
      this.zone.run(() => {
        this.isEdgeDragging = true;
        this.dragSourceId = nodeId;
        const p = evt.target.renderedPosition();
        this.dragCurrent = { x: p.x, y: p.y };
        try { this.cy.getElementById(this.dragSourceId).lock(); } catch (e) { /* ignore */ }
      });
      // create temporary cy node+edge visuals so the preview looks like a normal blue edge
        try {
          const tmpId = 'tmpdrag' + Date.now();
          this.currentTempNodeId = tmpId;
          try {
            const modelPos = this.renderedToModel(this.dragCurrent);
            // create an invisible temp node used only for edge preview
            // make it non-selectable/grabbable and locked so it does not intercept mouse events
            this.cy.add({ group: 'nodes', data: { id: tmpId, label: '' }, position: { x: modelPos.x, y: modelPos.y }, selectable: false, grabbable: false, locked: true });
            try { const tmpEl = this.cy.getElementById(tmpId); if (tmpEl) { try { tmpEl.addClass('temp-drag-node'); } catch (e) { /* ignore */ } } } catch (e) { /* ignore */ }
          } catch (e) { /* ignore */ }
          const tempEdgeId = this.createTempEdge(nodeId, tmpId);
          if (tempEdgeId) this.currentTempEdgeId = tempEdgeId;
          console.log('[GraphEditor] created drag preview tmpNode=', this.currentTempNodeId, 'tmpEdge=', this.currentTempEdgeId, 'modelPos=', this.dragCurrent);
        } catch (e) { console.log('[GraphEditor] error creating drag preview', e); }
      // prevent cytoscape from starting a node-move
      try { (evt.originalEvent as any).preventDefault?.(); } catch (e) { /* ignore */ }
    });

    // update the drag line while moving
    this.cy.on('mousemove', (evt: any) => {
      if (!this.isEdgeDragging) return;
      const rp = evt.renderedPosition || evt.position;
      if (!rp) return;
      this.zone.run(() => { this.dragCurrent = { x: rp.x, y: rp.y }; });
      // if we created a temp node for the drag preview, update its position so the temp edge follows the pointer
      try {
        if (this.currentTempNodeId) {
          const tmp = this.cy.getElementById(this.currentTempNodeId);
          if (tmp && typeof tmp.position === 'function') {
            try { const modelPos = this.renderedToModel(rp); tmp.position({ x: modelPos.x, y: modelPos.y }); } catch (e) { /* ignore */ }
          }
        }
        // diagnostic: log preview element states occasionally
        try {
          if (this.currentTempEdgeId) {
            const te = this.cy.getElementById(this.currentTempEdgeId);
            const tn = this.currentTempNodeId ? this.cy.getElementById(this.currentTempNodeId) : null;
            const teStyle = te && te.style ? te.style('line-color') : null;
            const tnRp = tn && tn.renderedPosition ? tn.renderedPosition() : null;
            console.log('[GraphEditor] drag preview update tmpEdgeExists=', !!te, 'line-color=', teStyle, 'tmpNodeRenderedPos=', tnRp);
          }
        } catch (e) { /* ignore */ }

        // Force temp-edge to stay visible: reapply inline styles and bring to front
        try {
          if (this.currentTempEdgeId) {
            const te = this.cy.getElementById(this.currentTempEdgeId);
            if (te) {
              try { te.style && te.style({ 'line-color': '#0073bb', 'target-arrow-color': '#0073bb', 'line-style': 'dashed', 'opacity': 0.95, 'width': 3, 'z-index': 9999 }); } catch (e) { /* ignore */ }
              try { if (typeof te.toFront === 'function') te.toFront(); } catch (e) { /* ignore */ }
            }
          }
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
      // provide cursor feedback when hovering over nodes while dragging
      try {
        const target = evt.target;
        if (target && typeof target.group === 'function' && target.group() === 'nodes') {
          const tid = target.id();
          if (tid && tid !== this.dragSourceId) {
            if (this.edgeExists(this.dragSourceId, tid) || this.wouldCreateCycle(this.dragSourceId, tid)) {
              this.cyContainer.nativeElement.style.cursor = 'not-allowed';
            } else {
              this.cyContainer.nativeElement.style.cursor = 'crosshair';
            }
          } else {
            this.cyContainer.nativeElement.style.cursor = '';
          }
        } else {
          // over the core/canvas
          this.cyContainer.nativeElement.style.cursor = '';
        }
      } catch (e) { /* ignore */ }
    });

    // if mouseup on a node while dragging, create an edge draft to that node
    this.cy.on('mouseup', 'node', (evt: any) => {
      if (!this.isEdgeDragging) return;
      const targetId = evt.target.id();
      if (targetId && targetId !== this.dragSourceId) {
        // if this connection would be invalid (duplicate or cycle), do nothing
        if (this.edgeExists(this.dragSourceId, targetId) || this.wouldCreateCycle(this.dragSourceId, targetId)) {
          // reset cursor and abort creation
          try { this.cyContainer.nativeElement.style.cursor = ''; } catch (e) { /* ignore */ }
        } else {
          this.zone.run(() => {
            this.connectSource = this.dragSourceId;
            this.connectTarget = targetId;
            this.edgeDraft = { source: this.dragSourceId, target: targetId, parentVar: this.getNodeLabel(this.dragSourceId), op: '==' };
            // create temporary visual edge (replace previous if any)
            const created = this.createTempEdge(this.dragSourceId, targetId);
            this.edgeDraft.tempEdgeId = created;
            // focus the condition value input so the user can start typing immediately
            setTimeout(() => this.focusConditionValueInput(), 0);
          });
        }
      }
      // stop dragging in any case, and unlock the source node
      try { this.cy.getElementById(this.dragSourceId).unlock(); } catch (e) { /* ignore */ }
      this.zone.run(() => { this.isEdgeDragging = false; this.dragSourceId = ''; });
      try { this.cyContainer.nativeElement.style.cursor = ''; } catch (e) { /* ignore */ }
    });

    // cancel dragging on core mouseup (not over node) — if released on canvas, create a leaf draft
    this.cy.on('mouseup', (evt: any) => {
      if (!this.isEdgeDragging) return;
      // if mouseup occurred on the core/canvas (not on a node), create a temporary leaf node at the drop position
      const isCore = evt.target === this.cy || !evt.target || evt.target === undefined;
      if (isCore) {
        const rp = evt.renderedPosition || evt.position || this.dragCurrent;
        const x = rp.x || this.dragCurrent.x;
        const y = rp.y || this.dragCurrent.y;
        // if we already created a drag-temp node, just reuse it and update position; otherwise create one
        let tmpNodeId = this.currentTempNodeId;
        if (tmpNodeId) {
          try {
            const tmpEl = this.cy.getElementById(tmpNodeId);
            if (tmpEl && typeof tmpEl.position === 'function') {
              const modelPos = this.renderedToModel({ x, y });
              tmpEl.position({ x: modelPos.x, y: modelPos.y });
              // if this node was an invisible drag preview, convert it into a visible temp leaf on drop
              try {
                if (tmpEl.hasClass && tmpEl.hasClass('temp-drag-node')) {
                  try { tmpEl.removeClass('temp-drag-node'); } catch (e) { /* ignore */ }
                  try { tmpEl.data && tmpEl.data('type', 'leaf'); } catch (e) { /* ignore */ }
                  try { tmpEl.addClass && tmpEl.addClass('new-look-state-node'); } catch (e) { /* ignore */ }
                  try { tmpEl.addClass && tmpEl.addClass('temp-leaf'); } catch (e) { /* ignore */ }
                  try { if (tmpEl.unlock) tmpEl.unlock(); } catch (e) { /* ignore */ }
                  try { if (tmpEl.grabify) tmpEl.grabify(); } catch (e) { /* ignore */ }
                  try { if (tmpEl.selectify) tmpEl.selectify(); } catch (e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
        } else {
          tmpNodeId = 'tmpnode' + Date.now();
          try {
            const modelPos = this.renderedToModel({ x, y });
            const tmpEl = this.cy.add({ group: 'nodes', data: { id: tmpNodeId, label: '', type: 'leaf' }, position: { x: modelPos.x, y: modelPos.y } });
            try { tmpEl.addClass('new-look-state-node'); tmpEl.addClass('temp-leaf'); } catch (e) { /* ignore */ }
          } catch (e) { /* ignore */ }
          this.currentTempNodeId = tmpNodeId;
        }
        // create temporary visual edge to the temp node (do this before storing currentTempNodeId so
        // createTempEdge doesn't remove the node we just added)
        const created = this.createTempEdge(this.dragSourceId, tmpNodeId);
        this.currentTempNodeId = tmpNodeId;
        // open edge draft in leaf mode
        this.zone.run(() => {
          this.connectSource = this.dragSourceId;
          this.connectTarget = tmpNodeId;
          this.edgeDraft = { source: this.dragSourceId, target: tmpNodeId, parentVar: this.getNodeLabel(this.dragSourceId), op: '==', tempEdgeId: created, isLeaf: true, output: '', leafPosition: { x, y } };
          // focus the condition input (not the output) as requested
          setTimeout(() => this.focusConditionValueInput('condition'), 0);
        });
      }
      // stop dragging in any case, and unlock the source node
      try { this.cy.getElementById(this.dragSourceId).unlock(); } catch (e) { /* ignore */ }
      this.zone.run(() => { this.isEdgeDragging = false; this.dragSourceId = ''; });
      try { this.cyContainer.nativeElement.style.cursor = ''; } catch (e) { /* ignore */ }
    });

    // No cytoscape extensions are used in this prototype build to avoid
    // runtime issues with module shapes. Edge creation can be done via
    // the UI controls (connect dropdown) or by dragging variables into
    // the canvas to create input nodes.

    // install global key handler for delete key
    this._boundKeyHandler = (ev: KeyboardEvent) => {
      try {
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          const tag = (active.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as any).isContentEditable) return;
        }
        if (ev.key === 'Delete' || ev.key === 'Del' || ev.key === 'Backspace') {
          ev.preventDefault();
          try {
            // Compute selection consistently: union of Cytoscape ':selected' and legacy '.selected'
            let sels: any = null;
            try {
              const s1 = this.cy ? this.cy.elements(':selected') : null;
              const s2 = this.cy ? this.cy.elements('.selected') : null;
              if (s1 && typeof s1.union === 'function') sels = s1.union(s2);
              else {
                const ids = new Set<string>();
                try { s1 && s1.forEach((e: any) => ids.add(e.id())); } catch (e) { /* ignore */ }
                try { s2 && s2.forEach((e: any) => ids.add(e.id())); } catch (e) { /* ignore */ }
                const arr: any[] = [];
                ids.forEach(id => { try { const el = this.cy.getElementById(id); if (el) arr.push(el); } catch (e) { /* ignore */ } });
                sels = this.cy && typeof this.cy.collection === 'function' ? this.cy.collection(arr) : arr;
              }
            } catch (e) {
              try { sels = this.cy.elements('.selected'); } catch (ee) { sels = null; }
            }

            // Debug logging to help diagnose selection/delete issues
            try {
              const ids: string[] = [];
              if (sels && typeof sels.forEach === 'function') sels.forEach((el: any) => { try { ids.push(el.id()); } catch (e) { /* ignore */ } });
              console.log('[GraphEditor] Delete key pressed. selectionCount=', ids.length, 'ids=', ids, 'modelSelectedNode=', this.selectedNode ? this.selectedNode.id : null, 'modelSelectedEdge=', this.selectedEdge ? this.selectedEdge.id : null);
            } catch (e) { console.log('[GraphEditor] Delete key pressed. (unable to enumerate selection)'); }

            if (sels && sels.length && sels.length > 0) {
              this.zone.run(() => this.deleteSelectedMultiple());
            } else if (this.selectedNode || this.selectedEdge) {
              // fallback to single-selection delete
              this.zone.run(() => this.deleteSelected());
            } else {
              console.debug('[GraphEditor] Delete key pressed but nothing selected.');
            }
          } catch (e) {
            // on any error, fallback to single delete
            this.zone.run(() => this.deleteSelected());
          }
        }
      } catch (e) { /* ignore */ }
    };
    try { window.addEventListener('keydown', this._boundKeyHandler); } catch (e) { /* ignore */ }
    // install outside-click handler to clear selection when clicking outside the cy container
    this._boundOutsideClickHandler = (ev: MouseEvent) => {
      try {
        const tgt = ev.target as HTMLElement | null;
        // prefer checking the full component root so clicks on the right-hand panel
        // (where the edge creation inputs live) do not cancel the draft.
        const root = this.rootContainer && this.rootContainer.nativeElement ? this.rootContainer.nativeElement : null;
        const container = this.cyContainer && this.cyContainer.nativeElement ? this.cyContainer.nativeElement : null;
        // if click occurred inside the component root or inside the cy container, do nothing
        if (tgt && ((root && root.contains(tgt)) || (container && container.contains(tgt)))) return;
        // otherwise clear selection
        this.zone.run(() => this.clearSelection());
      } catch (e) { /* ignore */ }
    };
    try { window.addEventListener('click', this._boundOutsideClickHandler); } catch (e) { /* ignore */ }
    // make sure container fits the available viewport space (avoid page scrollbar)
    try {
      this._resizeWindowHandler = () => this._adjustRootContainerHeight();
      window.addEventListener('resize', this._resizeWindowHandler);
      // initial adjust after a short delay so layout settled
      setTimeout(() => this._adjustRootContainerHeight(), 0);
    } catch (e) { /* ignore */ }
  }

  // adjust the root container height so the editor fits remaining viewport space
  private _adjustRootContainerHeight(): void {
    try {
      if (!this.rootContainer || !this.rootContainer.nativeElement) return;
      const el = this.rootContainer.nativeElement as HTMLElement;
      const rect = el.getBoundingClientRect();
      // clamp top to >= 0 so page scroll (negative top) doesn't inflate available height
      const top = Math.max(0, rect.top);
      const avail = Math.max(200, window.innerHeight - top);
      // set explicit height to available space so internal flex children can use 100%
      el.style.height = avail + 'px';
      el.style.maxHeight = avail + 'px';
      el.style.overflow = 'hidden';
      // ensure right pane uses full container height
      try {
        const rp = document.querySelector('.right-pane') as HTMLElement | null;
        if (rp) rp.style.height = '100%';
      } catch (e) { /* ignore */ }
      // trigger cy resize in case sizes changed
      try { if (this.cy && typeof this.cy.resize === 'function') this.cy.resize(); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }

  ngOnDestroy(): void {
    if (this.cy) { this.cy.destroy(); }
    // remove inline editor if present
    if (this._inlineEditorEl && this._inlineEditorEl.parentNode) {
      try { this._inlineEditorEl.parentNode.removeChild(this._inlineEditorEl); } catch (e) { /* ignore */ }
      this._inlineEditorEl = null;
    }
    // remove global key handler
    try { if (this._boundKeyHandler) window.removeEventListener('keydown', this._boundKeyHandler); } catch (e) { /* ignore */ }
    // remove outside-click handler
    try { if (this._boundOutsideClickHandler) window.removeEventListener('click', this._boundOutsideClickHandler); } catch (e) { /* ignore */ }
    // remove resizer handlers
    try { if (this._resizerMoveHandler) window.removeEventListener('mousemove', this._resizerMoveHandler); } catch (e) { /* ignore */ }
    try { if (this._resizerUpHandler) window.removeEventListener('mouseup', this._resizerUpHandler); } catch (e) { /* ignore */ }
    // remove metadata resizer handlers
    try { if (this._metaResizerMoveHandler) window.removeEventListener('mousemove', this._metaResizerMoveHandler); } catch (e) { /* ignore */ }
    try { if (this._metaResizerUpHandler) window.removeEventListener('mouseup', this._metaResizerUpHandler); } catch (e) { /* ignore */ }
    // remove any modal handlers
    try { if (this._modalMoveHandler) window.removeEventListener('mousemove', this._modalMoveHandler); } catch (e) { /* ignore */ }
    try { if (this._modalUpHandler) window.removeEventListener('mouseup', this._modalUpHandler); } catch (e) { /* ignore */ }
    try { if (this._wheelHandler) this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.removeEventListener('wheel', this._wheelHandler); } catch (e) { /* ignore */ }
    try { if (this._rightDownHandler) this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.removeEventListener('mousedown', this._rightDownHandler); } catch (e) { /* ignore */ }
    try { if (this._resizeWindowHandler) window.removeEventListener('resize', this._resizeWindowHandler); } catch (e) { /* ignore */ }
  }

  

  addNode(): void {
    const id = 'n' + (this.nodeCounter++);
    const node: NodeModel = { id, label: id, type: 'condition', expr: '' };
    this.nodes.push(node);
    const el = this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label } });
    try { el.addClass('new-look-state-node'); } catch (e) { /* ignore */ }
  }

  selectNodeById(id: string): void {
    // If we already have a source selected and user clicks a different node,
    // start an edge draft between source -> clicked node.
    if (this.connectSource && this.connectSource !== id) {
      // prevent creating drafts that would duplicate or create cycles
      if (this.edgeExists(this.connectSource, id) || this.wouldCreateCycle(this.connectSource, id)) {
        // do not create draft or temp edge
        return;
      }
      this.connectTarget = id;
      this.edgeDraft = { source: this.connectSource, target: id, parentVar: this.getNodeLabel(this.connectSource), op: '==' };
      // create a temporary visual edge immediately (replace any previous)
      const created = this.createTempEdge(this.connectSource, id);
      this.edgeDraft.tempEdgeId = created;
      // focus the condition value input so the user can start typing immediately
      setTimeout(() => this.focusConditionValueInput(), 0);
      // highlight both nodes
      try { this.cy.elements().unselect(); } catch (e) { try { this.cy.nodes().forEach((n: any) => n.removeClass('selected')); } catch (ee) { /* ignore */ } }
      const s = this.cy.getElementById(this.connectSource);
      const t = this.cy.getElementById(id);
      try { if (s) { try { if (s.select) s.select(); } catch (e) { } try { s.addClass && s.addClass('selected'); } catch (ee) { } } } catch (e) { /* ignore */ }
      try { if (t) { try { if (t.select) t.select(); } catch (e) { } try { t.addClass && t.addClass('selected'); } catch (ee) { } } } catch (e) { /* ignore */ }
      // keep selectedNode as the target for editing
      this.selectedNode = this.nodes.find(n => n.id === id) || null;
      return;
    }

    // start a new selection (single click)
    // clear prior selection state both in model and in Cytoscape, then select this node
    try { if (this.cy && typeof this.cy.elements === 'function') this.cy.elements().unselect(); } catch (e) { /* ignore */ }
    this.clearSelection();
    const found = this.nodes.find(n => n.id === id) || null;
    this.selectedNode = found;
    const el = this.cy.getElementById(id);
    try {
      if (el) {
        try { if (el.select) el.select(); } catch (e) { /* ignore */ }
        try { el.addClass && el.addClass('selected'); } catch (ee) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    this.connectSource = id;
    // clear any selected edge in the model
    this.selectedEdge = null;
    // store last selection snapshot
    try { this.lastSelectionSnapshot = { kind: 'node', data: Object.assign({}, found) }; } catch (e) { this.lastSelectionSnapshot = null; }
  }

  clearSelection(): void {
    this.selectedNode = null;
    this.selectedEdge = null;
    // clear Cytoscape's selection state and any legacy class markers
    try { if (this.cy && typeof this.cy.elements === 'function') this.cy.elements().unselect(); } catch (e) { /* ignore */ }
    try { this.cy.nodes().forEach((n: any) => n.removeClass('selected')); } catch (e) { /* ignore */ }
    try { this.cy.edges().forEach((e: any) => e.removeClass('selected')); } catch (e) { /* ignore */ }
    this.connectSource = '';
    this.connectTarget = '';
    // remove temporary visual edge if present
    this.removeCurrentTempEdge();
    this.edgeDraft = null;
    // do NOT clear lastSelectionSnapshot so metadata remains visible
  }

  removeCurrentTempEdge(): void {
    if (this.currentTempEdgeId) {
      try { const tmp = this.cy.getElementById(this.currentTempEdgeId); if (tmp) this.cy.remove(tmp); } catch (e) { /* ignore */ }
      this.currentTempEdgeId = null;
    }
    // also clear any tempEdgeId stored on edgeDraft
    if (this.edgeDraft) { this.edgeDraft.tempEdgeId = undefined; }
    // if we created a temporary node (leaf preview), remove it as well
    if (this.currentTempNodeId) {
      try { const tn = this.cy.getElementById(this.currentTempNodeId); if (tn) this.cy.remove(tn); } catch (e) { /* ignore */ }
      this.currentTempNodeId = null;
    }
  }

  selectEdgeById(id: string): void {
    try {
      const found = this.edges.find(e => e.id === id) || null;
      this.clearSelection();
      this.selectedEdge = found;
      if (found) {
        // highlight edge
        try { const el = this.cy.getElementById(found.id); if (el) { try { if (el.select) el.select(); } catch (se) { /* ignore */ } try { el.addClass && el.addClass('selected'); } catch (ee) { /* ignore */ } } } catch (e) { /* ignore */ }
        // store last selection snapshot
        try { this.lastSelectionSnapshot = { kind: 'edge', data: Object.assign({}, found) }; } catch (e) { this.lastSelectionSnapshot = null; }
      }
    } catch (e) { /* ignore */ }
  }

  // update selected edge from panel inputs
  updateSelectedEdge(): void {
    if (!this.selectedEdge) return;
    // find model edge and update
    const idx = this.edges.findIndex(e => e.id === this.selectedEdge!.id);
    if (idx >= 0) this.edges[idx] = { ...this.selectedEdge };
    try {
      const el = this.cy.getElementById(this.selectedEdge.id);
      if (el) el.data('label', this.selectedEdge.label || '');
    } catch (e) { /* ignore */ }
  }

  cancelEdgeEdit(): void {
    // refresh selectedEdge from model to discard local edits
    if (!this.selectedEdge) return;
    const found = this.edges.find(e => e.id === this.selectedEdge!.id) || null;
    this.selectedEdge = found;
  }

  createTempEdge(source: string, target: string): string {
    // ensure only one temporary edge exists at a time (remove previous temp edge but keep any temp node)
    try {
      if (this.currentTempEdgeId) {
        try { const prev = this.cy.getElementById(this.currentTempEdgeId); if (prev) this.cy.remove(prev); } catch (e) { /* ignore */ }
        this.currentTempEdgeId = null;
      }
    } catch (e) { /* ignore */ }
    // prevent creating a temp edge if it would duplicate or introduce a cycle
    if (this.edgeExists(source, target) || this.wouldCreateCycle(source, target)) {
      // do not create a temp edge; caller should handle the falsy return
      return '';
    }
    // also prevent any temp edges originating from leaf nodes
    try {
      const srcEl = this.cy.getElementById(source);
      const srcData = srcEl && srcEl.data ? srcEl.data() : {};
      if (srcData && srcData.type === 'leaf') {
        return '';
      }
    } catch (e) { /* ignore */ }
    const tempId = 'tmp' + Date.now();
    try {
      const added = this.cy.add({ group: 'edges', data: { id: tempId, source, target, label: '' }, classes: 'temp-edge' });
      // ensure the edge is visible by applying an inline style as a fallback
      try {
        if (added) {
          try { added.style && added.style({ 'line-color': '#0073bb', 'target-arrow-color': '#0073bb', 'line-style': 'dashed', 'opacity': 0.85, 'width': 2, 'z-index': 9999 }); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
    this.currentTempEdgeId = tempId;
    return tempId;
  }

  focusConditionValueInput(prefer?: 'condition' | 'output'): void {
    try {
      let id = 'edge-condition-value';
      if (prefer === 'condition') {
        id = 'edge-condition-value';
      } else if (prefer === 'output') {
        id = 'edge-output-value';
      } else {
        id = (this.edgeDraft && this.edgeDraft.isLeaf) ? 'edge-output-value' : 'edge-condition-value';
      }
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) { el.focus(); el.select(); }
    } catch (e) { /* ignore */ }
  }

  getNodeLabel(id: string): string {
    const n = this.nodes.find(x => x.id === id);
    return n ? n.label : id;
  }

  // Parse a combined operator+value string typed into the value field.
  // Returns {op, value} or null if not parseable.
  parseConditionInput(text: string): { op: string; value: string } | null {
    if (!text) return null;
    const t = text.trim();
    const lowered = t.toLowerCase();
    // try longest operators first
    const ops = ['==', '!=', '>=', '<=', '>', '<', '=', 'in'];
    for (const op of ops) {
      if (op === 'in') {
        if (lowered.startsWith('in ') || lowered === 'in') {
          const value = t.slice(2).trim();
          // allow empty value while typing
          return { op: 'in', value };
        }
      } else {
        if (t.startsWith(op)) {
          const value = t.slice(op.length).trim();
          return { op, value };
        }
      }
    }
    return null;
  }

  onValueInputChange(text: string): void {
    if (!this.edgeDraft) return;
    // Try to parse operator+value when user types into the value input.
    const parsed = this.parseConditionInput(text);
    if (parsed) {
      // parsed may have op like '=', '==', '>=', etc., and value may be empty while typing
      // apply parsed operator and value (value may be empty while typing)
      const prevOp = (this.edgeDraft.op || '').trim();
      const t = (text || '').trim();
      let newOp = prevOp;
      // if parsed.op is a single '=' keep it as '=' for now and only convert to '==' when a value exists or user typed '=='
      if (parsed.op === '=') {
        if (parsed.value && parsed.value.length > 0) {
          newOp = '==';
        } else if (t.startsWith('==')) {
          newOp = '==';
        } else if (prevOp && ['>','<','!'].includes(prevOp) && t.startsWith(prevOp + '=')) {
          newOp = (prevOp === '!') ? '!=' : (prevOp + '=');
        } else {
          // keep previous operator while user is still typing
          newOp = prevOp || '==';
        }
      } else {
        const allowed = ['==','!=','>','>=','<','<=','in','contains'];
        if (allowed.includes(parsed.op)) newOp = parsed.op;
      }
      this.edgeDraft.op = newOp;
      this.edgeDraft.value = parsed.value;
      this.edgeDraftParseError = null;
    } else {
      // no operator at start: treat as plain value
      this.edgeDraft.value = text;
      this.edgeDraftParseError = null;
    }
  }

  confirmEdgeDraft(): void {
    if (!this.edgeDraft) return;
    // basic parse/validation: ensure we have at least a value (operator may be 'in' or '==' etc.)
    const cond = { variable: this.edgeDraft.parentVar || '', op: this.edgeDraft.op || '', value: this.edgeDraft.value || '' };
    // if there's a parse error, prevent confirmation
    if (this.edgeDraftParseError) {
      return;
    }

    // check for semantic conflicts with existing edges from same source
    const conflicts: EdgeModel[] = [];
    for (const e of this.edges) {
      if (e.source !== this.edgeDraft.source) continue;
      if (e.condition && this.conditionsConflict(e.condition, cond)) {
        conflicts.push(e);
      }
    }
    if (conflicts.length) {
      this.conflictingEdges = conflicts;
      this.conflictModalVisible = true;
      return;
    }

    // prevent duplicate edges (same source->target) and cycles for non-leaf edges
    const srcCheck = this.edgeDraft.source;
    const tgtCheck = this.edgeDraft.target;
    if (!this.edgeDraft.isLeaf) {
      if (this.edgeExists(srcCheck, tgtCheck)) {
        // silently abort — UI prevents temp edge creation earlier
        return;
      }
      if (this.wouldCreateCycle(srcCheck, tgtCheck)) {
        // silently abort
        return;
      }
    }

    // remove temporary visual edge and add permanent one
    const id = 'e' + Date.now();
    const labelParts = [] as string[];
    if (this.edgeDraft.parentVar) labelParts.push(this.edgeDraft.parentVar);
    if (this.edgeDraft.op) labelParts.push(this.edgeDraft.op);
    if (this.edgeDraft.value) labelParts.push(this.edgeDraft.value);
    const label = labelParts.join(' ');

    if (this.edgeDraft.isLeaf) {
      // create a permanent leaf node at the temporary node's position (if any)
      let leafPos = this.edgeDraft.leafPosition;
      if (!leafPos && this.currentTempNodeId) {
        try {
          const tmpEl = this.cy.getElementById(this.currentTempNodeId);
          const p = tmpEl.position();
          leafPos = { x: p.x, y: p.y };
        } catch (e) { /* ignore */ }
      }
      const leafId = 'leaf' + Date.now();
      const leafLabel = (this.edgeDraft.output || '').toString() || 'output';
      const node: NodeModel = { id: leafId, label: leafLabel, type: 'leaf' };
      (node as any).position = leafPos || undefined;
      this.nodes.push(node);
      try {
        const added = this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label, type: node.type }, position: (node as any).position || undefined });
        try { added.addClass('new-look-state-node'); added.addClass('leaf-node'); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }

      // remove temp visuals and then create permanent edge to the leaf node
      this.removeCurrentTempEdge();
      const edge: EdgeModel = { id, source: this.edgeDraft.source, target: leafId, label, condition: cond, output: this.edgeDraft.output };
      this.edges.push(edge);
      try { this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } }); } catch (e) { /* ignore */ }
    } else {
      // normal edge to existing node
      this.removeCurrentTempEdge();
      const edge: EdgeModel = { id, source: this.edgeDraft.source, target: this.edgeDraft.target, label, condition: cond };
      this.edges.push(edge);
      try { this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } }); } catch (e) { /* ignore */ }
    }
    this.edgeDraft = null;
    this.connectSource = '';
    this.connectTarget = '';
    try { this.cy.layout({ name: 'dagre' }).run(); } catch (e) { /* ignore if dagre not present */ }
  }

  cancelEdgeDraft(): void {
    // remove temporary visual edge if present
    this.removeCurrentTempEdge();
    this.edgeDraft = null;
    this.connectTarget = '';
    // keep source selected so user can start again or clear
    try { this.cy.elements().unselect(); } catch (e) { try { this.cy.nodes().forEach((n: any) => n.removeClass('selected')); } catch (ee) { /* ignore */ } }
    if (this.connectSource) {
      const s = this.cy.getElementById(this.connectSource);
      try { if (s) { try { if (s.select) s.select(); } catch (e) { } try { s.addClass && s.addClass('selected'); } catch (ee) { } } } catch (e) { /* ignore */ }
      this.selectedNode = this.nodes.find(n => n.id === this.connectSource) || null;
    } else {
      this.selectedNode = null;
    }
  }

  // Determine if two conditions conflict/overlap. Basic rules implemented for common ops.
  conditionsConflict(a: { variable?: string; op?: string; value?: string } | undefined, b: { variable: string; op: string; value: string }): boolean {
    if (!a) return false;
    if (!a.variable || !b.variable) return false;
    if (a.variable !== b.variable) return false;

    const opA = (a.op || '').trim();
    const opB = (b.op || '').trim();
    const valA = (a.value || '').trim();
    const valB = (b.value || '').trim();

    // if exact same op and value -> conflict
    if (opA === opB && valA === valB) return true;

    // helper: represent intervals with inclusive flags
    type Interval = { lo: number; hi: number; loInc: boolean; hiInc: boolean };

    const toIntervals = (op: string, vStr: string): Interval[] => {
      // if value is a number, parse; otherwise return a wildcard interval for non-numeric comparisons
      const vNum = Number(vStr);
      const isNum = !isNaN(vNum);
      switch (op) {
        case '==':
          if (isNum) return [{ lo: vNum, hi: vNum, loInc: true, hiInc: true }];
          // non-numeric equality treat as single-point via NaN marker: we'll fallback to string compare later
          return [];
        case '!=':
          if (isNum) return [ { lo: Number.NEGATIVE_INFINITY, hi: vNum, loInc: false, hiInc: false }, { lo: vNum, hi: Number.POSITIVE_INFINITY, loInc: false, hiInc: false } ];
          return [];
        case '>':
          if (isNum) return [{ lo: vNum, hi: Number.POSITIVE_INFINITY, loInc: false, hiInc: false }];
          return [];
        case '>=':
          if (isNum) return [{ lo: vNum, hi: Number.POSITIVE_INFINITY, loInc: true, hiInc: false }];
          return [];
        case '<':
          if (isNum) return [{ lo: Number.NEGATIVE_INFINITY, hi: vNum, loInc: false, hiInc: false }];
          return [];
        case '<=':
          if (isNum) return [{ lo: Number.NEGATIVE_INFINITY, hi: vNum, loInc: false, hiInc: true }];
          return [];
        case 'in':
          // comma separated values; for numeric items return point intervals
          return vStr.split(',').map(s => s.trim()).map(item => {
            const n = Number(item);
            if (!isNaN(n)) return { lo: n, hi: n, loInc: true, hiInc: true } as Interval;
            // non-numeric: empty interval set; we'll compare strings separately
            return null as any;
          }).filter(Boolean);
        default:
          return [];
      }
    };

    const intervalsA = toIntervals(opA, valA);
    const intervalsB = toIntervals(opB, valB);

    // If both produced numeric intervals, check overlap precisely
    if (intervalsA.length && intervalsB.length) {
      const overlap = (i1: Interval, i2: Interval) => {
        if (i1.lo < i2.hi && i2.lo < i1.hi) return true;
        // handle edge-touching equality with inclusivity
        if (i1.hi === i2.lo) return i1.hiInc && i2.loInc;
        if (i2.hi === i1.lo) return i2.hiInc && i1.loInc;
        return false;
      };
      for (const ia of intervalsA) for (const ib of intervalsB) if (overlap(ia, ib)) return true;
      return false; // numeric intervals do not overlap -> no conflict
    }

    // handle 'in' or string equality cases: check textual overlap
    if (opA === 'in' || opB === 'in' || opA === '==' || opB === '==') {
      const listA = opA === 'in' ? valA.split(',').map(s => s.trim()) : [valA];
      const listB = opB === 'in' ? valB.split(',').map(s => s.trim()) : [valB];
      for (const x of listA) for (const y of listB) if (x && y && x === y) return true;
      return false;
    }

    // For any other combinations (including '!=' with non-numeric), be conservative but try to detect obvious disjoint cases
    // Example: a <= 18 vs > 18 -> we already handled numeric intervals above and returned false for non-overlap.
    // If we reach here, we cannot prove non-overlap; treat as conflict to be safe.
    return true;
  }

  // Check for duplicate directed edge (same source and target)
  private edgeExists(source: string, target: string): boolean {
    return this.edges.some(e => e.source === source && e.target === target);
  }

  // Determine if adding an edge source -> target would create a cycle in the graph
  private wouldCreateCycle(source: string, target: string): boolean {
    if (!source || !target) return false;
    if (source === target) return true;
    // build adjacency map from current edges
    const adj = new Map<string, string[]>();
    for (const e of this.edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    // include the new edge
    if (!adj.has(source)) adj.set(source, []);
    adj.get(source)!.push(target);

    // DFS from target to see if we can reach source
    const visited = new Set<string>();
    const stack: string[] = [target];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === source) return true;
      if (visited.has(n)) continue;
      visited.add(n);
      const outs = adj.get(n) || [];
      for (const o of outs) {
        if (!visited.has(o)) stack.push(o);
      }
    }
    return false;
  }

  // Replace conflicting edges (called by modal Replace action) and then finalize current draft
  replaceConflictsAndConfirm(): void {
    if (!this.edgeDraft) return;
    // remove conflicting edges
    for (const ce of this.conflictingEdges) {
      this.edges = this.edges.filter(e => e.id !== ce.id);
      try { const el = this.cy.getElementById(ce.id); if (el) this.cy.remove(el); } catch (e) { /* ignore */ }
    }
    this.conflictingEdges = [];
    this.conflictModalVisible = false;
    // before creating the edge, ensure we won't create duplicate edges or cycles (for non-leaf)
    const srcCheck = this.edgeDraft.source;
    const tgtCheck = this.edgeDraft.target;
    if (!this.edgeDraft.isLeaf) {
      if (this.edgeExists(srcCheck, tgtCheck)) {
        // silently abort replace/confirm — UI prevents these cases earlier
        this.conflictingEdges = [];
        this.conflictModalVisible = false;
        return;
      }
      if (this.wouldCreateCycle(srcCheck, tgtCheck)) {
        this.conflictingEdges = [];
        this.conflictModalVisible = false;
        return;
      }
    }

    // proceed to create the edge now that conflicts are removed
    const id = 'e' + Date.now();
    const labelParts = [];
    if (this.edgeDraft.parentVar) labelParts.push(this.edgeDraft.parentVar);
    if (this.edgeDraft.op) labelParts.push(this.edgeDraft.op);
    if (this.edgeDraft.value) labelParts.push(this.edgeDraft.value);
    const label = labelParts.join(' ');
    const cond = { variable: this.edgeDraft.parentVar || '', op: this.edgeDraft.op || '', value: this.edgeDraft.value || '' };
    if (this.edgeDraft.isLeaf) {
      let leafPos = this.edgeDraft.leafPosition;
      if (!leafPos && this.currentTempNodeId) {
        try { const tmpEl = this.cy.getElementById(this.currentTempNodeId); const p = tmpEl.position(); leafPos = { x: p.x, y: p.y }; } catch (e) { /* ignore */ }
      }
      const leafId = 'leaf' + Date.now();
      const leafLabel = (this.edgeDraft.output || '').toString() || 'output';
      const node: NodeModel = { id: leafId, label: leafLabel, type: 'leaf' };
      (node as any).position = leafPos || undefined;
      this.nodes.push(node);
      try {
        const added = this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label, type: node.type }, position: (node as any).position || undefined });
        try { added.addClass('new-look-state-node'); added.addClass('leaf-node'); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
      // remove temp visuals then add edge
      this.removeCurrentTempEdge();
      const edge: EdgeModel = { id, source: this.edgeDraft.source, target: leafId, label, condition: cond, output: this.edgeDraft.output };
      this.edges.push(edge);
      try { this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } }); } catch (e) { /* ignore */ }
    } else {
      // remove temp edge
      this.removeCurrentTempEdge();
      const edge: EdgeModel = { id, source: this.edgeDraft.source, target: this.edgeDraft.target, label, condition: cond };
      this.edges.push(edge);
      try { this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } }); } catch (e) { /* ignore */ }
    }
    this.edgeDraft = null;
    this.connectSource = '';
    this.connectTarget = '';
    try { this.cy.layout({ name: 'dagre' }).run(); } catch (e) { /* ignore */ }
  }

  cancelConflictModal(): void {
    this.conflictingEdges = [];
    this.conflictModalVisible = false;
  }

  getDragLineStart(): { x: number; y: number } {
    if (!this.isEdgeDragging || !this.dragSourceId) return { x: 0, y: 0 };
    try {
      const n = this.cy.getElementById(this.dragSourceId);
      if (n && n.length) {
        const p = n.renderedPosition();
        return { x: p.x, y: p.y };
      }
    } catch (e) { /* ignore */ }
    return { x: 0, y: 0 };
  }

  // Inline editing helpers for leaf nodes (edit label/output directly on canvas)
  startInlineEdit(nodeId: string): void {
    // prevent multiple editors
    this.hideInlineEditor();
    let nodeEl: any;
    try { nodeEl = this.cy.getElementById(nodeId); } catch (e) { return; }
    if (!nodeEl || !nodeEl.length) return;
    const p = nodeEl.renderedPosition();
    const containerRect = this.cyContainer.nativeElement.getBoundingClientRect();
    const absX = containerRect.left + (p.x || 0);
    const absY = containerRect.top + (p.y || 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = (nodeEl.data('label') || '').toString();
    input.style.position = 'absolute';
    input.style.left = Math.max(0, (p.x - 28)) + 'px';
    input.style.top = Math.max(0, (p.y - 12)) + 'px';
    input.style.transform = 'translate(0, 0)';
    input.style.zIndex = '2000';
    input.style.minWidth = '48px';
    input.style.padding = '4px 6px';
    input.style.border = '1px solid rgba(0,0,0,0.2)';
    input.style.borderRadius = '4px';
    input.style.fontSize = '13px';
    input.style.background = 'white';
    // position inside the cy container
    this.cyContainer.nativeElement.appendChild(input);
    this._inlineEditorEl = input;
    // focus
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* ignore */ } }, 0);

    const commit = () => {
      const v = input.value;
      this.zone.run(() => this.commitInlineEdit(nodeId, v));
      this.hideInlineEditor();
    };
    const cancel = () => { this.hideInlineEditor(); };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', () => { commit(); });
  }

  hideInlineEditor(): void {
    if (this._inlineEditorEl) {
      try { if (this._inlineEditorEl.parentNode) this._inlineEditorEl.parentNode.removeChild(this._inlineEditorEl); } catch (e) { /* ignore */ }
      this._inlineEditorEl = null;
    }
  }

  commitInlineEdit(nodeId: string, value: string): void {
    // update model node label
    const n = this.nodes.find(x => x.id === nodeId);
    if (n) { n.label = value; }
    try { const el = this.cy.getElementById(nodeId); if (el) el.data('label', value); } catch (e) { /* ignore */ }
    // propagate to edge.output for any incoming edges
    for (const e of this.edges) {
      if (e.target === nodeId) {
        e.output = value;
      }
    }
  }

  // Tooltip helpers
  private ensureTooltip(): HTMLDivElement {
    if (this._tooltipEl) return this._tooltipEl;
    const t = document.createElement('div');
    t.style.position = 'absolute';
    t.style.pointerEvents = 'none';
    t.style.zIndex = '3000';
    t.style.padding = '6px 8px';
    t.style.background = 'rgba(255,255,255,0.95)';
    t.style.color = '#111';
    t.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    t.style.fontSize = '12px';
    t.style.borderRadius = '4px';
    t.style.maxWidth = '240px';
    t.style.whiteSpace = 'nowrap';
    t.style.overflow = 'hidden';
    t.style.textOverflow = 'ellipsis';
    t.style.display = 'none';
    this.cyContainer.nativeElement.appendChild(t);
    this._tooltipEl = t;
    return t;
  }

  showTooltip(text: string, x: number, y: number): void {
    const t = this.ensureTooltip();
    t.textContent = text;
    t.style.display = 'block';
    this.moveTooltip(x, y);
  }

  moveTooltip(x: number, y: number): void {
    if (!this._tooltipEl) return;
    // position relative to cy container
    const rect = this.cyContainer.nativeElement.getBoundingClientRect();
    const left = Math.max(6, x + 12);
    const top = Math.max(6, y - 18);
    this._tooltipEl.style.left = left + 'px';
    this._tooltipEl.style.top = top + 'px';
  }

  hideTooltip(): void {
    if (!this._tooltipEl) return;
    this._tooltipEl.style.display = 'none';
  }

  // Search modal helpers (canvas-click created node)
  focusSearchInput(): void {
    try {
      const el = document.getElementById('search-input') as HTMLInputElement | null;
      if (el) { el.focus(); el.select(); }
    } catch (e) { /* ignore */ }
  }

  startModalDrag(ev: MouseEvent): void {
    try {
      // do not start dragging when the user clicks on interactive elements
      const tgt = ev.target as HTMLElement | null;
      if (tgt) {
        const tag = (tgt.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
        // avoid starting drag when clicking suggestion list items or inside lists/buttons
        if (tgt.closest && (tgt.closest('li') || tgt.closest('ul') || tgt.closest('button') || tgt.closest('.modal-overlay'))) return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      this._isModalDragging = true;
      // ensure anchored placement while dragging
      this.searchModalPlacement = 'anchor';
      // compute offset between mouse and modal top-left (convert to viewport)
      const rect = this.cyContainer && this.cyContainer.nativeElement ? this.cyContainer.nativeElement.getBoundingClientRect() : { left: 0, top: 0 } as any;
      const clientX = ev.clientX;
      const clientY = ev.clientY;
      const modalLeftViewport = rect.left + (this.searchModalPos && this.searchModalPos.x ? this.searchModalPos.x : 0);
      const modalTopViewport = rect.top + (this.searchModalPos && this.searchModalPos.y ? this.searchModalPos.y : 0);
      this._modalDragOffset.x = clientX - modalLeftViewport;
      this._modalDragOffset.y = clientY - modalTopViewport;
      // install global handlers
      this._modalMoveHandler = (m: MouseEvent) => this._onModalMouseMove(m);
      this._modalUpHandler = (u: MouseEvent) => this._onModalMouseUp(u);
      window.addEventListener('mousemove', this._modalMoveHandler);
      window.addEventListener('mouseup', this._modalUpHandler);
    } catch (e) { /* ignore */ }
  }

  private _onModalMouseMove(ev: MouseEvent): void {
    if (!this._isModalDragging) return;
    try {
      const rect = this.cyContainer.nativeElement.getBoundingClientRect();
      const x = ev.clientX - rect.left - this._modalDragOffset.x;
      const y = ev.clientY - rect.top - this._modalDragOffset.y;
      this.searchModalPos = { x: Math.max(8, x), y: Math.max(8, y) };
    } catch (e) { /* ignore */ }
  }

  private _onModalMouseUp(ev: MouseEvent): void {
    try {
      this._isModalDragging = false;
      if (this._modalMoveHandler) { window.removeEventListener('mousemove', this._modalMoveHandler); this._modalMoveHandler = null; }
      if (this._modalUpHandler) { window.removeEventListener('mouseup', this._modalUpHandler); this._modalUpHandler = null; }
    } catch (e) { /* ignore */ }
  }

  // return filtered available variables based on current query
  get filteredVariables(): string[] {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) return this.availableVariables.slice();
    return this.availableVariables.filter(v => v.toLowerCase().includes(q));
  }

  onSearchQueryChange(q: string): void {
    this.searchQuery = q;
    this.searchError = null;
  }

  selectVariable(name: string): void {
    this.searchQuery = name;
    this.searchError = null;
    // immediately confirm when user clicks a suggestion
    setTimeout(() => this.confirmSearchModal(), 0);
  }

  confirmSearchModal(): void {
    if (!this.searchModalNodeId) { this.closeSearchModal(true); return; }
    const name = (this.searchQuery || '').trim();
    if (!name) {
      this.searchError = 'Please pick a variable name';
      return;
    }
    // only allow variables that exist in availableVariables (case-insensitive)
    const found = this.availableVariables.find(v => v.toLowerCase() === name.toLowerCase());
    if (!found) {
      this.searchError = 'No matching variable. Please choose from suggestions.';
      return;
    }
    // update model and cy element
    const n = this.nodes.find(x => x.id === this.searchModalNodeId!);
    if (n) {
      n.label = found;
      try { const el = this.cy.getElementById(n.id); if (el) el.data('label', n.label); } catch (e) { /* ignore */ }
    }
    this.searchModalVisible = false;
    this.searchModalNodeId = null;
    this.searchQuery = '';
    this.searchError = null;
  }

  get isSearchExactMatch(): boolean {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) return false;
    return this.availableVariables.some(v => v.toLowerCase() === q);
  }

  // return style object for modal placement
  getSearchModalStyle(): any {
    const base: any = { position: 'fixed', zIndex: 180, width: '420px', borderRadius: '4px' };
    try {
      if (this.searchModalPlacement === 'center') {
        base.left = '50%';
        base.top = '160px';
        base.transform = 'translateX(-50%)';
        return base;
      }
      // anchor near click position (convert cy coordinates to viewport)
      const rect = this.cyContainer && this.cyContainer.nativeElement ? this.cyContainer.nativeElement.getBoundingClientRect() : null;
      if (!rect) {
        base.left = '50%'; base.top = '160px'; base.transform = 'translateX(-50%)';
        return base;
      }
      const left = rect.left + (this.searchModalPos && this.searchModalPos.x ? this.searchModalPos.x : 0);
      const top = rect.top + (this.searchModalPos && this.searchModalPos.y ? this.searchModalPos.y : 0) + 12;
      base.left = left + 'px';
      base.top = top + 'px';
      base.transform = 'translate(0, 0)';
      base.width = '320px';
      return base;
    } catch (e) {
      base.left = '50%'; base.top = '160px'; base.transform = 'translateX(-50%)';
      return base;
    }
  }

  closeSearchModal(cancel = true): void {
    if (cancel && this.searchModalNodeId) {
      // remove the created node if user cancelled
      const id = this.searchModalNodeId;
      this.nodes = this.nodes.filter(n => n.id !== id);
      this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
      try { const el = this.cy.getElementById(id); if (el) this.cy.remove(el); } catch (e) { /* ignore */ }
      this.clearSelection();
    }
    this.searchModalVisible = false;
    this.searchModalNodeId = null;
    this.searchQuery = '';
  }

  // Resizer handlers for adjusting right pane width
  startResizerDrag(ev: MouseEvent): void {
    try {
      ev.preventDefault();
      ev.stopPropagation();
      this._isResizerDragging = true;
      this._resizerMoveHandler = (m: MouseEvent) => this._onResizerMove(m);
      this._resizerUpHandler = (u: MouseEvent) => this._onResizerUp(u);
      window.addEventListener('mousemove', this._resizerMoveHandler);
      window.addEventListener('mouseup', this._resizerUpHandler);
    } catch (e) { /* ignore */ }
  }

  private _onResizerMove(ev: MouseEvent): void {
    if (!this._isResizerDragging) return;
    try {
      // compute using the overall container element so dragging is consistent
      const containerEl = (this.cyContainer && this.cyContainer.nativeElement && this.cyContainer.nativeElement.closest) ? this.cyContainer.nativeElement.closest('.container') as HTMLElement : null;
      const containerRect = containerEl ? containerEl.getBoundingClientRect() : document.documentElement.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const leftWidth = Math.max(0, ev.clientX - containerRect.left);
      const resizerW = 8; // matches the resizer width in template
      const newWidth = Math.max(220, Math.min(720, Math.round(containerWidth - leftWidth - resizerW)));
      // ensure change detection runs while dragging
      this.zone.run(() => { this.rightPaneWidth = newWidth; });
      // also apply directly to DOM to ensure immediate visual update if styles override binding
      try {
        const rp = document.querySelector('.right-pane') as HTMLElement | null;
        if (rp) { rp.style.boxSizing = 'border-box'; rp.style.width = newWidth + 'px'; }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }

  private _onResizerUp(ev: MouseEvent): void {
    try {
      this._isResizerDragging = false;
      if (this._resizerMoveHandler) { window.removeEventListener('mousemove', this._resizerMoveHandler); this._resizerMoveHandler = null; }
      if (this._resizerUpHandler) { window.removeEventListener('mouseup', this._resizerUpHandler); this._resizerUpHandler = null; }
    } catch (e) { /* ignore */ }
  }

  // Metadata resizer: start drag to adjust metadata panel height
  startMetaResizerDrag(ev: MouseEvent): void {
    try {
      ev.preventDefault(); ev.stopPropagation();
      this._isMetaResizerDragging = true;
      // record starting mouse Y and starting metadata height for delta-based resizing
      this._metaStartY = ev.clientY;
      this._metaStartHeight = this.metadataHeight || 0;
      this._metaResizerMoveHandler = (m: MouseEvent) => this._onMetaResizerMove(m);
      this._metaResizerUpHandler = (u: MouseEvent) => this._onMetaResizerUp(u);
      window.addEventListener('mousemove', this._metaResizerMoveHandler);
      window.addEventListener('mouseup', this._metaResizerUpHandler);
    } catch (e) { /* ignore */ }
  }

  private _onMetaResizerMove(ev: MouseEvent): void {
    if (!this._isMetaResizerDragging) return;
    try {
      if (this._metaStartY == null) return;
      // delta: positive when moving pointer down; we want metadataHeight to decrease when moving down
      const delta = this._metaStartY - ev.clientY;
      let newH = Math.round(this._metaStartHeight + delta);
      // compute bounds using left-pane height
      const leftPane = this.cyContainer && this.cyContainer.nativeElement ? (this.cyContainer.nativeElement.closest('.left-pane') as HTMLElement) : null;
      const paneHeight = leftPane ? leftPane.getBoundingClientRect().height : window.innerHeight;
      const minH = 60;
      const maxH = Math.max(120, paneHeight - 80);
      newH = Math.max(minH, Math.min(newH, maxH));
      this.zone.run(() => { this.metadataHeight = newH; });
      // ensure Cytoscape updates its internal canvases to match the resized container
      try {
        if (this.cy && typeof this.cy.resize === 'function') {
          // schedule on next frame for smoother updates
          requestAnimationFrame(() => { try { this.cy.resize(); } catch (e) { /* ignore */ } });
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  }

  private _onMetaResizerUp(ev: MouseEvent): void {
    try {
      this._isMetaResizerDragging = false;
      if (this._metaResizerMoveHandler) { window.removeEventListener('mousemove', this._metaResizerMoveHandler); this._metaResizerMoveHandler = null; }
      if (this._metaResizerUpHandler) { window.removeEventListener('mouseup', this._metaResizerUpHandler); this._metaResizerUpHandler = null; }
    } catch (e) { /* ignore */ }
  }

  updateSelectedNode(): void {
    if (!this.selectedNode) return;
    const el = this.cy.getElementById(this.selectedNode.id);
    if (el) { el.data('label', this.selectedNode.label); }
    // if this is a leaf node, propagate the changed label to any connected edge.output
    if (this.selectedNode.type === 'leaf') {
      for (const e of this.edges) {
        if (e.target === this.selectedNode!.id) {
          e.output = this.selectedNode.label;
        }
      }
    }
  }

  connectNodes(): void {
    if (!this.connectSource || !this.connectTarget || this.connectSource === this.connectTarget) return;
    // prevent duplicate edges and cycles — abort silently
    if (this.edgeExists(this.connectSource, this.connectTarget)) return;
    if (this.wouldCreateCycle(this.connectSource, this.connectTarget)) return;
    const id = 'e' + Date.now();
    const edge: EdgeModel = { id, source: this.connectSource, target: this.connectTarget, label: this.edgeLabel };
    this.edges.push(edge);
    this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } });
    this.edgeLabel = '';
    // run layout to place edges nicely
    try { this.cy.layout({ name: 'dagre' }).run(); } catch (e) { /* ignore if dagre not present */ }
  }

  deleteSelected(): void {
    console.log('[GraphEditor] deleteSelected() called. model selectedNode=', this.selectedNode ? this.selectedNode.id : null, 'selectedEdge=', this.selectedEdge ? this.selectedEdge.id : null);
    // if an edge is selected, remove it
    if (this.selectedEdge) {
      const eid = this.selectedEdge.id;
      this.edges = this.edges.filter(e => e.id !== eid);
      try { const el = this.cy.getElementById(eid); if (el) this.cy.remove(el); } catch (e) { /* ignore */ }
      this.selectedEdge = null;
      console.log('[GraphEditor] deleteSelected() removed edge', eid);
      return;
    }
    // otherwise remove selected node and connected edges
    if (!this.selectedNode) return;
    const id = this.selectedNode.id;
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
    const el = this.cy.getElementById(id);
    if (el) { this.cy.remove(el); }
    // remove connected edges
    try { const connected = this.cy.edges().filter((ed: any) => ed.data('source') === id || ed.data('target') === id); this.cy.remove(connected); } catch (e) { /* ignore */ }
    this.clearSelection();
  }

  // Delete all currently-selected elements (nodes and edges).
  // This handles multi-selection created by box-select or manual multi-select.
  deleteSelectedMultiple(): void {
    console.log('[GraphEditor] deleteSelectedMultiple() called');
    try {
      if (!this.cy) return;
      // prefer Cytoscape ':selected' but fall back to the legacy '.selected' class
      let sels: any = null;
      try {
        const s1 = this.cy.elements(':selected');
        const s2 = this.cy.elements('.selected');
        // union if available
        if (s1 && typeof s1.union === 'function') sels = s1.union(s2);
        else {
          // build a simple collection by ids
          const ids = new Set<string>();
          try { s1 && s1.forEach((e: any) => ids.add(e.id())); } catch (e) { /* ignore */ }
          try { s2 && s2.forEach((e: any) => ids.add(e.id())); } catch (e) { /* ignore */ }
          const arr: any[] = [];
          ids.forEach(id => { try { const el = this.cy.getElementById(id); if (el) arr.push(el); } catch (e) {} });
          sels = this.cy.collection ? this.cy.collection(arr) : arr;
        }
      } catch (e) {
        try { sels = this.cy.elements('.selected'); } catch (ee) { sels = null; }
      }
      if (!sels || !sels.length) return;

      // collect ids to remove
      const nodeIdsToRemove: Set<string> = new Set();
      const edgeIdsToRemove: Set<string> = new Set();

      sels.forEach((el: any) => {
        try {
          if (el.group && el.group() === 'nodes') nodeIdsToRemove.add(el.id());
          else if (el.group && el.group() === 'edges') edgeIdsToRemove.add(el.id());
        } catch (e) { /* ignore per element */ }
      });

      // remove edges connected to nodes-to-remove as well
      if (nodeIdsToRemove.size) {
        this.edges = this.edges.filter(e => !(nodeIdsToRemove.has(e.source) || nodeIdsToRemove.has(e.target) || edgeIdsToRemove.has(e.id)));
      } else {
        this.edges = this.edges.filter(e => !edgeIdsToRemove.has(e.id));
      }

      // remove nodes from model
      if (nodeIdsToRemove.size) {
        this.nodes = this.nodes.filter(n => !nodeIdsToRemove.has(n.id));
      }

      // remove from Cytoscape by calling `.remove()` on each element directly (edges first)
      try {
        if (edgeIdsToRemove.size) {
          edgeIdsToRemove.forEach(id => {
            try {
              const el = this.cy.getElementById(id);
              if (el && typeof el.remove === 'function') {
                el.remove();
                console.log('[GraphEditor] removed cy edge', id);
              }
            } catch (e) { /* ignore per edge */ }
          });
        }
        if (nodeIdsToRemove.size) {
          nodeIdsToRemove.forEach(id => {
            try {
              const el = this.cy.getElementById(id);
              if (el && typeof el.remove === 'function') {
                el.remove();
                console.log('[GraphEditor] removed cy node', id);
              }
            } catch (e) { /* ignore per node */ }
          });
        }
        // ensure Cytoscape selection state is cleared
        try { if (this.cy && typeof this.cy.elements === 'function') this.cy.elements().unselect(); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }

      // clear selection vars
      this.selectedNode = null;
      this.selectedEdge = null;
      this.clearSelection();
      console.log('[GraphEditor] deleteSelectedMultiple() finished. nodesRemaining=', this.nodes.length, 'edgesRemaining=', this.edges.length);
    } catch (e) { /* ignore */ }
  }

  exportJSON(): string {
    const model = { nodes: this.nodes, edges: this.edges };
    return JSON.stringify(model, null, 2);
  }

  exportDOT(): string {
    let out = 'digraph policy {\n';
    for (const n of this.nodes) {
      const attrs = [`label=\"${this.escape(n.label)}\"`, `type=\"${n.type || ''}\"`];
      out += `  ${n.id} [${attrs.join(', ')}];\n`;
    }
    for (const e of this.edges) {
      const lbl = e.label ? `[label=\"${this.escape(e.label)}\"]` : '';
      out += `  ${e.source} -> ${e.target} ${lbl};\n`;
    }
    out += '}\n';
    return out;
  }

  // Validate that every non-leaf node has at least one path to a leaf node.
  // Returns array of node ids that do NOT reach any leaf.
  validateGraphForExport(): string[] {
    // build adjacency map
    const adj = new Map<string, string[]>();
    for (const n of this.nodes) adj.set(n.id, []);
    for (const e of this.edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }

    // helper to check if from node we can reach any leaf
    const isLeaf = (id: string) => {
      const node = this.nodes.find(x => x.id === id);
      return node && node.type === 'leaf';
    };

    const memo = new Map<string, boolean>();
    const canReachLeaf = (start: string): boolean => {
      if (memo.has(start)) return memo.get(start)!;
      const visited = new Set<string>();
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (isLeaf(cur)) { memo.set(start, true); return true; }
        const outs = adj.get(cur) || [];
        for (const o of outs) {
          if (!visited.has(o)) stack.push(o);
        }
      }
      memo.set(start, false);
      return false;
    };

    const bad: string[] = [];
    for (const n of this.nodes) {
      if (n.type === 'leaf') continue;
      // if node has no outgoing edges, it's invalid
      const outs = adj.get(n.id) || [];
      if (!outs.length) { bad.push(n.id); continue; }
      if (!canReachLeaf(n.id)) bad.push(n.id);
    }
    return bad;
  }

  private highlightExportInvalidNodes(ids: string[]): void {
    try {
      this.clearExportInvalidHighlights();
      for (const id of ids) {
        const el = this.cy.getElementById(id);
        if (el) el.addClass('needs-fix');
      }
    } catch (e) { /* ignore */ }
  }

  private clearExportInvalidHighlights(): void {
    try {
      this.cy.nodes().forEach((n: any) => n.removeClass('needs-fix'));
    } catch (e) { /* ignore */ }
  }

  requestExportJSON(): void {
    const bad = this.validateGraphForExport();
    if (bad.length) {
      this.exportInvalidNodes = bad;
      this.highlightExportInvalidNodes(bad);
      this.exportInvalidModalVisible = true;
      return;
    }
    this.download('policy.json', this.exportJSON());
  }

  requestExportDOT(): void {
    const bad = this.validateGraphForExport();
    if (bad.length) {
      this.exportInvalidNodes = bad;
      this.highlightExportInvalidNodes(bad);
      this.exportInvalidModalVisible = true;
      return;
    }
    // Require exactly one root node for DOT export (single entry point)
    try {
      const incoming = new Map<string, number>();
      for (const n of this.nodes) incoming.set(n.id, 0);
      for (const e of this.edges) {
        incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
      }
      const roots = Array.from(incoming.entries()).filter(([_, cnt]) => cnt === 0).map(([id]) => id);
      if (roots.length !== 1) {
        this.exportDOTRoots = roots;
        this.highlightExportInvalidNodes(roots);
        this.exportMultipleRootsModalVisible = true;
        return;
      }
    } catch (e) { /* ignore and proceed if something goes wrong */ }
    this.download('policy.dot', this.exportDOT());
  }

  focusFirstInvalid(): void {
    if (!this.exportInvalidNodes || !this.exportInvalidNodes.length) return;
    const id = this.exportInvalidNodes[0];
    // center viewport on node
    try { const el = this.cy.getElementById(id); if (el) this.cy.center(el); } catch (e) { /* ignore */ }
  }

  focusFirstRoot(): void {
    if (!this.exportDOTRoots || !this.exportDOTRoots.length) return;
    const id = this.exportDOTRoots[0];
    try { const el = this.cy.getElementById(id); if (el) this.cy.center(el); } catch (e) { /* ignore */ }
  }

  closeExportMultipleRootsModal(): void {
    this.exportMultipleRootsModalVisible = false;
    this.exportDOTRoots = [];
    this.clearExportInvalidHighlights();
  }

  closeExportInvalidModal(): void {
    this.exportInvalidModalVisible = false;
    this.exportInvalidNodes = [];
    this.clearExportInvalidHighlights();
  }

  escape(s: string): string { return (s || '').replace(/\\/g, '\\\\').replace(/\"/g, '\\"'); }

  importJSON(text: string): void {
    try {
      const model = JSON.parse(text);
      if (!model.nodes) return;
      this.nodes = model.nodes;
      this.edges = model.edges || [];
      this.reloadGraph();
    } catch (e) {
      alert('Invalid JSON');
    }
  }

  download(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  reloadGraph(): void {
    this.cy.elements().remove();
    for (const n of this.nodes) {
      const el = this.cy.add({ group: 'nodes', data: { id: n.id, label: n.label, type: n.type }, position: (n as any).position || undefined });
      try { el.addClass('new-look-state-node'); if ((n as any).type === 'leaf') el.addClass('leaf-node'); } catch (e) { /* ignore */ }
    }
    for (const e of this.edges) {
      this.cy.add({ group: 'edges', data: { id: e.id, source: e.source, target: e.target, label: e.label } });
    }
    try { this.cy.layout({ name: 'dagre' }).run(); } catch (e) { /* ignore if dagre missing */ }
  }

  // Drag start from variable palette
  onVarDrag(ev: DragEvent, varName: string) {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.setData('text/plain', varName);
  }

  // Handle drop inside cy container
  onDrop(ev: DragEvent) {
    ev.preventDefault();
    if (!ev.dataTransfer) return;
    const varName = ev.dataTransfer.getData('text/plain');
    if (!varName) return;
    const rect = this.cyContainer.nativeElement.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const id = 'n' + (this.nodeCounter++);
    const node: NodeModel = { id, label: varName, type: 'input' };
    (node as any).position = { x, y };
    this.nodes.push(node);
    const el = this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label, type: node.type }, position: { x, y } });
    try { el.addClass('new-look-state-node'); } catch (e) { /* ignore */ }
  }

  onDragOver(ev: DragEvent) { ev.preventDefault(); }

  // Canvas settings helpers
  toggleCanvasSettings(ev: MouseEvent): void {
    ev.stopPropagation();
    this.canvasSettingsVisible = !this.canvasSettingsVisible;
  }

  applyBackground(): void {
    try {
      const el = this.cyContainer && this.cyContainer.nativeElement ? this.cyContainer.nativeElement : null;
      if (!el) return;
      // base color
      el.style.backgroundColor = this.bgColor || '#ffffff';
      // pattern
      if (this.bgPattern === 'plain') {
        el.style.backgroundImage = 'none';
      } else if (this.bgPattern === 'dots') {
        // dotted pattern — slightly larger and closer dots with a bit darker tone
        el.style.backgroundImage = 'radial-gradient(' + (this._mixColor('#cfcfcf', this.bgColor) || '#cfcfcf') + ' 1px, transparent 1px)';
        el.style.backgroundSize = '10px 10px';
        el.style.backgroundRepeat = 'repeat';
      } else if (this.bgPattern === 'grid') {
        // subtle grid
        const line = this._mixColor('#e6e6e6', this.bgColor) || '#e6e6e6';
        el.style.backgroundImage = `linear-gradient(0deg, transparent 23px, ${line} 24px), linear-gradient(90deg, transparent 23px, ${line} 24px)`;
        el.style.backgroundSize = '24px 24px';
        el.style.backgroundRepeat = 'repeat';
      }
    } catch (e) { /* ignore */ }
  }

  applyZoomSensitivity(): void {
    // nothing to set on cytoscape directly since we intercept wheel events; value updated via binding
  }

  // set zoom to explicit level (0.2 - 3). Centers on viewport center for clarity.
  setZoomLevel(val: number): void {
    try {
      this.zoomLevel = Math.max(0.2, Math.min(3, Number(val)));
      const rect = this.cyContainer.nativeElement.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      try { this.cy.zoom({ level: this.zoomLevel, position: { x: centerX, y: centerY } }); } catch (e) { try { this.cy.zoom(this.zoomLevel); } catch (ee) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  }

  // Convert a rendered (pixel) position inside the cy container into model coordinates
  private renderedToModel(pos: { x: number; y: number }): { x: number; y: number } {
    try {
      const pan = (this.cy && typeof this.cy.pan === 'function') ? this.cy.pan() : { x: 0, y: 0 };
      const zoom = (this.cy && typeof this.cy.zoom === 'function') ? this.cy.zoom() : 1;
      const mx = (pos.x - pan.x) / zoom;
      const my = (pos.y - pan.y) / zoom;
      return { x: mx, y: my };
    } catch (e) {
      return { x: pos.x, y: pos.y };
    }
  }

  // custom right-button panning handlers
  private _onCyMouseDown(ev: MouseEvent): void {
    try {
      if (ev.button !== 2) return; // only handle right-button
      ev.preventDefault();
      this._isRightPanning = true;
      this._panLast = { x: ev.clientX, y: ev.clientY };
      this._panMoveHandler = (m: MouseEvent) => {
        try {
          const dx = m.clientX - this._panLast.x;
          const dy = m.clientY - this._panLast.y;
          this.cy.panBy({ x: dx, y: dy });
          this._panLast = { x: m.clientX, y: m.clientY };
        } catch (e) { /* ignore */ }
      };
      this._panUpHandler = (u: MouseEvent) => {
        try { this._isRightPanning = false; if (this._panMoveHandler) { window.removeEventListener('mousemove', this._panMoveHandler); this._panMoveHandler = null; } if (this._panUpHandler) { window.removeEventListener('mouseup', this._panUpHandler); this._panUpHandler = null; } } catch (e) { /* ignore */ }
      };
      window.addEventListener('mousemove', this._panMoveHandler);
      window.addEventListener('mouseup', this._panUpHandler);
    } catch (e) { /* ignore */ }
  }

  // box-select mouse move
  private _onBoxMouseMove(ev: MouseEvent): void {
    try {
      const rect = this.cyContainer.nativeElement.getBoundingClientRect();
      const sx = this._boxStart.x;
      const sy = this._boxStart.y;
      const mx = ev.clientX;
      const my = ev.clientY;
      const dx = Math.abs(mx - sx);
      const dy = Math.abs(my - sy);
      // start showing box only after small threshold to avoid click jitter
      if (!this._isBoxSelecting && (dx > 6 || dy > 6)) {
        this._isBoxSelecting = true;
        // create overlay
        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.pointerEvents = 'none';
        box.style.border = '1px dashed rgba(0,0,0,0.35)';
        box.style.background = 'transparent';
        box.style.zIndex = '1000';
        this.cyContainer.nativeElement.appendChild(box);
        this._boxEl = box;
      }
      if (!this._isBoxSelecting || !this._boxEl) return;
      const left = Math.min(sx, mx) - rect.left;
      const top = Math.min(sy, my) - rect.top;
      const width = Math.abs(mx - sx);
      const height = Math.abs(my - sy);
      this._boxEl.style.left = Math.max(0, left) + 'px';
      this._boxEl.style.top = Math.max(0, top) + 'px';
      this._boxEl.style.width = Math.max(0, width) + 'px';
      this._boxEl.style.height = Math.max(0, height) + 'px';
    } catch (e) { /* ignore */ }
  }

  // box-select mouse up: select nodes inside rectangle
  private _onBoxMouseUp(ev: MouseEvent): void {
    try {
      if (this._boxMoveHandler) { window.removeEventListener('mousemove', this._boxMoveHandler); this._boxMoveHandler = null; }
      if (this._boxUpHandler) { window.removeEventListener('mouseup', this._boxUpHandler); this._boxUpHandler = null; }
      if (!this._isBoxSelecting) {
        this._wasBoxSelecting = false;
        return;
      }
      // compute final rect relative to container
      const rect = this.cyContainer.nativeElement.getBoundingClientRect();
      const sx = this._boxStart.x - rect.left;
      const sy = this._boxStart.y - rect.top;
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;
      const left = Math.min(sx, ex);
      const top = Math.min(sy, ey);
      const right = Math.max(sx, ex);
      const bottom = Math.max(sy, ey);

      // clear previous selection (use cytoscape unselect to clear native selection state)
      try { this.cy.elements().unselect(); } catch (e) { try { this.cy.nodes().forEach((n: any) => n.removeClass('selected')); } catch (ee) { /* ignore */ } }

      const selectedIds: string[] = [];
      const selectedEls: any[] = [];
      try {
        this.cy.nodes().forEach((n: any) => {
          try {
            const p = n.renderedPosition();
            if (p && p.x != null) {
              const x = p.x; const y = p.y;
              if (x >= left && x <= right && y >= top && y <= bottom) {
                selectedIds.push(n.id());
                selectedEls.push(n);
              }
            }
          } catch (e) { /* ignore per node */ }
        });
      } catch (e) { /* ignore */ }

      // select all found elements as a collection so Cytoscape's selection state and styles update together
      try {
        if (selectedEls.length) {
          try {
            const coll = (this.cy && typeof this.cy.collection === 'function') ? this.cy.collection(selectedEls) : null;
            if (coll && typeof coll.select === 'function') {
              coll.select();
            } else {
              // fallback: select individually
              selectedEls.forEach((el: any) => { try { if (el.select) el.select(); else if (el.addClass) el.addClass('selected'); } catch (ee) { /* ignore */ } });
            }
          } catch (e) {
            // best-effort fallback
            selectedEls.forEach((el: any) => { try { if (el.select) el.select(); else if (el.addClass) el.addClass('selected'); } catch (ee) { /* ignore */ } });
          }
        }
      } catch (e) { /* ignore */ }

      // update model-level selection: clear single selection and set last snapshot
      this.selectedNode = null;
      this.selectedEdge = null;
      if (selectedIds.length) {
        try { this.lastSelectionSnapshot = { kind: 'node', data: { id: selectedIds[0], label: this.getNodeLabel(selectedIds[0]) } }; } catch (e) { this.lastSelectionSnapshot = null; }
      }

      // cleanup overlay
      if (this._boxEl && this._boxEl.parentNode) { try { this._boxEl.parentNode.removeChild(this._boxEl); } catch (e) { /* ignore */ } }
      this._boxEl = null;
      this._isBoxSelecting = false;
      this._wasBoxSelecting = true;
    } catch (e) { /* ignore */ }
  }

  private _onWheel(ev: WheelEvent): void {
    try {
      // if user is focusing an input, let it scroll normally
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as any).isContentEditable)) return;
      ev.preventDefault();
      // compute zoom factor; negative deltaY -> zoom in
      const delta = -ev.deltaY; // invert so wheel-up zooms in
      const factor = 1 + (delta * this.zoomSensitivity);
      const cur = this.cy.zoom();
      let next = cur * factor;
      // clamp
      next = Math.max(Math.min(next, 3), 0.2);
      // zoom to pointer position if available
      const rect = this.cyContainer.nativeElement.getBoundingClientRect();
      const centerX = ev.clientX - rect.left;
      const centerY = ev.clientY - rect.top;
      try { this.cy.zoom({ level: next, position: { x: centerX, y: centerY } }); } catch (e) { try { this.cy.zoom(next); } catch (ee) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  }

  // tiny helper to mix two hex colors (returns a hex) - used to tone pattern color against bg
  private _mixColor(fore: string, back: string): string {
    try {
      const f = this._hexToRgb(fore);
      const b = this._hexToRgb(back);
      if (!f || !b) return fore;
      const r = Math.round((f.r + b.r) / 2);
      const g = Math.round((f.g + b.g) / 2);
      const bl = Math.round((f.b + b.b) / 2);
      return `rgb(${r}, ${g}, ${bl})`;
    } catch (e) { return fore; }
  }

  private _hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    try {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const int = parseInt(h, 16);
      return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
    } catch (e) { return null; }
  }
}

// Additional methods added after class to keep patch small (none)
