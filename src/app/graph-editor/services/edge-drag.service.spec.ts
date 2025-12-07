import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { EdgeDragService } from './edge-drag.service';
import { GraphStoreService } from './graph-store.service';

describe('EdgeDragService', () => {
  let service: EdgeDragService;
  let mockGraphStore: Partial<GraphStoreService>;
  let edges$: BehaviorSubject<any[]>;

  beforeEach(() => {
    edges$ = new BehaviorSubject<any[]>([]);
    mockGraphStore = {
      edges$: edges$.asObservable(),
      // keep cast because tests only need edges$
    } as any;

    TestBed.configureTestingModule({
      providers: [
        EdgeDragService,
        { provide: GraphStoreService, useValue: mockGraphStore }
      ]
    });
    service = TestBed.inject(EdgeDragService);
  });

  it('should emit preview on start and update', (done) => {
    const previews: any[] = [];
    const subs = service.preview$.subscribe(p => {
      previews.push(p);
    });

    service.startDrag('A', { x: 10, y: 20 });
    service.updateDrag({ x: 20, y: 30 }, null);
    // after a short tick, expect two previews
    setTimeout(() => {
      try {
        expect(previews.length).toBeGreaterThanOrEqual(2);
        expect(previews[0].sourceId).toBe('A');
        expect(previews[1].targetPos).toEqual({ x: 20, y: 30 });
        subs.unsubscribe();
        done();
      } catch (err) { subs.unsubscribe(); done.fail(err); }
    }, 10);
  });

  it('should mark drop invalid when it would create a cycle or duplicate', (done) => {
    // set edges such that A -> B exists
    edges$.next([{ id: 'e1', source: 'A', target: 'B' }]);
    const completed: any[] = [];
    const sub = service.completed$.subscribe(c => completed.push(c));

    // start dragging from B -> drop on A should create cycle (A->B exists)
    service.startDrag('B', { x: 0, y: 0 });
    service.endDrag('A', { x: 5, y: 5 });

    setTimeout(() => {
      try {
        expect(completed.length).toBe(1);
        expect(completed[0].valid).toBeFalse();
        // now test duplicate case: start drag from A and drop on B (duplicate)
        completed.length = 0;
        service.startDrag('A', { x: 0, y: 0 });
        service.endDrag('B', { x: 1, y: 1 });
        setTimeout(() => {
          try {
            expect(completed.length).toBe(1);
            expect(completed[0].valid).toBeFalse();
            sub.unsubscribe();
            done();
          } catch (err) { sub.unsubscribe(); done.fail(err); }
        }, 10);
      } catch (err) { sub.unsubscribe(); done.fail(err); }
    }, 10);
  });

  it('should emit cancelled when cancelled', (done) => {
    const called: string[] = [];
    const sub = service.cancelled$.subscribe(() => called.push('c'));
    service.startDrag('X', { x: 0, y: 0 });
    service.cancelDrag();
    setTimeout(() => {
      try {
        expect(called.length).toBe(1);
        sub.unsubscribe();
        done();
      } catch (err) { sub.unsubscribe(); done.fail(err); }
    }, 10);
  });
});
