import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { GraphStoreService } from './graph-store.service';

export interface Point { x: number; y: number }

export interface EdgeDragPreview {
  sourceId: string;
  targetNodeId?: string | null;
  targetPos?: Point | null;
  valid: boolean;
}

export interface EdgeDragCompleted {
  sourceId: string;
  targetNodeId?: string | null;
  targetPos?: Point | null;
  valid: boolean; // whether the drop is allowed (not duplicate / not cyclic)
}

@Injectable({ providedIn: 'root' })
export class EdgeDragService {
  private _preview$ = new Subject<EdgeDragPreview>();
  private _completed$ = new Subject<EdgeDragCompleted>();
  private _cancelled$ = new Subject<void>();

  readonly preview$: Observable<EdgeDragPreview> = this._preview$.asObservable();
  readonly completed$: Observable<EdgeDragCompleted> = this._completed$.asObservable();
  readonly cancelled$: Observable<void> = this._cancelled$.asObservable();

  private _isDragging = false;
  private _sourceId: string | null = null;
  private _sourcePos: Point | null = null;
  private _currentPos: Point | null = null;

  // keep a local snapshot of edges for quick checks
  private _edgesSnapshot: Array<{ source: string; target: string }> = [];

  constructor(private graphStore: GraphStoreService) {
    // subscribe to edges snapshot so we can run validation without DOM
    (this.graphStore.edges$ as BehaviorSubject<any>).subscribe((es: any) => {
      try {
        this._edgesSnapshot = (es || []).map((e: any) => ({ source: e.source, target: e.target }));
      } catch (e) { this._edgesSnapshot = []; }
    });
  }

  startDrag(sourceId: string, sourcePos: Point): void {
    if (!sourceId) return;
    this._isDragging = true;
    this._sourceId = sourceId;
    this._sourcePos = sourcePos || null;
    this._currentPos = sourcePos || null;
    // initial preview with no target
    this._emitPreview(null, this._currentPos);
  }

  updateDrag(pos: Point, targetNodeId?: string | null): void {
    if (!this._isDragging) return;
    this._currentPos = pos || null;
    this._emitPreview(targetNodeId || null, this._currentPos);
  }

  endDrag(targetNodeId?: string | null, pos?: Point | null): void {
    if (!this._isDragging || !this._sourceId) return;
    const tId = targetNodeId || null;
    const valid = this._validateDrop(this._sourceId, tId);
    const payload: EdgeDragCompleted = { sourceId: this._sourceId, targetNodeId: tId, targetPos: pos || this._currentPos || null, valid };
    this._completed$.next(payload);
    this._resetState();
  }

  cancelDrag(): void {
    if (!this._isDragging) return;
    this._cancelled$.next();
    this._resetState();
  }

  private _emitPreview(targetNodeId: string | null, pos: Point | null): void {
    if (!this._sourceId) return;
    const valid = this._validateDrop(this._sourceId, targetNodeId);
    this._preview$.next({ sourceId: this._sourceId, targetNodeId: targetNodeId, targetPos: pos, valid });
  }

  private _validateDrop(source: string, target: string | null): boolean {
    try {
      if (!source) return false;
      // dropping onto empty canvas (null target) is allowed
      if (!target) return true;
      if (source === target) return false;
      // duplicate edge check
      const dup = this._edgesSnapshot.some(e => e.source === source && e.target === target);
      if (dup) return false;
      // cycle check: compute adjacency and search from target to see if source reachable
      const adj = new Map<string, string[]>();
      for (const e of this._edgesSnapshot) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)!.push(e.target);
      }
      if (!adj.has(source)) adj.set(source, []);
      adj.get(source)!.push(target);
      const visited = new Set<string>();
      const stack: string[] = [target];
      while (stack.length) {
        const n = stack.pop()!;
        if (n === source) return false; // would create a cycle -> invalid drop
        if (visited.has(n)) continue;
        visited.add(n);
        const outs = adj.get(n) || [];
        for (const o of outs) if (!visited.has(o)) stack.push(o);
      }
      return true;
    } catch (e) { return false; }
  }

  private _resetState(): void {
    this._isDragging = false;
    this._sourceId = null;
    this._sourcePos = null;
    this._currentPos = null;
  }
}
