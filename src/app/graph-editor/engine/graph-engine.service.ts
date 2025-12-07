import { Injectable } from '@angular/core';
import * as cytoscape from 'cytoscape';
import { NodeModel } from '../models/node.model';
import { EdgeModel } from '../models/edge.model';

@Injectable({ providedIn: 'root' })
export class GraphEngineService {
  private cy: any = null;

  init(container: HTMLElement, opts: any = {}): any {
    if (this.cy) return this.cy;
    const cyFactory = (cytoscape as any) && ((cytoscape as any).default || (cytoscape as any));
    // default style copied from original GraphEditor to keep visual parity during migration
    const defaultOpts = {
      container,
      elements: [],
      style: [
        { selector: 'node', style: { 'shape': 'roundrectangle', 'background-color': '#ffffff', 'label': 'data(label)', 'color': '#16191f', 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': 120, 'width': 160, 'height': 44, 'padding-left': 12, 'padding-right': 12, 'font-size': 15, 'font-weight': 400, 'font-family': '"Amazon Ember", Inter, Roboto, Arial, sans-serif', 'border-width': 1, 'border-radius': 12, 'border-color': 'rgb(104, 112, 120)', 'text-outline-width': 0, 'text-outline-color': '#ffffff' } },
        { selector: 'node[type="leaf"]', style: { 'shape': 'ellipse', 'background-color': 'rgb(255, 249, 204)', 'border-color': 'var(--color-text-form-secondary-btuye6, #687078)', 'border-width': 0.6, 'width': 72, 'height': 72, 'font-size': 14, 'text-wrap': 'ellipsis', 'text-max-width': 56, 'text-valign': 'center', 'text-halign': 'center', 'color': '#16191f' } },
        { selector: '.temp-leaf', style: { 'opacity': 0.65 } },
        { selector: 'node.temp-drag-node', style: { 'opacity': 0, 'width': 1, 'height': 1, 'label': '' } },
        { selector: 'node:selected', style: { 'background-color': '#f1faff', 'border-color': '#0073bb', 'border-width': 1 } },
        { selector: 'node.selected', style: { 'background-color': '#fff3bf', 'border-color': '#d4a700' } },
        { selector: '.new-look-state-node', style: { 'font-weight': 400, 'font-family': '"Amazon Ember", Inter, Roboto, Arial, sans-serif', 'text-shadow': 'none', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': 110, 'text-margin-y': 0, 'font-size': 15, 'color': '#16191f' } },
        { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'label': 'data(label)', 'line-color': '#0073bb', 'target-arrow-color': '#0073bb', 'width': 1 } },
        { selector: '.temp-edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'label': 'data(label)', 'line-color': '#0073bb', 'target-arrow-color': '#0073bb', 'line-style': 'dashed', 'opacity': 0.85, 'width': 2 } },
        { selector: '.needs-fix', style: { 'border-color': '#d32f2f', 'border-width': 2, 'background-color': '#fff7f7' } },
        { selector: ':selected', style: { 'overlay-opacity': 0.25, 'overlay-color': '#ffc107' } }
      ],
      layout: { name: 'grid' },
      boxSelectionEnabled: true,
      panningEnabled: true,
      userPanningEnabled: false
    };
    this.cy = (cyFactory as any)(Object.assign({}, defaultOpts, opts));
    return this.cy;
  }

  destroy(): void {
    try { if (this.cy && typeof this.cy.destroy === 'function') this.cy.destroy(); } catch (e) { /* ignore */ }
    this.cy = null;
  }

  getCy(): any { return this.cy; }

  addNode(node: NodeModel): any {
    if (!this.cy) return null;
    try { return this.cy.add({ group: 'nodes', data: { id: node.id, label: node.label, type: node.type }, position: node.position || undefined }); } catch (e) { return null; }
  }

  addEdge(edge: EdgeModel): any {
    if (!this.cy) return null;
    try { return this.cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label } }); } catch (e) { return null; }
  }

  remove(id: string): void {
    if (!this.cy) return;
    try { const el = this.cy.getElementById(id); if (el) el.remove(); } catch (e) { /* ignore */ }
  }

  on(event: string, selector: any, handler: any): void {
    if (!this.cy) return;
    try { this.cy.on(event, selector, handler); } catch (e) { /* ignore */ }
  }

  off(event: string, selector?: any, handler?: any): void {
    if (!this.cy) return;
    try { if (selector && handler) this.cy.off(event, selector, handler); else if (selector) this.cy.off(event, selector); else this.cy.off(event); } catch (e) { /* ignore */ }
  }
}
