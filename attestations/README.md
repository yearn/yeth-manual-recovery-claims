# Attestations

Store claim-specific review evidence here when a ledger row needs supporting files beyond the canonical JSONL entry.

Suggested contents include:

- Signed message text files.
- Reviewer notes that should live with the accounting record.
- Payout or claimable-zeroing transaction evidence.
- Links or exported copies of external support context when needed.

Do not store private keys, seed phrases, internal credentials, or unrelated support material. `data/manual-claims.jsonl` remains the canonical ledger; files in this directory are supporting evidence.
