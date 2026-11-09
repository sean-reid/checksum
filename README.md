# checksum

A daily word puzzle at [checksum.dwainosaur.com](https://checksum.dwainosaur.com). Each day names a phrase of four to seven words by its rules alone: the first letters spell a planet, the last letters an animal, every word a different length, a Scrabble score of 70. Exactly one phrase of common words fits. Its checksum is the word you get by taking the same letter from each word, and the day is solved when the phrase in your slots passes every rule. The score is how long that took you.

## Development

```sh
npm install
npm run build          # bundle the client into dist/
npm run dev            # wrangler dev on http://localhost:8787
npm test               # unit tests
npm run test:e2e       # Playwright against a local wrangler dev
```

## How it runs

One Cloudflare Worker serves the page and a small API. Puzzles are generated ahead of time by a Rust tool in a nightly GitHub Actions job and written to a KV namespace; the solution never reaches the browser. The client checks the rules against your words as you type. The Worker confirms whether a word matches the solution in its slot, verifies the finished phrase, and stamps the solve time, which the share card carries. The puzzle rolls over at local midnight, numbered from `EPOCH` in `shared/day.ts`.
