#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

STATE_FILE="dashboard/state.json"

write_state() {
  cat > "$STATE_FILE" <<JSON
{
  "event": "$1",
  "vault_balance_wei": "$2",
  "attacker_loot_wei": "$3",
  "alice_recorded_balance_wei": "$4",
  "bob_recorded_balance_wei": "$5"
}
JSON
}

write_state "initial" "0" "0" "0" "0"
echo ""
echo "===================================="
echo "  SafeVault Bank — DEFENSE Demo"
echo "  Same attack, vault now protected"
echo "===================================="
sleep 5

echo "▶ Alice deposits 5 ETH..."
write_state "alice_deposits_5_eth_SAFE" "5000000000000000000" "0" "5000000000000000000" "0"
sleep 3

echo "▶ Bob deposits 5 ETH..."
write_state "bob_deposits_5_eth_SAFE" "10000000000000000000" "0" "5000000000000000000" "5000000000000000000"
sleep 3

echo "▶ Eve attempts the same attack..."
sleep 2

echo "▶ ✓ nonReentrant guard catches the re-entry — TRANSACTION REVERTED"
write_state "attack_BLOCKED_by_defense" "10000000000000000000" "0" "5000000000000000000" "5000000000000000000"
sleep 3

echo ""
echo "Running the REAL forge test to confirm..."
sleep 1
forge test -vv --match-test testLiveDefense
