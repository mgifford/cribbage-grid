# Game

This is a 5x5 grid version of the card game cribbage. Try it out.

# [Play here!](https://mgifford.github.io/cribbage-grid)

## Rules

At the start of each round, each player is dealt a **hand of 5 cards** from a shared shuffled deck. Players alternate turns: on your turn you **select a card from your hand** (click it to highlight it) and then **click an empty cell** in the grid to place it. After placing, you draw a replacement card from the deck (if available).

One player scores for **rows** (P1) and the other for **columns** (P2/CPU). Row and column scores are shown in real time next to each line, with totals in bold. At the end of the round (all 25 cells filled), whoever has more total points wins the difference; the loser gets zero. Then a new round begins with hands dealt again.

Scoring follows standard cribbage rules. See the Cribbage Scoring section below for details.

## Game Setup

Before each game you will see a **Game Setup** screen where you can:
- Set each player's name
- Choose whether each player is **Human** or **CPU**
- Set the CPU difficulty level (1–10) for CPU players

This lets you play solo against the CPU, pass-and-play with a friend on the same device, or watch two CPU players compete.

## Multiplayer

Click the **🌐 Multiplayer** button to play against a friend on a separate device.

- **Host**: click "Host Game", enter your name, then share the displayed **Room ID** or scan / send the **QR code** to your opponent.
- **Join**: scan the QR code (on mobile) or click "Join Game" and type the Room ID, then connect. You can also open a join link directly: `https://mgifford.github.io/cribbage-grid?join=<roomId>`

No account or login is needed. Your identity (name and row/column role) is shown throughout the game.

Multiplayer is powered by [PeerJS](https://peerjs.com/), which uses WebRTC to send game data directly between the two browsers. Two devices on the same Wi-Fi network, mobile hotspot, or even a wired connection can play together **without a public internet connection**. See [docs/peerjs-local-multiplayer.md](docs/peerjs-local-multiplayer.md) for details, including how to run a fully offline self-hosted signaling server.

## Cribbage Scoring

Hands can score points in different ways. The total points for a hand is equal to the sum of the points that it scores for pairs, fifteens, runs, and flush.

### Pairs

A pair of cards is worth 2 points (e.g. two kings). A three of a kind contains 3 pairs, and is thus worth 6 points. A 4 of a kind contains 6 pairs (4 choose 2) and is worth 12 points.

### Fifteens

Any combination of cards in your hand that adds up to 15 is worth 2 points (Ace = 1, JQK are 10 each). This makes the 5 very valuable because a lot of cards are worth 10. For example, a hand with A445J would have 3 fifteens: A4J, A4J with the other 4, and 5J. A hand of 66993 would have 5 fifteens: 4 possible versions of 69, and 663.

### Flush

Having all 5 cards of the same suit is worth 5 points.

### Runs

Having a run of cards (consecutive in rank) of length at least 3 is worth points equal to the length of the run. Ace here is low, and can only go with A23. AKQ is not allowed. For example 23456 has a run of length 5 for 5 points. 23445 has two runs of length 4 (depending on which 4 is used), so it has 8 points of runs. 33455 can 4 possible runs of length 3 (using either 3 and either 5), so it has 12 points of runs.

### Examples

AA44J: This hand has 2 pairs for 4 points, and four 15s for 8 points (4 possible combinations of A4J), so is worth a total of 12 points.

44566: This hand has 2 pairs for 4 points, 4 runs of length 3 (versions of 456 using either 4 and 6) for 12 points, and 4 15s (4+5+6=15) for 8 points, for a total of 24 points.

5555J: This hand has a four of a kind for 12 points, 4 15s that consist of 3 5s for 8 points, and 4 15s that consist of J5 for another 8 points, for a total of 28 points. This is the best hand in the game.

To understand the scoring better, I recommend filling up the board randomly with cards and trying to count points, using the reported totals next to each row and column as a guide.


### CPU Levels

The CPU can be formidable, at least in our experience. I recommend playing CPU level 2 or 3 at first and then progressing.

# Playing Card Images

Playing card images are in the public domain and available here.

Fronts:
https://www.me.uk/cards/
© Copyright 2018 Adrian Kennard
Released under CC0 Public Domain licence.

Blank and Astronaut Card Back:
https://tekeye.uk/playing_cards/svg-playing-cards
Published by dan@tekeye.uk

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
