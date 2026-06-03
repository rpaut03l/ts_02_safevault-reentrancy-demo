// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VulnerableVault.sol";
import "../src/SafeVault.sol";
import "../src/Attacker.sol";

contract ReentrancyLiveTest is Test {
    VulnerableVault vuln;
    SafeVault safe;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address eve   = address(0xE5E);

    function setUp() public {
        vuln = new VulnerableVault();
        safe = new SafeVault();
        vm.deal(alice, 5 ether);
        vm.deal(bob,   5 ether);
        vm.deal(eve,   1 ether);
    }

    function _snap(string memory event_name, address vault, uint256 attackerLoot) internal {
        // Print machine-parseable state snapshot
        console.log("===STATE_SNAPSHOT===");
        console.log("event:", event_name);
        console.log("vault_balance_wei:", vault.balance);
        console.log("attacker_loot_wei:", attackerLoot);
        console.log("alice_recorded_balance_wei:", VulnerableVault(payable(vault)).balances(alice));
        console.log("bob_recorded_balance_wei:",   VulnerableVault(payable(vault)).balances(bob));
        console.log("===END_SNAPSHOT===");
    }

    function testLiveDrain() public {
        _snap("initial", address(vuln), 0);

        vm.prank(alice);
        vuln.deposit{value: 5 ether}();
        _snap("alice_deposits_5_eth", address(vuln), 0);

        vm.prank(bob);
        vuln.deposit{value: 5 ether}();
        _snap("bob_deposits_5_eth", address(vuln), 0);

        vm.prank(eve);
        Attacker att = new Attacker(address(vuln));

        vm.prank(eve);
        att.attack{value: 1 ether}();
        _snap("attack_complete", address(vuln), att.loot());

        emit log_named_uint("FINAL Vault (wei)", address(vuln).balance);
        emit log_named_uint("FINAL Eve loot (wei)", att.loot());
    }

    function testLiveDefense() public {
        _snap("initial", address(safe), 0);

        vm.prank(alice);
        safe.deposit{value: 5 ether}();
        _snap("alice_deposits_5_eth_SAFE", address(safe), 0);

        vm.prank(bob);
        safe.deposit{value: 5 ether}();
        _snap("bob_deposits_5_eth_SAFE", address(safe), 0);

        vm.prank(eve);
        Attacker att = new Attacker(address(safe));

        vm.prank(eve);
        vm.expectRevert();
        att.attack{value: 1 ether}();
        _snap("attack_BLOCKED_by_defense", address(safe), 0);
    }
}
