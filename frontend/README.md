# Ballast frontend

Next.js app for [Ballast](../README.md). Set `NEXT_PUBLIC_CONTRACT_ADDRESS` (see `.env.example`), then:

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests for the pure logic
npx next build
```

Reads need no wallet. Registering a monitor, attesting and challenging need MetaMask on GenLayer Bradbury (chain 4221). Every write is
simulated first so a refusal shows the contract's own reason, then read back after acceptance, then watched until it is FINALIZED.
