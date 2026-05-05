import React, {useState} from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import Fade from '@material-ui/core/Fade';
import Typography from '@material-ui/core/Typography';
import Slider from '@material-ui/core/Slider';
import { QRCodeSVG } from 'qrcode.react';

if (process.env.NODE_ENV !== 'production') {
  const axe = require('@axe-core/react');
  axe(React, ReactDOM, 1000);
}

// =========================================================
// Grid configuration
// =========================================================

const GRID_SIZE = 7;              // side length of the square grid
const CELLS = GRID_SIZE * GRID_SIZE; // total number of cells
const CENTER = Math.floor(CELLS / 2); // index of the pre-placed centre card
// A standard 52-card deck covers a 7×7 board (49 cards) with room to spare.
// For grids > 52 cells, increase NUM_DECKS accordingly.
const NUM_DECKS = Math.ceil(CELLS / 52);
// Maximum cards allowed in a single row or column (standard cribbage hand size).
const MAX_CARDS_PER_LINE = 5;

// Card tile dimensions (square Scrabble-tile style)
const CARD_SIZE = 64;
const SUIT_FONT_SIZE = 44;
const RANK_FONT_SIZE = 17;

// =========================================================
// Board shape generator – creates a random connected blob
// =========================================================

/**
 * Generate a random connected board mask (Set of active cell indices).
 * The blob always includes CENTER and grows via BFS with random selection,
 * producing a different shape each game.
 * @param {number} gridSize  Side length of the square grid.
 * @returns {Set<number>}    Set of active cell indices.
 */
function generateBoardMask(gridSize) {
  const cells = gridSize * gridSize;
  const center = Math.floor(cells / 2);

  function getNeighbors(idx) {
    const row = Math.floor(idx / gridSize);
    const col = idx % gridSize;
    const result = [];
    if (row > 0)              result.push(idx - gridSize);
    if (row < gridSize - 1)   result.push(idx + gridSize);
    if (col > 0)              result.push(idx - 1);
    if (col < gridSize - 1)   result.push(idx + 1);
    return result;
  }

  const active = new Set([center]);
  const frontier = new Set(getNeighbors(center));
  // Target 28–36 active cells to give a varied but playable board
  const target = 28 + Math.floor(Math.random() * 9);

  while (active.size < target && frontier.size > 0) {
    const frontierArr = [...frontier];
    const cell = frontierArr[Math.floor(Math.random() * frontierArr.length)];
    frontier.delete(cell);
    active.add(cell);
    for (const n of getNeighbors(cell)) {
      if (!active.has(n)) frontier.add(n);
    }
  }

  return active;
}

// =========================================================
// PeerSync – thin wrapper around PeerJS for state syncing
// =========================================================

class PeerSync {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.state = {};
    this._listeners = {};
    this.isHost = false;
  }

  host(onReady, onConnect) {
    this.isHost = true;
    this.peer = new window.Peer();
    this.peer.on('open', (id) => onReady(id));
    this.peer.on('connection', (conn) => {
      this.conn = conn;
      conn.on('open', () => {
        this._setupConn(conn);
        if (onConnect) onConnect();
      });
    });
    this.peer.on('error', (err) => console.error('PeerJS host error:', err));
  }

  join(hostId, onConnect) {
    this.isHost = false;
    this.peer = new window.Peer();
    this.peer.on('open', () => {
      this.conn = this.peer.connect(hostId);
      this.conn.on('open', () => {
        this._setupConn(this.conn);
        if (onConnect) onConnect();
      });
    });
    this.peer.on('error', (err) => console.error('PeerJS join error:', err));
  }

  _setupConn(conn) {
    conn.on('data', (data) => {
      this.state = data;
      (this._listeners['update'] || []).forEach((cb) => cb(data));
    });
    conn.on('close', () => console.log('PeerJS connection closed'));
  }

  sync() {
    if (this.conn && this.conn.open && Object.keys(this.state).length > 0) {
      this.conn.send(this.state);
    }
  }

  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  }

  /** Register a one-time listener that removes itself after the first call. */
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this._listeners[event] = (this._listeners[event] || []).filter(
        (cb) => cb !== wrapper
      );
    };
    this.on(event, wrapper);
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
    }
  }
}

