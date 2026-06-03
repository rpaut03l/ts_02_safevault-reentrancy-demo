# Reentrancy Attack — Group 6

> **Live demonstration of a reentrancy exploit and defense on Ethereum smart contracts.**

**Course:** CSL6010 Cyber Security
**Instructor:** Prof. Susil Kumar Mohanty
**TA:** Nidhi Srivastava (P23CS0013)
**Institution:** M.Tech AI · IIT Jodhpur · Trimester 2
**Domain:** Blockchain & Smart-Contract Security

---

## 📺 Demo Video & Links

| Resource | Link |
|---|---|
| 🎥 **Demo Video (Google Drive)** | [Watch here](https://drive.google.com/file/d/1UW-czbJ6zCjCyvIUxxlwvNiTXB9M8nGP/view?usp=sharing) |
| 💻 **Source Code (GitHub)** | [rpaut03l/safevault-reentrancy-demo](https://github.com/rpaut03l/safevault-reentrancy-demo) |
| 📄 **Presentation Slides** | [Group_6_Presentation.pdf](./Group_6_Presentation.pdf) |

---

## 👥 Team — Group 6

| Name | Roll Number | Contribution |
|---|---|---|
| Rohit Patel | G25AIT2089 | Lead · Demo architecture · Foundry + Frontend · Slides |
| Sharvan Vittala | G25AIT2099 | VulnerableVault.sol contract |
| Sudeb Ghosh | G25AIT2113 | Attacker.sol + fallback exploit |
| Kosuru Yuvaraj | G25AIT2054 | Fixed contract (CEI + ReentrancyGuard) |
| Pujan Chakraborty | G25AIT2076 | Foundry tests + traces |
| Amit Singh | G25AIT2007 | Research — DAO + Curve case studies |
| Vishnu Priya | G25AIT2128 | README + demo video recording |

---

## 🎯 The One-Sentence Idea

A reentrancy attack is a smart-contract bug where a vault sends ETH **before** updating its records — letting a malicious receiver re-enter the same function and drain the vault recursively in a single transaction.

---

## 🎬 What the Demo Shows

1. **Alice** and **Bob** each deposit 5 ETH → VulnerableVault holds 10 ETH of honest funds
2. **Eve** (attacker) with only 1 ETH triggers the exploit
3. Vault drains to 0 in a single transaction — Eve walks away with 11 ETH
4. Same attack against **SafeVault** → reverts via `nonReentrant` guard
5. Foundry trace confirms recursive `withdraw()` loop on the vulnerable vault

---

## 📁 Repository Structure

    Assignment-1-Reentrancy-Attack/
    │
    ├── README.md                          # This file
    ├── setup.sh                           # One-shot deployment script
    ├── Group_6_Presentation.pdf           # Presentation slides
    │
    ├── reentrancy-demo/                   # Solidity (Foundry) project
    │   ├── src/
    │   │   ├── VulnerableVault.sol        # The buggy vault
    │   │   ├── SafeVault.sol              # Fixed vault (CEI + nonReentrant)
    │   │   └── Attacker.sol               # Malicious contract with reentrant receive()
    │   ├── test/
    │   │   └── Reentrancy.t.sol           # Forge tests proving attack + defense
    │   ├── foundry.toml
    │   └── remappings.txt
    │
    └── safevault-frontend/                # Next.js + ethers.js + MetaMask UI
        ├── app/
        │   ├── page.tsx                   # Main dashboard
        │   └── layout.tsx
        └── package.json

---

## 🚀 Quick Start

### Prerequisites

- **Foundry** (forge, anvil, cast) — `brew install foundry`
- **Node.js v18+** and **npm**
- **MetaMask** browser extension (for the live UI demo)
- macOS or Linux (tested on Apple Silicon)

### Run the deterministic proof (no UI, 30 seconds)

```bash
cd reentrancy-demo
forge install
forge test -vvv --match-test testReentrancyDrain          # attack succeeds
forge test -vvv --match-test testSafeVaultBlocksAttack    # attack reverts
```

Both tests pass. The `-vvv` flag prints the full EVM call trace, showing recursive `withdraw()` calls.

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

1. Open `http://localhost:3000` in **Chrome** (Safari blocks HTTP localhost)
2. Add Anvil network to MetaMask: RPC `http://127.0.0.1:8545`, Chain ID `31337`
3. Import Alice/Bob/Eve via Anvil's default private keys
4. Connect MetaMask → Deposit → Trigger Attack

---

## 🔍 The Vulnerability — Code Walkthrough

### Buggy code (`VulnerableVault.sol`)

```solidity
function withdraw() external {
    uint256 bal = balances[msg.sender];
    require(bal > 0, "no balance");

    (bool ok, ) = msg.sender.call{value: bal}("");   // INTERACTION first
    require(ok, "transfer failed");

    balances[msg.sender] = 0;                        // EFFECT last (TOO LATE!)
}
```

The vault sends ETH **before** zeroing the caller's balance. When the caller is a contract, its `receive()` function fires automatically — and uses that moment to call `withdraw()` again. The `require(bal > 0)` check still passes because balance hasn't been zeroed yet. The loop repeats until the vault is empty.

### Fixed code (`SafeVault.sol`)

```solidity
function withdraw() external nonReentrant {          // Defense 1: mutex lock
    uint256 bal = balances[msg.sender];
    require(bal > 0, "no balance");

    balances[msg.sender] = 0;                        // Defense 2: EFFECT first

    (bool ok, ) = msg.sender.call{value: bal}("");   // INTERACTION last
    require(ok, "transfer failed");
}
```

Two layers of defense:

1. **Checks-Effects-Interactions (CEI)** — Zero the balance BEFORE sending ETH. On a re-entry, the `require(bal > 0)` check fails because balance is already 0.
2. **`nonReentrant` modifier** — OpenZeppelin's `ReentrancyGuard` adds a mutex. If the function is called while still executing, the modifier reverts the transaction.

Either defense alone stops the attack. Together they provide defense-in-depth.

---

## 📊 Expected Test Results

| Test | Result |
|---|---|
| `testReentrancyDrain` (VulnerableVault) | ✅ PASS · Vault → 0 ETH · Attacker → 11 ETH |
| `testSafeVaultBlocksAttack` (SafeVault) | ✅ PASS · Attack reverts · Vault keeps 10 ETH |

---

## 🌍 Real-World Impact

| Incident | Year | Loss |
|---|---|---|
| **The DAO Hack** | 2016 | ~$60M (caused Ethereum hard fork) |
| **Cream Finance** | 2021 | ~$130M |
| **Curve Finance** | 2023 | ~$70M (Vyper compiler bug) |
| **Multiple incidents** | 2016–2024 | >$200M cumulative |

Classified as **SWC-107** in the Smart Contract Weakness Classification registry.

---

## 📚 References

1. [SWC-107: Reentrancy](https://swcregistry.io/docs/SWC-107/)
2. [OpenZeppelin ReentrancyGuard source](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/ReentrancyGuard.sol)
3. [Solidity Docs — Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
4. [Consensys Best Practices — Reentrancy](https://consensysdiligence.github.io/smart-contract-best-practices/attacks/reentrancy/)
5. [Chainlink — The DAO Hack Explained](https://blog.chain.link/reentrancy-attacks-and-the-dao-hack/)
6. [Solidity by Example — Re-Entrancy](https://solidity-by-example.org/hacks/re-entrancy/)
7. [Foundry Book](https://book.getfoundry.sh/)
8. [Ethernaut Level 10 (Reentrancy)](https://ethernaut.openzeppelin.com/level/10)

---

## 📄 License

MIT — Educational purposes (CSL6010 course assignment).
