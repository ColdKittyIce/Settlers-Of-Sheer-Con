# Pioneers — Feature TODO

Overall goal: align with the 1999 "Pioneers" PC game (Settlers-style) + user-requested features.

## Done (earlier sessions)
- Full Catan rules (build/trade/dev/robber/longest road/largest army)
- Solo vs AI, multiplayer (host-authoritative, lobby, chat, rejoin, disconnect-AI)
- 6-player support, 6 named preset maps, produced-hex green flash, real probability pips
- Discard modal steppers (multiples of same resource)

## Done (user's 4-part request, this build)
### A. Board formations — 17 presets
- [x] Presets: base hexagon, USA, Europe
- [x] Presets I designed: golden, shepherd, iron, forest, brick, diamond, longship, ring, star, twins, atoll, archipelago, crescent
- [x] Wire formation select into solo + MP create screens, seed-keyed generation

### B. AI difficulty / play style
- [x] Settings UI: per-AI difficulty (Easy/Medium/Hard) + play style (Balanced/Builder/Trader/Warlord/Expansionist)
- [x] ai.js: personality-aware decisions (score noise, dev/trade/robber priorities, settlement thresholds)
- [x] C&K-aware AI (improvements, knights, progress cards, barbarian defense)
- [x] Tuned: average game length dropped to ~183 turns; 17-config + 22-trial benchmarks pass with zero errors

### C. House rules
- [x] Friendly robber (can't place robber adjacent to own pieces; no steal if no enemies)
- [x] Turn timer (off / 30 / 60 / 120 s) with auto roll + auto end turn on expiry, HUD countdown
- [x] Custom discard threshold (7 / 9 / 12 / never)
- [x] Custom victory point limit (8 / 10 / 12 / 15 / 20)
- [x] Threaded through createGame, MP settings

### D. Seafarers expansion
- [x] Ships (build on sea edges, count for longest route)
- [x] Multi-island boards (main island + small islands, sea between)
- [x] Gold hexes (choose any resource on production)
- [x] Pirate (sea robber), blocks that sea hex
- [x] Island bonus (+2 VP for first settlement on a new island)
- [x] Render ships / pirate / gold; UI for building ships

### E. Cities & Knights expansion
- [x] Commodities (paper/coin/cloth) + city improvements (3 tracks, level-up → progress cards)
- [x] Progress cards (alchemist, crane, intrigue, monopoly, master, bishop, constitution, merchant, ...)
- [x] Board knights (build/upgrade/activate, move robber on activate)
- [x] Barbarian attacks (defended → commodities/VP to defenders; undefended → weakest city sacked), Defender of Catan (+2 VP, 🛡)
- [x] UI: city improvement modal, knight modal, progress modal, barbarian banner (#barbarianRow)
- [x] Works standalone and combined with Seafarers

## Done (undo + live game log)
### F. Undo last build (option in game settings)
- [x] `#setupUndo` (solo) + `#mpUndo` (MP) settings toggles, default **On**; threaded through `readSoloSettings`/`btnCreateGo` → `createGame({undoAllowed})`
- [x] `undoStack` in game state (cap 20); `pushUndo()` only records during a player's own action phase
- [x] `undoBuild()` in rules.js: reverses settlement (free vertex, refund, `recomputePorts`, island-bonus revoke), city (back to settlement), road/ship (free edge, `updateLongestRoadRaw`), knight (splice by kIdx, `updateDefender`); logs each undo; runs `checkWin` defensively
- [x] Stack cleared on roll (`rollDice`) and on `endTurn` — no build→roll→undo exploits
- [x] `↩ Undo last` full-width button in actions panel, enabled only when `undoAllowed && !pending && stack non-empty` and it's your action turn
- [x] Undo serialized for MP in save.js

### G. Live game log ("what is happening")
- [x] Log was hidden on mobile (`#logBox{display:none}`) — removed; mobile now shows it (flex-basis 100%, max-height 130px, auto-scroll)
- [x] Mobile sidebar order: Resources → Log → Actions (CSS `order`), so the live tracker is visible right under the resource tray
- [x] Turn markers in log: entries store `turn`, `renderLog` inserts "— Turn N —" headers
- [x] Trade decline now logged ("X declines Y's trade offer.") in `cancelTrade` (others) and `aiTradeStep` (AI declining); withdraws and accepts already logged
- [x] All undo paths live-verified: road, settlement, city, knight, ship, undo-OFF (button disabled + guard throws)

## Fixes landed during this build
- [x] `pickBestNumber` scored all players' vertices instead of only the player's own (was inflating alchemist picks)
- [x] Defender of Catan +2 VP was missing from the player-list/game-over VP display
- [x] `aiBestTrack` returned `'politics'` even when all tracks were maxed → crane crash ("Track already maxed"); now returns `null`, the AI crane handler no-ops, and `resolveCrane`/the crane modal tolerate the all-maxed case
- [x] Root-cause fix for "instant" AI turns: `afterChange()` → `kickAI()` scheduled a timer that the `aiStep` tail then overwrote without cancelling — the orphaned timers piled up and fired `aiStep` in rapid succession. `kickAI` now bails while an `aiStep` is in flight (`aiBusy` guard).
- [x] Resource-gain card animation: cards fly from producing hexes to the player's resource tray (own) or player rows / turn-badge fallback (others); recorded in state (`lastGains`/`gainsId`) and serialized for MP. Driven by a JS loop (rAF with 40ms setTimeout fallback) — CSS keyframes freeze in the wedged-preview state where rAF never fires.
- [x] Ports now show a ratio badge (⚓ = "3:1", resource = "2:1") drawn under each port circle; brick icon changed from ⛰ to 🧱 (board.js `RESOURCE_ICON`).
- [x] AI trade offers targeting a human player now pause the AI's turn for **15 s** (countdown shown on the trade banner) so the human can accept/decline; other AIs skip the offer during the wait; on accept/decline the AI resumes, on timeout the AI moves on with its turn. The AI won't re-offer the same trade in the same turn after a decline/timeout (`tradeWait`/`tradeBlocked` in main.js).
- [x] Random setup order: the snake setup order is now rotated by a random starting player (seed-derived, `makeRng(seed+'::setupOrder')` in `createGame`), so the human no longer always picks first. The player who picked first in setup also takes the first action turn (real-Catan rule; `placeSetupRoad` sets `state.turn = setup.order[0]` instead of hardcoded 0).
- [x] MP discard bug (host stuck "waiting for player2 to discard"): relayed `discard` actions resolved the player via the host's own `myPid` instead of the relaying actor — `performLocal` discard case now prefers `actorPid` (main.js).
- [x] Log + waiting text invisible on short windows: on ~600px-tall laptop windows the sidebar overflowed and the log box was pushed off-screen (collapsed to 1px). Sidebar is now scrollable (`overflow-y:auto`) and reordered Resources → Log → Actions → Players on desktop too, so the live log sits right under the resource tray; log box got a real min-height. Phase/waiting text (`#phaseText`) is no longer `display:none` on phones (truncates with ellipsis instead), so "Waiting for X to …" is visible on mobile.

## Open / future
- [ ] Single-player save/load UI (serialization exists in src/save.js; only used as MP wire format currently)
- [ ] Re-test cross-tab multiplayer after the user clicks **Save** (preview runs single-tab emulator)