// =========================================================
// ErrorBoundary – catches render errors and shows them on screen
// =========================================================

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('Game error:', error, info && info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { error, info } = this.state;
      return (
        <div role="alert" aria-live="assertive" style={{ padding: '24px', fontFamily: 'monospace', color: '#c00' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error && (error.message || String(error))}
          </pre>
          {info && (
            <details style={{ marginTop: '12px' }}>
              <summary>Component stack</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: '#333' }}>
                {info.componentStack}
              </pre>
            </details>
          )}
          <button
            aria-label="Reload the page to restart the game"
            style={{ marginTop: '16px', padding: '8px 16px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// =========================================================
// Styles
// =========================================================

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle = {
  backgroundColor: 'var(--modal-bg)',
  color: 'var(--page-text)',
  padding: '32px 40px',
  borderRadius: '10px',
  textAlign: 'center',
  minWidth: '320px',
  maxWidth: '90vw',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  overflowY: 'auto',
  maxHeight: '90vh',
};

const btnStyle = {
  margin: '8px',
  padding: '10px 24px',
  fontSize: '16px',
  cursor: 'pointer',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#1976d2',
  color: '#fff',
};

const cancelBtnStyle = {
  ...btnStyle,
  backgroundColor: '#6b6b6b',
};

const inputStyle = {
  fontSize: '16px',
  padding: '8px',
  width: '100%',
  marginBottom: '12px',
  borderRadius: '4px',
  border: '1px solid var(--input-border)',
  backgroundColor: 'var(--input-bg)',
  color: 'var(--input-text)',
  boxSizing: 'border-box',
};

const lastTurnStyle = {
  display: 'inline-block',
  margin: '8px 0 12px',
  padding: '10px 16px',
  borderRadius: '6px',
  backgroundColor: 'var(--last-turn-bg)',
  border: '1px solid var(--last-turn-border)',
  fontSize: '14px',
  lineHeight: '1.6',
};

// =========================================================
// GameSetupScreen – choose player names / CPU config
// =========================================================

function GameSetupScreen({ onStart }) {
  const [gameMode, setGameMode] = useState('cribbage');
  const [numPlayers, setNumPlayers] = useState(2);
  // Arrays indexed by player slot (0-3)
  const [playerTypes,  setPlayerTypes]  = useState(['human', 'cpu',   'cpu',     'cpu']);
  const [playerNames,  setPlayerNames]  = useState(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
  const [playerLevels, setPlayerLevels] = useState([5, 5, 5, 5]);

  function setType(idx, val) {
    const next = [...playerTypes]; next[idx] = val; setPlayerTypes(next);
  }
  function setName(idx, val) {
    const next = [...playerNames]; next[idx] = val; setPlayerNames(next);
  }
  function setLevel(idx, val) {
    const next = [...playerLevels]; next[idx] = val; setPlayerLevels(next);
  }

  // At least one human required
  const humanCount = playerTypes.slice(0, numPlayers).filter(t => t === 'human').length;
  const canStart = humanCount >= 1;

  function handleStart() {
    const zones = assignScoringZones(numPlayers);
    const players = Array.from({ length: numPlayers }, (_, i) => ({
      type:     playerTypes[i],
      name:     playerTypes[i] === 'cpu' ? `CPU ${i + 1}` : playerNames[i],
      cpuLevel: playerLevels[i],
      role:     playerRoleLabel(i, numPlayers),
      zone:     zones[i],
    }));
    onStart(players, gameMode);
  }

  const sectionStyle = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    textAlign: 'left',
  };
  const labelStyle = { fontWeight: '600', display: 'block', marginBottom: '8px' };

  function renderPlayerSection(idx) {
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const roleLabel = playerRoleLabel(idx, numPlayers);
    const header = gameMode === 'runwabble'
      ? `Player ${idx + 1}`
      : `Player ${idx + 1} – ${roleLabel}`;
    const sliderId = `p${idx + 1}-cpu-slider`;
    return (
      <div key={idx} style={{ ...sectionStyle, borderColor: color }}>
        <span style={{ ...labelStyle, color }}>{header}</span>
        <div style={{ marginBottom: '8px' }}>
          <label>
            <input
              type="radio" value="human" checked={playerTypes[idx] === 'human'}
              onChange={() => setType(idx, 'human')}
            />
            {' '}Human
          </label>
          {'  '}
          <label>
            <input
              type="radio" value="cpu" checked={playerTypes[idx] === 'cpu'}
              onChange={() => setType(idx, 'cpu')}
            />
            {' '}CPU
          </label>
        </div>
        {playerTypes[idx] === 'human' && (
          <input
            style={inputStyle} type="text" placeholder="Name"
            value={playerNames[idx]} onChange={(e) => setName(idx, e.target.value)}
            aria-label={`Player ${idx + 1} name`}
          />
        )}
        {playerTypes[idx] === 'cpu' && (
          <div style={{ width: '200px' }}>
            <Typography id={sliderId} gutterBottom>CPU Difficulty: {playerLevels[idx]}</Typography>
            <Slider
              value={playerLevels[idx]} aria-labelledby={sliderId}
              valueLabelDisplay="auto"
              onChange={(e, v) => setLevel(idx, v)}
              step={1} marks min={1} max={10}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="setup-heading">
      <div style={modalStyle}>
        <h2 id="setup-heading" style={{ marginTop: 0 }}>Game Setup</h2>

        {/* Game Mode */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Game Mode</span>
          <div style={{ marginBottom: '4px' }}>
            <label>
              <input
                type="radio" value="cribbage" checked={gameMode === 'cribbage'}
                onChange={() => setGameMode('cribbage')}
              />
              {' '}Cribbage Grid
            </label>
            {'  '}
            <label>
              <input
                type="radio" value="runwabble" checked={gameMode === 'runwabble'}
                onChange={() => setGameMode('runwabble')}
              />
              {' '}Runwabble
            </label>
          </div>
          {gameMode === 'runwabble' && (
            <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
              14×14 tile grid. Place 1-5 tiles per turn in a straight line, interlocking with existing tiles. Score 15s, runs, sets & color flush bonuses.
            </p>
          )}
        </div>

        {/* Number of players (Cribbage only; Runwabble stays 2-player) */}
        {gameMode === 'cribbage' && (
          <div style={sectionStyle}>
            <span style={labelStyle}>Number of Players</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[2, 3, 4].map(n => (
                <label key={n}>
                  <input
                    type="radio" value={n} checked={numPlayers === n}
                    onChange={() => setNumPlayers(n)}
                  />
                  {' '}{n}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Player sections */}
        {Array.from({ length: gameMode === 'runwabble' ? 2 : numPlayers }, (_, i) => renderPlayerSection(i))}

        {!canStart && (
          <p role="alert" style={{ color: '#c62828', fontSize: '13px', margin: '4px 0 8px' }}>
            At least one player must be Human.
          </p>
        )}

        <button style={btnStyle} onClick={handleStart} disabled={!canStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}

// =========================================================
// MultiplayerLobby – Host / Join overlay UI
// =========================================================

class MultiplayerLobby extends React.Component {
  constructor(props) {
    super(props);
    const autoId = props.autoJoinId || '';
    this.state = {
      mode: autoId ? 'join' : null,
      roomId: '',
      joinId: autoId,
      status: 'idle',
      errorMsg: '',
      playerName: props.localName || '',
      copied: false,
    };
    this._mounted = false;
    this.peerSync = new PeerSync();
  }

  componentDidMount() {
    this._mounted = true;
    // Auto-connect if we received an autoJoinId
    if (this.props.autoJoinId && this.state.joinId) {
      this.handleJoin();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  handleHost() {
    this.setState({ mode: 'host', status: 'waiting' });
    this.peerSync.host(
      (id) => {
        if (this._mounted) this.setState({ roomId: id });
      },
      () => {
        // Joiner connected – generate initial game state and send it
        const deck = makeDeck();
        shuffleDeck(deck);
        let cardLayout = Array.from({ length: CELLS }, () => ({ rank: null, suit: null }));
        cardLayout[CENTER] = deck[0];
        // Deal 5 cards to each player
        const p1Hand = deck.slice(1, 6);
        const p2Hand = deck.slice(6, 11);
        const remainingDeck = deck.slice(11);
        const gameState = {
          deck: remainingDeck,
          p1Hand,
          p2Hand,
          cardLayout,
          rowTurn: true,
          p1Name: this.state.playerName || 'Host',
          p2Name: '',  // joiner will fill in
        };
        this.peerSync.state = gameState;
        this.peerSync.sync();
        if (this._mounted) this.setState({ status: 'connected' });
        this.props.onConnected(this.peerSync, true, gameState, this.state.playerName || 'Host');
      }
    );
  }

  handleJoin() {
    const hostId = this.state.joinId.trim();
    if (!hostId) return;
    this.setState({ status: 'connecting' });
    this.peerSync.join(hostId, () => {
      this.peerSync.once('update', (gameState) => {
        // Patch in our name
        const patchedState = { ...gameState, p2Name: this.state.playerName || 'Guest' };
        this.peerSync.state = patchedState;
        this.peerSync.sync();
        if (this._mounted) this.setState({ status: 'connected' });
        this.props.onConnected(this.peerSync, false, patchedState, this.state.playerName || 'Guest');
      });
    });
  }

  handleCancel() {
    this.peerSync.destroy();
    this.props.onCancel();
  }

  copyJoinLink() {
    const url = buildJoinUrl(this.state.roomId);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    }
  }

  render() {
    const { mode, roomId, joinId, status, errorMsg, playerName, copied } = this.state;

    if (status === 'connected') {
      return (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <p>Connected! Starting game…</p>
          </div>
        </div>
      );
    }

    const joinUrl = roomId ? buildJoinUrl(roomId) : '';

    return (
      <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="multiplayer-heading">
        <div style={modalStyle}>
          <h2 id="multiplayer-heading" style={{ marginTop: 0 }}>Multiplayer</h2>

          {/* Name field always shown */}
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label htmlFor="mp-name-input" style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
              Your Name
            </label>
            <input
              id="mp-name-input"
              style={inputStyle}
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => this.setState({ playerName: e.target.value })}
            />
          </div>

          {!mode && (
            <>
              <p>Choose your role:</p>
              <button style={btnStyle} onClick={() => this.handleHost()}>
                Host Game
              </button>
              <button style={btnStyle} onClick={() => this.setState({ mode: 'join' })}>
                Join Game
              </button>
              <br />
              <button
                style={{ ...cancelBtnStyle, marginTop: '16px' }}
                onClick={() => this.handleCancel()}
              >
                Cancel
              </button>
            </>
          )}

          {mode === 'host' && (
            <>
              {roomId ? (
                <>
                  <p>Share this Room ID with your opponent:</p>
                  <p
                    style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      letterSpacing: '2px',
                      backgroundColor: '#f0f0f0',
                      padding: '10px',
                      borderRadius: '4px',
                    }}
                  >
                    {roomId}
                  </p>
                  {/* QR code for mobile scanning */}
                  <div style={{ margin: '16px auto', display: 'inline-block' }}>
                    <QRCodeSVG value={joinUrl} size={200} aria-label="QR code to join game" />
                  </div>
                  <p style={{ fontSize: '13px', color: '#555', marginTop: '4px', wordBreak: 'break-all' }}>
                    {joinUrl}
                  </p>
                  <div>
                    <button style={{ ...btnStyle, fontSize: '14px', padding: '6px 16px' }} onClick={() => this.copyJoinLink()}>
                      {copied ? '✓ Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </>
              ) : (
                <p>Generating Room ID…</p>
              )}
              <p style={{ color: '#555' }}>Waiting for opponent to connect…</p>
              <button style={cancelBtnStyle} onClick={() => this.handleCancel()}>
                Cancel
              </button>
            </>
          )}

          {mode === 'join' && (
            <>
              <label htmlFor="room-id-input" style={{ display: 'block', marginBottom: '4px', fontWeight: '600', textAlign: 'left' }}>
                Room ID
              </label>
              <input
                id="room-id-input"
                style={inputStyle}
                type="text"
                placeholder="e.g. abc123"
                value={joinId}
                onChange={(e) => this.setState({ joinId: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') this.handleJoin();
                }}
              />
              <br />
              <button
                style={btnStyle}
                onClick={() => this.handleJoin()}
                disabled={status === 'connecting'}
              >
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </button>
              <button style={cancelBtnStyle} onClick={() => this.handleCancel()}>
                Cancel
              </button>
              {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
            </>
          )}
        </div>
      </div>
    );
  }
}

/** Build the join URL from a room ID using the current page origin+path. */
function buildJoinUrl(roomId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?join=${encodeURIComponent(roomId)}`;
}

/** Parse ?join=<id> from the current URL. Returns the id string or null. */
function getAutoJoinId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('join') || null;
}

// =========================================================
// Card display components
// =========================================================

class Deck extends React.Component {
  render() {
    const label = this.props.isEmpty ? "Empty deck" : "Start next round";
    const deckStyle = {
      width: `${CARD_SIZE}px`,
      height: `${CARD_SIZE}px`,
      borderRadius: '6px',
      border: this.props.isEmpty ? '1px dashed var(--card-empty-border)' : '2px solid #1565c0',
      backgroundColor: this.props.isEmpty ? 'var(--card-empty-bg)' : '#1565c0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '28px',
      cursor: this.props.isEmpty ? 'default' : 'pointer',
      userSelect: 'none',
      boxShadow: this.props.isEmpty ? 'none' : '0 2px 6px var(--card-shadow)',
    };
    return (
      <button
        onClick={() => this.props.clickHandler()}
        aria-label={label}
        style={{ background: 'none', border: 'none', padding: 0, cursor: this.props.isEmpty ? 'default' : 'pointer' }}
      >
        <div style={deckStyle} aria-hidden="true">
          {this.props.isEmpty ? '' : '🂠'}
        </div>
      </button>
    );
  }
}

/** Returns the Unicode suit symbol for a given suit name. */
function suitSymbol(suit) {
  switch (suit) {
    case 'hearts':   return '♥';
    case 'diamonds': return '♦';
    case 'clubs':    return '♣';
    case 'spades':   return '♠';
    default:         return '';
  }
}

/** Returns the short display label for a rank (A, 2–10, J, Q, K). */
function rankDisplay(rank) {
  if (!rank) return '';
  switch (rank) {
    case 'ace':   return 'A';
    case 'jack':  return 'J';
    case 'queen': return 'Q';
    case 'king':  return 'K';
    default:      return rank;
  }
}

/** Returns true for red suits (hearts, diamonds). */
function isRedSuit(suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

const CARD_RED_COLOR = '#c62828';
const CARD_BLACK_COLOR = '#212121';

function cardDescription(rank, suit, showBack) {
  if (showBack) return 'Face-down card';
  if (rank && suit) {
    const r = rank.charAt(0).toUpperCase() + rank.slice(1);
    const s = suit.charAt(0).toUpperCase() + suit.slice(1);
    return `${r} of ${s}`;
  }
  return 'Empty cell';
}

function Card({ rank, suit, showBack, clickHandler, 'aria-label': ariaLabel, selected, ...rest }) {
  const description = ariaLabel || cardDescription(rank, suit, showBack);

  const selectedBorderStyle = selected
    ? { outline: '3px solid #f57c00', outlineOffset: '2px', borderRadius: '6px' }
    : {};

  const isRed = rank && suit && isRedSuit(suit);
  const suitColor = isRed ? 'var(--card-red)' : 'var(--card-black)';

  let cardInner;
  if (showBack) {
    cardInner = (
      <div className="card-tile" style={{
        width: `${CARD_SIZE}px`, height: `${CARD_SIZE}px`, borderRadius: '6px',
        backgroundColor: 'var(--card-back-bg)', border: '2px solid var(--card-back-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 6px var(--card-shadow)',
      }}>
        <span style={{ color: '#fff', fontSize: '32px' }} aria-hidden="true">🂠</span>
      </div>
    );
  } else if (rank && suit) {
    const r = rankDisplay(rank);
    const s = suitSymbol(suit);
    cardInner = (
      <div className="card-tile" style={{
        width: `${CARD_SIZE}px`, height: `${CARD_SIZE}px`, borderRadius: '6px',
        backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', color: suitColor,
        fontFamily: 'Georgia, serif', userSelect: 'none',
        boxShadow: '0 2px 6px var(--card-shadow)',
        overflow: 'hidden',
      }}>
        {/* Large suit symbol fills most of the tile */}
        <span style={{
          fontSize: `${SUIT_FONT_SIZE}px`, lineHeight: 1,
          opacity: 0.9,
        }} aria-hidden="true">{s}</span>
        {/* Rank badge at top-left */}
        <span style={{
          position: 'absolute', top: '3px', left: '5px',
          fontSize: `${RANK_FONT_SIZE}px`, lineHeight: 1,
          fontWeight: '900', color: suitColor,
          textShadow: '0 0 4px rgba(255,255,255,0.9), 0 0 2px rgba(255,255,255,0.7)',
        }}>{r}</span>
      </div>
    );
  } else {
    cardInner = (
      <div className="card-tile" style={{
        width: `${CARD_SIZE}px`, height: `${CARD_SIZE}px`, borderRadius: '6px',
        backgroundColor: 'var(--card-empty-bg)',
        border: '1px dashed var(--card-empty-border)',
      }} aria-hidden="true" />
    );
  }

  if (clickHandler) {
    const handleKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        clickHandler();
      }
    };
    return (
      <div
        {...rest}
        role="button"
        tabIndex={0}
        aria-label={description + (selected ? ' (selected)' : '')}
        aria-pressed={selected || false}
        onClick={clickHandler}
        onKeyDown={handleKey}
        style={{ display: 'inline-block', cursor: 'pointer', ...selectedBorderStyle }}
      >
        {cardInner}
      </div>
    );
  }

  return (
    <div {...rest} aria-label={description} style={{ display: 'inline-block', ...selectedBorderStyle }}>
      {cardInner}
    </div>
  );
}

function FadeCard(props) {
  var [comeIn, setComeIn] = useState(true);
  var [oldRank, setOldRank] = useState(null);
  var [oldSuit, setOldSuit] = useState(null);

  if ((oldRank !== props.rank || oldSuit !== props.suit) && comeIn) {
    setComeIn(false);
    setOldRank(props.rank);
    setOldSuit(props.suit);
    setTimeout(() => {setComeIn(true)}, 100);
  }

  return (<Fade in={comeIn} timeout={comeIn? 1500: 0}>
      <Card {...props}/>
    </Fade>);
}

// =========================================================
// HandDisplay – shows a player's hand of cards
// =========================================================

function HandDisplay({ hand, selectedIndex, onCardClick, label, faceDown, isActive }) {
  if (!hand || hand.length === 0) return null;

  const containerStyle = {
    margin: '12px 0',
    padding: '10px',
    backgroundColor: isActive ? 'var(--hand-active-bg)' : 'var(--hand-inactive-bg)',
    borderRadius: '8px',
    border: isActive ? '2px solid var(--hand-active-border)' : '1px solid var(--hand-inactive-border)',
    display: 'inline-block',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: 'var(--hand-label-color)' }}>
        {label}
        {isActive && <span style={{ color: 'var(--hand-active-border)', marginLeft: '8px' }}>← click a card to select it</span>}
      </div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {hand.map((card, i) => {
          if (!card || !card.rank) return null;
          if (faceDown) {
            return (
              <Card
                key={i}
                showBack={true}
                aria-label={`Opponent card ${i + 1} (face down)`}
              />
            );
          }
          return (
            <Card
              key={i}
              rank={card.rank}
              suit={card.suit}
              selected={selectedIndex === i}
              clickHandler={isActive ? () => onCardClick(i) : undefined}
              aria-label={`${cardDescription(card.rank, card.suit, false)}${selectedIndex === i ? ' (selected)' : ''}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
// Deck / card utilities
// =========================================================

function makeDeck() {
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10',
                  'jack', 'queen', 'king', 'ace'];
  let ans = [];
  for (let d = 0; d < NUM_DECKS; d++) {
    for (const s of suits) {
      for (const r of ranks) {
        ans.push({ rank: r, suit: s });
      }
    }
  }
  return ans;
}

function shuffleDeck(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

/** Deal initial hands from a deck. Returns {p1Hand, p2Hand, remainingDeck}.
 *  Assumes deck[0] is already used as the center card.
 */
function dealHands(deck) {
  const p1Hand = deck.slice(0, 5);
  const p2Hand = deck.slice(5, 10);
  const remainingDeck = deck.slice(10);
  return { p1Hand, p2Hand, remainingDeck };
}

/** Count cards already placed in a given row of cardLayout (flat array). */
function countCardsInRow(cardLayout, row) {
  let count = 0;
  for (let c = 0; c < GRID_SIZE; c++) {
    if (cardLayout[row * GRID_SIZE + c].rank) count++;
  }
  return count;
}

/** Count cards already placed in a given column of cardLayout (flat array). */
function countCardsInCol(cardLayout, col) {
  let count = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    if (cardLayout[r * GRID_SIZE + col].rank) count++;
  }
  return count;
}

/**
 * Count empty cells where a card can still legally be placed:
 * cell must be empty, and neither its row nor its column already
 * has MAX_CARDS_PER_LINE cards in it.
 * @param {Set<number>|null} boardMask  Active cell set; null = all cells active.
 */
function countValidPlacements(cardLayout, boardMask = null) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) {
    if (i === CENTER) continue;
    if (boardMask && !boardMask.has(i)) continue;
    if (cardLayout[i].rank) continue;
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    if (countCardsInRow(cardLayout, row) >= MAX_CARDS_PER_LINE) continue;
    if (countCardsInCol(cardLayout, col) >= MAX_CARDS_PER_LINE) continue;
    count++;
  }
  return count;
}

/**
 * Returns true if the cell at cellIndex is orthogonally adjacent to any occupied cell.
 */
function isAdjacentToOccupied(cardLayout, cellIndex) {
  const row = Math.floor(cellIndex / GRID_SIZE);
  const col = cellIndex % GRID_SIZE;
  const neighbors = [
    [row - 1, col], [row + 1, col],
    [row, col - 1], [row, col + 1],
  ];
  for (const [r, c] of neighbors) {
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
      if (cardLayout[r * GRID_SIZE + c].rank) return true;
    }
  }
  return false;
}

/**
 * Validate that placing at newCell is consistent with the straight-line rule.
 * turnCells: array of cell indices already placed this turn.
 * Returns { valid: boolean, error?: string }.
 */
function validateTurnLine(turnCells, newCell) {
  if (turnCells.length === 0) return { valid: true };

  const newRow = Math.floor(newCell / GRID_SIZE);
  const newCol = newCell % GRID_SIZE;

  if (turnCells.length === 1) {
    const firstRow = Math.floor(turnCells[0] / GRID_SIZE);
    const firstCol = turnCells[0] % GRID_SIZE;
    if (newRow !== firstRow && newCol !== firstCol) {
      return { valid: false, error: 'All cards in a turn must be placed in the same row or column.' };
    }
    return { valid: true };
  }

  // 2+ cells placed: determine locked direction
  const rows = turnCells.map(c => Math.floor(c / GRID_SIZE));
  const cols = turnCells.map(c => c % GRID_SIZE);
  const sameRow = rows.every(r => r === rows[0]);
  const sameCol = cols.every(c => c === cols[0]);

  if (sameRow && newRow !== rows[0]) {
    return { valid: false, error: `Must place in row ${rows[0] + 1} to continue your line this turn.` };
  }
  if (sameCol && newCol !== cols[0]) {
    return { valid: false, error: `Must place in column ${cols[0] + 1} to continue your line this turn.` };
  }
  return { valid: true };
}

/**
 * Count cells valid for placement on the current turn
 * (considering adjacency and straight-line constraints).
 * @param {Set<number>|null} boardMask  Active cell set; null = all cells active.
 */
function countValidTurnPlacements(cardLayout, turnCells, boardMask = null) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) {
    if (boardMask && !boardMask.has(i)) continue;
    if (cardLayout[i].rank) continue;
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    if (countCardsInRow(cardLayout, row) >= MAX_CARDS_PER_LINE) continue;
    if (countCardsInCol(cardLayout, col) >= MAX_CARDS_PER_LINE) continue;
    if (!isAdjacentToOccupied(cardLayout, i)) continue;
    if (!validateTurnLine(turnCells, i).valid) continue;
    count++;
  }
  return count;
}

/** Bonus points awarded when a player plays all 5 hand cards in one turn. */
const FIVE_CARD_BONUS = 5;

/**
 * Compute the sum of all row scores and all column scores from a flat cardLayout array.
 * Only lines with 2 or more cards are scored (matching CardGrid behaviour).
 */
function computeGridScores(cardLayout) {
  let rowTotal = 0;
  let colTotal = 0;
  for (let line = 0; line < GRID_SIZE; line++) {
    const rowCards = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const card = cardLayout[line * GRID_SIZE + c];
      if (card && card.rank) rowCards.push(card);
    }
    if (rowCards.length > 1) rowTotal += scoreHand(rowCards);

    const colCards = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const card = cardLayout[r * GRID_SIZE + line];
      if (card && card.rank) colCards.push(card);
    }
    if (colCards.length > 1) colTotal += scoreHand(colCards);
  }
  return { rowTotal, colTotal };
}

// =========================================================
// Multi-player helpers
// =========================================================

/** Player colour palette used throughout the UI. */
const PLAYER_COLORS = ['#1565c0', '#b71c1c', '#1b5e20', '#e65100'];

/**
 * Role label for a given player slot given the total player count.
 * Used in setup screen and turn display.
 */
function playerRoleLabel(playerIndex, numPlayers) {
  if (numPlayers === 2) return playerIndex === 0 ? 'rows' : 'cols';
  if (numPlayers === 3) {
    const labels = ['rows', 'even cols', 'odd cols'];
    return labels[playerIndex] || `player ${playerIndex + 1}`;
  }
  // 4 players
  const labels = ['top rows', 'bottom rows', 'left cols', 'right cols'];
  return labels[playerIndex] || `player ${playerIndex + 1}`;
}

/**
 * Assign scoring zones (rows / cols) to each player.
 * Returns an array of { rows: [...], cols: [...] } for each player.
 *
 * 2 players : P1=all rows,        P2=all cols
 * 3 players : P1=all rows,        P2=even cols (0,2,4,6), P3=odd cols (1,3,5)
 * 4 players : P1=rows 0–3,        P2=rows 4–6,
 *             P3=cols 0–3,        P4=cols 4–6
 */
function assignScoringZones(numPlayers) {
  const allRows = Array.from({ length: GRID_SIZE }, (_, i) => i);
  const allCols = Array.from({ length: GRID_SIZE }, (_, i) => i);
  const half = Math.ceil(GRID_SIZE / 2); // 4 for a 7-wide grid
  switch (numPlayers) {
    case 2:
      return [
        { rows: allRows, cols: [] },
        { rows: [], cols: allCols },
      ];
    case 3:
      return [
        { rows: allRows, cols: [] },
        { rows: [], cols: allCols.filter(c => c % 2 === 0) },
        { rows: [], cols: allCols.filter(c => c % 2 !== 0) },
      ];
    case 4:
    default:
      return [
        { rows: allRows.slice(0, half), cols: [] },
        { rows: allRows.slice(half),    cols: [] },
        { rows: [], cols: allCols.slice(0, half) },
        { rows: [], cols: allCols.slice(half) },
      ];
  }
}

/**
 * Compute the total score for a single player from their assigned scoring zone.
 */
function computePlayerScore(cardLayout, zone) {
  let score = 0;
  for (const row of zone.rows) {
    const rowCards = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const card = cardLayout[row * GRID_SIZE + c];
      if (card && card.rank) rowCards.push(card);
    }
    if (rowCards.length > 1) score += scoreHand(rowCards);
  }
  for (const col of zone.cols) {
    const colCards = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const card = cardLayout[r * GRID_SIZE + col];
      if (card && card.rank) colCards.push(card);
    }
    if (colCards.length > 1) score += scoreHand(colCards);
  }
  return score;
}

/**
 * Deal 5-card hands to numPlayers players from deck (deck[0] is the center card,
 * so pass deck.slice(1) here).
 * Returns { hands: [[...], ...], remainingDeck: [...] }.
 */
function dealHandsMulti(deck, numPlayers) {
  const hands = [];
  for (let p = 0; p < numPlayers; p++) {
    hands.push(deck.slice(p * 5, (p + 1) * 5));
  }
  return { hands, remainingDeck: deck.slice(numPlayers * 5) };
}

// =========================================================
// CardGrid
// =========================================================

class CardGrid extends React.Component {
  renderCard(i) {
    const boardMask = this.props.boardMask;
    // Inactive cell – render an invisible placeholder to preserve grid layout
    if (boardMask && !boardMask.has(i)) {
      return (
        <div
          className="board-cell-inactive"
          style={{ width: `${CARD_SIZE}px`, height: `${CARD_SIZE}px` }}
          aria-hidden="true"
        />
      );
    }

    const row = Math.floor(i / GRID_SIZE) + 1;
    const col = (i % GRID_SIZE) + 1;
    const card = this.props.cardLayout[i];
    const isEmpty = !card.rank;
    const inValidSet = !this.props.validCells || this.props.validCells.has(i);
    const isPlaceable = this.props.selectedHandCard && isEmpty && inValidSet;
    let posLabel = `Row ${row}, Column ${col}: ${cardDescription(card.rank, card.suit, false)}`;
    if (isPlaceable) posLabel += ' – click to place selected card here';
    return (
      <FadeCard
        rank={card.rank}
        suit={card.suit}
        clickHandler={() => this.props.clickHandler(i)}
        aria-label={posLabel}
        style={isPlaceable ? { outline: '2px dashed var(--placeable-outline)', borderRadius: '6px' } : {}}
      />
    );
  }

  getLineScores(indices, maxes, step) {
    var scores = [];
    for (let ind = 0 ; ind < GRID_SIZE ; ind++) {

      let startIndex = indices[ind];
      let maxIndex = maxes[ind];
      let lineCards = [];
      for(let i = startIndex; i < maxIndex; i += step) {
        if (this.props.cardLayout[i].rank) {
          lineCards.push(this.props.cardLayout[i]);
        }
      }
      let score = 0;
      if (lineCards.length > 1) {
        score = scoreHand(lineCards);
      }
      scores.push(score);
    }
    return scores;
  }

  getRowScores() {
    const indices = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE);
    const maxes   = Array.from({ length: GRID_SIZE }, (_, i) => (i + 1) * GRID_SIZE);
    return this.getLineScores(indices, maxes, 1);
  }

  getColumnScores() {
    const indices = Array.from({ length: GRID_SIZE }, (_, i) => i);
    const maxes   = Array.from({ length: GRID_SIZE }, () => CELLS);
    return this.getLineScores(indices, maxes, GRID_SIZE);
  }

  /** Returns true if a given row has at least one active cell in the board mask. */
  rowHasActiveCells(row) {
    const boardMask = this.props.boardMask;
    if (!boardMask) return true;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (boardMask.has(row * GRID_SIZE + c)) return true;
    }
    return false;
  }

  /** Returns true if a given column has at least one active cell in the board mask. */
  colHasActiveCells(col) {
    const boardMask = this.props.boardMask;
    if (!boardMask) return true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (boardMask.has(r * GRID_SIZE + col)) return true;
    }
    return false;
  }

  /**
   * Given a row or col index and a direction ('row'|'col'), return the player
   * index who owns that line (based on props.zones), or -1 if unowned.
   */
  ownerOf(lineIndex, direction) {
    const zones = this.props.zones;
    if (!zones) return direction === 'row' ? 0 : 1; // 2-player legacy
    for (let p = 0; p < zones.length; p++) {
      const zone = zones[p];
      if (direction === 'row' && zone.rows.includes(lineIndex)) return p;
      if (direction === 'col' && zone.cols.includes(lineIndex)) return p;
    }
    return -1;
  }

  render() {
    let rowScores = this.getRowScores();
    let columnScores = this.getColumnScores();
    const columnScoreTotal = columnScores.reduce((x,y)=>x+y, 0);
    const rowScoreTotal = rowScores.reduce((x,y)=>x+y, 0);

    // Top header row: [next card / deck] [col scores…] [col total]
    let topRowElements = [];
    if(this.props.nextCard) {
      topRowElements.push(
        <td key="next-card">
          <Card
            rank={this.props.nextCard.rank}
            suit={this.props.nextCard.suit}
            aria-label={`Next card: ${cardDescription(this.props.nextCard.rank, this.props.nextCard.suit, false)}`}
          />
        </td>
      );
    }
    else {
      topRowElements.push(
        <td key="deck">
          <Deck
            isEmpty={false}
            clickHandler={() => {this.props.resetCallback(rowScoreTotal, columnScoreTotal)}}
          />
        </td>
      );
    }
    for(let c = 0; c < GRID_SIZE; c++) {
      if (!this.colHasActiveCells(c)) continue;
      const owner = this.ownerOf(c, 'col');
      const ownerColor = owner >= 0 ? PLAYER_COLORS[owner % PLAYER_COLORS.length] : 'var(--page-text)';
      topRowElements.push(
        <th key={`col-score-${c}`} scope="col" style={{ color: ownerColor, textAlign: 'center', padding: '2px 4px' }}>
          <span className="sr-only">{`Column ${c + 1} score: `}</span>
          <span>{columnScores[c]}</span>
        </th>
      );
    }
    topRowElements.push(
      <th key="col-total" scope="col" style={{ textAlign: 'center', padding: '2px 4px' }}>
        <span className="sr-only">Column total score: </span>
        <span style={{fontWeight: 'bold', fontSize: 24}}>{columnScoreTotal}</span>
      </th>
    );

    // Game rows 1–GRID_SIZE
    let bodyRows = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      if (!this.rowHasActiveCells(row)) continue;
      const rowOwner = this.ownerOf(row, 'row');
      const rowOwnerColor = rowOwner >= 0 ? PLAYER_COLORS[rowOwner % PLAYER_COLORS.length] : 'var(--page-text)';
      let rowElements = [];
      rowElements.push(
        <th key="row-score" scope="row" style={{ color: rowOwnerColor, textAlign: 'right', paddingRight: '4px' }}>
          <span className="sr-only">{`Row ${row + 1} score: `}</span>
          <span>{rowScores[row]}</span>
        </th>
      );
      for(let cardIndex = 0; cardIndex < GRID_SIZE; cardIndex++) {
        const ind = cardIndex + GRID_SIZE * row;
        const isInactive = this.props.boardMask && !this.props.boardMask.has(ind);
        rowElements.push(
          <td key={`card-${ind}`} style={isInactive ? { padding: 0 } : undefined}>
            {this.renderCard(ind)}
          </td>
        );
      }
      bodyRows.push(<tr key={`row-${row}`}>{rowElements}</tr>);
    }

    const numPlayers = this.props.zones ? this.props.zones.length : 2;
    const captionText = numPlayers === 2
      ? `Cribbage Grid – variable-shape card grid. P1 scores for rows (left totals); P2/CPU scores for columns (top totals).`
      : `Cribbage Grid – variable-shape card grid. ${numPlayers}-player game – row/column colours show each player's scoring zone.`;

    return (
      <table>
        <caption className="sr-only">{captionText}</caption>
        <thead>
          <tr>{topRowElements}</tr>
        </thead>
        <tbody>
          {bodyRows}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <span className="sr-only">Row total score: </span>
              <span style={{fontWeight: 'bold', fontSize: 24}}>{rowScoreTotal}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    );
  }
}

