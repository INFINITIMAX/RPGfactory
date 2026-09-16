# RF-K01a-d — corecție Coder după review

Data: 16-09-2026

## Context

Reviewer-ul a respins RF-K01a. Raport integral: `docs/handoff/RF-K01a-reviewer-raport.md`.

Defectul: `maxNodes` se bazează acum pe `children.length`. Nodurile invalide sau duplicate sunt parcurse fără să consume buget, astfel încât un input ostil poate cauza procesare și warnings nelimitate.

## Sarcina

Modifică numai `adapters/pi-subagents-contract.js` și scrie `docs/handoff/RF-K01a-d-coder-raport.md`.

Aplică fixul minim:

1. Bugetul `maxNodes` include root-ul și fiecare element de nod întâlnit în `steps` ori `children`, înainte de validare și deduplicare.
2. Un element invalid sau duplicat consumă exact o poziție din buget.
3. Când următorul element ar depăși bugetul, oprește ramura/parcurgerea determinist și setează `truncated.count = true`.
4. Păstrează comportamentul existent pentru noduri valide: maxNodes=3 înseamnă root + cel mult două elemente întâlnite/proiectate.
5. Nu elimina warning-ul pentru elementul invalid/duplicat care încă încape în buget.
6. Nu schimba API-ul, schema outputului, allowlist-ul, lifecycle, usage, depth, identitatea sau celelalte mapări deja acceptate.

## Interzis

Nu modifica teste, fixture-uri sau alte fișiere, în afară de raportul nou. Nu rula comenzi sau teste. Nu accesa artefacte reale.

## Raport

Explică mecanismul bugetului, semantica exactă root + elemente întâlnite și confirmă că nu ai rulat comenzi/teste.
