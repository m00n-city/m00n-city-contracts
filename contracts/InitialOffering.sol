/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

///@notice modified version of Hedgic's initial offering contract: https://github.com/hegic/initial-bonding-curve-offering/blob/master/contracts/InitialOffering/HegicInitialOffering.sol

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice Initial offering cotract
 */
contract InitialOffering is Ownable {
    using SafeERC20 for IERC20;

    event Claimed(address indexed account, uint256 userShare, uint256 lunarAmount);
    event Received(address indexed account, uint256 ethAmount);

    // 1619786847 30.04.2021
    uint256 public immutable start;
    // START + 5 days
    uint256 public immutable end;

    // 4% 800_000 LUNARs
    uint256 public immutable totalDistributeAmount;
    // 75 ETH ~$150000
    uint256 public immutable minimalProvideAmount;
    uint256 public totalProvided = 0;
    mapping(address => uint256) public provided;
    IERC20 public immutable lunar;

    constructor(
        IERC20 _lunar,
        uint256 _start,
        uint256 _end,
        uint256 _totalDistributeAmount,
        uint256 _minimalProvideAmount
    ) {
        lunar = _lunar;
        start = _start;
        end = _end;
        totalDistributeAmount = _totalDistributeAmount;
        minimalProvideAmount = _minimalProvideAmount;
    }

    receive() external payable {
        require(start <= block.timestamp, "LUNAR IBCO: offering has not started yet");
        require(block.timestamp <= end, "LUNAR IBCO: offering has already ended");
        totalProvided += msg.value;
        provided[msg.sender] += msg.value;
        emit Received(msg.sender, msg.value);
    }

    function claim() external {
        require(block.timestamp > end, "LUNAR IBCO: offering must be completed");
        require(provided[msg.sender] > 0, "LUNAR IBCO: sender has nothing to claim");

        uint256 userShare = provided[msg.sender];
        provided[msg.sender] = 0;

        if (totalProvided >= minimalProvideAmount) {
            uint256 lunarAmount = (totalDistributeAmount * userShare) / totalProvided;
            lunar.safeTransfer(msg.sender, lunarAmount);
            emit Claimed(msg.sender, userShare, lunarAmount);
        } else {
            payable(msg.sender).transfer(userShare);
            emit Claimed(msg.sender, userShare, 0);
        }
    }

    function withdrawProvidedETH() external onlyOwner {
        require(end < block.timestamp, "LUNAR IBCO: offering must be completed");
        require(
            totalProvided >= minimalProvideAmount,
            "LUNAR IBCO: the required amount has not been provided"
        );
        payable(owner()).transfer(address(this).balance);
    }

    function withdrawLUNAR() external onlyOwner {
        require(end < block.timestamp, "LUNAR IBCO: offering must be completed");
        require(
            totalProvided < minimalProvideAmount,
            "LUNAR IBCO: The required amount has been provided"
        );
        lunar.safeTransfer(owner(), lunar.balanceOf(address(this)));
    }

    function withdrawUnclaimedLUNAR() external onlyOwner {
        require(end + 30 days < block.timestamp, "LUNAR IBCO: Withdrawal unavailable yet");
        lunar.safeTransfer(owner(), lunar.balanceOf(address(this)));
    }
}