// =========================================================
// CribbageGame – single round, with hand system
// =========================================================

class CribbageGame extends React.Component {
  constructor(props) {
    super(props);

    if (props.initialGameState) {
      // Online multiplayer: use the shared initial state from the host
      const initLayout = props.initialGameState.cardLayout;
      this.state = {
        deck: props.initialGameState.deck,
        p1Hand: props.initialGameState.p1Hand || [],
        p2Hand: props.initialGameState.p2Hand || [],
        cardLayout: initLayout,
        rowTurn: props.initialGameState.rowTurn,
        selectedHandIndex: null,
        p1Name: props.initialGameState.p1Name || 'Host',
        p2Name: props.initialGameState.p2Name || 'Guest',
        cardsPlacedThisTurn: 0,
        turnCells: [],
        p1Bonus: 0,
        p2Bonus: 0,
        placementError: null,
        lastTurnInfo: null,
        turnStartScores: computeGridScores(initLayout),
        boardMask: null, // online multiplayer uses full grid
      };
    } else {
      const numPlayers = (props.players && props.players.length) || 2;
      const deck = makeDeck();
      shuffleDeck(deck);

      // center card
      let cl = Array(CELLS).fill(null).map(() => ({ rank: null, suit: null }));
      cl[CENTER] = deck[0];

      const boardMask = generateBoardMask(GRID_SIZE);
      const zones = this._getZones(numPlayers, props.players);
      const { hands, remainingDeck } = dealHandsMulti(deck.slice(1), numPlayers);

      this.state = {
        deck: remainingDeck,
        hands,
        cardLayout: cl,
        currentPlayerIndex: 0,
        selectedHandIndex: null,
        cardsPlacedThisTurn: 0,
        turnCells: [],
        playerBonuses: new Array(numPlayers).fill(0),
        placementError: null,
        lastTurnInfo: null,
        turnStartScores: zones.map(z => computePlayerScore(cl, z)),
        // Keep peerSync-compatible fields for the 2-player online path
        p1Hand: hands[0],
        p2Hand: hands[1] || [],
        rowTurn: true,
        boardMask,
      };
    }
  }

  /** Return scoring zones from either player configs or auto-assignment. */
  _getZones(numPlayers, players) {
    if (players && players.length === numPlayers && players[0] && players[0].zone) {
      return players.map(p => p.zone);
    }
    return assignScoringZones(numPlayers);
  }

  /** Default player configs when none provided. */
  _defaultPlayers() {
    return [
      { type: 'human', name: 'P1', cpuLevel: 5, role: 'rows',
        zone: { rows: Array.from({length: GRID_SIZE}, (_, i) => i), cols: [] } },
      { type: 'cpu',   name: 'CPU', cpuLevel: 5, role: 'cols',
        zone: { rows: [], cols: Array.from({length: GRID_SIZE}, (_, i) => i) } },
    ];
  }

  componentDidMount() {
    if (this.props.peerSync) {
      this.props.peerSync.on('update', (newState) => {
        this.setState({
          deck: newState.deck,
          p1Hand: newState.p1Hand || [],
          p2Hand: newState.p2Hand || [],
          cardLayout: newState.cardLayout,
          rowTurn: newState.rowTurn,
          selectedHandIndex: null,
          cardsPlacedThisTurn: newState.cardsPlacedThisTurn || 0,
          turnCells: newState.turnCells || [],
          p1Bonus: newState.p1Bonus || 0,
          p2Bonus: newState.p2Bonus || 0,
          placementError: null,
          // Update names when they arrive (joiner sends back p2Name on first sync)
          p1Name: newState.p1Name || this.state.p1Name,
          p2Name: newState.p2Name || this.state.p2Name,
          lastTurnInfo: newState.lastTurnInfo || null,
          turnStartScores: newState.turnStartScores ?? this.state.turnStartScores,
        });
      });
    } else {
      // Local game: fire CPU if it is CPU's turn first
      this._maybeTriggerCpu(this.state);
    }
  }

  /** Returns true when it is the local player's turn (online multiplayer only). */
  isMyTurn() {
    return this.props.isHost ? this.state.rowTurn : !this.state.rowTurn;
  }

  /** Current player's player config (from props.players). */
  currentPlayer() {
    if (this.props.peerSync) {
      const idx = this.state.rowTurn ? 0 : 1;
      const players = this.props.players || this._defaultPlayers();
      return players[idx];
    }
    const players = this.props.players || this._defaultPlayers();
    return players[this.state.currentPlayerIndex];
  }

  /** Fire CPU move if current player is CPU (local game only). */
  _maybeTriggerCpu(state) {
    if (this.props.peerSync) return;
    const players = this.props.players || this._defaultPlayers();
    const idx = state.currentPlayerIndex;
    const player = players[idx];
    const hand = state.hands && state.hands[idx];
    const hasValidCells = countValidTurnPlacements(state.cardLayout, [], state.boardMask) > 0;
    if (player && player.type === 'cpu' && hasValidCells && hand && hand.length > 0) {
      setTimeout(() => this.cpuMoveHandler(), 1200);
    }
  }

