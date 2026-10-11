// Playing with friends: direct connections between browsers (WebRTC, through
// the PeerJS library). One player hosts a table and gets a short code; the
// others join with it. Every message goes to or from the host.
//
// PeerJS's free public service is only used to introduce the browsers to each
// other; after that they talk directly. On some strict networks (offices,
// schools) a direct connection can't be made, and joining will fail.
import { Peer } from 'peerjs';

const PREFIX = 'deadslide-casino-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // (no I, O, 0 or 1: too easy to misread)
const newCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

const reason = (err) => ({
  'peer-unavailable': 'No table with that code',
  'unavailable-id': 'That code is taken, try again',
  network: 'Lost the connection',
  'browser-incompatible': "This browser can't make direct connections",
}[err?.type] || "Couldn't connect");

// handlers: open(code)  join(id)  leave(id)  message(id, msg)  closed(why)
// For a guest, the host's id is 'host'.
export class Net {
  constructor(handlers) {
    this.on = handlers;
    this.peer = null;
    this.links = new Map();   // host: guest id -> connection
    this.toHost = null;       // guest: the connection to the host
    this.id = '';
  }

  host() {
    const code = newCode();
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', () => this.on.open(code));
    this.peer.on('connection', (link) => {
      link.on('open', () => { this.links.set(link.peer, link); this.on.join(link.peer); });
      link.on('data', (msg) => this.on.message(link.peer, msg));
      const gone = () => { if (this.links.delete(link.peer)) this.on.leave(link.peer); };
      link.on('close', gone);
      link.on('error', gone);
    });
    this.peer.on('error', (err) => { if (err.type !== 'peer-unavailable') this.fail(reason(err)); });
    this.peer.on('disconnected', () => this.peer?.reconnect());   // (the introducing service dropped us; existing links carry on)
  }

  join(code) {
    code = String(code).trim().toUpperCase();
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      this.id = id;
      const link = (this.toHost = this.peer.connect(PREFIX + code, { reliable: true }));
      link.on('open', () => this.on.open(code));
      link.on('data', (msg) => this.on.message('host', msg));
      link.on('close', () => this.fail('The host closed the table'));
      link.on('error', () => this.fail('Lost the connection'));
    });
    this.peer.on('error', (err) => this.fail(reason(err)));
  }

  // Guest -> host.
  send(msg) { if (this.toHost?.open) this.toHost.send(msg); }
  // Host -> one guest, or all of them.
  sendTo(id, msg) { const link = this.links.get(id); if (link?.open) link.send(msg); }
  broadcast(msg) { for (const link of this.links.values()) if (link.open) link.send(msg); }

  fail(why) {
    if (!this.peer) return;
    this.close();
    this.on.closed(why);
  }

  close() {
    const peer = this.peer;
    this.peer = null;
    this.links.clear();
    this.toHost = null;
    try { peer?.destroy(); } catch {}
  }
}
