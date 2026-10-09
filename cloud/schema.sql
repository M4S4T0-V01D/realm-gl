-- RareFriends Realm cloud saves (Cloudflare D1). Apply with:
--   npx wrangler d1 execute rarefriends-realm-saves --remote --file cloud/schema.sql --config cloud/wrangler.toml

-- Sign-in challenges: single use, ten minutes.
CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
-- Sessions: only a SHA-256 of the bearer token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_address ON sessions (address);
-- One character per wallet and Friend (a Friend's new owner starts their own; see cloud/README.md).
CREATE TABLE IF NOT EXISTS characters (
  address TEXT NOT NULL,
  friend_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  save TEXT NOT NULL,
  size INTEGER NOT NULL,
  total_xp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  imported_at INTEGER,
  PRIMARY KEY (address, friend_id)
);
-- Earlier versions, kept for recovery (the latest few per character).
CREATE TABLE IF NOT EXISTS history (
  address TEXT NOT NULL,
  friend_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  save TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (address, friend_id, version)
);
-- Imports already made (a hash of the imported save), so the same import can't be applied twice.
CREATE TABLE IF NOT EXISTS imports (
  address TEXT NOT NULL,
  friend_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (address, friend_id, hash)
);
-- A short-lived cache of on-chain owners.
CREATE TABLE IF NOT EXISTS owners (
  friend_id INTEGER PRIMARY KEY,
  address TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
