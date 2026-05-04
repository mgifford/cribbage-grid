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
    onStart(players);
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

        {/* P1 */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Player 1 – Rows</span>
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
          <span style={labelStyle}>Player 2 – Columns</span>
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
        let cardLayout = Array.from({ length: 25 }, () => ({ rank: null, suit: null }));
        cardLayout[12] = deck[0];
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
    const src = this.props.isEmpty ? "cards/blank_card.svg" : "cards/astronaut.svg";
    const label = this.props.isEmpty ? "Empty deck" : "Start next round";
    return (
      <button
        onClick={() => this.props.clickHandler()}
        aria-label={label}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <img src={src} width="50px" alt="" aria-hidden="true" />
      </button>
    );
  }
}


function rank2svgid(r) {
  if (r.length === 1) {
    return r;
  }
  else if (r === '10') {
    return 'T';
  }
  return r.charAt(0).toUpperCase();
}

function convertCardToUrl(rank, suit) {
  const rank_id  = rank2svgid(rank);
  return "cards/" + rank_id + suit.charAt(0).toUpperCase() + ".svg";
}



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
  let location;
  if (showBack) {
    location = "cards/astronaut.svg";
  }
  else if (rank && suit) {
    location = convertCardToUrl(rank, suit);
  }
  else {
    location = "cards/blank_card.svg";
  }

  const description = ariaLabel || cardDescription(rank, suit, showBack);

  const selectedBorderStyle = selected
    ? { outline: '3px solid #f57c00', outlineOffset: '2px', borderRadius: '4px' }
    : {};

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
        <img src={location} width="50px" alt="" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div {...rest} style={{ display: 'inline-block', ...selectedBorderStyle }}>
      <img src={location} width="50px" alt={description} />
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
  for (const s of suits) {
    for (const r of ranks) {
      ans.push( {rank: r, suit: s});
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

// =========================================================
// CardGrid
// =========================================================

class CardGrid extends React.Component {
  renderCard(i) {
    const row = Math.floor(i / 5) + 1;
    const col = (i % 5) + 1;
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
    for (let ind = 0 ; ind < 5 ; ind++) {

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
    return this.getLineScores([0, 5, 10, 15, 20],
                              [5, 10, 15, 20, 25], 
                              1);
  }

  getColumnScores() {
    return this.getLineScores([0, 1, 2, 3, 4],
                              [25, 25, 25, 25, 25], 
                              5);
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
    for(let c = 0; c < 5; c++) {
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

    // Game rows 1–5
    let bodyRows = [];
    for (let row = 0; row < 5; row++) {
      let rowElements = [];
      rowElements.push(
        <th key="row-score" scope="row">
          <span className="sr-only">{`Row ${row + 1} score: `}</span>
          <span>{rowScores[row]}</span>
        </th>
      );
      for(let cardIndex = 0; cardIndex < 5; cardIndex++) {
        const ind = cardIndex + 5*row;
        rowElements.push(<td key={`card-${ind}`}>{this.renderCard(ind)}</td>);
      }
      bodyRows.push(<tr key={`row-${row}`}>{rowElements}</tr>);
    }

    return (
      <table>
        <caption className="sr-only">
          Cribbage Grid – 5×5 card grid. P1 scores for rows (left totals); P2/CPU scores for columns (top totals).
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
      };
    } else {
      const deck = makeDeck();
      shuffleDeck(deck);

      // center card
      let cl = Array(25).fill(null).map(() => ({ rank: null, suit: null }));
      cl[12] = deck[0];

      // deal hands from the rest of the deck
      const { p1Hand, p2Hand, remainingDeck } = dealHands(deck.slice(1));

      this.state = {
        deck: remainingDeck,
        p1Hand,
        p2Hand,
        cardLayout: cl,
        rowTurn: true,
        selectedHandIndex: null,
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
    const hasCards = state.cardLayout.some(c => !c.rank);
    if (player.type === 'cpu' && hasCards && hand && hand.length > 0) {
      setTimeout(() => this.cpuMoveHandler(), 1200);
    }
  }

  resetGame() {
    if (this.props.peerSync && !this.props.isHost) return;

    let deck = makeDeck();
    shuffleDeck(deck);

    let cl = Array(25).fill(null).map(() => ({ rank: null, suit: null }));
    cl[12] = deck[0];

    const { p1Hand, p2Hand, remainingDeck } = dealHands(deck.slice(1));

    const newRowTurn = !(this.state.rowTurn);

    const newState = {
      deck: remainingDeck,
      p1Hand,
      p2Hand,
      cardLayout: cl,
      rowTurn: newRowTurn,
      selectedHandIndex: null,
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

    const { selectedHandIndex, rowTurn } = this.state;
    if (selectedHandIndex === null) return; // no card selected

    const hand = rowTurn ? this.state.p1Hand : this.state.p2Hand;
    const cardToPlace = hand[selectedHandIndex];
    if (!cardToPlace || !cardToPlace.rank) return;

    // Remove card from hand, draw from deck if available
    const newHand = hand.filter((_, idx) => idx !== selectedHandIndex);
    let newDeck = this.state.deck.slice();
    if (newDeck.length > 0) {
      newHand.push(newDeck[0]);
      newDeck = newDeck.slice(1);
    }

    const newLayout = this.state.cardLayout.slice();
    newLayout[i] = cardToPlace;
    const newRowTurn = !rowTurn;

    const newState = {
      deck: newDeck,
      p1Hand: rowTurn ? newHand : this.state.p1Hand,
      p2Hand: rowTurn ? this.state.p2Hand : newHand,
      cardLayout: newLayout,
      rowTurn: newRowTurn,
      selectedHandIndex: null,
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
    const { rowTurn, cardLayout } = this.state;
    const hand = rowTurn ? this.state.p1Hand : this.state.p2Hand;
    const players = this.props.players || [
      { type: 'human', name: 'P1', cpuLevel: 5, role: 'rows' },
      { type: 'cpu',   name: 'CPU', cpuLevel: 5, role: 'cols' },
    ];
    const playerIdx = rowTurn ? 0 : 1;
    const cpuLevel = players[playerIdx].cpuLevel || 5;

    const move = getCpuHandMove(cardLayout, hand, cpuLevel);
    if (!move) return;

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
    const newRowTurn = !rowTurn;

    const newState = {
      deck: newDeck,
      p1Hand: rowTurn ? newHand : this.state.p1Hand,
      p2Hand: rowTurn ? this.state.p2Hand : newHand,
      cardLayout: newLayout,
      rowTurn: newRowTurn,
      selectedHandIndex: null,
    };

    this.setState(newState, () => {
      this._maybeTriggerCpu(newState);
    });
  }

  render() {
    const { cardLayout, rowTurn, p1Hand, p2Hand, selectedHandIndex, deck,
            p1Name: stateP1Name, p2Name: stateP2Name } = this.state;
    const { peerSync, isHost, players } = this.props;

    const p1Config = (players && players[0]) || { type: 'human', name: 'P1', role: 'rows' };
    const p2Config = (players && players[1]) || { type: 'cpu', name: 'CPU', role: 'cols' };

    // Names resolved from state (multiplayer) or player config (single-player)
    const resolvedP1Name = peerSync ? (stateP1Name || 'Host') : p1Config.name;
    const resolvedP2Name = peerSync ? (stateP2Name || 'Guest') : p2Config.name;

    // Determine round-over: all 24 non-center cells filled
    const emptyCells = cardLayout.filter((c, idx) => idx !== 12 && !c.rank).length;
    const roundOver = emptyCells === 0;

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

  handleSetupStart(players) {
    this.setState({ players, gameKey: this.state.gameKey + 1 });
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
            autoJoinId, localName, players, gameKey } = this.state;

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

    const rowScoreString = peerSync
      ? `${isHost ? 'Your' : "Opponent's"} Score (Rows – ${p1Name}): ${this.state.rowScoreboard}`
      : `${p1Name} Score (Rows): ${this.state.rowScoreboard}`;
    const colScoreString = peerSync
      ? `${isHost ? "Opponent's" : 'Your'} Score (Cols – ${p2Name}): ${this.state.colScoreboard}`
      : `${p2Name} Score (Cols): ${this.state.colScoreboard}`;

    // Game type label
    let gameTypeLabel = '';
    if (peerSync) {
      gameTypeLabel = '2-player game (online)';
    } else if (players) {
      const humanCount = players.filter(p => p.type === 'human').length;
      if (humanCount === 2) gameTypeLabel = '2-player game (local)';
      else if (humanCount === 1) gameTypeLabel = '1-player game (vs CPU)';
      else gameTypeLabel = 'CPU vs CPU';
    }

    return (
      <>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header>
          <h1>Cribbage Grid</h1>
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
            <GameSetupScreen onStart={(p) => this.handleSetupStart(p)} />
          )}

          <h2>{rowScoreString}</h2>
          <h2>{colScoreString}</h2>

          {!peerSync ? (
            <button
              style={{ ...btnStyle, marginBottom: '16px' }}
              onClick={() => this.setState({ showMultiplayerLobby: true })}
            >
              🌐 Multiplayer
            </button>
          ) : (
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

          {/* Only render game when setup is done (single-player) or in multiplayer */}
          {(players || peerSync) && (
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
  <MultiRoundCribbageGame />,
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
  if(hand[0].suit === hand[1].suit && 
    hand[0].suit === hand[2].suit &&
    hand[0].suit === hand[3].suit &&
    hand[0].suit === hand[4].suit) {
      return 5;
  }
  return 0;
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
  for (let i = 0 ; i < 5 ; i++) {
    let row = [];
    for (let j = 0 ; j < 5 ; j++) {
      row.push(cardLayout[i*5+j]);
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

  if (realCards.length === 5) {
    return scoreHand(realCards);
  }
  else if (realCards.length === 0) {
    return cardRatings["0"];
  }
  else {
    let numbers = realCards.map((x) => convertRankToNumber(x.rank));
    numbers.sort((a, b) => a - b);
    let handId = 0;
    for (const n of numbers) {
      handId *= 14;
      handId += n;
    }
    return cardRatings[String(handId)];
  }
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

  for (let row = 0 ; row < 5 ; row++) {
    for (let col = 0 ; col < 5 ; col ++) {
      if (array2d[row][col].rank) {
        continue;
      }
      
      let baselineRowRating = getRowRating(array2d, row);
      let baselineColRating = getColRating(array2d, col);

      array2d[row][col] = nextCard;

      let newRowRating = getRowRating(array2d, row);
      let newColRating = getColRating(array2d, col);
      
      array2d[row][col] = {rank: null, suit: null};

      let scoreDiff = (newColRating - newRowRating) - (baselineColRating - baselineRowRating);
      
      openIndices.push(row*5 + col);
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