  resetGame() {
    if (this.props.peerSync && !this.props.isHost) return;

    let deck = makeDeck();
    shuffleDeck(deck);

    let cl = Array(CELLS).fill(null).map(() => ({ rank: null, suit: null }));
    cl[CENTER] = deck[0];

    if (this.props.peerSync) {
      // Online 2-player reset
      const { p1Hand, p2Hand, remainingDeck } = dealHands(deck.slice(1));
      const newRowTurn = !this.state.rowTurn;
      const newState = {
        deck: remainingDeck,
        p1Hand,
        p2Hand,
        cardLayout: cl,
        rowTurn: newRowTurn,
        selectedHandIndex: null,
        cardsPlacedThisTurn: 0,
        turnCells: [],
        p1Bonus: 0,
        p2Bonus: 0,
        placementError: null,
        lastTurnInfo: null,
        turnStartScores: computeGridScores(cl),
        boardMask: null,
      };
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
      this.setState(newState, () => { this._maybeTriggerCpu(newState); });
    } else {
      // Local N-player reset – generate a new random board shape each round
      const boardMask = generateBoardMask(GRID_SIZE);
      const numPlayers = (this.props.players && this.props.players.length) || 2;
      const zones = this._getZones(numPlayers, this.props.players);
      const { hands, remainingDeck } = dealHandsMulti(deck.slice(1), numPlayers);
      // Next round starts with the next player in rotation
      const nextStart = (this.state.currentPlayerIndex + 1) % numPlayers;
      const newState = {
        deck: remainingDeck,
        hands,
        cardLayout: cl,
        currentPlayerIndex: nextStart,
        selectedHandIndex: null,
        cardsPlacedThisTurn: 0,
        turnCells: [],
        playerBonuses: new Array(numPlayers).fill(0),
        placementError: null,
        lastTurnInfo: null,
        turnStartScores: zones.map(z => computePlayerScore(cl, z)),
        p1Hand: hands[0],
        p2Hand: hands[1] || [],
        rowTurn: nextStart === 0,
        boardMask,
      };
      this.setState(newState, () => { this._maybeTriggerCpu(newState); });
    }
  }

  handleHandClick(index) {
    const newIndex = this.state.selectedHandIndex === index ? null : index;
    this.setState({ selectedHandIndex: newIndex });
  }

  handleGridClick(i) {
    if (this.state.cardLayout[i].rank) return; // already filled

    // Reject clicks on cells outside the board mask
    const { boardMask } = this.state;
    if (boardMask && !boardMask.has(i)) return;

    if (this.props.peerSync) {
      // Online multiplayer path (2-player)
      if (!this.isMyTurn()) return;

      const { selectedHandIndex, rowTurn, cardLayout } = this.state;
      if (selectedHandIndex === null) return;

      const hand = rowTurn ? this.state.p1Hand : this.state.p2Hand;
      const cardToPlace = hand[selectedHandIndex];
      if (!cardToPlace || !cardToPlace.rank) return;

      const row = Math.floor(i / GRID_SIZE);
      const col = i % GRID_SIZE;
      if (countCardsInRow(cardLayout, row) >= MAX_CARDS_PER_LINE) {
        this.setState({ placementError: `Row ${row + 1} already has ${MAX_CARDS_PER_LINE} cards – choose a different row.` });
        return;
      }
      if (countCardsInCol(cardLayout, col) >= MAX_CARDS_PER_LINE) {
        this.setState({ placementError: `Column ${col + 1} already has ${MAX_CARDS_PER_LINE} cards – choose a different column.` });
        return;
      }

      // Adjacency check
      if (!isAdjacentToOccupied(cardLayout, i)) {
        this.setState({ placementError: 'Cards must connect – place adjacent to an existing card.' });
        return;
      }

      // Straight-line check
      const lineCheck = validateTurnLine(this.state.turnCells, i);
      if (!lineCheck.valid) {
        this.setState({ placementError: lineCheck.error });
        return;
      }

      // Remove the placed card from hand (no deck draw until end of turn)
      const newHand = hand.filter((_, idx) => idx !== selectedHandIndex);

      const newLayout = cardLayout.slice();
      newLayout[i] = cardToPlace;
      const newTurnCells = [...this.state.turnCells, i];

      const newState = {
        deck: this.state.deck,
        p1Hand: rowTurn ? newHand : this.state.p1Hand,
        p2Hand: rowTurn ? this.state.p2Hand : newHand,
        cardLayout: newLayout,
        rowTurn,
        selectedHandIndex: null,
        cardsPlacedThisTurn: this.state.cardsPlacedThisTurn + 1,
        turnCells: newTurnCells,
        placementError: null,
        lastTurnInfo: this.state.lastTurnInfo,
        turnStartScores: this.state.turnStartScores,
        p1Bonus: this.state.p1Bonus,
        p2Bonus: this.state.p2Bonus,
      };
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
      this.setState(newState);
      return;
    }

    // Local N-player path
    const { selectedHandIndex, currentPlayerIndex, cardLayout, hands } = this.state;
    const players = this.props.players || this._defaultPlayers();
    const player = players[currentPlayerIndex];

    if (player && player.type === 'cpu') return;
    if (selectedHandIndex === null) return;

    const hand = hands[currentPlayerIndex];
    const cardToPlace = hand && hand[selectedHandIndex];
    if (!cardToPlace || !cardToPlace.rank) return;

    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    if (countCardsInRow(cardLayout, row) >= MAX_CARDS_PER_LINE) {
      this.setState({ placementError: `Row ${row + 1} already has ${MAX_CARDS_PER_LINE} cards – choose a different row.` });
      return;
    }
    if (countCardsInCol(cardLayout, col) >= MAX_CARDS_PER_LINE) {
      this.setState({ placementError: `Column ${col + 1} already has ${MAX_CARDS_PER_LINE} cards – choose a different column.` });
      return;
    }

    // Adjacency check
    if (!isAdjacentToOccupied(cardLayout, i)) {
      this.setState({ placementError: 'Cards must connect – place adjacent to an existing card.' });
      return;
    }

    // Straight-line check
    const lineCheck = validateTurnLine(this.state.turnCells, i);
    if (!lineCheck.valid) {
      this.setState({ placementError: lineCheck.error });
      return;
    }

    // Remove the placed card from hand (no deck draw until end of turn)
    const newHand = hand.filter((_, idx) => idx !== selectedHandIndex);

    const newLayout = cardLayout.slice();
    newLayout[i] = cardToPlace;
    const newTurnCells = [...this.state.turnCells, i];

    const newHands = hands.map((h, idx) => idx === currentPlayerIndex ? newHand : h);

    this.setState({
      hands: newHands,
      cardLayout: newLayout,
      selectedHandIndex: null,
      cardsPlacedThisTurn: this.state.cardsPlacedThisTurn + 1,
      turnCells: newTurnCells,
      placementError: null,
      p1Hand: newHands[0],
      p2Hand: newHands[1] || [],
    });
  }

  /** End the current player's turn and advance to the next player. */
  handleEndTurn() {
    if (this.props.peerSync) {
      // Online 2-player path
      if (!this.isMyTurn()) return;
      const { deck, p1Hand, p2Hand, cardLayout, rowTurn, cardsPlacedThisTurn, turnStartScores } = this.state;
      const newRowTurn = !rowTurn;
      const currentScores = computeGridScores(cardLayout);

      // Draw replacement cards from deck for the current player
      let newDeck = deck.slice();
      const currentHand = rowTurn ? p1Hand : p2Hand;
      const refilled = currentHand.slice();
      while (refilled.length < 5 && newDeck.length > 0) {
        refilled.push(newDeck[0]);
        newDeck = newDeck.slice(1);
      }
      const newP1Hand = rowTurn ? refilled : p1Hand;
      const newP2Hand = rowTurn ? p2Hand : refilled;

      // 5-card bonus
      const earnedBonus = cardsPlacedThisTurn === 5 ? FIVE_CARD_BONUS : 0;
      const newP1Bonus = (this.state.p1Bonus || 0) + (rowTurn ? earnedBonus : 0);
      const newP2Bonus = (this.state.p2Bonus || 0) + (!rowTurn ? earnedBonus : 0);

      const lastTurnInfo = {
        wasRowTurn: rowTurn,
        rowDelta: currentScores.rowTotal - turnStartScores.rowTotal,
        colDelta: currentScores.colTotal - turnStartScores.colTotal,
        cardsPlaced: cardsPlacedThisTurn,
        bonusPoints: earnedBonus,
      };
      const newState = {
        deck: newDeck,
        p1Hand: newP1Hand,
        p2Hand: newP2Hand,
        cardLayout,
        rowTurn: newRowTurn,
        selectedHandIndex: null,
        cardsPlacedThisTurn: 0,
        turnCells: [],
        placementError: null,
        lastTurnInfo,
        turnStartScores: currentScores,
        p1Bonus: newP1Bonus,
        p2Bonus: newP2Bonus,
      };
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
      this.setState(newState, () => { this._maybeTriggerCpu(newState); });
      return;
    }

    // Local N-player path
    const { hands, cardLayout, currentPlayerIndex, cardsPlacedThisTurn, turnStartScores, playerBonuses } = this.state;
    const players = this.props.players || this._defaultPlayers();
    const numPlayers = players.length;
    const newPlayerIndex = (currentPlayerIndex + 1) % numPlayers;

    // Draw replacement cards from deck
    let newDeck = this.state.deck.slice();
    const newHands = hands.map((h, idx) => {
      if (idx !== currentPlayerIndex) return h;
      const refilled = h.slice();
      while (refilled.length < 5 && newDeck.length > 0) {
        refilled.push(newDeck[0]);
        newDeck = newDeck.slice(1);
      }
      return refilled;
    });

    const zones = this._getZones(numPlayers, players);
    const newScores = zones.map(z => computePlayerScore(cardLayout, z));
    const scoreDelta = newScores[currentPlayerIndex] - turnStartScores[currentPlayerIndex];

    // 5-card bonus
    const earnedBonus = cardsPlacedThisTurn === 5 ? FIVE_CARD_BONUS : 0;
    const newPlayerBonuses = (playerBonuses || []).slice();
    while (newPlayerBonuses.length < numPlayers) newPlayerBonuses.push(0);
    if (earnedBonus > 0) newPlayerBonuses[currentPlayerIndex] += earnedBonus;

    const lastTurnInfo = {
      playerIndex: currentPlayerIndex,
      playerName: players[currentPlayerIndex].name,
      playerRole: players[currentPlayerIndex].role,
      scoreDelta,
      cardsPlaced: cardsPlacedThisTurn,
      bonusPoints: earnedBonus,
    };

    const newState = {
      deck: newDeck,
      hands: newHands,
      cardLayout,
      currentPlayerIndex: newPlayerIndex,
      selectedHandIndex: null,
      cardsPlacedThisTurn: 0,
      turnCells: [],
      playerBonuses: newPlayerBonuses,
      placementError: null,
      lastTurnInfo,
      turnStartScores: newScores,
      p1Hand: newHands[0],
      p2Hand: newHands[1] || [],
      rowTurn: newPlayerIndex === 0,
    };

    this.setState(newState, () => { this._maybeTriggerCpu(newState); });
  }

  cpuMoveHandler() {
    if (this.props.peerSync) return; // CPU not used in online multiplayer

    const { currentPlayerIndex, cardLayout, cardsPlacedThisTurn, hands, turnCells, boardMask } = this.state;
    const players = this.props.players || this._defaultPlayers();
    const player = players[currentPlayerIndex];
    if (!player || player.type !== 'cpu') return;

    const hand = hands[currentPlayerIndex];
    const cpuLevel = player.cpuLevel || 5;
    const numPlayers = players.length;

    // Check if game is over (no placeable cells at all)
    if (countValidPlacements(cardLayout, boardMask) === 0) {
      this.handleEndTurn();
      return;
    }

    // Check turn limits and valid turn placements
    const validTurnCells = countValidTurnPlacements(cardLayout, turnCells, boardMask);
    if (cardsPlacedThisTurn >= MAX_CARDS_PER_LINE || validTurnCells === 0) {
      this.handleEndTurn();
      return;
    }

    // Use zone-aware CPU for all player counts
    const zone = player.zone || this._getZones(numPlayers, players)[currentPlayerIndex];
    const move = getCpuHandMoveForZone(cardLayout, hand, cpuLevel, zone, turnCells, boardMask);
    if (!move) {
      this.handleEndTurn();
      return;
    }

    const { handIndex, gridIndex } = move;
    // Remove placed card from hand (no draw from deck until end of turn)
    const newHand = hand.filter((_, idx) => idx !== handIndex);

    const newLayout = cardLayout.slice();
    newLayout[gridIndex] = hand[handIndex];
    const newCardsPlaced = cardsPlacedThisTurn + 1;
    const newTurnCells = [...turnCells, gridIndex];
    const nextValidTurnCells = countValidTurnPlacements(newLayout, newTurnCells, boardMask);

    const newHands = hands.map((h, idx) => idx === currentPlayerIndex ? newHand : h);

    const newState = {
      hands: newHands,
      cardLayout: newLayout,
      currentPlayerIndex,
      selectedHandIndex: null,
      cardsPlacedThisTurn: newCardsPlaced,
      turnCells: newTurnCells,
      placementError: null,
      lastTurnInfo: this.state.lastTurnInfo,
      turnStartScores: this.state.turnStartScores,
      playerBonuses: this.state.playerBonuses,
      p1Hand: newHands[0],
      p2Hand: newHands[1] || [],
      rowTurn: currentPlayerIndex === 0,
      boardMask,
    };

    this.setState(newState, () => {
      const stillHasCards = newHand.length > 0;
      if (newCardsPlaced < MAX_CARDS_PER_LINE && stillHasCards && nextValidTurnCells > 0) {
        setTimeout(() => this.cpuMoveHandler(), 800);
      } else {
        setTimeout(() => this.handleEndTurn(), 600);
      }
    });
  }

  render() {
    const { peerSync, players } = this.props;

    if (peerSync) {
      return this._renderOnlineMultiplayer();
    }
    return this._renderLocalGame(players || this._defaultPlayers());
  }

