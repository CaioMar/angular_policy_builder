import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { NodeModel } from '../models/node.model';
import { EdgeModel } from '../models/edge.model';

@Injectable({ providedIn: 'root' })
export class GraphSelectionService {
  private _selectedNode$ = new BehaviorSubject<NodeModel | null>(null);
  private _selectedEdge$ = new BehaviorSubject<EdgeModel | null>(null);
  private _lastSnapshot$ = new BehaviorSubject<{ kind: 'node' | 'edge'; data: any } | null>(null);

  readonly selectedNode$: Observable<NodeModel | null> = this._selectedNode$.asObservable();
  readonly selectedEdge$: Observable<EdgeModel | null> = this._selectedEdge$.asObservable();
  readonly lastSelectionSnapshot$ = this._lastSnapshot$.asObservable();

  selectNode(node: NodeModel | null) {
    this._selectedNode$.next(node);
    if (node) this._lastSnapshot$.next({ kind: 'node', data: { ...node } });
    if (node) this._selectedEdge$.next(null);
  }

  selectEdge(edge: EdgeModel | null) {
    this._selectedEdge$.next(edge);
    if (edge) this._lastSnapshot$.next({ kind: 'edge', data: { ...edge } });
    if (edge) this._selectedNode$.next(null);
  }

  clearSelection() {
    this._selectedNode$.next(null);
    this._selectedEdge$.next(null);
  }
}
