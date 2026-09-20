# RPGfactory

A local 2D medieval RPG-style visualizer for your real agents (Claude Code and, later, other harnesses). Each agent is a character; its rank (Grand Wizard / Wizard / Apprentice) comes from the model in use, specialization is a separate attribute, and persistent knowledge loaded into an agent contributes to leveling.

Written from scratch and conceptually inspired by [bot-crossing](https://github.com/Station-Sciences/bot-crossing) (the same idea—run as character—but 3D there and 2D here).

## Run

```
npm start
```

Reads Claude Code runs from `~/.claude/sessions/*.json` and serves them at `http://localhost:5311/`.

## Art

Sprites come from CC0/free packs—see `assets/README.md` for sources and licenses. The art is not committed to Git (see `.gitignore`).