  _renderOnlineMultiplayer() {
    const { cardLayout, p1Hand, p2Hand, selectedHandIndex, deck,
            cardsPlacedThisTurn, placementError, lastTurnInfo, turnCells,
            p1Name: stateP1Name, p2Name: stateP2Name, boardMask } = this.state;
    const { isHost } = this.props;

    const resolvedP1Name = stateP1Name || 'Host';
    const resolvedP2Name = stateP2Name || 'Guest';
    const roundOver = countValidPlacements(cardLayout, boardMask) === 0 ||
                      countValidTurnPlacements(cardLayout, [], boardMask) === 0;
    const myTurn = this.isMyTurn();
    const myRole = isHost ? 'rows' : 'cols';
    const myName = isHost ? resolvedP1Name : resolvedP2Name;

    let turnText;
    if (roundOver) {
      turnText = isHost
        ? "Round Over – click deck to start next round"
        : "Round Over – waiting for host to start next round";
    } else {
      turnText = myTurn ? `Your Turn – ${myName} (${myRole})` : "Opponent's Turn";
    }

    const isLocalHumanTurn = myTurn;
    const selectedCardForGrid = isLocalHumanTurn && selectedHandIndex !== null
      ? (isHost ? p1Hand[selectedHandIndex] : p2Hand[selectedHandIndex])
      : null;

    // Compute valid placement cells (considering boardMask + adjacency + turn line)
    const validCellSet = new Set();
    if (!roundOver && isLocalHumanTurn) {
      for (let idx = 0; idx < CELLS; idx++) {
        if (boardMask && !boardMask.has(idx)) continue;
        if (cardLayout[idx].rank) continue;
        const r = Math.floor(idx / GRID_SIZE);
        const c = idx % GRID_SIZE;
        if (countCardsInRow(cardLayout, r) >= MAX_CARDS_PER_LINE) continue;
        if (countCardsInCol(cardLayout, c) >= MAX_CARDS_PER_LINE) continue;
        if (!isAdjacentToOccupied(cardLayout, idx)) continue;
        if (!validateTurnLine(turnCells, idx).valid) continue;
        validCellSet.add(idx);
      }
    }

    const resetClickHandler = (r, c) => {
      if (isHost) {
        const p1Bonus = this.state.p1Bonus || 0;
        const p2Bonus = this.state.p2Bonus || 0;
        this.resetGame();
        this.props.resetCallback([r + p1Bonus, c + p2Bonus]);
      }
    };

    // Turn line indicator
    let turnLineText = null;
    if (!roundOver && myTurn && turnCells.length > 0) {
      const rows = turnCells.map(c => Math.floor(c / GRID_SIZE));
      const cols = turnCells.map(c => c % GRID_SIZE);
      if (turnCells.length === 1) {
        turnLineText = `First card placed – next card must share row ${rows[0] + 1} or column ${cols[0] + 1}`;
      } else if (rows.every(r => r === rows[0])) {
        turnLineText = `Playing in row ${rows[0] + 1} this turn`;
      } else if (cols.every(c => c === cols[0])) {
        turnLineText = `Playing in column ${cols[0] + 1} this turn`;
      }
    }

    // 2-player zones for color coding
    const zones = assignScoringZones(2);

    return (
      <div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{turnText}</div>
        <h3>{turnText}</h3>
        <p style={{ color: 'var(--score-label-color)', fontSize: '14px', marginTop: 0 }}>
          You are: <strong>{isHost ? `${resolvedP1Name} (rows)` : `${resolvedP2Name} (cols)`}</strong>
        </p>
        {turnLineText && (
          <p style={{ fontSize: '13px', color: '#1565c0', margin: '2px 0 6px' }}>
            🎯 {turnLineText}
          </p>
        )}
        <br/>
        <CardGrid
          nextCard={roundOver ? null : (isHost ? (p1Hand[0] || null) : (p2Hand[0] || null))}
          cardLayout={cardLayout}
          clickHandler={(i) => this.handleGridClick(i)}
          resetCallback={resetClickHandler}
          selectedHandCard={selectedCardForGrid}
          validCells={validCellSet}
          zones={zones}
          boardMask={boardMask}
        />
        <br />
        {lastTurnInfo && (
          <div role="status" aria-live="polite" style={lastTurnStyle}>
            <strong>
              Last turn – {lastTurnInfo.wasRowTurn ? resolvedP1Name : resolvedP2Name}
              {' '}({lastTurnInfo.wasRowTurn ? 'rows' : 'cols'}):
            </strong>{' '}
            placed {lastTurnInfo.cardsPlaced} card{lastTurnInfo.cardsPlaced !== 1 ? 's' : ''}
            {' · '}Row pts: <strong>{lastTurnInfo.rowDelta > 0 ? `+${lastTurnInfo.rowDelta}` : lastTurnInfo.rowDelta}</strong>
            {' · '}Col pts: <strong>{lastTurnInfo.colDelta > 0 ? `+${lastTurnInfo.colDelta}` : lastTurnInfo.colDelta}</strong>
            {lastTurnInfo.bonusPoints > 0 && (
              <>{' · '}<strong style={{ color: '#e65100' }}>🎉 Full Hand Bonus: +{lastTurnInfo.bonusPoints}</strong></>
            )}
          </div>
        )}
        <div>
          <HandDisplay
            hand={isHost ? p1Hand : p2Hand}
            selectedIndex={isLocalHumanTurn ? selectedHandIndex : null}
            onCardClick={(i) => this.handleHandClick(i)}
            label={`Your Hand – ${isHost ? resolvedP1Name : resolvedP2Name} (${isHost ? 'rows' : 'cols'})`}
            faceDown={false}
            isActive={isLocalHumanTurn && !roundOver}
          />
          <HandDisplay
            hand={isHost ? p2Hand : p1Hand}
            selectedIndex={null}
            onCardClick={() => {}}
            label={`Opponent's Hand – ${isHost ? resolvedP2Name : resolvedP1Name} (${isHost ? 'cols' : 'rows'})`}
            faceDown={true}
            isActive={false}
          />
        </div>
        <p style={{ fontSize: '12px', color: '#888' }}>Cards remaining in deck: {deck.length}</p>
        {!roundOver && isLocalHumanTurn && this._renderEndTurnButton(cardsPlacedThisTurn)}
        {placementError && (
          <p role="alert" style={{ color: '#c62828', fontSize: '14px', margin: '6px 0' }}>
            ⚠ {placementError}
          </p>
        )}
      </div>
    );
  }

  _renderLocalGame(players) {
    const { cardLayout, currentPlayerIndex, hands, selectedHandIndex, deck,
            cardsPlacedThisTurn, placementError, lastTurnInfo, turnCells,
            playerBonuses, boardMask } = this.state;
    const numPlayers = players.length;
    const currentPlayer = players[currentPlayerIndex];
    const zones = this._getZones(numPlayers, players);

    const roundOver = countValidPlacements(cardLayout, boardMask) === 0 ||
                      countValidTurnPlacements(cardLayout, [], boardMask) === 0;

    const isHumanTurn = currentPlayer && currentPlayer.type === 'human';

    let turnText;
    if (roundOver) {
      turnText = "Round Over – click deck (astronaut) for next round";
    } else {
      const role = currentPlayer ? currentPlayer.role : '';
      turnText = currentPlayer && currentPlayer.type === 'cpu'
        ? `CPU's Turn (${role}) – ${currentPlayer.name}`
        : `${currentPlayer ? currentPlayer.name : 'Player'}'s Turn (${role})`;
    }

    const currentHand = hands && hands[currentPlayerIndex];
    const nextCardForGrid = (!roundOver && currentHand && currentHand[0]) ? currentHand[0] : null;

    const selectedCardForGrid = isHumanTurn && selectedHandIndex !== null
      ? (currentHand && currentHand[selectedHandIndex])
      : null;

    const playerColor = PLAYER_COLORS[currentPlayerIndex % PLAYER_COLORS.length];

    // Compute valid placement cells (boardMask + adjacency + turn line)
    const validCellSet = new Set();
    if (!roundOver && isHumanTurn) {
      for (let idx = 0; idx < CELLS; idx++) {
        if (boardMask && !boardMask.has(idx)) continue;
        if (cardLayout[idx].rank) continue;
        const r = Math.floor(idx / GRID_SIZE);
        const c = idx % GRID_SIZE;
        if (countCardsInRow(cardLayout, r) >= MAX_CARDS_PER_LINE) continue;
        if (countCardsInCol(cardLayout, c) >= MAX_CARDS_PER_LINE) continue;
        if (!isAdjacentToOccupied(cardLayout, idx)) continue;
        if (!validateTurnLine(turnCells, idx).valid) continue;
        validCellSet.add(idx);
      }
    }

    // Turn line indicator text
    let turnLineText = null;
    if (!roundOver && isHumanTurn && turnCells.length > 0) {
      const rows = turnCells.map(c => Math.floor(c / GRID_SIZE));
      const cols = turnCells.map(c => c % GRID_SIZE);
      if (turnCells.length === 1) {
        turnLineText = `First card placed – next must share row ${rows[0] + 1} or column ${cols[0] + 1}`;
      } else if (rows.every(r => r === rows[0])) {
        turnLineText = `Playing in row ${rows[0] + 1} this turn`;
      } else if (cols.every(c => c === cols[0])) {
        turnLineText = `Playing in column ${cols[0] + 1} this turn`;
      }
    }

    const resetClickHandler = (r, c) => {
      // Compute per-player scores (grid score + accumulated bonuses)
      const finalScores = zones.map((z, i) =>
        computePlayerScore(cardLayout, z) + ((playerBonuses || [])[i] || 0)
      );
      this.resetGame();
      this.props.resetCallback(finalScores);
    };

    return (
      <div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{turnText}</div>
        <h3 style={{ color: playerColor }}>{turnText}</h3>
        {turnLineText && (
          <p style={{ fontSize: '13px', color: '#1565c0', margin: '2px 0 6px' }}>
            🎯 {turnLineText}
          </p>
        )}
        <br/>
        <CardGrid
          nextCard={roundOver ? null : nextCardForGrid}
          cardLayout={cardLayout}
          clickHandler={(i) => this.handleGridClick(i)}
          resetCallback={resetClickHandler}
          selectedHandCard={selectedCardForGrid}
          validCells={validCellSet}
          zones={zones}
          boardMask={boardMask}
        />
        <br />
        {lastTurnInfo && (
          <div role="status" aria-live="polite" style={lastTurnStyle}>
            <strong>
              Last turn – {lastTurnInfo.playerName} ({lastTurnInfo.playerRole}):
            </strong>{' '}
            placed {lastTurnInfo.cardsPlaced} card{lastTurnInfo.cardsPlaced !== 1 ? 's' : ''}
            {lastTurnInfo.scoreDelta !== 0 && (
              <>{' · '}Score: <strong>{lastTurnInfo.scoreDelta > 0 ? `+${lastTurnInfo.scoreDelta}` : lastTurnInfo.scoreDelta}</strong></>
            )}
            {lastTurnInfo.bonusPoints > 0 && (
              <>{' · '}<strong style={{ color: '#e65100' }}>🎉 Full Hand Bonus: +{lastTurnInfo.bonusPoints}</strong></>
            )}
          </div>
        )}
        {/* Hand displays for all local players */}
        <div>
          {players.map((player, idx) => {
            const hand = hands && hands[idx];
            const isTurnPlayer = idx === currentPlayerIndex;
            const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
            return (
              <HandDisplay
                key={idx}
                hand={hand}
                selectedIndex={isTurnPlayer && isHumanTurn ? selectedHandIndex : null}
                onCardClick={(i) => this.handleHandClick(i)}
                label={<span style={{ color }}>{player.name}'s Hand ({player.role})</span>}
                faceDown={player.type === 'cpu'}
                isActive={isTurnPlayer && player.type === 'human' && !roundOver}
              />
            );
          })}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--score-label-color)' }}>Cards remaining in deck: {deck.length}</p>
        {!roundOver && isHumanTurn && this._renderEndTurnButton(cardsPlacedThisTurn)}
        {placementError && (
          <p role="alert" style={{ color: '#c62828', fontSize: '14px', margin: '6px 0' }}>
            ⚠ {placementError}
          </p>
        )}
      </div>
    );
  }

  _renderEndTurnButton(cardsPlacedThisTurn) {
    return (
      <div style={{ margin: '12px 0' }}>
        <button
          onClick={() => this.handleEndTurn()}
          aria-label="End your turn and pass play to the next player"
          style={{
            padding: '10px 28px', fontSize: '16px', cursor: 'pointer',
            borderRadius: '6px', border: 'none',
            backgroundColor: '#388e3c', color: '#fff', fontWeight: 'bold',
          }}
        >
          End Turn {cardsPlacedThisTurn > 0 ? `(${cardsPlacedThisTurn} card${cardsPlacedThisTurn !== 1 ? 's' : ''} placed)` : ''}
        </button>
        {cardsPlacedThisTurn === 0 && (
          <span style={{ marginLeft: '10px', fontSize: '13px', color: '#777' }}>
            Place at least one card before ending your turn.
          </span>
        )}
      </div>
    );
  }
}

// =========================================================
// MultiRoundCribbageGame – top-level component
// =========================================================

class MultiRoundCribbageGame extends React.Component {
  constructor(props) {
    super(props);
    const autoJoinId = getAutoJoinId();
    this.state = {
      // Online multiplayer (peerSync) uses rowScoreboard / colScoreboard
      rowScoreboard: 0,
      colScoreboard: 0,
      // Local N-player games use playerScoreboards (array indexed by player slot)
      playerScoreboards: [],
      showMultiplayerLobby: !!autoJoinId,
      autoJoinId,
      peerSync: null,
      isHost: false,
      multiplayerInitialState: null,
      localName: '',
      players: null,       // null = show setup screen
      gameMode: 'cribbage', // 'cribbage' or 'runwabble'
      gameKey: 0,          // bump to force remount of CribbageGame
    };
  }

  handleMultiplayerConnected(peerSync, isHost, gameState, localName) {
    this.setState({
      showMultiplayerLobby: false,
      peerSync,
      isHost,
      multiplayerInitialState: gameState,
      localName,
      rowScoreboard: 0,
      colScoreboard: 0,
      playerScoreboards: [],
      players: null,
    });
  }

  exitMultiplayer() {
    if (this.state.peerSync) {
      this.state.peerSync.destroy();
    }
    this.setState({
      peerSync: null,
      isHost: false,
      multiplayerInitialState: null,
      localName: '',
      rowScoreboard: 0,
      colScoreboard: 0,
      playerScoreboards: [],
      players: null,
      gameKey: this.state.gameKey + 1,
    });
  }

  handleSetupStart(players, gameMode) {
    this.setState({
      players,
      gameMode: gameMode || 'cribbage',
      playerScoreboards: new Array(players.length).fill(0),
      gameKey: this.state.gameKey + 1,
    });
  }

