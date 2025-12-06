import { Injectable } from '@angular/core';
import { EdgeModel } from '../models/edge.model';
import { NodeModel } from '../models/node.model';

@Injectable({ providedIn: 'root' })
export class GraphHelpersService {
  parseConditionInput(text: string): { op: string; value: string } | null {
    if (!text) return null;
    const t = text.trim();
    const lowered = t.toLowerCase();
    const ops = ['==', '!=', '>=', '<=', '>', '<', '=', 'in'];
    for (const op of ops) {
      if (op === 'in') {
        if (lowered.startsWith('in ') || lowered === 'in') {
          const value = t.slice(2).trim();
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

  // Basic conflict detection copied/ported from component logic but made pure
  conditionsConflict(a: { variable?: string; op?: string; value?: string } | undefined, b: { variable: string; op: string; value: string }): boolean {
    if (!a) return false;
    if (!a.variable || !b.variable) return false;
    if (a.variable !== b.variable) return false;

    const opA = (a.op || '').trim();
    const opB = (b.op || '').trim();
    const valA = (a.value || '').trim();
    const valB = (b.value || '').trim();
    if (opA === opB && valA === valB) return true;

    type Interval = { lo: number; hi: number; loInc: boolean; hiInc: boolean };

    const toIntervals = (op: string, vStr: string): Interval[] => {
      const vNum = Number(vStr);
      const isNum = !isNaN(vNum);
      switch (op) {
        case '==':
          if (isNum) return [{ lo: vNum, hi: vNum, loInc: true, hiInc: true }];
          return [];
        case '!=':
          if (isNum) return [{ lo: Number.NEGATIVE_INFINITY, hi: vNum, loInc: false, hiInc: false }, { lo: vNum, hi: Number.POSITIVE_INFINITY, loInc: false, hiInc: false }];
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
          return vStr.split(',').map(s => s.trim()).map(item => {
            const n = Number(item);
            if (!isNaN(n)) return { lo: n, hi: n, loInc: true, hiInc: true } as Interval;
            return null as any;
          }).filter(Boolean);
        default:
          return [];
      }
    };

    const intervalsA = toIntervals(opA, valA);
    const intervalsB = toIntervals(opB, valB);

    if (intervalsA.length && intervalsB.length) {
      const overlap = (i1: Interval, i2: Interval) => {
        if (i1.lo < i2.hi && i2.lo < i1.hi) return true;
        if (i1.hi === i2.lo) return i1.hiInc && i2.loInc;
        if (i2.hi === i1.lo) return i2.hiInc && i1.loInc;
        return false;
      };
      for (const ia of intervalsA) for (const ib of intervalsB) if (overlap(ia, ib)) return true;
      return false;
    }

    if (opA === 'in' || opB === 'in' || opA === '==' || opB === '==') {
      const listA = opA === 'in' ? valA.split(',').map(s => s.trim()) : [valA];
      const listB = opB === 'in' ? valB.split(',').map(s => s.trim()) : [valB];
      for (const x of listA) for (const y of listB) if (x && y && x === y) return true;
      return false;
    }
    return true;
  }

  wouldCreateCycle(source: string, target: string, edges: EdgeModel[]): boolean {
    if (!source || !target) return false;
    if (source === target) return true;
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    if (!adj.has(source)) adj.set(source, []);
    adj.get(source)!.push(target);
    const visited = new Set<string>();
    const stack: string[] = [target];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === source) return true;
      if (visited.has(n)) continue;
      visited.add(n);
      const outs = adj.get(n) || [];
      for (const o of outs) if (!visited.has(o)) stack.push(o);
    }
    return false;
  }

  validateGraphForExport(nodes: NodeModel[], edges: EdgeModel[]): string[] {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const isLeaf = (id: string) => {
      const node = nodes.find(x => x.id === id);
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
        for (const o of outs) if (!visited.has(o)) stack.push(o);
      }
      memo.set(start, false);
      return false;
    };
    const bad: string[] = [];
    for (const n of nodes) {
      if (n.type === 'leaf') continue;
      const outs = adj.get(n.id) || [];
      if (!outs.length) { bad.push(n.id); continue; }
      if (!canReachLeaf(n.id)) bad.push(n.id);
    }
    return bad;
  }

  exportJSON(nodes: NodeModel[], edges: EdgeModel[]): string {
    return JSON.stringify({ nodes, edges }, null, 2);
  }

  escape(s: string): string { return (s || '').replace(/\\/g, '\\\\').replace(/\"/g, '\\"'); }

  exportDOT(nodes: NodeModel[], edges: EdgeModel[]): string {
    let out = 'digraph policy {\n';
    for (const n of nodes) {
      const attrs = [`label=\"${this.escape(n.label)}\"`, `type=\"${n.type || ''}\"`];
      out += `  ${n.id} [${attrs.join(', ')}];\n`;
    }
    for (const e of edges) {
      const lbl = e.label ? `[label=\"${this.escape(e.label)}\"]` : '';
      out += `  ${e.source} -> ${e.target} ${lbl};\n`;
    }
    out += '}\n';
    return out;
  }
}
