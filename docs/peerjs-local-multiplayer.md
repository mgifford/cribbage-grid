# PeerJS and Local Multiplayer

This document explains how Cribbage Grid uses [PeerJS](https://peerjs.com/) to
let two players compete from separate devices — including on a local network
with **no connection to the public internet**.

---

## What is PeerJS?

PeerJS is a JavaScript library that wraps the browser's built-in
[WebRTC DataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
API into a simpler, event-driven interface.  WebRTC is a standard that lets
two browsers exchange arbitrary binary or text data directly — browser to
browser — once they know each other's address.

The key insight is the split between **signaling** and **data transfer**:

| Phase | What happens | Needs internet? |
|---|---|---|
| **Signaling** | The two peers exchange metadata (network addresses, codec info) so WebRTC can set up a route between them | Only to reach the signaling server |
| **Data transfer** | Game state is sent directly between the two browsers (peer-to-peer) | **No** — traffic goes over whatever network the devices share |

By default PeerJS uses the free [PeerJS Cloud](https://peercloud.peerjs.com/)
server for signaling.  That server does nothing but introduce the two peers to
each other; after the handshake it gets out of the way and all game data flows
directly between the players.

---

## How the game uses PeerJS

### Loading PeerJS

PeerJS is loaded from a CDN in `public/index.html`:

```html
<!-- PeerJS for peer-to-peer multiplayer -->
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
```

This makes `window.Peer` available to the rest of the app.

### PeerSync — the thin wrapper

`src/index.js` contains a small class called `PeerSync` that wraps the PeerJS
`Peer` object:

```
PeerSync
 ├── host(onReady, onConnect)   – creates a Peer, waits for an incoming connection
 ├── join(hostId, onConnect)    – creates a Peer, dials the host's ID
 ├── sync()                     – sends this.state to the connected peer
 ├── on(event, callback)        – subscribe to incoming state updates
 ├── once(event, callback)      – one-shot subscription
 └── destroy()                  – tears down the Peer and connection
```

Game state (deck order, card layout, whose turn it is) is stored in
`peerSync.state` and broadcast to the remote player with a single `sync()`
call every time a move is made.

### MultiplayerLobby — the host/join UI

The `MultiplayerLobby` React component presents two buttons:

* **Host Game** — calls `PeerSync.host()`, receives a short alphanumeric
  **Room ID** from PeerJS, and displays it on screen.  The host also generates
  the initial shuffled deck and sends it to the joiner as soon as the
  connection opens, guaranteeing both players see an identical starting state.

* **Join Game** — the joiner types the Room ID shown on the host's screen,
  then calls `PeerSync.join(hostId)`.  Once the connection is open the joiner
  waits for the host's initial state before the game board appears.

### Turn enforcement

After the connection is established:

* The **host** plays as the *row* player (P1).
* The **joiner** plays as the *column* player (P2).

Each player's `handleMove()` function checks `this.props.isHost` and the
current `rowTurn` flag before allowing a placement, so neither player can move
out of turn.  After every valid move the new state is pushed to the peer with
`peerSync.sync()`.

---

## Playing on a local network (no public internet)

The default PeerJS Cloud signaling works well when both devices have internet
access.  If you want to play **entirely offline** — over a home router, a
shared Wi-Fi hotspot, or a wired switch — you can run a self-hosted PeerJS
signaling server instead.

### 1. Install the PeerJS server

On any machine that both players can reach (a laptop, a Raspberry Pi, etc.):

```bash
npm install -g peer
peerjs --port 9000
```

The server listens on port 9000 and prints a confirmation message.  It
requires only Node.js and no internet connection after the package is
installed.

### 2. Tell the app to use your local server

In `public/index.html` the PeerJS CDN script is still needed (it is the
*client* library, not the server).  In `src/index.js`, change the two
`new window.Peer()` calls inside `PeerSync` to point at your local server:

```js
// host() and join() both create a Peer like this:
this.peer = new window.Peer(undefined, {
  host: '192.168.1.100',  // IP of the machine running `peerjs --port 9000`
  port: 9000,
  path: '/',
});
```

Replace `192.168.1.100` with the LAN IP of the machine running the server
(find it with `ip addr` on Linux/macOS or `ipconfig` on Windows).

### 3. Serve the game locally

Because browsers block mixed-content and some WebRTC features on plain `http`,
it is best to serve the game over HTTPS or from `localhost`.  The simplest
option during development:

```bash
# In the project root
npm start          # serves on http://localhost:3000 with hot-reload
```

For a production-style local server without installing extra tooling:

```bash
npm run build
npx serve -s build -l 3000
```

Both players open `http://<host-machine-ip>:3000` in their browsers, one
clicks **Host Game** and shares the Room ID, and the other clicks **Join
Game**.

---

## Ad-hoc and hotspot scenarios

PeerJS works wherever the two devices can reach the signaling server.  Some
common setups that require no internet router:

| Scenario | How to set it up |
|---|---|
| **Mobile hotspot** | One phone creates a Wi-Fi hotspot.  Both devices connect to it.  Run the PeerJS server on the hotspot phone or the host laptop. |
| **Direct Wi-Fi (ad-hoc)** | On Linux/macOS you can create an ad-hoc Wi-Fi network.  Both machines join it and assign static IPs.  Run the PeerJS server on either machine. |
| **Ethernet cable** | Connect two laptops with a crossover cable (or a USB-to-Ethernet adapter and a small switch).  Assign static IPs (e.g. `10.0.0.1` / `10.0.0.2`) and run the PeerJS server on one of them. |
| **Same home/office Wi-Fi** | No extra setup — just use the default PeerJS Cloud server if the router has internet, or a local server if it does not. |

In all of these cases the **actual game data never leaves the local network**.
PeerJS / WebRTC keeps the data path local once the initial handshake is
complete (or always, if you use a local signaling server).

---

## Why P2P matters

Traditional multiplayer games require a central server that stores the
authoritative game state and relays every move.  That server must be reachable
from the internet, costs money to run, and disappears the moment the service
shuts down.

PeerJS / WebRTC eliminates the central server from the data path:

* **No hosting costs** — game state travels directly between players.
* **Works offline** — two devices on the same LAN or hotspot are enough.
* **Privacy** — moves are never uploaded to a third-party server.
* **Resilience** — the game keeps working even if the PeerJS Cloud service is
  unavailable, as long as you use a local signaling server.

For a small card game like Cribbage Grid, this means you can set up a game at
a kitchen table, on a plane, at a camping site, or anywhere else two devices
can talk to each other — no internet required.

---

## Further reading

* [PeerJS documentation](https://peerjs.com/docs/)
* [PeerJS server (self-hosted)](https://github.com/peers/peerjs-server)
* [WebRTC overview – MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
* [WebRTC without a signaling server (experimental)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)