  /**
   * Called when a round ends.
   * @param {number[]|number} scoreOrArray  Array of per-player scores (local game)
   *                                        or raw rowScore for online (legacy 2-arg path).
   * @param {number} [colScore]             Column score (online game / Runwabble legacy).
   */
  updateScore(scoreOrArray, colScore) {
    const { players, peerSync, multiplayerInitialState } = this.state;

    // Online multiplayer (peerSync) – legacy 2-arg path
    if (peerSync || typeof scoreOrArray === 'number') {
      const rScore = Array.isArray(scoreOrArray) ? scoreOrArray[0] : scoreOrArray;
      const cScore = Array.isArray(scoreOrArray) ? (scoreOrArray[1] || 0) : (colScore || 0);
      const p1Name = multiplayerInitialState
        ? (this.state.isHost
            ? (multiplayerInitialState.p1Name || 'Host')
            : (multiplayerInitialState.p2Name || 'Guest'))
        : 'P1';
      const p2Name = multiplayerInitialState
        ? (this.state.isHost
            ? (multiplayerInitialState.p2Name || 'Guest')
            : (multiplayerInitialState.p1Name || 'Host'))
        : 'P2/CPU';

      let winMsg;
      let newR = rScore, newC = cScore;
      if (rScore > cScore) {
        newR = rScore - cScore; newC = 0;
        winMsg = `${p1Name} (rows) wins: ${newR} points`;
      } else if (cScore > rScore) {
        newC = cScore - rScore; newR = 0;
        winMsg = `${p2Name} (cols) wins: ${newC} points`;
      } else {
        winMsg = 'Tie!'; newR = 0; newC = 0;
      }
      alert(winMsg);
      this.setState({
        rowScoreboard: this.state.rowScoreboard + newR,
        colScoreboard: this.state.colScoreboard + newC,
      });
      return;
    }

    // Local N-player game – scoreOrArray is an array of per-player scores
    const scores = Array.isArray(scoreOrArray) ? scoreOrArray : [scoreOrArray, colScore || 0];
    const numPlayers = players ? players.length : scores.length;

    // Find winner(s) – subtract the highest score of other players (same as 2-player logic generalised)
    const maxScore = Math.max(...scores);
    const winners = scores.reduce((acc, s, i) => s === maxScore ? [...acc, i] : acc, []);

    let winMsg;
    if (winners.length === 1) {
      const wi = winners[0];
      const pName = players ? players[wi].name : `Player ${wi + 1}`;
      const pRole = players ? players[wi].role : '';
      winMsg = `${pName} (${pRole}) wins with ${maxScore} points!`;
    } else {
      const names = winners.map(wi => players ? players[wi].name : `Player ${wi + 1}`).join(' & ');
      winMsg = `Tie between ${names} (${maxScore} pts each)!`;
    }
    alert(winMsg);

    // Round points: winner earns (their score - next highest score); others earn 0
    const sortedScores = [...scores].sort((a, b) => b - a);
    const secondHighest = sortedScores[1] || 0;
    const roundPoints = scores.map((s, i) =>
      s === maxScore && winners.length === 1 ? s - secondHighest : 0
    );

    const prev = this.state.playerScoreboards.length === numPlayers
      ? this.state.playerScoreboards
      : new Array(numPlayers).fill(0);
    this.setState({
      playerScoreboards: prev.map((p, i) => p + (roundPoints[i] || 0)),
    });
  }


  render() {
    const { showMultiplayerLobby, peerSync, isHost, multiplayerInitialState,
            autoJoinId, localName, players, gameKey, gameMode } = this.state;

    const p1Name = players ? players[0].name : (peerSync
      ? (isHost
          ? (multiplayerInitialState && multiplayerInitialState.p1Name) || 'Host'
          : (multiplayerInitialState && multiplayerInitialState.p2Name) || 'Guest')
      : 'P1');
    const p2Name = players ? players[1] && players[1].name : (peerSync
      ? (isHost
          ? (multiplayerInitialState && multiplayerInitialState.p2Name) || 'Guest'
          : (multiplayerInitialState && multiplayerInitialState.p1Name) || 'Host')
      : 'P2/CPU');

    const isRunwabble = gameMode === 'runwabble' && !peerSync;
    const numPlayers = players ? players.length : 2;

    // Score display strings
    const rowScoreString = peerSync
      ? `${isHost ? 'Your' : "Opponent's"} Score (Rows – ${p1Name}): ${this.state.rowScoreboard}`
      : isRunwabble
        ? `${p1Name}: ${this.state.rowScoreboard} pts`
        : `${p1Name} Score (Rows): ${this.state.rowScoreboard}`;
    const colScoreString = peerSync
      ? `${isHost ? "Opponent's" : 'Your'} Score (Cols – ${p2Name}): ${this.state.colScoreboard}`
      : isRunwabble
        ? `${p2Name}: ${this.state.colScoreboard} pts`
        : `${p2Name} Score (Cols): ${this.state.colScoreboard}`;

    // Game type label
    let gameTypeLabel = '';
    if (peerSync) {
      gameTypeLabel = '2-player game (online)';
    } else if (players) {
      const humanCount = players.filter(p => p.type === 'human').length;
      const modeLabel = isRunwabble ? 'Runwabble' : 'Cribbage Grid';
      if (numPlayers > 2) {
        gameTypeLabel = `${modeLabel} – ${numPlayers}-player game`;
      } else if (humanCount === 2) {
        gameTypeLabel = `${modeLabel} – 2-player game (local)`;
      } else if (humanCount === 1) {
        gameTypeLabel = `${modeLabel} – 1-player game (vs CPU)`;
      } else {
        gameTypeLabel = `${modeLabel} – CPU vs CPU`;
      }
    }

    // Scoreboard for local N-player games
    const localScoreboards = players && !isRunwabble && numPlayers > 0 && this.state.playerScoreboards;

    return (
      <>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header>
          <h1>{isRunwabble ? 'Runwabble' : 'Cribbage Grid'}</h1>
          {gameTypeLabel && (
            <p style={{ margin: '0 0 8px', color: '#555', fontSize: '14px' }}>{gameTypeLabel}</p>
          )}
        </header>
        <main id="main-content">
          {showMultiplayerLobby && (
            <MultiplayerLobby
              autoJoinId={autoJoinId}
              localName={localName}
              onConnected={(ps, ih, gs, name) => this.handleMultiplayerConnected(ps, ih, gs, name)}
              onCancel={() => this.setState({ showMultiplayerLobby: false })}
            />
          )}

          {/* Game setup screen (local game only, shown before first game or after reset) */}
          {!peerSync && !players && !showMultiplayerLobby && (
            <GameSetupScreen onStart={(p, mode) => this.handleSetupStart(p, mode)} />
          )}

          {/* Scoreboard */}
          {peerSync && !isRunwabble && <h2>{rowScoreString}</h2>}
          {peerSync && !isRunwabble && <h2>{colScoreString}</h2>}
          {!peerSync && !isRunwabble && localScoreboards && localScoreboards.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              {players.map((p, i) => {
                const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
                return (
                  <h2 key={i} style={{ margin: '4px 0', color }}>
                    {p.name} ({p.role}): {localScoreboards[i] || 0} pts
                  </h2>
                );
              })}
            </div>
          )}
          {isRunwabble && !peerSync && <h2>{rowScoreString}</h2>}
          {isRunwabble && !peerSync && <h2>{colScoreString}</h2>}

          {!peerSync && !isRunwabble && (
            <button
              style={{ ...btnStyle, marginBottom: '16px' }}
              onClick={() => this.setState({ showMultiplayerLobby: true })}
            >
              🌐 Multiplayer
            </button>
          )}
          {peerSync && (
            <button
              style={{ ...btnStyle, backgroundColor: '#c62828', marginBottom: '16px' }}
              onClick={() => this.exitMultiplayer()}
            >
              Exit Multiplayer
            </button>
          )}

          {players && (
            <button
              style={{ ...cancelBtnStyle, marginBottom: '16px' }}
              onClick={() => this.setState({ players: null, gameKey: gameKey + 1 })}
            >
              ↩ New Setup
            </button>
          )}

          {/* Render Runwabble or Cribbage based on mode */}
          {players && isRunwabble && (
            <RunwabbleGame
              key={`runwabble-${gameKey}`}
              players={players}
              resetCallback={(p1Score, p2Score) => {
                this.setState({
                  rowScoreboard: this.state.rowScoreboard + p1Score,
                  colScoreboard: this.state.colScoreboard + p2Score,
                  players: null,
                  gameKey: gameKey + 1,
                });
              }}
            />
          )}

          {/* Only render Cribbage game when setup is done (local) or in online multiplayer */}
          {(players || peerSync) && !isRunwabble && (
            <CribbageGame
              key={`game-${peerSync ? 'multiplayer' : 'singleplayer'}-${gameKey}`}
              peerSync={peerSync}
              isHost={isHost}
              initialGameState={multiplayerInitialState}
              players={players}
              resetCallback={(scores) => this.updateScore(scores)}
            />
          )}
        </main>
      </>
    );
  }
}



// ========================================

ReactDOM.render(
  <ErrorBoundary>
    <MultiRoundCribbageGame />
  </ErrorBoundary>,
  document.getElementById('root')
);

// ========================================


function convertRankToNumber(r) {
  const d = {
    'ace': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'jack': 11,
    'queen': 12,
    'king': 13
  }
  return d[r];
}

function scorePairs(hand) {
  if (hand.length < 2) {
    return 0;
  }
  var score = 0;
  for (let i = 0 ; i < hand.length ; i++) {
    for (let j = i+1 ; j < hand.length ; j++) {
      if (hand[i].rank === hand[j].rank) {
        // Same-color pairs (both red or both black) are rarer and worth 3 pts;
        // cross-color pairs are worth the standard 2 pts.
        const sameColor = hand[i].suit && hand[j].suit &&
          (isRedSuit(hand[i].suit) === isRedSuit(hand[j].suit));
        score += sameColor ? 3 : 2;
      }
    }
  }
  return score;
}

/**
 * Bonus points for four of a kind beyond the pairs score.
 * Four of a kind is statistically very rare (+4 bonus).
 */
function scoreFourOfAKind(hand) {
  const rankCounts = {};
  for (const card of hand) {
    if (card.rank) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  }
  for (const count of Object.values(rankCounts)) {
    if (count >= 4) {
      return 4;
    }
  }
  return 0;
}

function scoreFlush(hand) {
  if (hand.length < 5) {
    return 0;
  }
  // Count how many cards share the same suit (skip blanks); score 5 if any suit appears 5+ times.
  const suitCounts = {};
  for (const card of hand) {
    if (!card.suit) continue;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }
  if (Object.values(suitCounts).length > 0 && Math.max(...Object.values(suitCounts)) >= 5) {
    return 5;
  }
  return 0;
}

/** +2 bonus when all 5 cards in a hand are the same color (all red or all black). */
function scoreColor(hand) {
  if (hand.length < 5) return 0;
  const realCards = hand.filter(c => c.suit);
  if (realCards.length < 5) return 0;
  const allRed = realCards.every(c => isRedSuit(c.suit));
  const allBlack = realCards.every(c => !isRedSuit(c.suit));
  return (allRed || allBlack) ? 2 : 0;
}


function score15(hand) {
  const numbers = hand.map( (x) => Math.min(10, convertRankToNumber(x.rank)));
  const getAllSubsets = 
      theArray => theArray.reduce(
        (subsets, value) => subsets.concat(
         subsets.map(set => [value,...set])
        ),
        [[]]
      );
  const subsets = getAllSubsets(numbers);
  var score = 0;
  for (const s of subsets) {
    if(s.length > 0) {
      const sumValue = s.reduce((a, b) => a+b, 0);
      if (sumValue === 15) {
        score += 2;
      }
    }
  }
  return score;
}

function scoreRuns(hand) {
  let numbers = hand.map( (x) => convertRankToNumber(x.rank));
  numbers.sort(function(a, b){return a-b});
  numbers.push(1000);


  var score  = 0;
  var duplicity = 1;
  var currentLength = 1;
  var multiple = 1;
  for (let i = 1 ; i < numbers.length ; i++) {
    const current = numbers[i], prev = numbers[i-1];
    const delta = current - prev;
    if (delta === 0) {
      duplicity += 1;
    }
    else if (delta === 1) {
      multiple *= duplicity;
      duplicity = 1;
      currentLength += 1;
    }
    else {
      if (currentLength > 2) {
        score += (currentLength * multiple * duplicity);
      }
      currentLength = 1;
      duplicity = 1;
      multiple = 1;
    }
  }
  return score;
}


function scoreHand(hand) {
  var score = 0;

  score += score15(hand);
  score += scoreFlush(hand);
  score += scoreColor(hand);
  score += scorePairs(hand);
  score += scoreFourOfAKind(hand);
  score += scoreRuns(hand);

  return score;
}

//=========================================================================
//===========================CPU NEXT MOVE LOGIC===========================
//=========================================================================

let cardRatings = require('./ratings.json');

function convertLayoutToGrid(cardLayout) {
  let ans = [];
  for (let i = 0 ; i < GRID_SIZE ; i++) {
    let row = [];
    for (let j = 0 ; j < GRID_SIZE ; j++) {
      row.push(cardLayout[i * GRID_SIZE + j]);
    }
    ans.push(row);
  }
  return ans;
}

function getCardRatings(subset) {
  let realCards = [];
  for (const s of subset) {
    if (s.rank && s.suit) {
      realCards.push(s);
    }
  }

  if (realCards.length === 0) {
    return cardRatings["0"];
  }
  if (realCards.length >= 5) {
    // Row is fully scored (5 or more real cards); compute the actual cribbage score.
    return scoreHand(realCards);
  }
  // For 1–4 cards, use the pre-computed lookup table.
  let numbers = realCards.map((x) => convertRankToNumber(x.rank));
  numbers.sort((a, b) => a - b);
  let handId = 0;
  for (const n of numbers) {
    handId *= 14;
    handId += n;
  }
  return cardRatings[String(handId)];
}

function getRowRating(array2d, rowInd) {
  return getCardRatings(array2d[rowInd]);
}

function getColRating(array2d, colInd) {
  let col = [];
  for (let row = 0 ; row < array2d.length ; row++) {
    col.push(array2d[row][colInd]);
  }
  return getCardRatings(col);
}

/** Weighted soft max of values, multiply by alpha first. */
function softmax(values, alpha) {
  let ans = values.map((x) => Math.exp(x*alpha));
  let sum = ans.reduce((a,b) => a+b, 0);
  return ans.map((x) => x/sum);
}

/** Return random index according to weights in values (probability distribution). */
function pickIndex(values) {
  let i = 0, total=0;
  const r = Math.random();

  for (i = 0 ; i < values.length ; i++) {
    total += values[i];
    if (r < total) {
      return i;
    }
  }
  return values.length - 1;
}

// =========================================================
// Zone-aware CPU helpers (used for 2–4 player local games)
// =========================================================

/**
 * Like getNextMoveRatings but evaluates moves purely within the given scoring zone.
 * The CPU tries to maximise its own zone's score improvement.
 * @param {object} zone  { rows: number[], cols: number[] }
 * @param {number[]} turnCells  Cells already placed this turn (for straight-line constraint)
 * @param {Set<number>|null} boardMask  Active cell set; null = all cells active.
 */
