import React, {useState} from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import Fade from '@material-ui/core/Fade';
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import Typography from '@material-ui/core/Typography';
import Slider from '@material-ui/core/Slider';

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
// MultiplayerLobby – Host / Join overlay UI
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
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
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

class MultiplayerLobby extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      mode: null,       // 'host' | 'join' | null
      roomId: '',       // displayed to host
      joinId: '',       // typed by joiner
      status: 'idle',  // 'idle' | 'waiting' | 'connecting' | 'error'
      errorMsg: '',
    };
    this._mounted = false;
    this.peerSync = new PeerSync();
  }

  componentDidMount() {
    this._mounted = true;
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
        // Joiner has connected – generate and send initial game state
        const deck = makeDeck();
        shuffleDeck(deck);
        let cardLayout = Array.from({ length: 25 }, () => ({ rank: null, suit: null }));
        cardLayout[12] = deck[0];
        const gameState = {
          deck: deck.slice(1),
          cardLayout,
          rowTurn: true,
        };
        this.peerSync.state = gameState;
        this.peerSync.sync();
        if (this._mounted) this.setState({ status: 'connected' });
        this.props.onConnected(this.peerSync, true, gameState);
      }
    );
  }

  handleJoin() {
    const hostId = this.state.joinId.trim();
    if (!hostId) return;
    this.setState({ status: 'connecting' });
    this.peerSync.join(hostId, () => {
      // Connection open – wait for host to send initial state
      this.peerSync.once('update', (gameState) => {
        if (this._mounted) this.setState({ status: 'connected' });
        this.props.onConnected(this.peerSync, false, gameState);
      });
    });
  }

  handleCancel() {
    this.peerSync.destroy();
    this.props.onCancel();
  }

  render() {
    const { mode, roomId, joinId, status, errorMsg } = this.state;

    if (status === 'connected') {
      return (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <p>Connected! Starting game…</p>
          </div>
        </div>
      );
    }

    return (
      <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="multiplayer-heading">
        <div style={modalStyle}>
          <h2 id="multiplayer-heading" style={{ marginTop: 0 }}>Multiplayer</h2>

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
                </>
              ) : (
                <p>Generating Room ID…</p>
              )}
              <p style={{ color: '#555' }}>Waiting for opponent to connect…</p>
              <button
                style={cancelBtnStyle}
                onClick={() => this.handleCancel()}
              >
                Cancel
              </button>
            </>
          )}

          {mode === 'join' && (
            <>
              <label htmlFor="room-id-input" style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
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
              <button
                style={cancelBtnStyle}
                onClick={() => this.handleCancel()}
              >
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

function Card({ rank, suit, showBack, clickHandler, 'aria-label': ariaLabel, ...rest }) {
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
        aria-label={description}
        onClick={clickHandler}
        onKeyDown={handleKey}
        style={{ display: 'inline-block', cursor: 'pointer' }}
      >
        <img src={location} width="50px" alt="" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div {...rest}>
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

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}


class CardGrid extends React.Component {
  renderCard(i) {
    const row = Math.floor(i / 5) + 1;
    const col = (i % 5) + 1;
    const card = this.props.cardLayout[i];
    const posLabel = `Row ${row}, Column ${col}: ${cardDescription(card.rank, card.suit, false)}`;
    return (
      <FadeCard
        rank={card.rank}
        suit={card.suit}
        clickHandler={() => this.props.clickHandler(i)}
        aria-label={posLabel}
      />
    );
  }

  getLineScores(indices, maxes, step) {
    var scores = [];
    for (let ind = 0 ; ind < 5 ; ind++) {

      let startIndex = indices[ind];
      let maxIndex = maxes[ind];
      // get non null cards in row.
      let lineCards = [];
      for(let i = startIndex; i < maxIndex; i += step) {
        if (this.props.cardLayout[i].rank) {
          lineCards.push(this.props.cardLayout[i]);
        }
      }
      // Get score for them.
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
        <th key={`col-score-${c}`} scope="col" aria-label={`Column ${c + 1} score: ${columnScores[c]}`}>
          <span>{columnScores[c]}</span>
        </th>
      );
    }
    topRowElements.push(
      <th key="col-total" scope="col" aria-label={`Column total score: ${columnScoreTotal}`}>
        <span style={{fontWeight: 'bold', fontSize: 24}}>{columnScoreTotal}</span>
      </th>
    );

    // Game rows 1–5
    let bodyRows = [];
    for (let row = 0; row < 5; row++) {
      let rowElements = [];
      rowElements.push(
        <th key="row-score" scope="row" aria-label={`Row ${row + 1} score: ${rowScores[row]}`}>
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
            <td aria-label={`Row total score: ${rowScoreTotal}`}>
              <span style={{fontWeight: 'bold', fontSize: 24}}>{rowScoreTotal}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    );
  }
}

class CribbageGame extends React.Component {
  constructor(props) {
    super(props);

    if (props.initialGameState) {
      // Multiplayer: use the shared initial state provided by the host
      this.state = {
        deck: props.initialGameState.deck,
        cardLayout: props.initialGameState.cardLayout,
        rowTurn: props.initialGameState.rowTurn,
        cpuEnabled: false,
        cpuLevel: 5,
      };
    } else {
      const deck = makeDeck();
      shuffleDeck(deck);

      // fill center card
      let cl = Array(25).fill({rank: null, suit: null});
      cl[12] = deck[0];

      this.state = {
        deck: deck.slice(1, deck.length),
        cardLayout: cl,
        rowTurn: true,
        cpuEnabled: !props.peerSync, // disable CPU in multiplayer
        cpuLevel: 5,
      };
    }
  }

  componentDidMount() {
    if (this.props.peerSync) {
      // Listen for remote state updates and re-render
      this.props.peerSync.on('update', (newState) => {
        this.setState({
          deck: newState.deck,
          cardLayout: newState.cardLayout,
          rowTurn: newState.rowTurn,
        });
      });
    }
  }

  /** Returns true when it is the local player's turn (multiplayer only). */
  isMyTurn() {
    return this.props.isHost ? this.state.rowTurn : !this.state.rowTurn;
  }

  resetGame() {
    // In multiplayer, only the host can reset (start a new round)
    if (this.props.peerSync && !this.props.isHost) {
      return;
    }

    let deck = makeDeck();
    shuffleDeck(deck);

    // fill center card
    let cl = Array(25).fill({rank: null, suit: null});
    cl[12] = deck[0];
    deck = deck.slice(1, deck.length);

    const newRowTurn = !(this.state.rowTurn);

    // call cpu here if it needs to make a move still (single-player only).
    if (!this.props.peerSync && !newRowTurn && this.state.cpuEnabled) {
      setTimeout(()=> this.cpuMoveHandler(cl, deck[0]), 3000);
    }

    const newState = { deck, cardLayout: cl, rowTurn: newRowTurn };

    if (this.props.peerSync) {
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
    }

    this.setState(newState);
  }

  handleGridClick(i) {
    // If there is already a card there, do nothing.
    if(this.state.cardLayout[i].rank && this.state.cardLayout[i].suit) {
      return;
    }

    // Multiplayer turn enforcement: host plays rows, joiner plays columns
    if (this.props.peerSync) {
      if (!this.isMyTurn()) return;
    }

    const newLayout = this.state.cardLayout.slice()
    newLayout[i] = this.state.deck[0];
    const newDeck = this.state.deck.slice(1, this.state.deck.length);
    const newRowTurn = !(this.state.rowTurn);

    // call cpu here if it needs to make a move still (single-player only).
    if (!this.props.peerSync && newDeck.length > 27 && !newRowTurn && this.state.cpuEnabled) {
      setTimeout(()=> this.cpuMoveHandler(newLayout, newDeck[0]), 3000);
    }

    const newState = {
      deck: newDeck,
      cardLayout: newLayout,
      rowTurn: newRowTurn,
    };

    // Sync to peer before applying locally so the remote player updates promptly
    if (this.props.peerSync) {
      this.props.peerSync.state = newState;
      this.props.peerSync.sync();
    }

    this.setState(newState);
  }

  cpuMoveHandler(cardLayout, nextCard) {
    if (nextCard === null) {
      console.log(this.state);
    }
    let ans = getNextMove(cardLayout, nextCard, this.state.cpuLevel);
    if (ans !== null) {
      this.handleGridClick(ans);
    }
  }

  render() {
    let currentCard;
    let turnText;

    if (this.state.deck.length > 27) {
      currentCard = this.state.deck[0];
      if (this.props.peerSync) {
        const myTurn = this.isMyTurn();
        const role = this.props.isHost ? 'rows' : 'columns';
        turnText = myTurn
          ? `Your Turn (${role})`
          : "Opponent's Turn";
      } else {
        turnText = this.state.rowTurn? "P1's Turn (rows)" : " P2/CPU's Turn (columns)";
      }
    }
    else {
      currentCard = null;
      if (this.props.peerSync) {
        if (this.props.isHost) {
          turnText = "Round Over – click deck to start next round";
        } else {
          turnText = "Round Over – waiting for host to start next round";
        }
      } else {
        turnText = "Round Over - click deck (astronaut) for next round";
      }
    }

    const gridClickHandler = (i) => {
      if (this.props.peerSync) {
        if (this.isMyTurn()) this.handleGridClick(i);
      } else {
        if (this.state.rowTurn || !this.state.cpuEnabled) this.handleGridClick(i);
      }
    };

    // In multiplayer, only the host can reset the round
    const resetClickHandler = (r, c) => {
      if (!this.props.peerSync || this.props.isHost) {
        this.resetGame();
        this.props.resetCallback(r, c);
      }
    };

    return (
      <div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{turnText}</div>
        <h3>{turnText}</h3>
        <br/>
        <CardGrid
          nextCard={currentCard}
          cardLayout={this.state.cardLayout}
          clickHandler={gridClickHandler}
          resetCallback={resetClickHandler}
        />
        <br />
        {!this.props.peerSync && (
          <>
            <FormControlLabel
              control={
                <Switch checked={this.state.cpuEnabled}
                        onChange={() => this.setState({cpuEnabled: !this.state.cpuEnabled})}
                        name="cpuEnableSwitch" />
              }
              label="CPU Opponent"
            />
            <br />
            <div style={{width: "200px"}}>
              <Typography id="discrete-slider" gutterBottom>
                {"CPU Difficulty"}
              </Typography>
              <Slider
                defaultValue={5}
                aria-labelledby="discrete-slider"
                valueLabelDisplay="auto"
                onChange={(e, v) => this.setState({cpuLevel: v})}
                step={1}
                marks
                min={1}
                max={10}
                disabled={!this.state.cpuEnabled}
              />
            </div>
          </>
        )}
      </div>
    );
  }
}

class MultiRoundCribbageGame extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      rowScoreboard: 0,
      colScoreboard: 0,
      showMultiplayerLobby: false,
      peerSync: null,
      isHost: false,
      multiplayerInitialState: null,
    }
  }

  handleMultiplayerConnected(peerSync, isHost, gameState) {
    this.setState({
      showMultiplayerLobby: false,
      peerSync,
      isHost,
      multiplayerInitialState: gameState,
      rowScoreboard: 0,
      colScoreboard: 0,
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
      rowScoreboard: 0,
      colScoreboard: 0,
    });
  }

  updateScore(rScore, cScore) {
    let msg;
    if (rScore > cScore) {
      rScore = rScore - cScore;
      cScore = 0;
      msg = "P1 (Row) Wins: " + rScore + " points";;
    }
    else if (cScore > rScore) {
      cScore = cScore - rScore;
      rScore = 0;
      msg = "P2/CPU (Col) Wins: " + cScore + " points";
    }
    else { //tie
      msg = "Tie!";
      cScore = 0;
      rScore = 0;
    }

    alert(msg);
    this.setState({rowScoreboard: this.state.rowScoreboard+rScore,
                   colScoreboard: this.state.colScoreboard+cScore});
  }


  render() {
    const { showMultiplayerLobby, peerSync, isHost, multiplayerInitialState } = this.state;

    const rowScoreString = peerSync
      ? (isHost ? "Your Score (Rows): " : "Opponent Score (Rows): ") + this.state.rowScoreboard
      : "P1 Score (Row): " + this.state.rowScoreboard;
    const colScoreString = peerSync
      ? (isHost ? "Opponent Score (Cols): " : "Your Score (Cols): ") + this.state.colScoreboard
      : "P2/CPU Score (Col): " + this.state.colScoreboard;

    return (
      <>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header>
          <h1>Cribbage Grid</h1>
        </header>
        <main id="main-content">
          {showMultiplayerLobby && (
            <MultiplayerLobby
              onConnected={(ps, ih, gs) => this.handleMultiplayerConnected(ps, ih, gs)}
              onCancel={() => this.setState({ showMultiplayerLobby: false })}
            />
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
          {/* key forces a clean remount when switching between single-player and
              multiplayer so the new initial state / peer connection takes effect */}
          <CribbageGame
            key={peerSync ? 'multiplayer' : 'singleplayer'}
            peerSync={peerSync}
            isHost={isHost}
            initialGameState={multiplayerInitialState}
            resetCallback={(r, c) => this.updateScore(r, c)}
          />
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

// var testHand = [{rank: '5', suit: 'spades'},
//                 {rank: 'king', suit: 'spades'},
//                 {rank: 'queen', suit: 'spades'},
//                 {rank: 'king', suit: 'spades'},
//                 {rank: 'jack', suit: 'clubs'},];

// console.log("Hand:", testHand);
// console.log("Score 15: ", score15(testHand));
// console.log("Score Pair: ", scorePairs(testHand));
// console.log("Score Run: ", scoreRuns(testHand));
// console.log("Score Flush: ", scoreFlush(testHand));

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
  // Get all numerical ranks in order.
  let numbers = hand.map( (x) => convertRankToNumber(x.rank));
  numbers.sort(function(a, b){return a-b});
  numbers.push(1000); // for the following loop to be easy.


  // Go through and see if we have runs.
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
    else { // broken sequence
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

// Load the required ratings JSON file.
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
    // Convert to numbers and sort into ascending order.
    let numbers = realCards.map((x) => convertRankToNumber(x.rank));
    numbers.sort((a, b) => a - b);
    // Convert to an ID.
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

  // Iterate through array tracking score and index at each spot.
  let openIndices = [];
  let netRatings = [];

  for (let row = 0 ; row < 5 ; row++) {
    for (let col = 0 ; col < 5 ; col ++) {
      // If spot filled, skip past it. Can't place here.
      if (array2d[row][col].rank) {
        continue;
      }
      
      // check the value of placing the card at each position in the grid.
      let baselineRowRating = getRowRating(array2d, row);
      let baselineColRating = getColRating(array2d, col);

      // place the card into this spot.
      array2d[row][col] = nextCard;

      // calculate new score
      let newRowRating = getRowRating(array2d, row);
      let newColRating = getColRating(array2d, col);
      
      // Put null card back in.
      array2d[row][col] = {rank: null, suit: null};

      // check score differential.
      let scoreDiff = (newColRating - newRowRating) - (baselineColRating - baselineRowRating);
      
      openIndices.push(row*5 + col);
      netRatings.push(scoreDiff);
    }
  }
  return [openIndices, netRatings];
}

/** Weighted soft max of values, multiply by alpha first.
 * 
 * @param {Array[number]} values 
 * @param {number} alpha 
 */
function softmax(values, alpha) {
  let ans = values.map((x) => Math.exp(x*alpha));
  let sum = ans.reduce((a,b) => a+b, 0);
  return ans.map((x) => x/sum);
}

/** Return random index according to weights in values
 * 
 * @param {Array[number]} values Must be a prob distribution.
 */
function pickIndex(values) {
  let i = 0, total=0;
  const r = Math.random();

  for (i = 0 ; i < values.length ; i++) {
    total += values[i];
    if (r < total) {
      return i;
    }
  }
  console.assert(false, "Should not reach here in weighted random sampling");
  return values.length-1;
}

function getNextMove(cardLayout, nextCard, cpuLevel) {
  let [openIndices, netRatings] = getNextMoveRatings(cardLayout, nextCard);
  if (openIndices.length === 0) {
    return null;
  }
  let alpha = (cpuLevel === 10)? 10 : Math.max(cpuLevel-1, 0) / 2.5;
  console.log(`Alpha : ${alpha}`);
  let softMaxRatings = softmax(netRatings, alpha);
  return openIndices[pickIndex(softMaxRatings)];
}
