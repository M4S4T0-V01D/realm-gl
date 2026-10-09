# Cloud saves

Players verify their wallet once, then play normally. Their adventure saves automatically and follows the wallet to any device. They no longer need a recovery code; save codes stay available as an optional extra copy.

- **Service:** `https://rarefriends-realm-saves.masato-void.workers.dev`, a Cloudflare Worker (`src/worker.ts`) with one D1 database (`schema.sql`).
- **Host page:** `host/cloud.ts`, the trusted page around the game.
- **Game UI:** `games/rarefriends-realm/cloudui.tsx`.
- **Tests:**
  - `tests/cloud.test.mjs`: the Worker.
  - `tests/cloud-sync.test.mjs`: the host's logic.
  - `tests/cloud-i18n.test.mjs`: every cloud text in every language.
  - `tests/cloud-browser.mjs`: the real game end to end.

## What it is, and what it isn't

- **It stores characters. It is not a game server.** Multiplayer stays peer to peer (`host/net.ts`) and never touches this service. Nothing here runs game rules, moves players or relays messages.
- **The browser save still comes first.** Every save is written to the browser exactly as before. The cloud is a mirror kept in step with it. If the cloud is unreachable, play continues, and uploads resume by themselves (backing off from 15 s to 5 min).
- **The game never sees the network or the wallet.** The sandboxed game asks the trusted host page with `CLOUD_ACTION` and is told what happened with `CLOUD_STATE` (`roster.ts`). The session token lives only in the host page.

## Signing in

1. The game's "Verify wallet" button asks the host page.
2. The host asks the Worker for a challenge, an EIP-4361-style sign-in message. It names:
   - the site and the wallet
   - Robinhood Chain (4663)
   - a single-use nonce
   - a ten-minute expiry
   - the words "It is not a transaction and costs nothing"
3. Before the wallet sees anything, the host checks the message is exactly that text for this site and wallet (`isSignInMessage`). A server sending anything else gets no signature.
4. The wallet signs the message (`personal_sign`). This is the only signature the page ever asks for: no transactions, no typed data (permits), no approvals. `tests/preview-bundle.test.mjs` enforces that in the built preview.
5. The Worker verifies it. It checks that the nonce is unused, unexpired, for this address and origin, and that the message matches word for word. It recovers the signer for plain wallets, and uses ERC-1271/6492 through the chain for contract wallets. It claims the nonce before verifying, so a replay can't race.
6. The Worker issues a random 32-byte session token valid for 30 days, and stores only its SHA-256. "Sign out of cloud saves" deletes it.

A Friend's token ID or a player's name is never a credential. Every save request needs the bearer token, and every write also needs the wallet to own the Friend on chain at that moment.

## Characters and ownership

- **One character per (wallet, Friend).** This matches the browser saves, which were always per wallet and Friend.
- **Writes need current ownership.** The Worker reads `ownerOf(friend)` on the Generations collection (`0x14C4…181D`) and caches the answer for 5 minutes. A Friend that doesn't exist counts as unowned. If the chain can't be read and nothing is cached, the write is refused with "try again", and the browser save holds the progress.
- **Reads are always allowed for your own character.** Even after the Friend has moved to another wallet, you can see and export your own progress. It is never deleted.

### When a Friend changes hands

- **The new owner** starts their own character for that Friend. They never receive the previous owner's progress: nothing transfers silently.
- **The previous owner** keeps their character. They can read it and export it (save code), but can't write to it while they don't own the Friend. If the Friend comes back to them, they carry on where they were.

No one is locked out of progress they made, and no one gets another player's private progress with an NFT. The game shows this as "This wallet doesn't own this Friend now…" and stops cloud saving; the browser save is untouched.

## Never going backwards

- **Every write names the version it was based on.** The Worker updates only if that is still the latest version, inside one D1 transaction. Otherwise it answers 409 with the newer version. An older save can never overwrite a newer one: two devices racing for the same new character get one 200 and one 409.
- **The host decides at start.** It keeps, per wallet and Friend, the last cloud version it agreed with and a hash of that save. When the game starts it compares that with the cloud:

  | Situation | Result |
  |---|---|
  | Nothing in the browser | The cloud's adventure is used. |
  | Browser unchanged since the last sync | The cloud's newer adventure is used. |
  | Played on this device since the last upload, and the cloud hasn't moved | This device's adventure is newer and uploads. |
  | Both changed | The player is asked ("Two versions of this adventure"), with both summaries side by side. |