function getNextMoveRatingsForZone(cardLayout, nextCard, zone, turnCells = [], boardMask = null) {
  const array2d = convertLayoutToGrid(cardLayout);
  const openIndices = [];
  const netRatings = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    let rowCount = 0;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (array2d[row][c].rank) rowCount++;
    }
    if (rowCount >= MAX_CARDS_PER_LINE) continue;

    for (let col = 0; col < GRID_SIZE; col++) {
      if (array2d[row][col].rank) continue;

      const cellIndex = row * GRID_SIZE + col;

      // Board mask: skip inactive cells
      if (boardMask && !boardMask.has(cellIndex)) continue;

      let colCount = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (array2d[r][col].rank) colCount++;
      }
      if (colCount >= MAX_CARDS_PER_LINE) continue;

      // Adjacency constraint: must be adjacent to an existing card
      if (!isAdjacentToOccupied(cardLayout, cellIndex)) continue;

      // Straight-line constraint: must be consistent with the current turn line
      if (!validateTurnLine(turnCells, cellIndex).valid) continue;

      const ownsRow = zone.rows.includes(row);
      const ownsCol = zone.cols.includes(col);

      let baselineScore = 0;
      if (ownsRow) baselineScore += getRowRating(array2d, row);
      if (ownsCol) baselineScore += getColRating(array2d, col);

      array2d[row][col] = nextCard;

      let newScore = 0;
      if (ownsRow) newScore += getRowRating(array2d, row);
      if (ownsCol) newScore += getColRating(array2d, col);

      array2d[row][col] = { rank: null, suit: null };

      openIndices.push(cellIndex);
      netRatings.push(newScore - baselineScore);
    }
  }
  return [openIndices, netRatings];
}

/**
 * Zone-aware version of getCpuHandMove.
 * The CPU maximises score gains within its own assigned rows / cols.
 * Returns {handIndex, gridIndex} or null if no move is available.
 * @param {number[]} turnCells  Cells already placed this turn (for straight-line constraint)
 * @param {Set<number>|null} boardMask  Active cell set; null = all cells active.
 */
function getCpuHandMoveForZone(cardLayout, hand, cpuLevel, zone, turnCells = [], boardMask = null) {
  if (!hand || hand.length === 0) return null;

  let allChoices = [];
  hand.forEach((card, hIdx) => {
    if (!card || !card.rank) return;
    const [openIndices, netRatings] = getNextMoveRatingsForZone(cardLayout, card, zone, turnCells, boardMask);
    openIndices.forEach((gridIdx, i) => {
      allChoices.push({ handIndex: hIdx, gridIndex: gridIdx, rating: netRatings[i] });
    });
  });

  if (allChoices.length === 0) return null;

  const ratings = allChoices.map(c => c.rating);
  const alpha = (cpuLevel === 10) ? 10 : Math.max(cpuLevel - 1, 0) / 2.5;
  const probs = softmax(ratings, alpha);
  return allChoices[pickIndex(probs)];
}

// =========================================================
// Runwabble – 14×14 tile-grid game mode
// =========================================================

const RW_GRID = 14;
const RW_CELLS = RW_GRID * RW_GRID;

/** Create a shuffled bag of 2 standard decks worth of tiles for Runwabble. */
function makeRunwabbleBag() {
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
  const ranks = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  let bag = [];
  for (let d = 0; d < 2; d++) {
    for (const s of suits) {
      for (const r of ranks) {
        bag.push({ rank: r, suit: s, flipped: false });
      }
    }
  }
  return bag;
}

/** Return the effective rank of a tile (6↔9 flip mechanic). */
function rwEffectiveRank(tile) {
  if (!tile || !tile.rank) return null;
  if (tile.rank === '6' && tile.flipped) return '9';
  if (tile.rank === '9' && tile.flipped) return '6';
  return tile.rank;
}

/** Numeric value of a tile for scoring (face/10=10, ace=1, honours 6/9 flip). */
function rwTileValue(tile) {
  const rank = rwEffectiveRank(tile);
  if (!rank) return 0;
  return Math.min(10, convertRankToNumber(rank));
}

/**
 * Score a contiguous Runwabble line (2-5 tiles).
 * Uses 15s, pairs/sets, runs + 20-point Color Flush bonus (no ordinary 5-pt flush).
 */
function scoreRunwabbleLine(tiles) {
  if (!tiles || tiles.length < 2) return 0;
  // Apply 6/9 flip to produce effective tiles for scoring
  const eff = tiles.map(t => ({ ...t, rank: rwEffectiveRank(t) }));
  let score = 0;
  score += score15(eff);
  score += scorePairs(eff);
  score += scoreRuns(eff);
  // Color Flush bonus: +20 for 5 same-suit tiles in one line
  if (eff.length >= 5) {
    const suitCounts = {};
    for (const t of eff) {
      if (t.suit) suitCounts[t.suit] = (suitCounts[t.suit] || 0) + 1;
    }
    if (Math.max(...Object.values(suitCounts)) >= 5) {
      score += 20;
    }
  }
  return score;
}

/**
 * Find the contiguous horizontal segment in `board` that includes (row, col).
 * Returns { start, end, tiles } where start/end are column indices.
 */
function rwRowSegment(board, row, col) {
  let start = col, end = col;
  while (start > 0 && board[row * RW_GRID + start - 1] !== null) start--;
  while (end < RW_GRID - 1 && board[row * RW_GRID + end + 1] !== null) end++;
  const tiles = [];
  for (let c = start; c <= end; c++) tiles.push(board[row * RW_GRID + c]);
  return { start, end, tiles };
}

/**
 * Find the contiguous vertical segment in `board` that includes (row, col).
 * Returns { start, end, tiles } where start/end are row indices.
 */
function rwColSegment(board, row, col) {
  let start = row, end = row;
  while (start > 0 && board[(start - 1) * RW_GRID + col] !== null) start--;
  while (end < RW_GRID - 1 && board[(end + 1) * RW_GRID + col] !== null) end++;
  const tiles = [];
  for (let r = start; r <= end; r++) tiles.push(board[r * RW_GRID + col]);
  return { start, end, tiles };
}

/**
 * Validate a proposed Runwabble placement.
 * @param {Array} board       196-element array (null = empty, object = tile)
 * @param {Array} cells       Grid indices where tiles will be placed
 * @param {boolean} firstMovePlayed  Has any move been made yet?
 * @returns {{ valid: boolean, error?: string, direction?: string }}
 */
function validateRunwabblePlacement(board, cells, firstMovePlayed) {
  if (cells.length === 0) return { valid: false, error: 'Select tiles and cells to place' };
  if (cells.length > 5) return { valid: false, error: 'Cannot place more than 5 tiles at once' };
  if (!firstMovePlayed && cells.length < 2) {
    return { valid: false, error: 'First move must place at least 2 tiles' };
  }
  if (new Set(cells).size !== cells.length) {
    return { valid: false, error: 'Duplicate cells selected' };
  }
  for (const cell of cells) {
    if (board[cell] !== null) return { valid: false, error: 'A selected cell is already occupied' };
  }

  const positions = cells.map(idx => ({ row: Math.floor(idx / RW_GRID), col: idx % RW_GRID }));
  const uniqueRows = [...new Set(positions.map(p => p.row))];
  const uniqueCols = [...new Set(positions.map(p => p.col))];

  let direction;
  if (cells.length === 1) {
    direction = 'horizontal';
  } else if (uniqueRows.length === 1) {
    direction = 'horizontal';
  } else if (uniqueCols.length === 1) {
    direction = 'vertical';
  } else {
    return { valid: false, error: 'Tiles must be placed in a straight line' };
  }

  // Build temp board to check contiguity and length
  const tmp = board.slice();
  cells.forEach(c => { tmp[c] = { rank: 'temp', suit: 'temp', flipped: false }; });

  if (direction === 'horizontal') {
    const row = uniqueRows[0];
    const sortedCols = positions.map(p => p.col).sort((a, b) => a - b);
    // No gaps within the new cells range
    for (let c = sortedCols[0]; c <= sortedCols[sortedCols.length - 1]; c++) {
      if (tmp[row * RW_GRID + c] === null) {
        return { valid: false, error: 'Placement creates a gap in the row' };
      }
    }
    const seg = rwRowSegment(tmp, row, sortedCols[0]);
    if (seg.end - seg.start + 1 > 5) {
      return { valid: false, error: 'A line cannot exceed 5 tiles' };
    }
  } else {
    const col = uniqueCols[0];
    const sortedRows = positions.map(p => p.row).sort((a, b) => a - b);
    for (let r = sortedRows[0]; r <= sortedRows[sortedRows.length - 1]; r++) {
      if (tmp[r * RW_GRID + col] === null) {
        return { valid: false, error: 'Placement creates a gap in the column' };
      }
    }
    const seg = rwColSegment(tmp, sortedRows[0], col);
    if (seg.end - seg.start + 1 > 5) {
      return { valid: false, error: 'A line cannot exceed 5 tiles' };
    }
  }

  // Check perpendicular lines stay ≤ 5
  for (const cell of cells) {
    const r = Math.floor(cell / RW_GRID), c = cell % RW_GRID;
    if (direction === 'horizontal') {
      const vSeg = rwColSegment(tmp, r, c);
      if (vSeg.end - vSeg.start + 1 > 5) {
        return { valid: false, error: 'A perpendicular column would exceed 5 tiles' };
      }
    } else {
      const hSeg = rwRowSegment(tmp, r, c);
      if (hSeg.end - hSeg.start + 1 > 5) {
        return { valid: false, error: 'A perpendicular row would exceed 5 tiles' };
      }
    }
  }

  // Must interlock with existing tiles (after first move)
  if (firstMovePlayed) {
    const touches = cells.some(cell => {
      const r = Math.floor(cell / RW_GRID), c = cell % RW_GRID;
      return (r > 0 && board[(r - 1) * RW_GRID + c] !== null) ||
             (r < RW_GRID - 1 && board[(r + 1) * RW_GRID + c] !== null) ||
             (c > 0 && board[r * RW_GRID + c - 1] !== null) ||
             (c < RW_GRID - 1 && board[r * RW_GRID + c + 1] !== null);
    });
    if (!touches) return { valid: false, error: 'Placement must connect to existing tiles' };
  }

  return { valid: true, direction };
}

/**
 * Compute the score gained by placing `tiles` at `cells` on `board`.
 * Scores all affected contiguous line segments (primary + perpendicular).
 */
function scoreRunwabbleMove(board, cells, tiles) {
  const tmp = board.slice();
  cells.forEach((cell, i) => { tmp[cell] = tiles[i]; });

  const positions = cells.map(idx => ({ row: Math.floor(idx / RW_GRID), col: idx % RW_GRID }));
  const uniqueRows = [...new Set(positions.map(p => p.row))];
  const uniqueCols = [...new Set(positions.map(p => p.col))];

  let total = 0;
  const scored = new Set();

  const scoreSeg = (key, segTiles) => {
    if (!scored.has(key) && segTiles.length >= 2) {
      scored.add(key);
      total += scoreRunwabbleLine(segTiles);
    }
  };

  if (cells.length === 1 || uniqueRows.length === 1) {
    // Horizontal (or single tile) placement
    const row = uniqueRows[0];
    const colList = positions.map(p => p.col);
    const hSeg = rwRowSegment(tmp, row, colList[0]);
    scoreSeg(`h-${row}-${hSeg.start}-${hSeg.end}`, hSeg.tiles);
    for (const col of colList) {
      const vSeg = rwColSegment(tmp, row, col);
      scoreSeg(`v-${col}-${vSeg.start}-${vSeg.end}`, vSeg.tiles);
    }
  } else {
    // Vertical placement
    const col = uniqueCols[0];
    const rowList = positions.map(p => p.row);
    const vSeg = rwColSegment(tmp, rowList[0], col);
    scoreSeg(`v-${col}-${vSeg.start}-${vSeg.end}`, vSeg.tiles);
    for (const row of rowList) {
      const hSeg = rwRowSegment(tmp, row, col);
      scoreSeg(`h-${row}-${hSeg.start}-${hSeg.end}`, hSeg.tiles);
    }
  }

  return total;
}

/** Sum of tile face-values remaining in a hand (used for end-game deduction). */
function rwHandDeductionValue(hand) {
  if (!hand) return 0;
  return hand.reduce((sum, t) => sum + (t && t.rank ? rwTileValue(t) : 0), 0);
}

// =========================================================
// RunwabbleBoard – 14×14 grid for Runwabble
// =========================================================

function RunwabbleBoard({ board, selectedCells, onCellClick }) {
  const tileSize = 36;
  const headerCells = [
    <th key="corner" scope="col" style={{ width: 22 }}></th>,
  ];
  for (let c = 0; c < RW_GRID; c++) {
    headerCells.push(
      <th
        key={`h-${c}`}
        scope="col"
        style={{ fontSize: '10px', textAlign: 'center', padding: '1px', color: '#888', width: tileSize }}
      >
        {c + 1}
      </th>
    );
  }

  const bodyRows = [];
  for (let r = 0; r < RW_GRID; r++) {
    const cells = [
      <th
        key="rh"
        scope="row"
        style={{ fontSize: '10px', padding: '0 2px', color: '#888', textAlign: 'right', width: 22 }}
      >
        {r + 1}
      </th>,
    ];
    for (let c = 0; c < RW_GRID; c++) {
      const idx = r * RW_GRID + c;
      const tile = board[idx];
      const isSelected = selectedCells && selectedCells.includes(idx);

      const cellBaseStyle = {
        width: tileSize,
        height: tileSize + 8,
        border: '1px solid #ccc',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        backgroundColor: isSelected ? '#fff3e0' : '#fafafa',
        outline: isSelected ? '2px solid #f57c00' : 'none',
        outlineOffset: '-2px',
      };

      if (tile) {
        const displayRank = rwEffectiveRank(tile);
        const desc = cardDescription(displayRank, tile.suit, false);
        const tileColor = isRedSuit(tile.suit) ? CARD_RED_COLOR : CARD_BLACK_COLOR;
        cells.push(
          <td key={`c-${c}`} style={{ padding: 0 }}>
            <div style={{ ...cellBaseStyle, color: tileColor, fontWeight: 'bold', fontFamily: 'Georgia, serif', flexDirection: 'column', position: 'relative' }} aria-label={`Row ${r + 1} Col ${c + 1}: ${desc}`}>
              <span style={{ fontSize: '9px', lineHeight: 1 }} aria-hidden="true">{rankDisplay(displayRank)}</span>
              <span style={{ fontSize: '14px', lineHeight: 1 }} aria-hidden="true">{suitSymbol(tile.suit)}</span>
            </div>
          </td>
        );
      } else {
        let label = `Row ${r + 1} Col ${c + 1}: Empty`;
        if (isSelected) label += ' (selected – click to deselect)';
        else label += ' – click to select for placement';
        cells.push(
          <td key={`c-${c}`} style={{ padding: 0 }}>
            <div
              role="button"
              tabIndex={0}
              style={{ ...cellBaseStyle, cursor: 'pointer' }}
              aria-label={label}
              onClick={() => onCellClick && onCellClick(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick && onCellClick(idx); }
              }}
            >
              {isSelected && <span style={{ fontSize: 12, color: '#f57c00' }}>●</span>}
            </div>
          </td>
        );
      }
    }
    bodyRows.push(<tr key={`r-${r}`}>{cells}</tr>);
  }

  return (
    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <caption className="sr-only">Runwabble 14×14 tile grid</caption>
        <thead><tr>{headerCells}</tr></thead>
        <tbody>{bodyRows}</tbody>
      </table>
    </div>
  );
}

