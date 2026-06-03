# Reentrancy Attack — Group 6

> Live demonstration of a reentrancy exploit and its defense on Ethereum smart contracts, built and proven end-to-end with Foundry, Anvil, and a MetaMask UI.

| | |
|---|---|
| **Course** | CSL6010 — Cyber Security |
| **Instructor** | Prof. Susil Kumar Mohanty |
| **TA** | Nidhi Srivastava (P23CS0013) |
| **Institution** | M.Tech AI · IIT Jodhpur · Trimester-02 |
| **Domain** | Blockchain & Smart-Contract Security |

---

## Table of Contents

1. [Demo Video and Links](#demo-video-and-links)
2. [Team — Group 6](#team--group-6)
3. [The One-Sentence Idea](#the-one-sentence-idea)
4. [What the Demo Shows](#what-the-demo-shows)
5. [Problem Statement — What a Reentrancy Attack Is](#problem-statement--what-a-reentrancy-attack-is)
6. [Why It Works — The EVM Mechanics](#why-it-works--the-evm-mechanics)
7. [The Attack, Step by Step](#the-attack-step-by-step)
8. [Root Cause Analysis](#root-cause-analysis)
9. [Business and System Impact](#business-and-system-impact)
10. [Repository Structure](#repository-structure)
11. [Quick Start](#quick-start)
12. [Code Walkthrough](#code-walkthrough)
13. [Prevention and Defense](#prevention-and-defense)
14. [Incident Response — If You Are Already Exploited](#incident-response--if-you-are-already-exploited)
15. [Expected Test Results](#expected-test-results)
16. [Real-World Impact](#real-world-impact)
17. [Types of Reentrancy You Should Know](#types-of-reentrancy-you-should-know)
18. [References](#references)

---

## Demo Video and Links

| Resource | Link |
|---|---|
| Demo Video (Google Drive) | [Watch here](https://drive.google.com/file/d/1UW-czbJ6zCjCyvIUxxlwvNiTXB9M8nGP/view?usp=sharing) |
| Source Code (GitHub) | [rpaut03l/ts_02_safevault-reentrancy-demo](https://github.com/rpaut03l/ts_02_safevault-reentrancy-demo) |
| Presentation Slides | [Group_6_Presentation.pptx](https://github.com/rpaut03l/ts_02_safevault-reentrancy-demo/blob/main/Group%20PPT/Group_6_Presentation.pptx) |

[Back to top](#table-of-contents)

---

## Team — Group 6

| Name | Roll Number | Contribution |
|---|---|---|
| Rohit Patel | G25AIT2089 | Demo architecture · Foundry |
| Sharvan Vittala | G25AIT2099 | VulnerableVault.sol contract |
| Sudeb Ghosh | G25AIT2113 | Attacker.sol + fallback exploit |
| Kosuru Yuvaraj | G25AIT2054 | Fixed contract (CEI + ReentrancyGuard) |
| Pujan Chakraborty | G25AIT2076 | Foundry tests + traces + slides |
| Amit Singh | G25AIT2007 | Research — DAO + Curve case studies |
| Vishnu Priya | G25AIT2128 | README + demo video + frontend |

[Back to top](#table-of-contents)

---

## The One-Sentence Idea

A reentrancy attack is a smart-contract bug where a vault sends ETH **before** it updates its internal records — letting a malicious receiver call back into the same function and drain the vault recursively, all inside a single transaction, before the books are ever corrected.

[Back to top](#table-of-contents)

---

## What the Demo Shows

1. **Alice** and **Bob** each deposit 5 ETH into the `VulnerableVault`, which now holds **10 ETH** of honest funds.
2. **Eve** (the attacker) deposits only **1 ETH** through her malicious `Attacker.sol` contract.
3. Eve calls `attack()`. The vault drains to **0 ETH** in a single transaction — Eve walks away with **11 ETH** (her 1 + everyone else's 10).
4. The same attack is fired at `SafeVault`. It **reverts** on the very first re-entry; the vault keeps its 10 ETH.
5. The Foundry trace (`-vvv`) prints the recursive `withdraw()` loop, so you can literally watch the call stack re-enter itself.

[Back to top](#table-of-contents)

---

## Problem Statement — What a Reentrancy Attack Is?

A **reentrancy attack** is a vulnerability where an external contract is allowed to call back ("re-enter") into a function before that function has finished its first run. Because the contract's internal state has not yet been updated, the same checks pass again and again, and the same payout fires again and again.

Explain-it-to-a-kid version:

> Imagine an ATM that hands you cash **first**, and only **afterwards** writes down "this person already withdrew." If you could somehow ask for money again in the split second before it writes anything down, the ATM would happily pay you a second time — because as far as its notebook knows, you still have a full balance. Reentrancy is exactly that gap between "hand over the money" and "write it down."

Key characteristics:

* **Recursive exploitation** — the same function calls itself indirectly through the attacker.
* **State inconsistency** — the balance is updated *after* the external call, not before.
* **Unguarded external calls** — sending ETH to a contract hands that contract control of the CPU mid-function.
* **Most famous case** — The DAO hack of 2016, which drained roughly $60M and split Ethereum into ETH and ETC.

[Back to top](#table-of-contents)

---

## Why It Works — The EVM Mechanics

This is the part the slides skip, and it is the part that actually matters.

**1. Sending ETH to a contract runs that contract's code.**
When `call{value: x}("")` reaches a contract address, the EVM does not just move a number. It *invokes* the recipient's `receive()` or `fallback()` function. The recipient is now executing **inside the sender's transaction**, holding the program counter, before the sender's function has returned.

**2. The sender is paused, not finished.**
The vulnerable `withdraw()` is mid-execution. It has sent the ETH but has not yet zeroed the balance. It is "parked" on the call instruction, waiting for the receiver to return. The receiver does not have to return immediately — it can do whatever it wants first, including calling `withdraw()` again.

**3. The `require` check still passes.**
On re-entry, `require(bal > 0)` reads storage. Storage still says the attacker has a balance, because the line that zeroes it has not run yet. So the guard waves the attacker through every single time.

**4. Gas stipend caveat (important nuance).**
Historically, `transfer()` and `send()` forwarded only a **2300 gas** stipend — barely enough to log an event, not enough to re-enter. People relied on this as a defense. **Do not.** After EIP-1884 (Istanbul) raised storage-access gas costs, the 2300 stipend became unreliable, and `transfer()` can now break legitimate recipients. The modern guidance is: use `call`, but protect it with CEI and a reentrancy guard. The stipend is a side effect, never a security control.

ASCII model of the re-entry loop:

```
  Eve (EOA)          Attacker.sol              VulnerableVault.sol
     |                    |                            |
     | attack() -------->  deposit{value:1}() -------->  balances[Atk]=1
     |                    |                            |
     |                     withdraw() ------------------>  require(1>0) OK
     |                    |                            |    send 1 ETH --+
     |                     receive() fires <-----------+ (paused here)   |
     |                    |                            |                 |
     |                     withdraw() (RE-ENTRY) ------> require(1>0) OK |
     |                    |                            |    send 1 ETH   |
     |                     receive() fires again <-----+                 |
     |                    |        ... loop ...        |                 |
     |                    |                            |  vault empty    |
     |                    | (loop stops, stack unwinds) balances[Atk]=0  |
     |                    |                            |  (too late)     |
```

The balance is finally set to 0 only *after* every recursive call has returned — by then the vault is empty.

[Back to top](#table-of-contents)

---

## The Attack, Step by Step

```
1. Victim contract holds honest funds (Alice 5 + Bob 5 = 10 ETH).
2. Attacker deposits a small amount (1 ETH) so it has a valid balance.
3. Attacker calls withdraw().
4. Vault sends ETH to Attacker BEFORE updating the balance.
5. Attacker's receive() fires and calls withdraw() again.
6. Vault's require(bal > 0) still passes -> sends ETH again.
7. Steps 5-6 repeat until the vault cannot cover another payout.
8. The stack unwinds; the vault finally sets balance = 0 (uselessly).
9. Net result: Eve drains 11 ETH from a 1 ETH stake.
```

The drain arithmetic for the demo: Eve's recorded balance is 1 ETH, so each re-entry sends 1 ETH. The loop fires ~11 times (1 ETH of her own + 10 ETH of honest deposits) until the vault balance can no longer cover a transfer.

[Back to top](#table-of-contents)

---

## Root Cause Analysis

**Root cause 1 — Checks-Effects-Interactions (CEI) violation.**

```solidity
// VULNERABLE
function withdraw(uint amount) public {
    require(balances[msg.sender] >= amount);    // Check
    msg.sender.call{value: amount}("");         // Interaction FIRST  (wrong)
    balances[msg.sender] -= amount;             // Effect LAST        (too late)
}
```

The external call (Interaction) happens before the state change (Effect). The correct order is Checks, then Effects, then Interactions.

**Root cause 2 — Unprotected external calls.**
Untrusted contracts are called with no mutex/lock. A fallback or `receive()` function on the recipient can re-enter freely.

**Root cause 3 — State management.**
Balance is updated after the transfer; there is no lock preventing concurrent (re-entrant) access; no function modifier guards the critical section.

Why it happens in practice:

* Developer oversight in call ordering.
* Low security awareness in early smart-contract development.
* Complex multi-contract interaction patterns.
* Insufficient testing for the malicious-recipient edge case.

[Back to top](#table-of-contents)

---

## Business and System Impact

**Financial:**

* Direct, irreversible theft of funds — blockchain transactions cannot be reversed.
* Token/market value drops as confidence erodes.
* The DAO: ~$60M drained, forcing the Ethereum hard fork (ETH vs ETC split).

**System:**

| Impact area | Consequence |
|---|---|
| Contract state | Corrupted balances, inconsistent accounting |
| Transaction flow | Recursive calls exhaust gas; denial of service |
| Trust | Users abandon the platform |
| Operations | Emergency pauses, frozen contracts |

**Cascading effects:** heightened regulatory scrutiny, higher DeFi insurance costs, security-audit delays, lasting reputation damage.

[Back to top](#table-of-contents)

---

## Repository Structure

```
Assignment-1-Reentrancy-Attack/
|
+-- README.md                          # This file
+-- setup.sh                           # One-shot deployment script
+-- Group_6_Presentation.pdf           # Presentation slides
|
+-- reentrancy-demo/                   # Solidity (Foundry) project
|   +-- src/
|   |   +-- VulnerableVault.sol        # The buggy vault
|   |   +-- SafeVault.sol              # Fixed vault (CEI + nonReentrant)
|   |   +-- Attacker.sol               # Malicious contract with reentrant receive()
|   +-- test/
|   |   +-- Reentrancy.t.sol           # Forge tests proving attack + defense
|   +-- foundry.toml
|   +-- remappings.txt
|
+-- safevault-frontend/                # Next.js + ethers.js + MetaMask UI
    +-- app/
    |   +-- page.tsx                   # Main dashboard
    |   +-- layout.tsx
    +-- package.json
```

[Back to top](#table-of-contents)

---

## Quick Start

### Prerequisites

* **Foundry** (forge, anvil, cast) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
* **Node.js v18+** and **npm**
* **MetaMask** browser extension (for the live UI demo)
* macOS or Linux (tested on Apple Silicon)

### Run the deterministic proof (no UI, ~30 seconds)

```bash
cd reentrancy-demo
forge install
forge test -vvv --match-test testReentrancyDrain        # attack succeeds
forge test -vvv --match-test testSafeVaultBlocksAttack  # attack reverts
```

Both tests pass. The `-vvv` flag prints the full EVM call trace, exposing the recursive `withdraw()` calls on the vulnerable vault.

### Run the live UI demo

**Terminal 1 — Anvil (local Ethereum chain):**

```bash
cd reentrancy-demo
anvil --chain-id 31337
```

**Terminal 2 — Deploy contracts + write env file:**

```bash
cd ..
bash setup.sh
```

**Terminal 3 — Next.js dev server:**

```bash
cd safevault-frontend
npm install
npm run dev
```

**Browser:**

1. Open `http://localhost:3000` in **Chrome** (Safari blocks HTTP localhost).
2. Add the Anvil network to MetaMask: RPC `http://127.0.0.1:8545`, Chain ID `31337`.
3. Import Alice / Bob / Eve via Anvil's default private keys.
4. Connect MetaMask, then Deposit, then Trigger Attack and watch the vault drain.

[Back to top](#table-of-contents)

---

## Code Walkthrough

### The bug — `VulnerableVault.sol`

```solidity
function withdraw() external {
    uint256 bal = balances[msg.sender];
    require(bal > 0, "no balance");

    (bool ok, ) = msg.sender.call{value: bal}("");   // INTERACTION first
    require(ok, "transfer failed");

    balances[msg.sender] = 0;                         // EFFECT last (TOO LATE)
}
```

The vault sends ETH before zeroing the caller's balance. When the caller is a contract, its `receive()` fires automatically and re-calls `withdraw()`. The `require(bal > 0)` still passes because the balance has not been zeroed. The loop repeats until the vault is empty.

### The weapon — `Attacker.sol`

```solidity
contract Attacker {
    VulnerableVault public vault;

    constructor(address _vault) {
        vault = VulnerableVault(_vault);
    }

    // 1. Seed a real balance, then start the drain.
    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    // 2. This fires every time the vault sends ETH.
    //    While the vault is still mid-withdraw, we re-enter.
    receive() external payable {
        if (address(vault).balance >= msg.value) {
            vault.withdraw();
        }
    }
}
```

`receive()` is the trigger. Each incoming payment from the vault re-calls `withdraw()`. The `if` check stops the loop once the vault no longer has enough to pay out, so the transaction does not revert from an out-of-funds failure.

### The fix — `SafeVault.sol`

```solidity
function withdraw() external nonReentrant {           // Defense 1: mutex lock
    uint256 bal = balances[msg.sender];
    require(bal > 0, "no balance");

    balances[msg.sender] = 0;                          // Defense 2: EFFECT first

    (bool ok, ) = msg.sender.call{value: bal}("");     // INTERACTION last
    require(ok, "transfer failed");
}
```

Two independent layers of defense — either one alone stops the attack:

1. **Checks-Effects-Interactions** — the balance is zeroed *before* the ETH leaves. On re-entry, `require(bal > 0)` fails because the balance is already 0.
2. **`nonReentrant` modifier** — OpenZeppelin's `ReentrancyGuard` flips a storage flag at function entry and reverts if the function is entered again while that flag is set. Together this is defense-in-depth.

[Back to top](#table-of-contents)

---

## Prevention and Defense

### 1. Checks-Effects-Interactions (the primary fix)

Always order your function body as: **Checks** (validate inputs and state), then **Effects** (update your own storage), then **Interactions** (call external addresses last). If a re-entry happens after Effects, the state is already consistent and the malicious caller gains nothing.

### 2. Reentrancy guard (mutex)

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SafeVault is ReentrancyGuard {
    function withdraw() external nonReentrant { /* ... */ }
}
```

Under the hood, `nonReentrant` is a simple lock: set a status flag to "entered" on the way in, revert if it is already "entered," reset it on the way out. It costs a little gas but blocks single-function reentrancy outright.

### 3. Pull-payment pattern

Instead of *pushing* ETH to users inside your logic (push payment), record what they are owed and let them *pull* it in a separate, isolated transaction. This removes the external call from the sensitive code path entirely.

### Defensive checklist

```
[*] Follow Checks-Effects-Interactions in EVERY state-changing function
[*] Add nonReentrant to functions that make external calls
[*] Prefer the pull-payment pattern over push payments
[*] Treat the 2300 gas stipend as a side effect, NEVER as a defense
[*] Validate external-call return values (require(ok))
[*] Run static analysis: Slither, Mythril
[*] Add fuzz/invariant tests for the malicious-recipient case
[*] Get a professional audit before mainnet deployment
[*] Run a bug-bounty program post-launch
```

Mnemonic — **CEI-GUARD-PULL**: **C**heck, **E**ffect, **I**nteract; **GUARD** the door (nonReentrant); let them **PULL**, do not push.

[Back to top](#table-of-contents)

---

## Incident Response — If You Are Already Exploited

```
1. PAUSE     - Trigger the emergency circuit breaker / pause modifier.
2. ISOLATE   - Cut off the vulnerable contract from connected protocols.
3. AUDIT     - Pinpoint the exact CEI violation and unguarded call.
4. PATCH     - Apply CEI + nonReentrant; add tests that reproduce the attack.
5. REDEPLOY  - Ship the fixed contract; migrate state if possible.
6. DISCLOSE  - Notify users, publish a post-mortem, coordinate with auditors.
```

Long-term: build a security-first culture, wire static analysis into CI/CD, run continuous bug bounties, and keep developers trained on the latest attack classes.

[Back to top](#table-of-contents)

---

## Expected Test Results

| Test | Result |
|---|---|
| `testReentrancyDrain` (VulnerableVault) | PASS · vault drops to 0 ETH · attacker holds 11 ETH |
| `testSafeVaultBlocksAttack` (SafeVault) | PASS · attack reverts · vault keeps 10 ETH |

[Back to top](#table-of-contents)

---

## Real-World Impact

| Incident | Year | Loss | Note |
|---|---|---|---|
| The DAO Hack | 2016 | ~$60M | Caused the Ethereum hard fork (ETH / ETC split) |
| Cream Finance | 2021 | ~$130M | Cross-contract reentrancy via flash loans |
| Curve Finance | 2023 | ~$70M | Vyper compiler bug disabled the reentrancy lock |
| Cumulative | 2016–2024 | >$200M | Across many DeFi protocols |

Classified as **SWC-107** in the Smart Contract Weakness Classification registry.

[Back to top](#table-of-contents)

---

## Types of Reentrancy You Should Know

* **Single-function reentrancy** — the classic case demonstrated here; a function re-enters itself. CEI + `nonReentrant` stops it.
* **Cross-function reentrancy** — the attacker re-enters a *different* function that shares the same state. A per-function guard is not enough; the shared state must be consistent across functions.
* **Cross-contract reentrancy** — the shared state lives in another contract, so a guard on one contract does not protect the other.
* **Read-only reentrancy** — the attacker re-enters a `view` function during an inconsistent state and feeds the stale reading to a third protocol that trusts it. Guards on write functions do not cover this; the answer is consistent state and careful oracle/price-feed design.

[Back to top](#table-of-contents)

---

## References

1. [SWC-107: Reentrancy](https://swcregistry.io/docs/SWC-107/)
2. [OpenZeppelin ReentrancyGuard source](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/ReentrancyGuard.sol)
3. [Solidity Docs — Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
4. [Consensys Best Practices — Reentrancy](https://consensysdiligence.github.io/smart-contract-best-practices/attacks/reentrancy/)
5. [Chainlink — The DAO Hack Explained](https://blog.chain.link/reentrancy-attacks-and-the-dao-hack/)
6. [Solidity by Example — Re-Entrancy](https://solidity-by-example.org/hacks/re-entrancy/)
7. [Foundry Book](https://book.getfoundry.sh/)
8. [Ethernaut Level 10 (Reentrancy)](https://ethernaut.openzeppelin.com/level/10)

---

## License

MIT — Educational purposes (CSL6010 course assignment).

[Back to top](#table-of-contents)
