import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The database the e2e run uses, shared by `playwright.config.ts` (which
 * hands it to the dev server) and the specs (which seed through it).
 *
 * Deterministic rather than `mkdtemp`, because the config and the worker
 * processes each import this module separately — a random path would give
 * them different databases and the specs would seed one while the server
 * read another.
 *
 * Outside the repo so a run cannot touch `apps/web/data/realms.db`. The
 * specs deliberately fell editions, and a felled edition cannot be
 * un-felled; doing that to a developer's local state would be rude.
 */
export const E2E_DB = join(tmpdir(), "realms-colophon-e2e", "realms.db");

export const E2E_PORT = 3400;
