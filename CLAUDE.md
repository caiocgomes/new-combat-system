# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foundry VTT module (JavaScript, browser-based) that adds custom combat mechanics to D&D 5e for a campaign set in "Garen." Not a Node.js project — no package.json, no build step, no test runner.

**Hard dependency:** `lib-wrapper` module must be active in Foundry VTT. Both scripts check for it on init and warn via `ui.notifications` if missing.

## How to Develop

There is no build, lint, or test command. The module is loaded directly by Foundry VTT from `module.json`. To test changes:

1. Place/symlink this directory into Foundry VTT's `Data/modules/` folder
2. Enable "Custom Combat System" in Foundry's module management
3. Reload the Foundry browser tab to pick up script changes

Manual testing only — no automated tests exist.

## Architecture

### Entry Point & Loading

`module.json` declares which scripts Foundry loads. Currently: `scripts/defense-logic.js` and `scripts/crit-damage.js`. The skill system lives under `cleversonbraga.forge-vtt.com/modules/my-skill-system/` and is loaded as a separate Foundry module.

### Three Independent Mechanics

| Script | Hook | What it does |
|--------|------|-------------|
| `defense-logic.js` | `renderChatMessage` + wraps `rollAttack` | Adds "Roll Defense" button to attack chat messages. Defense = 1d20 + (AC - 10). Replaces passive AC with active defense rolls. |
| `crit-damage.js` | wraps `DamageRoll.prototype.evaluate` | Rewrites crit formula: even die counts get halved with max-roll bonus (4d6 → 2d6+12). Odd die counts unchanged. |
| `my-skill-system/main.js` | `renderActorSheet5eCharacter` + `getRollData` | 36 custom Portuguese-named skills with point allocation based on class + INT mod. Data persisted via actor flags. |

### Key Patterns

**libWrapper registration:** All Foundry function interceptions use `libWrapper.register("new-combat-system", "CONFIG.path.to.function", wrapperFn, "WRAPPER")`. The wrapped function is always called (`await wrapped(...args)`) — modifications happen around the original.

**Chat message placeholder pattern:** Defense buttons need the message ID, but the ID doesn't exist until after `ChatMessage.create()`. So the code creates with `"PLACEHOLDER"`, then immediately calls `message.update()` to replace it with `message.id`.

**Dice formula mutation on crits:** `crit-damage.js` mutates `this._formula` via regex (`/(\d+)d(\d+)/g`), then reparses terms with `Roll.parse()`. This is necessary because Foundry's Roll object uses immutable term structures.

**Actor flag persistence:** Skill data stored via `actor.setFlag("my-skill-system", "skills")` / `actor.getFlag(...)`.

## Compatibility

- Foundry VTT v10–v11
- D&D 5e system only (`"system": ["dnd5e"]` in module.json)
- Current version: 1.1.1
