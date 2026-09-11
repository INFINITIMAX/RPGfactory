# RPGfactory

Vizualizator local 2D, stil medieval RPG, pentru agenții tăi reali (Claude Code și, ulterior, alte harness-uri). Fiecare agent e un personaj; nivelul lui (Grand Wizard / Wizard / Apprentice) vine din modelul folosit, specializarea e un atribut separat, iar knowledge-ul persistent încărcat într-un agent îl face să facă level.

Scris de la zero, inspirat conceptual de [bot-crossing](https://github.com/Station-Sciences/bot-crossing) (aceeași idee — sesiune = personaj — dar 3D acolo, 2D aici).

## Rulare

```
npm start
```

Citește sesiunile Claude Code din `~/.claude/sessions/*.json` și le servește pe `http://localhost:5311/`.

## Artă

Sprite-uri din pachete CC0/gratuite — vezi `assets/README.md` pentru sursă și licență. Arta nu intră în git (vezi `.gitignore`).
