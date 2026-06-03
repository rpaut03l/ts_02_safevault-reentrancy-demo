// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SafeVault is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // FIXED: CEI + nonReentrant
    function withdraw() external nonReentrant {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "no balance");

        balances[msg.sender] = 0;                       // EFFECT first

        (bool ok, ) = msg.sender.call{value: bal}("");  // INTERACTION last
        require(ok, "transfer failed");
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
