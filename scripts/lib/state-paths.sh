#!/usr/bin/env bash
#
# Shared state locations for the chain layer, plus the genesis-snapshot
# helpers. Sourced (never executed) by chain-up.sh, chain-snapshot.sh,
# chain-reset.sh and local-up.sh — one definition of what "the chain's state"
# actually is, so a reset can never miss a file that provisioning wrote.
#
# The caller must set ROOT to the repo root before sourcing.

: "${ROOT:?state-paths.sh: set ROOT before sourcing}"

STATE_DIR="$ROOT/apps/web/data"
STATE_FILE="$STATE_DIR/anvil-state.json"

# Written only AFTER deploy + seed fully succeed. Its presence — not the
# auto-dumped state file — is what marks the chain as provisioned, so a
# half-finished run (e.g. a seeder crash) re-provisions cleanly next time
# instead of loading a partially-seeded chain.
PROVISIONED_MARKER="$STATE_DIR/.chain-provisioned"

# Pristine post-seed copy of everything provisioning produced. Captured once by
# chain-snapshot.sh; restoring it is what makes a reset take seconds instead of
# re-running Deploy.s.sol and six seeders. Lives under data/ so it is gitignored
# and survives every git operation.
GENESIS_DIR="$STATE_DIR/genesis"

# Generated address book + seeder caches (gitignored; see ensure-generated.mjs).
GENERATED_DIR="$ROOT/apps/web/lib/contracts/generated"
ENSURE_GENERATED="$ROOT/apps/web/scripts/ensure-generated.mjs"
GENERATED_FILES=(addresses.json realms.json adapters.json catalog.json)

# The player-realm registry. -shm/-wal are SQLite's sidecars: they MUST be
# removed alongside the main db on any restore, or SQLite pairs a restored .db
# with a newer write-ahead log and reads back a mix of the two.
DB_FILES=(
  "$STATE_DIR/realms.db"
  "$STATE_DIR/realms.db-shm"
  "$STATE_DIR/realms.db-wal"
)

# True iff a usable genesis bundle exists (state file is the load-bearing part).
genesis_present() {
  [[ -f "$GENESIS_DIR/anvil-state.json" ]]
}

# Who these files must belong to. chain-snapshot.sh and chain-reset.sh both run
# as root (they drive systemctl), but the files are WRITTEN by the service user:
# anvil dumps its state on shutdown, and the seeders rewrite generated/. Since
# genesis_restore does `rm -f` before `cp`, a root-side restore recreates them
# owned by root, and the next chain start silently fails to persist its state.
#
# Defaults to whoever owns the checkout — on a conventional install that is the
# account systemd's User= runs as. Override with STATE_OWNER=user:group.
state_owner() {
  if [[ -n "${STATE_OWNER:-}" ]]; then
    printf '%s\n' "$STATE_OWNER"
  else
    stat -c '%U:%G' "$ROOT" 2>/dev/null || true
  fi
}

# No-op unless we are root and the checkout belongs to someone else.
hand_back_ownership() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || return 0
  local owner
  owner="$(state_owner)"
  [[ -n "$owner" && "$owner" != "root:root" ]] || return 0
  chown -R "$owner" "$@" 2>/dev/null || true
}

# Copy the live chain state INTO the bundle. The chain must already be stopped —
# anvil dumps its state on SIGINT, so a copy taken while it runs is stale by up
# to --state-interval seconds.
#
# The db is a different problem: it is written by the APP, not by anvil, so it
# can be mid-write even with the chain stopped. `.backup` takes a consistent
# snapshot of a live database and folds in the WAL, which is why the bundle
# holds a single realms.db and no sidecars (same approach as
# deploy/systemd/realms-state-backup.service).
genesis_save() {
  mkdir -p "$GENESIS_DIR/generated"
  cp "$STATE_FILE" "$GENESIS_DIR/anvil-state.json"

  local db="${DB_FILES[0]}"
  rm -f "$GENESIS_DIR/realms.db"
  if [[ -f "$db" ]]; then
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "$db" ".backup '$GENESIS_DIR/realms.db'"
    else
      cp "$db" "$GENESIS_DIR/realms.db"
    fi
  fi

  local f
  for f in "${GENERATED_FILES[@]}"; do
    cp "$GENERATED_DIR/$f" "$GENESIS_DIR/generated/$f"
  done

  hand_back_ownership "$GENESIS_DIR"
}

# Copy the bundle back OVER the live chain state. The chain must already be
# stopped — a running anvil dumps state on exit and would overwrite whatever we
# just restored.
genesis_restore() {
  # Removing the sidecars is the point: the bundle holds a checkpointed db with
  # no WAL, so leaving the live -wal/-shm behind would let SQLite replay newer
  # writes on top of the restored file.
  rm -f "$STATE_FILE" "${DB_FILES[@]}"
  cp "$GENESIS_DIR/anvil-state.json" "$STATE_FILE"
  if [[ -f "$GENESIS_DIR/realms.db" ]]; then
    cp "$GENESIS_DIR/realms.db" "${DB_FILES[0]}"
  fi
  local f
  mkdir -p "$GENERATED_DIR"
  for f in "${GENERATED_FILES[@]}"; do
    cp "$GENESIS_DIR/generated/$f" "$GENERATED_DIR/$f"
  done

  # STATE_DIR covers the state file, the db and the bundle itself in one pass.
  hand_back_ownership "$STATE_DIR" "$GENERATED_DIR"
}
