import { describe, expect, it } from 'vitest';
import { STAGE_START, plan, snapshot } from '../src/sim/engine';
import { receiverLayout, senderLayout } from '../src/sim/queues';
import { actorAt, ACTOR_OF_EVENT } from '../src/lib/actors';

const p = plan({ count: 24, loss: 0.12, seed: 7 });
const lost = p.packets.filter((x) => x.lost);

describe('senderLayout (A · outgoing queue)', () => {
  it('is empty of packets before packetizing', () => {
    expect(senderLayout(p, STAGE_START.encrypt).every((s) => s.slot === null)).toBe(true);
  });

  it('holds every packet right after packetizing, in seq order with stable places', () => {
    const items = senderLayout(p, STAGE_START.packetize);
    expect(items.map((s) => s.seq)).toEqual(p.packets.map((x) => x.seq));
    expect(items.every((s) => s.slot === 'queued')).toBe(true);
  });

  it('a packet leaves the queue (its place becomes empty) when it departs', () => {
    const x = p.packets[10];
    expect(senderLayout(p, x.depart - 0.01)[10].slot).toBe('queued');
    expect(senderLayout(p, x.depart)[10].slot).toBeNull();
  });

  it('lost packets come back, waiting for resend, once the SACK reaches A', () => {
    const before = senderLayout(p, STAGE_START.resend - 1);
    const after = senderLayout(p, STAGE_START.resend);
    lost.forEach((x) => {
      expect(before[x.seq].slot).toBeNull();
      expect(after[x.seq].slot).toBe('awaiting-resend');
      expect(senderLayout(p, x.resendDepart!)[x.seq].slot).toBeNull();
    });
  });
});

describe('receiverLayout (B · incoming buffer)', () => {
  it('starts as empty slots', () => {
    const l = receiverLayout(snapshot(p, STAGE_START.transit));
    expect(l.items).toEqual([]);
    expect(l.slots).toBe(24);
  });

  it('in transit: arrivals only, append-only, slots for the rest', () => {
    const a = receiverLayout(snapshot(p, 90)), b = receiverLayout(snapshot(p, 110));
    expect(b.items.slice(0, a.items.length)).toEqual(a.items.map((i) => ({ ...i, state: 'delivered' })));
    expect(a.items.length + a.slots).toBe(24);
  });

  it('after sorting: every seq in order; a missing packet is a hole with its own flip id', () => {
    const l = receiverLayout(snapshot(p, STAGE_START.sort));
    expect(l.items.map((i) => i.seq)).toEqual(p.packets.map((x) => x.seq));
    expect(l.slots).toBe(0);
    lost.forEach((x) => expect(l.items[x.seq]).toMatchObject({ state: 'lost', flipId: `hole:${x.seq}` }));
    expect(l.items.find((i) => i.state === 'delivered')!.flipId).toMatch(/^\d+$/);
  });

  it('a recovered packet takes its own id back (so it can fly in from A)', () => {
    const x = lost[0];
    const l = receiverLayout(snapshot(p, x.arrive + 0.01));
    expect(l.items[x.seq]).toMatchObject({ state: 'recovered', flipId: String(x.seq) });
  });
});

describe('actors', () => {
  it('stages 1–3 belong to A, transit to the network, the rest to B (with the SACK round trip on the network)', () => {
    expect([0, 5, 15, 25].map((t) => actorAt(t).key)).toEqual(['A', 'A', 'A', 'A']);
    expect(actorAt(STAGE_START.transit).key).toBe('N');
    expect(actorAt(STAGE_START.sort).key).toBe('B');
    expect(actorAt(STAGE_START.sack).key).toBe('N');
    expect(actorAt(STAGE_START.resend).key).toBe('N');
    expect(actorAt(STAGE_START.decrypt).key).toBe('B');
    expect(actorAt(9999).key).toBe('B');
  });

  it('tags every event kind', () => {
    expect(ACTOR_OF_EVENT.send).toBe('A');
    expect(ACTOR_OF_EVENT.lost).toBe('N');
    expect(ACTOR_OF_EVENT.sorted).toBe('B');
    expect(ACTOR_OF_EVENT.resend).toBe('A');
  });
});
