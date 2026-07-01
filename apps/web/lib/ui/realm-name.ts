/**
 * Realm name profanity gate (poc-realm-name-filter).
 *
 * `/create` names are public-facing — shown in the realm selector and on
 * the play page — so we block flagged profanity before a name is ever
 * persisted. Shared by the client input (`/create`) and the server-side
 * allow-list check in the register route, same split as the accent
 * palette in `./accents.ts`.
 *
 * Backed by `obscenity`, which also catches common obfuscation (leetspeak
 * substitutions, duplicated characters) that a plain word-list substring
 * check would miss.
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** True if `name` contains no flagged profanity. */
export function isCleanRealmName(name: string): boolean {
  return !matcher.hasMatch(name);
}