- **Nothing is thrown away.**
  - Keeping the cloud's copy sets this browser's aside as a backup (`…:backup`). The game swaps saves on the title screen, or reloads if the question came mid-play.
  - Keeping this browser's copy is a "takeover" write. The cloud's previous version goes into its history first.
- **One tab saves at a time.** The existing tab hand-off (`SAVE_ELSEWHERE`) also stops older tabs' cloud uploads.

## Upload rhythm

The game writes to the browser every 5 seconds while something changes. The host uploads:

- every **90 s** while the save changes
- within **12 s** after a milestone (a level, a quest, an achievement)
- **straight away** when the player logs out, and once more when the page closes (`keepalive`)

Bodies are gzipped JSON, typically 2–20 KB. The Worker refuses automatic saves closer together than 8 s per character.

D1's free tier allows about 100,000 written rows a day. A normal save writes one row; a history copy is added at most every 10 minutes. That leaves room for well over a hundred players playing for hours each day.

## Importing existing characters

Characters made before cloud saves were introduced live only in a browser, or in a save code.

- **Browser saves:** after the first sign-in, if the cloud has no character but the browser has one, the game asks "Bring your adventure to the cloud" and shows the save's summary.
  - Nothing is uploaded until the player chooses.
  - On "Import to the cloud", the host keeps a copy aside, uploads the save as an `import`, and clears the copy only once the Worker confirms the stored version.
  - "Not now" leaves the adventure in the browser, with an import button in Settings and a chip in the game.
- **Save codes:** restoring a code in Settings, as before, now also imports it into the cloud (replacing the cloud's version, which goes to history first).
- **No duplicates:** every import carries a SHA-256 of what was imported, and the Worker records it. The same import again changes nothing (`duplicate: true`), so repeated imports can't duplicate or keep overwriting a character. An import that fails isn't recorded as done.

Old saves are never discarded. A browser save that never reached the cloud stays in the browser until the player imports it.

## What the server checks, and what it can't

The game is client-authoritative. It runs in the player's browser, so a determined player can change their own save. Server storage alone doesn't change that, and this service doesn't pretend it does. What it does:

- **Shape and size:**
  - JSON only, at most 400 KB
  - save version `v: 1`
  - the Friend in the save must be the Friend in the URL
  - sensible field names (no `__proto__` and similar)
  - limited depth and lengths, finite numbers
  - an inventory of at most 64 slots
- **Impossible values:** at most 200,000,000 XP per skill (the game's own cap).
- **Plausible progress:** between saves, total XP may grow by at most 2,000,000 plus 3,000 XP per second of real time (about 10.8 million an hour, far beyond honest play). Imports and takeovers are the player's explicit choice and skip this check. A save that fails it is refused, and the player keeps their browser save.
- **The client still validates:** every field of a loaded save is checked again by the game (`engine.ts` `restore`), exactly as for browser saves, so a tampered save can't break the game.

Currency, items and achievements are not treated as authoritative for anything shared: the Realm's economy is simulated and per player. If shared stakes ever arrive, such as real rewards or a global leaderboard, they will need server-side rules for those specific actions, not just stored saves.

## Backups and recovery

- **The cloud keeps earlier versions:** the last 12 per character. A copy is taken at most every 10 minutes, and always before an import, a takeover or a restore. `GET /v1/characters/:friend/history` lists them, and `POST /v1/characters/:friend/restore { version }` brings one back as the newest version (keeping the replaced one too).
- **The browser keeps:**
  - its own save
  - a `…:backup` copy whenever the cloud's adventure replaced it, or while an import is unconfirmed
- **Save codes** still work as an extra copy on any device.

## Operating it

From `cloud/`, with Wrangler logged in to the account:

```sh
npx wrangler d1 create rarefriends-realm-saves          # once; put the id in wrangler.toml
npx wrangler d1 execute rarefriends-realm-saves --remote --file schema.sql
npx wrangler deploy
npx wrangler tail                                       # live logs
```

Configuration is in `wrangler.toml` `[vars]`:

- `ORIGINS`: the pages allowed to sign in. Both renderers share `https://m4s4t0-v01d.github.io`.
- `RPC_URL`, `CHAIN_ID`, `COLLECTION`

There are no secrets: the Worker holds no keys. Sessions are random tokens, and chain reads are public.

Known limits:

- **The public Robinhood RPC sometimes refuses requests from Cloudflare.** Ownership reads retry three times and are cached for 5 minutes. When they still fail, the client keeps the save and retries.
- **Ownership caching:** after a Friend changes hands, the previous owner can keep writing for up to 5 minutes, until the ownership cache expires.
