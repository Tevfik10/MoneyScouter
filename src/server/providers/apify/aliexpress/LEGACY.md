# AliExpress adapter — LEGACY / INACTIVE

As of the Alibaba sourcing migration, **Alibaba is the only active product
discovery source**. Everything in this directory (`crawlerbros/`,
`tortuga/`, `index.ts`, `types.ts`) is kept for its own unit tests and as a
reference in case AliExpress is reactivated in the future, but:

- **Nothing in the active pipeline imports it.** `orchestratorReal.ts`
  imports `@/server/providers/apify/alibaba`, not this directory.
- It never runs, never starts an Apify Actor, and never consumes budget —
  there is no code path left that calls `getAliExpressProvider`,
  `tortugaAliExpressProvider.search`, or `crawlerbrosAliExpressProvider.search`
  outside of `*.test.ts` files in this same directory.
- It is not offered as a choice anywhere in Settings or the UI.
- No AliExpress data is ever mixed into an Alibaba-sourced run: discovery
  writes `Supplier.platform = "alibaba"`, never `"aliexpress"`, going
  forward.

Historical `Product`/`Supplier`/`ProductSource` rows with
`platform = "aliexpress"` from before this migration are left in the
database untouched — they remain valid historical records, just no longer
added to.

To reactivate this provider, re-wire `orchestratorReal.ts`'s discovery step
back onto `getAliExpressProvider()` and reintroduce a provider selector in
Settings. Until then, treat every file in this directory as dead code that
happens to still compile and test cleanly.
