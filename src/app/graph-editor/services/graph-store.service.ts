import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { NodeModel } from '../models/node.model';
import { EdgeModel } from '../models/edge.model';

@Injectable({ providedIn: 'root' })
export class GraphStoreService {
  private _nodes$ = new BehaviorSubject<NodeModel[]>([]);
  private _edges$ = new BehaviorSubject<EdgeModel[]>([]);

  readonly nodes$: Observable<NodeModel[]> = this._nodes$.asObservable();
  readonly edges$: Observable<EdgeModel[]> = this._edges$.asObservable();

  get snapshot() {
    return { nodes: this._nodes$.value.slice(), edges: this._edges$.value.slice() };
  }

  setNodes(nodes: NodeModel[]) { this._nodes$.next(nodes.slice()); }
  setEdges(edges: EdgeModel[]) { this._edges$.next(edges.slice()); }

  addNode(node: NodeModel) { this._nodes$.next([...this._nodes$.value, node]); }
  updateNode(id: string, patch: Partial<NodeModel>) {
    this._nodes$.next(this._nodes$.value.map(n => n.id === id ? { ...n, ...patch } : n));
  }
  removeNode(id: string) {
    this._nodes$.next(this._nodes$.value.filter(n => n.id !== id));
    this._edges$.next(this._edges$.value.filter(e => e.source !== id && e.target !== id));
  }

  addEdge(edge: EdgeModel) { this._edges$.next([...this._edges$.value, edge]); }
  updateEdge(id: string, patch: Partial<EdgeModel>) {
    this._edges$.next(this._edges$.value.map(e => e.id === id ? { ...e, ...patch } : e));
  }
  removeEdge(id: string) { this._edges$.next(this._edges$.value.filter(e => e.id !== id)); }
}
