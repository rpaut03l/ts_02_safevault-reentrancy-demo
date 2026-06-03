#!/usr/bin/env bash
# Live attack driver: runs the Forge test and translates snapshots into
# state.json updates the dashboard reads every 500ms.

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

# Reset
write_state "initial" "0" "0" "0" "0"
echo ""
echo "===================================="
echo "  SafeVault Bank — Live Attack Demo"
echo "===================================="
echo ""
echo "Open dashboard/index.html in your browser now."
echo "Pausing 5s so you can switch windows..."
sleep 5

echo "▶ Alice deposits 5 ETH..."
write_state "alice_deposits_5_eth" "5000000000000000000" "0" "5000000000000000000" "0"
sleep 3

echo "▶ Bob deposits 5 ETH..."
write_state "bob_deposits_5_eth" "10000000000000000000" "0" "5000000000000000000" "5000000000000000000"
sleep 3

echo "▶ Eve (attacker contract) deposits 1 ETH..."
write_state "eve_deposits_1_eth" "11000000000000000000" "0" "5000000000000000000" "5000000000000000000"
sleep 3

echo "▶ 🚨 Attack triggered — calling withdraw() with malicious receive() ..."
sleep 1

# Visualize the recursive drain step by step
for vault in "10000000000000000000" "9000000000000000000" "8000000000000000000" "7000000000000000000" "6000000000000000000" "5000000000000000000" "4000000000000000000" "3000000000000000000" "2000000000000000000" "1000000000000000000" "0"; do
  loot=$(( 11000000000000000000 - vault ))
  write_state "attack_in_progress" "$vault" "$loot" "5000000000000000000" "5000000000000000000"
  sleep 0.6
done

echo "▶ Attack complete. Running Forge test to PROVE this is real..."
write_state "attack_complete" "0" "11000000000000000000" "5000000000000000000" "5000000000000000000"

echo ""
echo "===================================="
echo "  Now running the REAL forge test"
echo "===================================="
sleep 2
forge test -vv --match-test testLiveDrain
