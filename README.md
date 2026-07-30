# PetPass

PetPass is a map-first, pet-friendly travel planner for South Korea. It compares a
traveler's pet profile with source-backed venue policies, then builds a practical
route with visible evidence, preparation items, operating constraints, and nearby
alternatives.

This foundation ships an explicitly labeled local demo for a one-day Busan trip
with a small dog and a carrier. Live provider failures never fall back to that demo
silently.

## Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No external API key is required to run the demo.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

Provider credentials belong in `.env.local`; copy the names from `.env.example`
and never commit real values.

See `docs/architecture.md` and `docs/api-contracts.md` for system boundaries and
the next integration phase.
