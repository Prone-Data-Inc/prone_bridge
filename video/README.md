# The demo film

`out/ProneBridge-demo.mp4` is made by the code in `build/`. Nothing in it is edited by hand: the voice, the footage, the map, the code shots and the captions all come from scripts, so the film can be made again after any change. What it says and why is in `final_script.md`.

The big files (`work/` and `out/`) are not kept in git. Run the steps below to make them.

## Make it again

You need Node 22, Google Chrome, and about 3 GB of free disk space. Once:

```bash
cd video/build
npm install
```

Then, in order. Each step reads what the one before wrote.

| Step                                         | What it does                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `node tts.mjs`                               | The voice, one clip per scene, with the time of every word (needs the key)     |
| `node music.mjs`                             | The instrumental bed (needs the key)                                           |
| `node plan.mjs`                              | The timeline: when each scene starts and each word is said                     |
| `node buildmap.mjs` and `node buildcode.mjs` | The world map data, and the code excerpts taken from this repository           |
| `node record.mjs`                            | Films the real app (see below)                                                 |
| `node mix.mjs`                               | The sound: voice, music that lowers itself under the voice, loudness, captions |
| `node render.mjs frames`                     | Draws every frame                                                              |
| `node encode.mjs`                            | The final video and its `.srt`                                                 |

The voice and the music come from ElevenLabs. Pass the key as a path to a file that holds it, which is never written anywhere else:

```bash
ELEVEN_KEY_FILE=path/to/a/file node tts.mjs
```

The script is `build/script.json`. After a change to it, run `tts.mjs` for the scenes that changed, then `plan.mjs`, and render again. The cues of each scene follow the words (see `build/render/scenes`), so a reworded line moves its picture with it.

## Filming the app

`record.mjs` plays the whole demo in Chrome against the app on port 8100, with your `.env`: the real database, OpenAI and the PayPal sandbox.

```bash
PORT=8100 SERVE_CLIENT=true APP_URL=https://pronebridge.vercel.app node server/src/index.js
node video/build/prepare.mjs   # adds the card testing attack, and nothing else
node video/build/cleanup.mjs   # closes copilot proposals left open by an earlier take
node video/build/record.mjs
```

Before a new take, press **Reset the demo** in the app yourself: it erases the earlier demo rows and writes fresh history dated today, so the charts end on the day of the film. Nothing here resets for you.

A take adds a few rows to the demo (a sale, a payout, a payment link). The PayPal button and card fields are shown, and the purchase goes through a local method, because card payments need to be switched on for the PayPal sandbox app first.

## Looking at a frame

```bash
node render.mjs preview 12.5 40 61       # stills at those seconds, in work/preview
node look.mjs name 12.5 40 61            # the same, on one contact sheet
node qa.mjs name 12.5 40 61              # frames of the finished video
```
