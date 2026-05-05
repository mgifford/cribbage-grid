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
  backgroundColor: '#fff',
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
  border: '1px solid #999',
  boxSizing: 'border-box',
};

// =========================================================
// GameSetupScreen – choose player names / CPU config
// =========================================================

function GameSetupScreen({ onStart }) {
  const [gameMode, setGameMode] = useState('cribbage');
  const [p1Type, setP1Type] = useState('human');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p1Level, setP1Level] = useState(5);
  const [p2Type, setP2Type] = useState('cpu');
  const [p2Name, setP2Name] = useState('Player 2');
  const [p2Level, setP2Level] = useState(5);

  function handleStart() {
    const players = [
      { type: p1Type, name: p1Type === 'cpu' ? 'CPU' : p1Name, cpuLevel: p1Level, role: 'rows' },
      { type: p2Type, name: p2Type === 'cpu' ? 'CPU' : p2Name, cpuLevel: p2Level, role: 'cols' },
    ];
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

        {/* P1 */}
        <div style={sectionStyle}>
          <span style={labelStyle}>{gameMode === 'runwabble' ? 'Player 1' : 'Player 1 – Rows'}</span>
          <div style={{ marginBottom: '8px' }}>
            <label>
              <input
                type="radio" value="human" checked={p1Type === 'human'}
                onChange={() => setP1Type('human')}
              />
              {' '}Human
            </label>
            {'  '}
            <label>
              <input
                type="radio" value="cpu" checked={p1Type === 'cpu'}
                onChange={() => setP1Type('cpu')}
              />
              {' '}CPU
            </label>
          </div>
          {p1Type === 'human' && (
            <input
              style={inputStyle} type="text" placeholder="Name"
              value={p1Name} onChange={(e) => setP1Name(e.target.value)}
              aria-label="Player 1 name"
            />
          )}
          {p1Type === 'cpu' && (
            <div style={{ width: '200px' }}>
              <Typography id="p1-cpu-slider" gutterBottom>CPU Difficulty: {p1Level}</Typography>
              <Slider
                value={p1Level} aria-labelledby="p1-cpu-slider"
                valueLabelDisplay="auto"
                onChange={(e, v) => setP1Level(v)}
                step={1} marks min={1} max={10}
              />
            </div>
          )}
        </div>

        {/* P2 */}
        <div style={sectionStyle}>
          <span style={labelStyle}>{gameMode === 'runwabble' ? 'Player 2' : 'Player 2 – Columns'}</span>
          <div style={{ marginBottom: '8px' }}>
            <label>
              <input
                type="radio" value="human" checked={p2Type === 'human'}
                onChange={() => setP2Type('human')}
              />
              {' '}Human
            </label>
            {'  '}
            <label>
              <input
                type="radio" value="cpu" checked={p2Type === 'cpu'}
                onChange={() => setP2Type('cpu')}
              />
              {' '}CPU
            </label>
          </div>
          {p2Type === 'human' && (
            <input
              style={inputStyle} type="text" placeholder="Name"
              value={p2Name} onChange={(e) => setP2Name(e.target.value)}
              aria-label="Player 2 name"
            />
          )}
          {p2Type === 'cpu' && (
            <div style={{ width: '200px' }}>
              <Typography id="p2-cpu-slider" gutterBottom>CPU Difficulty: {p2Level}</Typography>
              <Slider
                value={p2Level} aria-labelledby="p2-cpu-slider"
                valueLabelDisplay="auto"
                onChange={(e, v) => setP2Level(v)}
                step={1} marks min={1} max={10}
              />
            </div>
          )}
        </div>

        <button style={btnStyle} onClick={handleStart}>
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
      width: '50px',
      height: '70px',
      borderRadius: '4px',
      border: this.props.isEmpty ? '1px dashed #ccc' : '2px solid #1565c0',
      backgroundColor: this.props.isEmpty ? '#f5f5f5' : '#1565c0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '22px',
      cursor: this.props.isEmpty ? 'default' : 'pointer',
      userSelect: 'none',
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
    ? { outline: '3px solid #f57c00', outlineOffset: '2px', borderRadius: '4px' }
    : {};

  const textColor = (rank && suit) ? (isRedSuit(suit) ? CARD_RED_COLOR : CARD_BLACK_COLOR) : '#bbb';

  let cardInner;
  if (showBack) {
    cardInner = (
      <div style={{
        width: '50px', height: '70px', borderRadius: '4px',
        backgroundColor: '#1565c0', border: '2px solid #0d47a1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontSize: '22px' }} aria-hidden="true">🂠</span>
      </div>
    );
  } else if (rank && suit) {
    const r = rankDisplay(rank);
    const s = suitSymbol(suit);
    cardInner = (
      <div style={{
        width: '50px', height: '70px', borderRadius: '4px',
        backgroundColor: '#fff', border: '1px solid #999',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', color: textColor, fontWeight: 'bold',
        fontFamily: 'Georgia, serif',
        userSelect: 'none',
      }}>
        <span style={{ position: 'absolute', top: '3px', left: '5px', fontSize: '13px', lineHeight: 1 }}>{r}</span>
        <span style={{ fontSize: '24px', lineHeight: 1 }} aria-hidden="true">{s}</span>
        <span style={{ position: 'absolute', bottom: '3px', right: '5px', fontSize: '13px', lineHeight: 1, transform: 'rotate(180deg)', display: 'inline-block' }}>{r}</span>
      </div>
    );
  } else {
    cardInner = (
      <div style={{
        width: '50px', height: '70px', borderRadius: '4px',
        backgroundColor: '#f5f5f5', border: '1px dashed #ccc',
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
    backgroundColor: isActive ? '#e3f2fd' : '#f5f5f5',
    borderRadius: '8px',
    border: isActive ? '2px solid #1976d2' : '1px solid #ccc',
    display: 'inline-block',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#444' }}>
        {label}
        {isActive && <span style={{ color: '#1976d2', marginLeft: '8px' }}>← click a card to select it</span>}
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
 */
function countValidPlacements(cardLayout) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) {
    if (i === CENTER) continue;
    if (cardLayout[i].rank) continue;
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    if (countCardsInRow(cardLayout, row) >= MAX_CARDS_PER_LINE) continue;
    if (countCardsInCol(cardLayout, col) >= MAX_CARDS_PER_LINE) continue;
    count++;
  }
  return count;
}

// =========================================================
// CardGrid
// =========================================================

class CardGrid extends React.Component {
  renderCard(i) {
    const row = Math.floor(i / GRID_SIZE) + 1;
    const col = (i % GRID_SIZE) + 1;
    const card = this.props.cardLayout[i];
    const isEmpty = !card.rank;
    const isPlaceable = this.props.selectedHandCard && isEmpty;
    let posLabel = `Row ${row}, Column ${col}: ${cardDescription(card.rank, card.suit, false)}`;
    if (isPlaceable) posLabel += ' – click to place selected card here';
    return (
      <FadeCard
        rank={card.rank}
        suit={card.suit}
        clickHandler={() => this.props.clickHandler(i)}
        aria-label={posLabel}
        style={isPlaceable ? { outline: '2px dashed #1976d2', borderRadius: '4px' } : {}}
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
      topRowElements.push(
        <th key={`col-score-${c}`} scope="col">
          <span className="sr-only">{`Column ${c + 1} score: `}</span>
          <span>{columnScores[c]}</span>
        </th>
      );
    }
    topRowElements.push(
      <th key="col-total" scope="col">
        <span className="sr-only">Column total score: </span>
        <span style={{fontWeight: 'bold', fontSize: 24}}>{columnScoreTotal}</span>
      </th>
    );

    // Game rows 1–GRID_SIZE
    let bodyRows = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      let rowElements = [];
      rowElements.push(
        <th key="row-score" scope="row">
          <span className="sr-only">{`Row ${row + 1} score: `}</span>
          <span>{rowScores[row]}</span>
        </th>
      );
      for(let cardIndex = 0; cardIndex < GRID_SIZE; cardIndex++) {
        const ind = cardIndex + GRID_SIZE * row;
        rowElements.push(<td key={`card-${ind}`}>{this.renderCard(ind)}</td>);
      }
      bodyRows.push(<tr key={`row-${row}`}>{rowElements}</tr>);
    }

    return (
      <table>
        <caption className="sr-only">
          Cribbage Grid – {GRID_SIZE}×{GRID_SIZE} card grid. P1 scores for rows (left totals); P2/CPU scores for columns (top totals).
        </caption>
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
      // Multiplayer: use the shared initial state from the host
      this.state = {
        deck: props.initialGameState.deck,
        p1Hand: props.initialGameState.p1Hand || [],
        p2Hand: props.initialGameState.p2Hand || [],
        cardLayout: props.initialGameState.cardLayout,
        rowTurn: props.initialGameState.rowTurn,
        selectedHandIndex: null,
        p1Name: props.initialGameState.p1Name || 'Host',
        p2Name: props.initialGameState.p2Name || 'Guest',
        cardsPlacedThisTurn: 0,
        placementError: null,
      };
    } else {
      const deck = makeDeck();
      shuffleDeck(deck);

      // center card
      let cl = Array(CELLS).fill(null).map(() => ({ rank: null, suit: null }));
      cl[CENTER] = deck[0];

      // deal hands from the rest of the deck
      const { p1Hand, p2Hand, remainingDeck } = dealHands(deck.slice(1));

      this.state = {
        deck: remainingDeck,
        p1Hand,
        p2Hand,
        cardLayout: cl,
        rowTurn: true,
        selectedHandIndex: null,
        cardsPlacedThisTurn: 0,
        placementError: null,
      };
    }
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
          placementError: null,
          // Update names when they arrive (joiner sends back p2Name on first sync)
          p1Name: newState.p1Name || this.state.p1Name,
          p2Name: newState.p2Name || this.state.p2Name,
        });
      });
    } else {
      // Single-player: fire CPU if it is CPU's turn first
      this._maybeTriggerCpu(this.state);
    }
  }

  /** Returns true when it is the local player's turn (multiplayer only). */
  isMyTurn() {
    return this.props.isHost ? this.state.rowTurn : !this.state.rowTurn;
  }

  /** Current player's player config (from props.players). */
  currentPlayer() {
    const idx = this.state.rowTurn ? 0 : 1;
    const players = this.props.players || [
      { type: 'human', name: 'P1', cpuLevel: 5, role: 'rows' },
      { type: 'cpu',   name: 'CPU', cpuLevel: 5, role: 'cols' },
    ];
    return players[idx];
  }

  /** Fire CPU move if current player is CPU (single-player only). */
  _maybeTriggerCpu(state) {
    if (this.props.peerSync) return;
    const players = this.props.players || [
      { type: 'human', name: 'P1', cpuLevel: 5, role: 'rows' },
      { type: 'cpu',   name: 'CPU', cpuLevel: 5, role: 'cols' },
    ];
    const idx = state.rowTurn ? 0 : 1;
    const player = players[idx];
    const hand = state.rowTurn ? state.p1Hand : state.p2Hand;
    const hasValidCells = countValidPlacements(state.cardLayout) > 0;
    if (player.type === 'cpu' && hasValidCells && hand && hand.length > 0) {
      setTimeout(() => this.cpuMoveHandler(), 1200);
    }
  }

  resetGame() {
    if (this.props.peerSync && !this.props.isHost) return;

    let deck = makeDeck();
    shuffleDeck(deck);

    let cl = Array(CELLS).fill(null).map(() => ({ rank: null, suit: null }));
    cl[CENTER] = deck[0];

    const { p1Hand, p2Hand, remainingDeck } = dealHands(deck.slice(1));

    const newRowTurn = !(this.state.rowTurn);

    const newState = {
      deck: remainingDeck,
      p1Hand,
      p2Hand,
      cardLayout: cl,
      rowTurn: newRowTurn,
      selectedHandIndex: null,
      cardsPlacedThisTurn: 0,
      placementError: null,
    };

    if (this.props.peerSync) {
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
    }

    this.setState(newState, () => {
      this._maybeTriggerCpu(newState);
    });
  }

  handleHandClick(index) {
    // Toggle selection
    const newIndex = this.state.selectedHandIndex === index ? null : index;
    this.setState({ selectedHandIndex: newIndex });
  }

  handleGridClick(i) {
    if (this.state.cardLayout[i].rank) return; // already filled

    // Multiplayer: enforce turn
    if (this.props.peerSync && !this.isMyTurn()) return;

    // Single-player: only the human player can click during their turn
    if (!this.props.peerSync) {
      const player = this.currentPlayer();
      if (player.type === 'cpu') return;
    }

    const { selectedHandIndex, rowTurn, cardLayout } = this.state;
    if (selectedHandIndex === null) return; // no card selected

    const hand = rowTurn ? this.state.p1Hand : this.state.p2Hand;
    const cardToPlace = hand[selectedHandIndex];
    if (!cardToPlace || !cardToPlace.rank) return;

    // Enforce MAX_CARDS_PER_LINE limit for the target row and column
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

    // Remove card from hand, draw from deck if available
    const newHand = hand.filter((_, idx) => idx !== selectedHandIndex);
    let newDeck = this.state.deck.slice();
    if (newDeck.length > 0) {
      newHand.push(newDeck[0]);
      newDeck = newDeck.slice(1);
    }

    const newLayout = cardLayout.slice();
    newLayout[i] = cardToPlace;
    // Turn does NOT switch automatically – player must click "End Turn"

    const newState = {
      deck: newDeck,
      p1Hand: rowTurn ? newHand : this.state.p1Hand,
      p2Hand: rowTurn ? this.state.p2Hand : newHand,
      cardLayout: newLayout,
      rowTurn: rowTurn,
      selectedHandIndex: null,
      cardsPlacedThisTurn: this.state.cardsPlacedThisTurn + 1,
      placementError: null,
    };

    if (this.props.peerSync) {
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
    }

    this.setState(newState);
  }

  /** End the current player's turn and hand over to the opponent. */
  handleEndTurn() {
    // Multiplayer: only the active player can end the turn
    if (this.props.peerSync && !this.isMyTurn()) return;

    const { deck, p1Hand, p2Hand, cardLayout } = this.state;
    const newRowTurn = !this.state.rowTurn;

    const newState = {
      deck,
      p1Hand,
      p2Hand,
      cardLayout,
      rowTurn: newRowTurn,
      selectedHandIndex: null,
      cardsPlacedThisTurn: 0,
      placementError: null,
    };

    if (this.props.peerSync) {
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
    }

    this.setState(newState, () => {
      this._maybeTriggerCpu(newState);
    });
  }

  cpuMoveHandler() {
    const { rowTurn, cardLayout, cardsPlacedThisTurn } = this.state;
    const hand = rowTurn ? this.state.p1Hand : this.state.p2Hand;
    const players = this.props.players || [
      { type: 'human', name: 'P1', cpuLevel: 5, role: 'rows' },
      { type: 'cpu',   name: 'CPU', cpuLevel: 5, role: 'cols' },
    ];
    const playerIdx = rowTurn ? 0 : 1;
    const cpuLevel = players[playerIdx].cpuLevel || 5;

    // Compute valid cells once; CPU plays up to MAX_CARDS_PER_LINE cards per turn.
    const validCells = countValidPlacements(cardLayout);
    if (cardsPlacedThisTurn >= MAX_CARDS_PER_LINE || validCells === 0) {
      this.handleEndTurn();
      return;
    }

    // getCpuHandMove already filters out cells violating the row/col limit
    // (via getNextMoveRatings), so the returned move is always legal.
    const move = getCpuHandMove(cardLayout, hand, cpuLevel);
    if (!move) {
      // No valid move available; end the CPU's turn
      this.handleEndTurn();
      return;
    }

    const { handIndex, gridIndex } = move;

    // Remove card from hand, draw from deck
    const newHand = hand.filter((_, idx) => idx !== handIndex);
    let newDeck = this.state.deck.slice();
    if (newDeck.length > 0) {
      newHand.push(newDeck[0]);
      newDeck = newDeck.slice(1);
    }

    const newLayout = cardLayout.slice();
    newLayout[gridIndex] = hand[handIndex];
    const newCardsPlaced = cardsPlacedThisTurn + 1;
    // Compute valid cells for the updated layout to decide whether to continue.
    const nextValidCells = countValidPlacements(newLayout);

    const newState = {
      deck: newDeck,
      p1Hand: rowTurn ? newHand : this.state.p1Hand,
      p2Hand: rowTurn ? this.state.p2Hand : newHand,
      cardLayout: newLayout,
      rowTurn: rowTurn,
      selectedHandIndex: null,
      cardsPlacedThisTurn: newCardsPlaced,
      placementError: null,
    };

    this.setState(newState, () => {
      // Continue placing cards or end turn
      const stillHasCards = newHand.length > 0;
      if (newCardsPlaced < MAX_CARDS_PER_LINE && stillHasCards && nextValidCells > 0) {
        setTimeout(() => this.cpuMoveHandler(), 800);
      } else {
        setTimeout(() => this.handleEndTurn(), 600);
      }
    });
  }

  render() {
    const { cardLayout, rowTurn, p1Hand, p2Hand, selectedHandIndex, deck,
            cardsPlacedThisTurn, placementError,
            p1Name: stateP1Name, p2Name: stateP2Name } = this.state;
    const { peerSync, isHost, players } = this.props;

    const p1Config = (players && players[0]) || { type: 'human', name: 'P1', role: 'rows' };
    const p2Config = (players && players[1]) || { type: 'cpu', name: 'CPU', role: 'cols' };

    // Names resolved from state (multiplayer) or player config (single-player)
    const resolvedP1Name = peerSync ? (stateP1Name || 'Host') : p1Config.name;
    const resolvedP2Name = peerSync ? (stateP2Name || 'Guest') : p2Config.name;

    // Determine round-over: no valid placements remain (respects 5-card row/col limit)
    const validCellsLeft = countValidPlacements(cardLayout);
    const roundOver = validCellsLeft === 0;

    // Turn text
    let turnText;
    if (roundOver) {
      if (peerSync) {
        turnText = isHost
          ? "Round Over – click deck to start next round"
          : "Round Over – waiting for host to start next round";
      } else {
        turnText = "Round Over – click deck (astronaut) for next round";
      }
    } else if (peerSync) {
      const myTurn = this.isMyTurn();
      const myRole = isHost ? 'rows' : 'cols';
      const myName = isHost ? resolvedP1Name : resolvedP2Name;
      turnText = myTurn
        ? `Your Turn – ${myName} (${myRole})`
        : "Opponent's Turn";
    } else {
      const cp = rowTurn ? p1Config : p2Config;
      const role = rowTurn ? 'rows' : 'cols';
      turnText = cp.type === 'cpu'
        ? `CPU's Turn (${role}) – ${cp.name}`
        : `${cp.name}'s Turn (${role})`;
    }

    // The "next card" shown in top-left of grid is the first card of the current player's hand
    // (or null to show the deck/reset button when round is over)
    const currentHand = rowTurn ? p1Hand : p2Hand;
    const nextCardForGrid = (!roundOver && currentHand && currentHand[0]) ? currentHand[0] : null;

    // Grid click handler
    const gridClickHandler = (i) => {
      this.handleGridClick(i);
    };

    const resetClickHandler = (r, c) => {
      if (!peerSync || isHost) {
        this.resetGame();
        this.props.resetCallback(r, c);
      }
    };

    // Determine whether current human player needs to interact with their hand
    const isLocalHumanTurn = !peerSync
      ? (rowTurn ? p1Config.type === 'human' : p2Config.type === 'human')
      : this.isMyTurn();

    const selectedCardForGrid = isLocalHumanTurn && selectedHandIndex !== null
      ? (rowTurn ? p1Hand[selectedHandIndex] : p2Hand[selectedHandIndex])
      : null;

    return (
      <div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{turnText}</div>
        <h3>{turnText}</h3>

        {/* Identity label */}
        {peerSync && (
          <p style={{ color: '#555', fontSize: '14px', marginTop: 0 }}>
            You are: <strong>
              {isHost ? `${resolvedP1Name} (rows)` : `${resolvedP2Name} (cols)`}
            </strong>
          </p>
        )}

        <br/>
        <CardGrid
          nextCard={roundOver ? null : nextCardForGrid}
          cardLayout={cardLayout}
          clickHandler={gridClickHandler}
          resetCallback={resetClickHandler}
          selectedHandCard={selectedCardForGrid}
        />
        <br />

        {/* Hand displays */}
        {!peerSync && (
          <div>
            {/* P1 hand */}
            <HandDisplay
              hand={p1Hand}
              selectedIndex={rowTurn && isLocalHumanTurn ? selectedHandIndex : null}
              onCardClick={(i) => this.handleHandClick(i)}
              label={`${resolvedP1Name}'s Hand (rows)`}
              faceDown={p1Config.type === 'cpu'}
              isActive={rowTurn && p1Config.type === 'human' && !roundOver}
            />
            {/* P2 hand */}
            <HandDisplay
              hand={p2Hand}
              selectedIndex={!rowTurn && isLocalHumanTurn ? selectedHandIndex : null}
              onCardClick={(i) => this.handleHandClick(i)}
              label={`${resolvedP2Name}'s Hand (cols)`}
              faceDown={p2Config.type === 'cpu'}
              isActive={!rowTurn && p2Config.type === 'human' && !roundOver}
            />
          </div>
        )}

        {peerSync && (
          <div>
            {/* Show your own hand face-up */}
            <HandDisplay
              hand={isHost ? p1Hand : p2Hand}
              selectedIndex={isLocalHumanTurn ? selectedHandIndex : null}
              onCardClick={(i) => this.handleHandClick(i)}
              label={`Your Hand – ${isHost ? resolvedP1Name : resolvedP2Name} (${isHost ? 'rows' : 'cols'})`}
              faceDown={false}
              isActive={isLocalHumanTurn && !roundOver}
            />
            {/* Show opponent's hand face-down */}
            <HandDisplay
              hand={isHost ? p2Hand : p1Hand}
              selectedIndex={null}
              onCardClick={() => {}}
              label={`Opponent's Hand – ${isHost ? resolvedP2Name : resolvedP1Name} (${isHost ? 'cols' : 'rows'})`}
              faceDown={true}
              isActive={false}
            />
          </div>
        )}

        {/* Deck size info */}
        <p style={{ fontSize: '12px', color: '#888' }}>
          Cards remaining in deck: {deck.length}
        </p>

        {/* End Turn button – visible during a human player's turn */}
        {!roundOver && isLocalHumanTurn && (
          <div style={{ margin: '12px 0' }}>
            <button
              onClick={() => this.handleEndTurn()}
              aria-label="End your turn and pass play to the other player"
              style={{
                padding: '10px 28px',
                fontSize: '16px',
                cursor: 'pointer',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#388e3c',
                color: '#fff',
                fontWeight: 'bold',
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
        )}

        {/* Placement error message */}
        {placementError && (
          <p role="alert" style={{ color: '#c62828', fontSize: '14px', margin: '6px 0' }}>
            ⚠ {placementError}
          </p>
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
      rowScoreboard: 0,
      colScoreboard: 0,
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
      players: null,
      gameKey: this.state.gameKey + 1,
    });
  }

  handleSetupStart(players, gameMode) {
    this.setState({ players, gameMode: gameMode || 'cribbage', gameKey: this.state.gameKey + 1 });
  }

  updateScore(rScore, cScore) {
    const { players, multiplayerInitialState } = this.state;
    const p1Name = players
      ? players[0].name
      : (multiplayerInitialState
          ? (multiplayerInitialState.p1Name || 'Host')
          : 'P1');
    const p2Name = players
      ? players[1].name
      : (multiplayerInitialState
          ? (multiplayerInitialState.p2Name || 'Guest')
          : 'P2/CPU');

    let msg;
    if (rScore > cScore) {
      rScore = rScore - cScore;
      cScore = 0;
      msg = `${p1Name} (rows) wins: ${rScore} points`;
    }
    else if (cScore > rScore) {
      cScore = cScore - rScore;
      rScore = 0;
      msg = `${p2Name} (cols) wins: ${cScore} points`;
    }
    else {
      msg = "Tie!";
      cScore = 0;
      rScore = 0;
    }

    alert(msg);
    this.setState({
      rowScoreboard: this.state.rowScoreboard + rScore,
      colScoreboard: this.state.colScoreboard + cScore,
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
    const p2Name = players ? players[1].name : (peerSync
      ? (isHost
          ? (multiplayerInitialState && multiplayerInitialState.p2Name) || 'Guest'
          : (multiplayerInitialState && multiplayerInitialState.p1Name) || 'Host')
      : 'P2/CPU');

    const isRunwabble = gameMode === 'runwabble' && !peerSync;

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
      if (humanCount === 2) gameTypeLabel = `${modeLabel} – 2-player game (local)`;
      else if (humanCount === 1) gameTypeLabel = `${modeLabel} – 1-player game (vs CPU)`;
      else gameTypeLabel = `${modeLabel} – CPU vs CPU`;
    }

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

          {/* Game setup screen (single-player only, shown before first game or after reset) */}
          {!peerSync && !players && !showMultiplayerLobby && (
            <GameSetupScreen onStart={(p, mode) => this.handleSetupStart(p, mode)} />
          )}

          {!isRunwabble && <h2>{rowScoreString}</h2>}
          {!isRunwabble && <h2>{colScoreString}</h2>}

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

          {/* Only render Cribbage game when setup is done (single-player) or in multiplayer */}
          {(players || peerSync) && !isRunwabble && (
            <CribbageGame
              key={`game-${peerSync ? 'multiplayer' : 'singleplayer'}-${gameKey}`}
              peerSync={peerSync}
              isHost={isHost}
              initialGameState={multiplayerInitialState}
              players={players}
              resetCallback={(r, c) => this.updateScore(r, c)}
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
        score += 2;
      }
    }
  }
  return score;
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

function getNextMoveRatings(cardLayout, nextCard) {

  let array2d = convertLayoutToGrid(cardLayout);

  let openIndices = [];
  let netRatings = [];

  for (let row = 0 ; row < GRID_SIZE ; row++) {
    // Skip rows that already have MAX_CARDS_PER_LINE cards
    let rowCount = 0;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (array2d[row][c].rank) rowCount++;
    }
    if (rowCount >= MAX_CARDS_PER_LINE) continue;

    for (let col = 0 ; col < GRID_SIZE ; col ++) {
      if (array2d[row][col].rank) {
        continue;
      }

      // Skip columns that already have MAX_CARDS_PER_LINE cards
      let colCount = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (array2d[r][col].rank) colCount++;
      }
      if (colCount >= MAX_CARDS_PER_LINE) continue;

      let baselineRowRating = getRowRating(array2d, row);
      let baselineColRating = getColRating(array2d, col);

      array2d[row][col] = nextCard;

      let newRowRating = getRowRating(array2d, row);
      let newColRating = getColRating(array2d, col);
      
      array2d[row][col] = {rank: null, suit: null};

      let scoreDiff = (newColRating - newRowRating) - (baselineColRating - baselineRowRating);
      
      openIndices.push(row * GRID_SIZE + col);
      netRatings.push(scoreDiff);
    }
  }
  return [openIndices, netRatings];
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

/**
 * Choose the best (handIndex, gridIndex) for the CPU from its hand.
 * Returns {handIndex, gridIndex} or null if no move available.
 */
function getCpuHandMove(cardLayout, hand, cpuLevel) {
  if (!hand || hand.length === 0) return null;

  let allChoices = [];

  hand.forEach((card, hIdx) => {
    if (!card || !card.rank) return;
    const [openIndices, netRatings] = getNextMoveRatings(cardLayout, card);
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

