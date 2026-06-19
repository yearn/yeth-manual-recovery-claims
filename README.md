# yeth-manual-recovery-claims

Canonical operational ledger for yETH manual late recovery claims.

This repository tracks manual claim requests, signatures, payout math, payout transactions, optional claimable-zeroing transactions, and generated inventories of still-unclaimed claims. It is intended for Yearn operators and reviewers; public visibility is acceptable because claim evidence should never include seed phrases, private keys, internal credentials, or unrelated support material.

## Source Snapshot

The original [`yearn/yETH-snapshot`](https://github.com/yearn/yETH-snapshot) repository is immutable historical source data. Do not edit or reinterpret that repository for operational recovery work. This repository imports the final snapshot into `data/source/snapshot.json` and records its provenance in `data/source/snapshot.meta.json`.

Final snapshot:

- Source repo: `https://github.com/yearn/yETH-snapshot`
- Snapshot JSON: `https://raw.githubusercontent.com/yearn/yETH-snapshot/master/snapshot.json`
- Snapshot block: `23914085`

## Contracts

Mainnet contracts used by this ledger:

| Name | Address |
| --- | --- |
| Claim contract | `0x9564850c7090B13794e6d1164B0826C0aEFf3143` |
| Yield vault | `0xd7a540ba3626c0aa66e7DB4088971d0CD64695B6` |
| Recovery vault | `0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd` |
| Asset | WETH, `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |

## Manual Payout Formula

Manual payouts use exact integer math:

```text
manualPayoutWei = floor(claimableWei * recoveryRateWei / 1e18)
```

All wei values are stored as decimal strings. A late manual claimant receives the same recovered principal they would have received via claim-and-exit during the claim window. They do not receive Recovery Vault shares or accrued Recovery Vault yield.

## Ledger

The canonical accounting ledger is `data/manual-claims.jsonl`.

Each line is one JSON object. An empty file is valid. Supporting files can be placed under `attestations/`, but they do not replace the ledger row.

Allowed statuses:

- `needs_signature`
- `signature_received`
- `verified`
- `ready_to_pay`
- `paid`
- `claimable_zeroed`
- `exception`

## Signed Message

Use this exact message shape for claimant signatures:

```text
yETH manual late claim
Wallet: <address>
Recipient: <recipient>
Snapshot block: 23914085
Snapshot amount: <snapshotAmountEth> ETH
Manual settlement amount: <manualPayoutEth> WETH
Date: <YYYY-MM-DD>
I understand this is a manual late claim for recovered principal only and does not mint Recovery Vault shares or include accrued yield.
```

This is message signing only. Claimants must not share seed phrases or private keys and must not sign a transaction for verification.

## Commands

Install dependencies:

```fish
npm ci
```

Run typechecking:

```fish
npm run check
```

Run tests:

```fish
npm test
```

Validate the ledger:

```fish
npm run validate
```

Export the ledger CSV:

```fish
npm run export:ledger
```

The CSV export writes:

```text
data/generated/manual-claims.csv
```

Verify a signature:

```fish
npm run verify:signature -- --address 0x... --message-file path/to/message.txt --signature 0x...
```

## Extract Unclaimed Claims

Set a mainnet RPC URL:

```fish
set -x ETH_RPC_URL "https://..."
```

Extract at the latest block:

```fish
npm run extract:unclaimed
```

Extract at a specific block:

```fish
npm run extract:unclaimed -- --block 12345678
```

Write generated outputs to a specific directory:

```fish
npm run extract:unclaimed -- --out-dir data/generated
```

The extraction script loads the snapshot, reads the claim contract at one exact block, queries `claimable(address)` for every snapshot address, computes `manualPayoutWei`, and writes JSON and CSV inventories under `data/generated/`.

Generated inventory files:

- `data/generated/unclaimed-claims.<block>.json`
- `data/generated/unclaimed-claims.<block>.csv`
- `data/generated/unclaimed-claims.latest.json`
- `data/generated/unclaimed-claims.latest.csv`

## Operational Flow

1. Claimant opens an issue using the manual yETH claim issue template.
2. Operator runs the `Prepare Claim` workflow with issue number, claimant address, and recipient.
3. Claimant signs the exact message posted by the workflow.
4. Claimant posts the Etherscan verified signature URL, raw signature, and exact signed message.
5. Operator base64-encodes the signed message and runs the `Verify Claim` workflow.
6. Workflow opens a PR that adds or updates the ledger row as `ready_to_pay`.
7. CI validates typechecking, tests, ledger validation, and generated CSV output.
8. Move the GitHub Project item to `ready_to_pay`.
9. Payer sends WETH according to the approved manual payout.
10. Operator runs the `Record Claim Transaction` workflow with `tx_kind = payout`.
11. Workflow opens a PR that updates the ledger row to `paid`.
12. Optional: call the claim contract `set_claimable([address], [0])`.
13. Operator runs the `Record Claim Transaction` workflow with `tx_kind = zeroing`.
14. Workflow opens a PR that updates the ledger row to `claimable_zeroed`.
15. After a ledger PR merges, `Refresh Unclaimed Inventory` runs and opens a generated inventory PR if claimable state changed.
16. Close the issue after the ledger and generated inventory are current.

## Manual Workflows

### Repository Secret

Add a repository Actions secret named:

```text
ETH_RPC_URL
```

Use a dedicated RPC key with quota limits. The workflows read it as an environment variable and do not print it.

### Prepare Claim

Workflow: `Prepare Claim`

Inputs:

- `issue_number`
- `address`
- `recipient`
- `date`, optional. Defaults to current UTC date.

The workflow reads `data/generated/unclaimed-claims.latest.json`, computes the exact message, and comments on the issue.

### Verify Claim

Workflow: `Verify Claim`

Inputs:

- `issue_number`
- `address`
- `recipient`
- `signature_url`
- `signature`
- `signed_message_base64`
- `notes`, optional

The workflow verifies:

- address exists in the latest unclaimed inventory
- signed message matches the ledger values exactly
- signature verifies for the claimant address
- payout math and ledger schema pass validation

To encode the exact signed message locally:

```fish
base64 -i signed-message.txt | tr -d '\n'
```

Paste that value into `signed_message_base64`. The workflow opens a PR rather than pushing directly to the protected branch.

### Record Claim Transaction

Workflow: `Record Claim Transaction`

Inputs:

- `address`
- `tx_kind`: `payout` or `zeroing`
- `tx_hash`

For `payout`, the workflow verifies the transaction succeeded and contains either:

- an exact WETH transfer to the ledger recipient for `manualPayoutWei`
- or a direct ETH transaction to the ledger recipient for `manualPayoutWei`

For `zeroing`, the workflow verifies the transaction succeeded and `claimable(address) == 0` at the transaction block.

The workflow opens a PR with the updated ledger row and generated manual ledger CSV.

### Refresh Unclaimed Inventory

Workflow: `Refresh Unclaimed Inventory`

Triggers:

- manual `workflow_dispatch`
- push to `main` or `master` that changes `data/manual-claims.jsonl`

The workflow runs `npm run extract:unclaimed` with `ETH_RPC_URL` and opens a PR only if generated unclaimed inventory changes.

Contract-wallet signatures are not automated yet. If a claimant address is a Safe or another contract wallet, handle it as an exception until EIP-1271 support is added.

## Pull Request Requirements

Every claim PR should include:

- The GitHub issue link.
- The claimant address and recipient address.
- The signature URL, raw signature, and signed message when required by status.
- Exact wei values as strings.
- Payout transaction hash when status is `paid` or `claimable_zeroed`.
- Claimable-zeroing transaction hash when status is `claimable_zeroed`.
- Updated generated CSV when `data/manual-claims.jsonl` changes.

## GitHub Project

Create a GitHub Project named:

```text
yETH Manual Recovery Claims
```

Board statuses:

- `needs_signature`
- `signature_received`
- `verified`
- `ready_to_pay`
- `paid`
- `claimable_zeroed`
- `exception`

Custom fields:

- `Address`
- `Recipient`
- `Payout ETH`
- `Payout Wei`
- `Signature URL`
- `Payout Tx`
- `Zeroing Tx`
- `Reviewer`
- `Payer`
- `Extraction Block`
- `Ledger PR`

Automation:

- Auto-add issues with the label `yeth-manual-claim`.
- Set initial status to `needs_signature`.
- Move closed issues to done or archive them if desired.

GitHub Projects is coordination only. `data/manual-claims.jsonl` is the canonical accounting record.

## GitHub Repository Settings

Before enabling branch protection:

- Confirm the GitHub teams in `.github/CODEOWNERS` exist.
- Update `.github/CODEOWNERS` if the placeholder teams are not the real review teams.
- Enable branch protection and require the validate workflow.
- Require CODEOWNERS review for protected branches.

Current CODEOWNERS references:

- `@yearn/recovery-reviewers`
- `@yearn/recovery-engineering`

Maintainers must update those entries to real GitHub teams before relying on CODEOWNERS for branch protection.
