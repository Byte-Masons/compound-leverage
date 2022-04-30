// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import './CTokenI.sol';

interface IRewardDistributor {
    /// @notice Emitted when a new reward supply speed is calculated for a market
    event RewardSupplySpeedUpdated(uint8 rewardType, CTokenI indexed cToken, uint256 newSpeed);

    /// @notice Emitted when a new reward borrow speed is calculated for a market
    event RewardBorrowSpeedUpdated(uint8 rewardType, CTokenI indexed cToken, uint256 newSpeed);

    event RewardAdded(uint8 rewardType, address newRewardAddress);

    event RewardAddressChanged(uint8 rewardType, address oldRewardAddress, address newRewardAddress);

    /// @notice Emitted when JOE/AVAX is distributed to a supplier
    event DistributedSupplierReward(
        uint8 rewardType,
        CTokenI indexed cToken,
        address indexed supplier,
        uint256 rewardDelta,
        uint256 rewardSupplyIndex
    );

    /// @notice Emitted when JOE/AVAX is distributed to a borrower
    event DistributedBorrowerReward(
        uint8 rewardType,
        CTokenI indexed cToken,
        address indexed borrower,
        uint256 rewardDelta,
        uint256 rewardBorrowIndex
    );

    /// @notice Emitted when JOE is granted by admin
    event RewardGranted(uint8 rewardType, address recipient, uint256 amount);

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in all markets
     * @param holder The address to claim JOE/AVAX for
     */
    function claimReward(uint8 rewardType, address payable holder) external;

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in the specified markets
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to claim JOE/AVAX for
     * @param cTokens The list of markets to claim JOE/AVAX in
     */
    function claimReward(
        uint8 rewardType,
        address payable holder,
        address[] memory cTokens
    ) external;

    /**
     * @notice Claim all JOE/AVAX  accrued by the holders
     * @param rewardType  0 = JOE, 1 = AVAX
     * @param holders The addresses to claim JOE/AVAX for
     * @param cTokens The list of markets to claim JOE/AVAX in
     * @param borrowers Whether or not to claim JOE/AVAX earned by borrowing
     * @param suppliers Whether or not to claim JOE/AVAX earned by supplying
     */
    function claimReward(
        uint8 rewardType,
        address payable[] memory holders,
        address[] memory cTokens,
        bool borrowers,
        bool suppliers
    ) external payable;

    /**
     * @notice Set the Reward token address
     */
    function getRewardAddress(uint256 rewardType) external view returns (address);

    function getBlockTimestamp() external view returns (uint256);

    function rewardAccrued(uint8 rewardIndex, address userAddress) external view returns (uint256);
}
