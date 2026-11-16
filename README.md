# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bangandrii/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bangandrii/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token-radar is a specialized discovery tool built for the make.fun token-radar-01 bounty. It processes a frozen DefiLlama snapshot containing 758 protocols, specifically monitoring a 40-protocol watchlist with a $50M TVL floor. The system identifies and ranks 198 pre-token protocols based on their implied value, generating a comprehensive board.json file, a self-contained offline dashboard, and a detailed dossier.

The valuation logic, defined in lib/model.ts (model version radar-2), calculates implied value by multiplying TVL by the median market-cap/TVL ratio of tokenized protocols within the same category. For categories with limited peer data, the model blends toward the global median, with multiples clamped between 0.02x and 3x. Final scores are further refined by 7-day momentum (clamped -60% to +120% with a 0.5 weight), protocol maturity (age in days, capped at 3 years), and a size discount that tapers values for protocols exceeding $100M TVL down to a 0.45 floor. The model is strictly algorithmic and does not special-case any specific protocol names.

The output includes a comprehensive board covering all watchlist slugs, while rows below the TVL floor highlight promising early-stage discoveries. Existing tokenized protocols are maintained as a separate reference list. The provided dashboard is a zero-dependency HTML/CSS/JS application designed for offline use, featuring robust search and filtering by category or chain. Users can explore sortable columns, a "How the radar scores" panel for transparency, and individual detail pages that provide a full model breakdown alongside a specific, actionable farming plan including estimated costs and timeframes for every protocol.

* **Main Outputs:** The script main.ts generates board.json, data.js, a dashboard/ directory, screenshots/, and dossier.json.
* **Data Shape:** The resulting board contains between 100 and 4000 rows ranked 1 to N, with implied values strictly non-increasing.
* **Protocol Details:** Each row includes 3 to 12 detailed farming steps, with each step description ranging from 20 to 600 characters.

## Run it

```sh
node main.ts --input path/to/snapshot.json
# writes ./output (or $MAKEFUN_OUTPUT_DIR): board.json, data.js, dashboard/, screenshots/, dossier.json
# then open output/dashboard/index.html in a browser — it runs fully offline
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=rj8w1xf3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

(Disclosure, required by the house: the make.fun link in that footer is the author's referral link.)