// =========================================================
// RunwabbleHandDisplay – hand with multi-select and 6/9 flip
// =========================================================

function RunwabbleHandDisplay({ hand, selectedIndices, onCardClick, onFlipClick, label, isActive }) {
  if (!hand || hand.length === 0) return null;

  return (
    <div
      style={{
        margin: '12px 0',
        padding: '10px',
        backgroundColor: isActive ? '#e3f2fd' : '#f5f5f5',
        borderRadius: '8px',
        border: isActive ? '2px solid #1976d2' : '1px solid #ccc',
        display: 'inline-block',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#444' }}>
        {label}
        {isActive && (
          <span style={{ color: '#1976d2', marginLeft: '8px' }}>
            ← click tiles to select, then click grid cells
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {hand.map((tile, i) => {
          if (!tile || !tile.rank) return null;
          const isSelected = selectedIndices && selectedIndices.includes(i);
          const displayRank = rwEffectiveRank(tile);
          const canFlip = tile.rank === '6' || tile.rank === '9';
          const flipTarget = tile.rank === '6' ? '9' : '6';

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <Card
                rank={displayRank}
                suit={tile.suit}
                selected={isSelected}
                clickHandler={isActive ? () => onCardClick(i) : undefined}
                aria-label={`${cardDescription(displayRank, tile.suit, false)}${tile.flipped ? ' (flipped)' : ''}${isSelected ? ' (selected)' : ''}`}
              />
              {isActive && canFlip && (
                <button
                  onClick={() => onFlipClick(i)}
                  aria-label={`Flip tile: use as ${flipTarget} instead`}
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    cursor: 'pointer',
                    backgroundColor: tile.flipped ? '#ff9800' : '#e0e0e0',
                    color: tile.flipped ? '#fff' : '#333',
                    border: 'none',
                    borderRadius: '3px',
                  }}
                >
                  {tile.rank}↔{flipTarget}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
// RunwabbleGame – full Runwabble game component
// =========================================================

class RunwabbleGame extends React.Component {
  constructor(props) {
    super(props);
    const bag = makeRunwabbleBag();
    shuffleDeck(bag);
    const p1Hand = bag.splice(0, 5);
    const p2Hand = bag.splice(0, 5);

    this.state = {
      board: Array(RW_CELLS).fill(null),
      bag,
      p1Hand,
      p2Hand,
      currentPlayer: 0,
      p1Score: 0,
      p2Score: 0,
      selectedHandIndices: [],
      selectedCells: [],
      firstMovePlayed: false,
      gameOver: false,
      lastMoveInfo: '',
      message: '',
    };
  }

  componentDidMount() {
    const name = this.getPlayerName(0);
    this.setState({ message: `${name}'s turn: select tiles from your hand, then click cells on the grid` });
  }

  getPlayerName(idx) {
    const { players } = this.props;
    if (players && players[idx]) return players[idx].name;
    return idx === 0 ? 'Player 1' : 'Player 2';
  }

  currentHand() {
    return this.state.currentPlayer === 0 ? this.state.p1Hand : this.state.p2Hand;
  }

  defaultMessage(nextPlayer) {
    const name = this.getPlayerName(nextPlayer !== undefined ? nextPlayer : this.state.currentPlayer);
    return `${name}'s turn: select tiles from your hand, then click cells on the grid`;
  }

  handleHandClick(i) {
    if (this.state.gameOver) return;
    const hand = this.currentHand();
    if (!hand[i] || !hand[i].rank) return;

    const { selectedHandIndices } = this.state;
    let next;
    if (selectedHandIndices.includes(i)) {
      next = selectedHandIndices.filter(x => x !== i);
    } else {
      if (selectedHandIndices.length >= 5) return;
      next = [...selectedHandIndices, i];
    }
    this.setState({ selectedHandIndices: next }, () => this.updateMessage());
  }

  handleFlipClick(i) {
    if (this.state.gameOver) return;
    const { currentPlayer, p1Hand, p2Hand } = this.state;
    const hand = (currentPlayer === 0 ? p1Hand : p2Hand).slice();
    hand[i] = { ...hand[i], flipped: !hand[i].flipped };
    if (currentPlayer === 0) {
      this.setState({ p1Hand: hand });
    } else {
      this.setState({ p2Hand: hand });
    }
  }

  handleCellClick(idx) {
    if (this.state.gameOver) return;
    if (this.state.board[idx] !== null) return;

    const { selectedHandIndices, selectedCells } = this.state;
    let next;
    if (selectedCells.includes(idx)) {
      next = selectedCells.filter(x => x !== idx);
    } else {
      if (selectedCells.length >= Math.max(selectedHandIndices.length, 1)) {
        // Replace oldest selection
        next = [...selectedCells.slice(1), idx];
      } else {
        next = [...selectedCells, idx];
      }
    }
    this.setState({ selectedCells: next }, () => this.updateMessage());
  }

  updateMessage() {
    const { selectedHandIndices, selectedCells, board, firstMovePlayed } = this.state;
    if (selectedHandIndices.length === 0) {
      this.setState({ message: this.defaultMessage() });
      return;
    }
    if (selectedCells.length < selectedHandIndices.length) {
      const need = selectedHandIndices.length - selectedCells.length;
      this.setState({ message: `Now click ${need} more cell${need > 1 ? 's' : ''} on the grid` });
      return;
    }
    if (selectedCells.length !== selectedHandIndices.length) {
      this.setState({ message: `Select ${selectedHandIndices.length} cell(s) to match your tile selection` });
      return;
    }
    const result = validateRunwabblePlacement(board, selectedCells, firstMovePlayed);
    if (!result.valid) {
      this.setState({ message: `⚠ ${result.error}` });
    } else {
      this.setState({ message: 'Ready – click "Confirm Placement" to place your tiles' });
    }
  }

  canConfirm() {
    const { selectedHandIndices, selectedCells, board, firstMovePlayed } = this.state;
    if (selectedHandIndices.length === 0) return false;
    if (selectedCells.length !== selectedHandIndices.length) return false;
    return validateRunwabblePlacement(board, selectedCells, firstMovePlayed).valid;
  }

  confirmPlacement() {
    if (!this.canConfirm()) return;

    const {
      board, bag, p1Hand, p2Hand, currentPlayer,
      p1Score, p2Score, selectedHandIndices, selectedCells, firstMovePlayed,
    } = this.state;

    const hand = currentPlayer === 0 ? p1Hand : p2Hand;
    const placedTiles = selectedHandIndices.map(i => hand[i]);

    // Compute move score
    let moveScore = scoreRunwabbleMove(board, selectedCells, placedTiles);

    // First-move bonus
    if (!firstMovePlayed) moveScore += 10;

    // Place tiles
    const newBoard = board.slice();
    selectedCells.forEach((cell, i) => { newBoard[cell] = placedTiles[i]; });

    // Remove placed tiles from hand and draw replacements
    let newBag = bag.slice();
    let newHand = hand.filter((_, i) => !selectedHandIndices.includes(i));

    // Clear-all-5 bonus
    const playedAll = selectedHandIndices.length === 5 && hand.length === 5;
    if (playedAll) moveScore += 10;

    const drawn = newBag.splice(0, Math.min(selectedHandIndices.length, newBag.length));
    newHand = [...newHand, ...drawn];

    const newP1Hand = currentPlayer === 0 ? newHand : p1Hand;
    const newP2Hand = currentPlayer === 1 ? newHand : p2Hand;
    const newP1Score = p1Score + (currentPlayer === 0 ? moveScore : 0);
    const newP2Score = p2Score + (currentPlayer === 1 ? moveScore : 0);

    // Game over when bag is exhausted AND current player just used their last tile
    const gameOver = newBag.length === 0 && newHand.length === 0;

    let finalP1Score = newP1Score;
    let finalP2Score = newP2Score;
    let gameOverMsg = '';

    if (gameOver) {
      const ded1 = rwHandDeductionValue(newP1Hand);
      const ded2 = rwHandDeductionValue(newP2Hand);
      finalP1Score = newP1Score - ded1;
      finalP2Score = newP2Score - ded2;
      const name1 = this.getPlayerName(0);
      const name2 = this.getPlayerName(1);
      let winner;
      if (finalP1Score > finalP2Score) winner = `${name1} wins!`;
      else if (finalP2Score > finalP1Score) winner = `${name2} wins!`;
      else winner = 'Tie game!';
      gameOverMsg = `Game Over! ${winner} | ${name1}: ${finalP1Score} pts (−${ded1}) | ${name2}: ${finalP2Score} pts (−${ded2})`;
    }

    const nextPlayer = 1 - currentPlayer;
    let info = `${this.getPlayerName(currentPlayer)} scored ${moveScore} pts`;
    if (!firstMovePlayed) info += ' (+10 first move)';
    if (playedAll) info += ' (+10 clear hand)';

    this.setState({
      board: newBoard,
      bag: newBag,
      p1Hand: newP1Hand,
      p2Hand: newP2Hand,
      currentPlayer: nextPlayer,
      p1Score: finalP1Score,
      p2Score: finalP2Score,
      selectedHandIndices: [],
      selectedCells: [],
      firstMovePlayed: true,
      gameOver,
      lastMoveInfo: info,
      message: gameOver ? gameOverMsg : this.defaultMessage(nextPlayer),
    });
  }

  endGame() {
    const { p1Hand, p2Hand, p1Score, p2Score } = this.state;
    const ded1 = rwHandDeductionValue(p1Hand);
    const ded2 = rwHandDeductionValue(p2Hand);
    const finalP1 = p1Score - ded1;
    const finalP2 = p2Score - ded2;
    const name1 = this.getPlayerName(0);
    const name2 = this.getPlayerName(1);
    let winner;
    if (finalP1 > finalP2) winner = `${name1} wins!`;
    else if (finalP2 > finalP1) winner = `${name2} wins!`;
    else winner = 'Tie game!';
    this.setState({
      gameOver: true,
      p1Score: finalP1,
      p2Score: finalP2,
      message: `Game Over! ${winner} | ${name1}: ${finalP1} pts (−${ded1}) | ${name2}: ${finalP2} pts (−${ded2})`,
    });
  }

  render() {
    const {
      board, bag, p1Hand, p2Hand, currentPlayer,
      p1Score, p2Score, selectedHandIndices, selectedCells,
      gameOver, message, lastMoveInfo,
    } = this.state;

    const p1Name = this.getPlayerName(0);
    const p2Name = this.getPlayerName(1);
    const hand = currentPlayer === 0 ? p1Hand : p2Hand;
    const canConfirm = this.canConfirm();

    return (
      <div>
        {/* Status message */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            backgroundColor: gameOver ? '#e8f5e9' : '#e3f2fd',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: gameOver ? '600' : 'normal',
          }}
        >
          {message}
        </div>

        {/* Scoreboard */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ color: currentPlayer === 0 && !gameOver ? '#1976d2' : '#333' }}>
            {p1Name}: {p1Score} pts{currentPlayer === 0 && !gameOver ? ' ◀' : ''}
          </strong>
          <strong style={{ color: currentPlayer === 1 && !gameOver ? '#1976d2' : '#333' }}>
            {p2Name}: {p2Score} pts{currentPlayer === 1 && !gameOver ? ' ◀' : ''}
          </strong>
          <span style={{ color: '#888', fontSize: '13px' }}>Tiles in bag: {bag.length}</span>
          {lastMoveInfo && (
            <span style={{ color: '#555', fontSize: '12px', fontStyle: 'italic' }}>{lastMoveInfo}</span>
          )}
        </div>

        {/* Board */}
        <RunwabbleBoard
          board={board}
          selectedCells={selectedCells}
          onCellClick={(idx) => this.handleCellClick(idx)}
        />

        {/* Active player hand and controls */}
        {!gameOver && (
          <>
            <RunwabbleHandDisplay
              hand={hand}
              selectedIndices={selectedHandIndices}
              onCardClick={(i) => this.handleHandClick(i)}
              onFlipClick={(i) => this.handleFlipClick(i)}
              label={`${currentPlayer === 0 ? p1Name : p2Name}'s Hand`}
              isActive={true}
            />

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                style={{ ...btnStyle, backgroundColor: canConfirm ? '#2e7d32' : '#9e9e9e', cursor: canConfirm ? 'pointer' : 'not-allowed' }}
                disabled={!canConfirm}
                onClick={() => this.confirmPlacement()}
                aria-disabled={!canConfirm}
              >
                ✓ Confirm Placement
              </button>
              <button
                style={cancelBtnStyle}
                onClick={() => this.setState({ selectedHandIndices: [], selectedCells: [] }, () => this.updateMessage())}
              >
                Clear Selection
              </button>
              <button
                style={{ ...cancelBtnStyle, backgroundColor: '#b71c1c' }}
                onClick={() => this.endGame()}
                aria-label="End game and apply tile deductions"
              >
                End Game
              </button>
            </div>
          </>
        )}

        {/* Post-game actions */}
        {gameOver && (
          <div style={{ marginTop: '16px' }}>
            <button
              style={btnStyle}
              onClick={() => this.props.resetCallback && this.props.resetCallback(p1Score, p2Score)}
            >
              New Game
            </button>
          </div>
        )}

        {/* Rules reference */}
        <details style={{ marginTop: '20px', fontSize: '13px', color: '#555' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600', color: '#333' }}>Runwabble Rules</summary>
          <div style={{ marginTop: '8px', lineHeight: '1.7' }}>
            <p><strong>Grid:</strong> 14×14. Place 1–5 tiles per turn in a straight horizontal or vertical line.</p>
            <p><strong>First move:</strong> Place 2–5 tiles anywhere. All later plays must connect to existing tiles.</p>
            <p><strong>Five-tile limit:</strong> No continuous line of tiles may exceed 5.</p>
            <p><strong>Scoring (per resulting line of 2+ tiles):</strong></p>
            <ul>
              <li>Fifteens – any combination totalling 15: <strong>2 pts</strong></li>
              <li>Runs – 3/4/5 consecutive values: <strong>3/4/5 pts</strong></li>
              <li>Sets – pair/3-of-a-kind/4-of-a-kind/5-of-a-kind: <strong>2/6/12/20 pts</strong></li>
              <li>Color Flush – 5 tiles same suit in one line: <strong>+20 pts bonus</strong></li>
            </ul>
            <p><strong>Bonuses:</strong> First move of the game <strong>+10 pts</strong>; playing all 5 hand tiles at once <strong>+10 pts</strong>.</p>
            <p><strong>Tile values:</strong> Ace=1; 2–9 face value; 10/J/Q/K=10. A 6 or 9 tile may be flipped (6↔9) to use the opposite value for scoring — the flip is fixed once the tile is placed.</p>
            <p><strong>End of game:</strong> Bag empty and a player uses their last tile (or click End Game). Remaining hand tile values are <strong>deducted</strong> from each player's score.</p>
          </div>
        </details>
      </div>
    );
  }
}

