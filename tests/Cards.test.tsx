// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Details } from '../src/components/Cards/Details';
import { EventLog } from '../src/components/Cards/EventLog';
import { Inspector } from '../src/components/Cards/Inspector';
import { STAGE_START, END } from '../src/sim/engine';
import { transmit, type Transmission } from '../src/sim/pipeline';
import { useSim } from '../src/store';

let tx: Transmission;
const original = Uint8Array.from({ length: 20_000 }, (_, i) => (i * 7) & 255);

beforeAll(async () => { tx = await transmit(original); });
beforeEach(() => {
  useSim.getState().reset();
  useSim.getState().load({ ...tx, payload: { kind: 'photo', name: 'f.jpg', mime: 'image/jpeg', bytes: original }, posterUrl: 'blob:poster' });
});
afterEach(cleanup);

const n = () => tx.packets.length;
const lostSeqs = () => useSim.getState().plan.packets.filter((p) => p.lost).map((p) => p.seq);
const queueA = () => screen.getByRole('region', { name: /^A · Fila de saída/ });
const bufferB = () => screen.getByRole('region', { name: /^B · Buffer de entrada/ });
const buttonsIn = (el: HTMLElement) => within(el).queryAllByRole('button');
const at = (t: number) => { useSim.getState().scrub(t); render(<Details />); };

describe('A · outgoing queue (sender: stages 1–3, then departures)', () => {
  it('shows the whole picture before encryption, then cracks it apart and greys it while encrypting', () => {
    at(STAGE_START.send);
    const intact = within(queueA()).getByTestId('intact');
    expect(intact.style.gap).toBe('0px');
    expect(intact.dataset.ciphered).toBe('false');
    expect(intact.style.getPropertyValue('--img')).toContain('blob:poster');
    expect(buttonsIn(queueA())).toHaveLength(0);
    cleanup();
    at((STAGE_START.encrypt + STAGE_START.packetize) / 2);
    const cracking = within(queueA()).getByTestId('intact');
    expect(cracking.style.gap).toBe('3px');
    expect(cracking.dataset.ciphered).toBe('true');
  });

  it('after packetizing, every packet waits in A in seq order, each with its own piece of the picture', () => {
    at(STAGE_START.packetize);
    const cells = buttonsIn(queueA());
    expect(cells.map((b) => Number(b.dataset.flip))).toEqual(tx.packets.map((p) => p.seq));
    expect((cells[0].firstElementChild as HTMLElement).style.backgroundPosition).toBe('0% 0%');
    expect(within(queueA()).getByText(/pacotes prontos/)).toBeTruthy();
  });

  it('packets leave A as they depart (their place stays, empty)', () => {
    at(50);
    const grid = within(queueA()).getByTestId('outgoing');
    expect(grid.children).toHaveLength(n());
    const left = buttonsIn(queueA()).length;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(n());
  });

  it('lost packets come back to A, waiting to be resent, once the SACK arrives', () => {
    at(STAGE_START.resend);
    expect(buttonsIn(queueA()).map((b) => Number(b.dataset.flip))).toEqual(lostSeqs());
    expect(within(queueA()).getAllByRole('button', { name: /Aguardando reenvio/ })).toHaveLength(lostSeqs().length);
  });

  it('text has no picture: a message, then plain packet cells', () => {
    useSim.setState((s) => ({ transfer: s.transfer && { ...s.transfer, posterUrl: undefined } }));
    at(STAGE_START.send);
    expect(within(queueA()).getByText(/Mensagem pronta/)).toBeTruthy();
    cleanup();
    at(STAGE_START.packetize);
    expect(buttonsIn(queueA())[0].querySelectorAll('span')).toHaveLength(1);
  });
});

describe('B · incoming buffer (receiver)', () => {
  it('starts as empty slots, waiting for arrivals', () => {
    at(STAGE_START.transit);
    expect(buttonsIn(bufferB())).toHaveLength(0);
    expect(within(bufferB()).getByTestId('incoming').children).toHaveLength(n());
    expect(within(bufferB()).getByText(/aguardando chegadas/)).toBeTruthy();
  });

  it('in transit: arrivals only, append-only (earlier arrivals never move)', () => {
    at(90);
    const early = buttonsIn(bufferB()).map((b) => b.dataset.flip);
    cleanup();
    at(110);
    const later = buttonsIn(bufferB()).map((b) => b.dataset.flip);
    expect(later.length).toBeGreaterThan(early.length);
    expect(later.slice(0, early.length)).toEqual(early);
  });

  it('a packet is never in A and B at the same time (same flip id = the same packet flying across)', () => {
    for (const t of [40, 70, 100, 140, STAGE_START.resend + 5, 220]) {
      cleanup();
      at(t);
      const a = new Set(buttonsIn(queueA()).map((b) => b.dataset.flip));
      const b = buttonsIn(bufferB()).map((x) => x.dataset.flip);
      expect(b.filter((id) => a.has(id))).toEqual([]);
    }
  });

  it('after sorting: seq order, gaps named, missing packets are holes', () => {
    at(STAGE_START.sort);
    const cells = buttonsIn(bufferB());
    expect(cells).toHaveLength(n());
    expect(within(bufferB()).getByText(/faltam/).textContent).toContain(`#${lostSeqs()[0]}`);
    lostSeqs().forEach((seq) => expect(cells[seq].dataset.flip).toBe(`hole:${seq}`));
  });

  it('colours come back once B decrypts', () => {
    at(STAGE_START.sort);
    expect(within(bufferB()).getByTestId('incoming').dataset.ciphered).toBe('true');
    cleanup();
    at(STAGE_START.decrypt);
    expect(within(bufferB()).getByTestId('incoming').dataset.ciphered).toBe('false');
  });
});

describe('Details middle card (Eventos | Pacote)', () => {
  it('shows events by default and switches to the packet when one is clicked in a queue', () => {
    at(STAGE_START.packetize);
    expect(screen.getByRole('region', { name: 'Registro de eventos' })).toBeTruthy();
    fireEvent.click(within(queueA()).getByRole('button', { name: /^Pacote 3,/ }));
    expect(useSim.getState().selected).toBe(3);
    expect(screen.getByRole('region', { name: 'Inspetor de pacote' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eventos' }));
    expect(screen.getByRole('region', { name: 'Registro de eventos' })).toBeTruthy();
  });

  it('highlights the queue of the side that is acting', () => {
    at(STAGE_START.encrypt);
    expect(queueA().dataset.active).toBe('true');
    expect(bufferB().dataset.active).toBe('false');
    cleanup();
    at(STAGE_START.sort);
    expect(queueA().dataset.active).toBe('false');
    expect(bufferB().dataset.active).toBe('true');
  });
});

describe('Inspector', () => {
  it('shows the real ciphertext bytes of the selected packet', () => {
    useSim.getState().select(2);
    render(<Inspector />);
    const firstBytes = Array.from(tx.packets[2].payload.subarray(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' ');
    expect(screen.getByText(new RegExp(`^${firstBytes}`))).toBeTruthy();
    expect(screen.getByRole('heading').textContent).toBe('Pacote #2');
  });

  it('says where the packet is: A, the network or B', () => {
    const seq = lostSeqs()[0];
    useSim.getState().select(seq);
    const where = () => screen.getByTitle(/^(em A|na rede|em B)$/).getAttribute('title');
    useSim.getState().scrub(STAGE_START.packetize);
    render(<Inspector />);
    expect(where()).toBe('em A');
    cleanup();
    useSim.getState().scrub(STAGE_START.sort + 1);
    render(<Inspector />);
    expect(where()).toBe('na rede');
    expect(screen.getByText(/Descartado/)).toBeTruthy();
    cleanup();
    useSim.getState().scrub(END);
    render(<Inspector />);
    expect(where()).toBe('em B');
  });
});

describe('EventLog', () => {
  it('lists the newest events first, each tagged with who did it', () => {
    useSim.getState().scrub(END);
    render(<EventLog />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0].textContent).toContain('Kenji visualizou');
    expect(within(items[0]).getByTitle('B · destinatário')).toBeTruthy();
    // the latest events span the whole round trip: A resends, the network carries the SACK, B decrypts
    const who = new Set(items.map((li) => li.querySelector('[title]')!.getAttribute('title')));
    expect(who).toEqual(new Set(['A · remetente', 'rede', 'B · destinatário']));
    cleanup();
    useSim.getState().scrub(STAGE_START.sort - 1);
    render(<EventLog />);
    expect(screen.getAllByText(/perdido ·/).length).toBeGreaterThan(0);
  });
});

describe('route-aware text', () => {
  it('event log names the chosen cities and uses their latency', () => {
    useSim.getState().setRoute('lon', 'fra');
    useSim.getState().scrub(STAGE_START.transit + 1);
    render(<EventLog />);
    expect(screen.getByText(/Primeiro pacote deixa o CDN Londres/)).toBeTruthy();
    cleanup();
    useSim.getState().scrub(STAGE_START.sort);
    render(<EventLog />);
    expect(screen.getByText(/Primeiro pacote chega ao CDN Frankfurt/)).toBeTruthy();
  });
});
