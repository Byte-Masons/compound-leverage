// SPDX-License-Identifier: MIT

import './abstract/ReaperBaseStrategyv2.sol';
import './interfaces/IUniswapRouter.sol';
import './interfaces/CErc20I.sol';
import './interfaces/IComptroller.sol';
import './interfaces/IRewardDistributor.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

pragma solidity 0.8.11;

/**
 * @dev This strategy will deposit and leverage a token on Compound to maximize yield by farming reward tokens
 */
contract ReaperStrategyCompoundLeverage is ReaperBaseStrategyv2 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @dev Tokens Used:
     * {nativeToken} - Required for liquidity routing when doing swaps.
     * {feesToken} - Token in which fees is charged.
     * {rewardToken} - The reward token for farming
     * {dualRewardToken} - Secondary reward token if applicable.
     * {want} - The vault token the strategy is maximizing
     * {cWant} - The Compound version of the want token
     */
    address public constant nativeToken = address(0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d);
    address public constant feesToken = address(0xB12BFcA5A55806AaF64E99521918A4bf0fC40802);
    address public constant rewardToken = address(0x9f1F933C660a1DC856F0E0Fe058435879c5CCEf0);
    address public dualRewardToken;
    address public want;
    CErc20I public cWant;

    /**
     * @dev Third Party Contracts:
     * {UNI_ROUTER} - the UNI_ROUTER for target DEX
     * {REWARD_DISTRIBUTOR} - contract for claiming rewards
     * {comptroller} - Compound contract to enter market and to claim Compound tokens
     */
    address public constant UNI_ROUTER = address(0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B);
    address public constant REWARD_DISTRIBUTOR = address(0x98E8d4b4F53FA2a2d1b9C651AF919Fc839eE4c1a);
    IComptroller public comptroller;

    /**
     * @dev Routes we take to swap tokens
     * {rewardToNativeRoute} - Route we take to get from {rewardToken} into {nativeToken}.
     * {dualRewardToNativeRoute} - Route we take to get from {dualRewardToken} into {nativeToken}.
     * {nativeToFeesRoute} - Route we take to get from {nativeToken} into {feesToken}.
     * {nativeToWantRoute} - Route we take to get from {nativeToken} into {want}.
     */
    address[] public rewardToNativeRoute;
    address[] public dualRewardToNativeRoute;
    address[] public nativeToFeesRoute;
    address[] public nativeToWantRoute;

    /**
     * @dev Compound variables
     * {markets} - Contains the Compound tokens to farm, used to enter markets and claim Compound
     * {MANTISSA} - The unit used by the Compound protocol
     * {MAX_BORROW_DEPTH} - The limit on the maximum amount of loops used to leverage and deleverage
     */
    address[] public markets;
    uint256 public constant MANTISSA = 1e18;
    uint256 public constant MAX_BORROW_DEPTH = 15;

    /**
     * @dev Strategy variables
     * {ltvSafetyZone} - The highest we will set {targetLTV} as a proportion of the allowed max LTV.
     * {targetLTV} - The target loan to value for the strategy where 1 ether = 100%
     * {allowedLTVDrift} - How much the strategy can deviate from the target ltv where 0.01 ether = 1%
     * {balanceOfPool} - The total balance deposited into Compound (supplied - borrowed)
     * {borrowDepth} - The maximum amount of loops used to leverage and deleverage
     * {minWantToLeverage} - The minimum amount of want to leverage in a loop
     * {minRewardToSell} - The minimum amount of reward to swap to {want} and redeposit
     * {withdrawSlippageTolerance} - Maximum slippage authorized when withdrawing
     * {isDualRewardActive} - Maximum slippage authorized when withdrawing
     * {dualRewardIndex} - The index of the dual reward in the reward distributor
     */
    uint256 public ltvSafetyZone;
    uint256 public targetLTV;
    uint256 public allowedLTVDrift;
    uint256 public balanceOfPool;
    uint256 public borrowDepth;
    uint256 public minWantToLeverage;
    uint256 public minRewardToSell;
    uint256 public withdrawSlippageTolerance;
    bool public isDualRewardActive;
    uint8 public dualRewardIndex;

    /**
     * @dev Initializes the strategy. Sets parameters, saves routes, and gives allowances.
     * @notice see documentation for each variable above its respective declaration.
     */
    function initialize(
        address _vault,
        address[] memory _feeRemitters,
        address[] memory _strategists,
        address[] memory _multisigRoles,
        address _cWant
    ) public initializer {
        __ReaperBaseStrategy_init(_vault, _feeRemitters, _strategists, _multisigRoles);
        cWant = CErc20I(_cWant);
        want = cWant.underlying();
        comptroller = IComptroller(cWant.comptroller());
        markets = [_cWant];
        rewardToNativeRoute = [rewardToken, nativeToken];
        nativeToFeesRoute = [nativeToken, feesToken];
        nativeToWantRoute = [nativeToken, want];

        ltvSafetyZone = 0.70 ether;
        allowedLTVDrift = 0.01 ether;
        setTargetLtv(type(uint256).max);
        balanceOfPool = 0;
        borrowDepth = 2;
        minWantToLeverage = 1000;
        minRewardToSell = 1000;
        withdrawSlippageTolerance = 50;
        _giveAllowances();
        comptroller.enterMarkets(markets);
    }

    /**
     * @dev Function that puts the funds to work.
     * It gets called whenever someone supplied in the strategy's vault contract.
     * It supplies {want} Compound to farm {rewardToken}
     */
    function _deposit() internal override doUpdateBalance {
        CErc20I(cWant).mint(balanceOfWant());
        uint256 _ltv = _calculateLTVAfterWithdraw(0);

        if (_shouldLeverage(_ltv)) {
            _leverMax();
        } else if (_shouldDeleverage(_ltv)) {
            _deleverage(0);
        }
    }

    /**
     * @dev Withdraws funds and sents them back to the vault.
     * It withdraws {want} from Compound
     * The available {want} minus fees is returned to the vault.
     */
    function _withdraw(uint256 _withdrawAmount) internal override doUpdateBalance {
        uint256 _ltv = _calculateLTVAfterWithdraw(_withdrawAmount);

        if (_shouldLeverage(_ltv)) {
            // Strategy is underleveraged so can withdraw underlying directly
            _withdrawUnderlyingToVault(_withdrawAmount);
            _leverMax();
        } else if (_shouldDeleverage(_ltv)) {
            _deleverage(_withdrawAmount);

            // Strategy has deleveraged to the point where it can withdraw underlying
            _withdrawUnderlyingToVault(_withdrawAmount);
        } else {
            // LTV is in the acceptable range so the underlying can be withdrawn directly
            _withdrawUnderlyingToVault(_withdrawAmount);
        }
    }

    /**
     * @dev Core function of the strat, in charge of collecting and re-investing rewards.
     * @notice Assumes the deposit will take care of the TVL rebalancing.
     * 1. Claims {rewardToken} from the comptroller.
     * 2. Swaps {rewardToken} to {nativeToken}.
     * 3. Claims fees for the harvest caller and treasury.
     * 4. Swaps the {nativeToken} token for {want}
     */
    function _harvestCore() internal override {
        _claimRewards();
        _swapRewardsToNative();
        _chargeFees();
        _swapToWant();
    }

    /**
     * @dev Core harvest function.
     * Get rewards from markets entered
     */
    function _claimRewards() internal {
        IRewardDistributor(REWARD_DISTRIBUTOR).claimReward(0, payable(address(this)), markets);
        if (isDualRewardActive) {
            IRewardDistributor(REWARD_DISTRIBUTOR).claimReward(dualRewardIndex, payable(address(this)), markets);
        }
    }

    /**
     * @dev Core harvest function.
     * Swaps {rewardToken} and {dualRewardToken} to {nativeToken}
     */
    function _swapRewardsToNative() internal {
        uint256 rewardBalance = IERC20Upgradeable(rewardToken).balanceOf(address(this));
        if (rewardBalance >= minRewardToSell) {
            _swap(rewardBalance, rewardToNativeRoute);
        }

        if (dualRewardToken == address(0)) {
            return;
        }

        uint256 dualRewardBalance = IERC20Upgradeable(dualRewardToken).balanceOf(address(this));
        if (dualRewardBalance >= minRewardToSell && nativeToken != dualRewardToken) {
            _swap(dualRewardBalance, dualRewardToNativeRoute);
        }
    }

    /**
     * @dev Helper function to swap tokens given an {_amount} and swap {_path}.
     */
    function _swap(uint256 _amount, address[] memory _path) internal {
        IERC20Upgradeable(_path[0]).safeIncreaseAllowance(UNI_ROUTER, _amount);
        IUniswapRouter(UNI_ROUTER).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            _amount,
            0,
            _path,
            address(this),
            block.timestamp
        );
    }

    /**
     * @dev Core harvest function.
     * Charges fees based on the amount of nativeToken gained from reward
     */
    function _chargeFees() internal {
        uint256 nativeFee = (IERC20Upgradeable(nativeToken).balanceOf(address(this)) * totalFee) / PERCENT_DIVISOR;

        uint256 beforeSwapBal = IERC20Upgradeable(feesToken).balanceOf(address(this));
        _swap(nativeFee, nativeToFeesRoute);
        uint256 fees = IERC20Upgradeable(feesToken).balanceOf(address(this)) - beforeSwapBal;

        if (fees != 0) {
            uint256 callFeeToUser = (fees * callFee) / PERCENT_DIVISOR;
            uint256 treasuryFeeToVault = (fees * treasuryFee) / PERCENT_DIVISOR;
            uint256 feeToStrategist = (treasuryFeeToVault * strategistFee) / PERCENT_DIVISOR;
            treasuryFeeToVault -= feeToStrategist;

            IERC20Upgradeable(feesToken).safeTransfer(msg.sender, callFeeToUser);
            IERC20Upgradeable(feesToken).safeTransfer(treasury, treasuryFeeToVault);
            IERC20Upgradeable(feesToken).safeTransfer(strategistRemitter, feeToStrategist);
        }
    }

    /**
     * @dev Core harvest function.
     * Swaps {nativeToken} for {want}
     */
    function _swapToWant() internal {
        if (want == nativeToken) {
            return;
        }

        uint256 nativeBalance = IERC20Upgradeable(nativeToken).balanceOf(address(this));
        if (nativeBalance != 0) {
            _swap(nativeBalance, nativeToWantRoute);
        }
    }

    /**
     * @dev Calculates the total amount of {want} held by the strategy
     * which is the balance of want + the total amount supplied to Compound.
     */
    function balanceOf() public view override returns (uint256) {
        return balanceOfWant() + balanceOfPool;
    }

    /**
     * @dev Calculates the balance of want held directly by the strategy
     */
    function balanceOfWant() public view returns (uint256) {
        return IERC20Upgradeable(want).balanceOf(address(this));
    }

    /**
     * @dev Returns the approx amount of profit from harvesting.
     *      Profit is denominated in nativeToken, and takes fees into account.
     */
    function estimateHarvest() external view override returns (uint256 profit, uint256 callFeeToUser) {
        uint256 rewards = IRewardDistributor(REWARD_DISTRIBUTOR).rewardAccrued(0, address(this));
        if (!isDualRewardActive && rewards == 0) {
            return (0, 0);
        }
        profit += IUniswapRouter(UNI_ROUTER).getAmountsOut(rewards, rewardToNativeRoute)[1];
        if (isDualRewardActive) {
            rewards = IRewardDistributor(REWARD_DISTRIBUTOR).rewardAccrued(dualRewardIndex, address(this));
            if (rewards != 0) {
                profit += IUniswapRouter(UNI_ROUTER).getAmountsOut(rewards, dualRewardToNativeRoute)[1];
            }
        }
        uint256 nativeFee = (profit * totalFee) / PERCENT_DIVISOR;
        callFeeToUser = (nativeFee * callFee) / PERCENT_DIVISOR;
        profit -= nativeFee;
    }

    /**
     * @dev Calculates the LTV using existing exchange rate,
     * depends on the cWant being updated to be accurate.
     * Does not update in order provide a view function for LTV.
     */
    function calculateLTV() external view returns (uint256 ltv) {
        (, uint256 cWantBalance, uint256 borrowed, uint256 exchangeRate) = cWant.getAccountSnapshot(address(this));

        uint256 supplied = (cWantBalance * exchangeRate) / MANTISSA;

        if (supplied == 0 || borrowed == 0) {
            return 0;
        }

        ltv = (MANTISSA * borrowed) / supplied;
    }

    /**
     * @dev Emergency function to deleverage in case regular deleveraging breaks
     */
    function manualDeleverage(uint256 amount) external doUpdateBalance {
        _atLeastRole(STRATEGIST);
        require(cWant.redeemUnderlying(amount) == 0);
        require(cWant.repayBorrow(amount) == 0);
    }

    /**
     * @dev Emergency function to deleverage in case regular deleveraging breaks
     */
    function manualReleaseWant(uint256 amount) external doUpdateBalance {
        _atLeastRole(STRATEGIST);
        require(cWant.redeemUnderlying(amount) == 0);
    }

    /**
     * @dev Sets a new LTV for leveraging.
     * Should be in units of 1e18
     */
    function setTargetLtv(uint256 _ltv) public {
        _atLeastRole(KEEPER);
        (, uint256 collateralFactorMantissa, ) = comptroller.markets(address(cWant));
        uint256 maxSafeLTV = (collateralFactorMantissa * ltvSafetyZone) / MANTISSA;
        if (_ltv > maxSafeLTV) {
            _ltv = maxSafeLTV;
        }

        require(collateralFactorMantissa > _ltv + allowedLTVDrift);
        targetLTV = _ltv;
    }

    /**
     * @dev Sets a new LTV safety zone for {targetLTV}.
     * Should be in units of 1e18
     */
    function setLtvSafetyZone(uint256 _newLtvSafetyZone) external {
        _atLeastRole(STRATEGIST);
        require(_newLtvSafetyZone < 0.97 ether);
        ltvSafetyZone = _newLtvSafetyZone;
    }

    /**
     * @dev Sets a new allowed LTV drift
     * Should be in units of 1e18
     */
    function setAllowedLtvDrift(uint256 _drift) external {
        _atLeastRole(STRATEGIST);
        (, uint256 collateralFactorMantissa, ) = comptroller.markets(address(cWant));
        require(collateralFactorMantissa > targetLTV + _drift);
        allowedLTVDrift = _drift;
    }

    /**
     * @dev Sets a new borrow depth (how many loops for leveraging+deleveraging)
     */
    function setBorrowDepth(uint256 _borrowDepth) external {
        _atLeastRole(STRATEGIST);
        require(_borrowDepth <= MAX_BORROW_DEPTH);
        borrowDepth = _borrowDepth;
    }

    /**
     * @dev Sets the minimum reward the will be sold (too little causes revert from Uniswap)
     */
    function setMinRewardToSell(uint256 _minRewardToSell) external {
        _atLeastRole(STRATEGIST);
        minRewardToSell = _minRewardToSell;
    }

    /**
     * @dev Sets the minimum want to leverage/deleverage (loop) for
     */
    function setMinWantToLeverage(uint256 _minWantToLeverage) external {
        _atLeastRole(STRATEGIST);
        minWantToLeverage = _minWantToLeverage;
    }

    /**
     * @dev Sets the maximum slippage authorized when withdrawing
     */
    function setWithdrawSlippageTolerance(uint256 _withdrawSlippageTolerance) external {
        _atLeastRole(STRATEGIST);
        withdrawSlippageTolerance = _withdrawSlippageTolerance;
    }

    /**
     * @dev Configure variables for the dual reward
     */
    function configureDualReward(
        bool _isDualRewardActive,
        address _dualRewardToken,
        uint8 _dualRewardIndex,
        address[] calldata _newDualRewardToNativeRoute
    ) external {
        _atLeastRole(STRATEGIST);
        require(_newDualRewardToNativeRoute[0] == _dualRewardToken);
        require(_newDualRewardToNativeRoute[_newDualRewardToNativeRoute.length - 1] == nativeToken);
        isDualRewardActive = _isDualRewardActive;
        dualRewardToken = _dualRewardToken;
        dualRewardIndex = _dualRewardIndex;
        delete dualRewardToNativeRoute;
        dualRewardToNativeRoute = _newDualRewardToNativeRoute;
    }

    /**
     * @dev Function to retire the strategy. Claims all rewards and withdraws
     *      all principal from external contracts, and sends everything back to
     *      the vault. Can only be called by strategist or owner.
     *
     * Note: this is not an emergency withdraw function. For that, see panic().
     */
    function _retireStrat() internal override doUpdateBalance {
        _claimRewards();
        _swapRewardsToNative();
        _swapToWant();

        _deleverage(type(uint256).max);
        _withdrawUnderlyingToVault(balanceOfPool);
    }

    /**
     * @dev Withdraws all funds from Compound, leaving rewards behind.
     */
    function _reclaimWant() internal override doUpdateBalance {
        _deleverage(type(uint256).max);
    }

    /**
     * @dev Returns the current position in Compound. Does not accrue interest
     * so might not be accurate, but the cWant is usually updated.
     */
    function getCurrentPosition() public view returns (uint256 supplied, uint256 borrowed) {
        (, uint256 cWantBalance, uint256 borrowBalance, uint256 exchangeRate) = cWant.getAccountSnapshot(address(this));
        borrowed = borrowBalance;

        supplied = (cWantBalance * exchangeRate) / MANTISSA;
    }

    /**
     * @dev Updates the balance. This is the state changing version so it sets
     * balanceOfPool to the latest value.
     */
    function updateBalance() public {
        uint256 supplyBalance = CErc20I(cWant).balanceOfUnderlying(address(this));
        uint256 borrowBalance = CErc20I(cWant).borrowBalanceCurrent(address(this));
        balanceOfPool = supplyBalance - borrowBalance;
    }

    /**
     * @dev Levers the strategy up to the targetLTV
     */
    function _leverMax() internal {
        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));

        uint256 realSupply = supplied - borrowed;
        uint256 newBorrow = _getMaxBorrowFromSupplied(realSupply, targetLTV);
        uint256 totalAmountToBorrow = newBorrow - borrowed;

        for (uint256 i = 0; i < borrowDepth && totalAmountToBorrow > minWantToLeverage; i++) {
            totalAmountToBorrow -= _leverUpStep(totalAmountToBorrow);
        }
    }

    /**
     * @dev Does one step of leveraging
     */
    function _leverUpStep(uint256 _borrowAmount) internal returns (uint256) {
        if (_borrowAmount == 0) {
            return 0;
        }

        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));
        (, uint256 collateralFactorMantissa, ) = comptroller.markets(address(cWant));
        uint256 canBorrow = (supplied * collateralFactorMantissa) / MANTISSA;

        canBorrow -= borrowed;

        if (canBorrow < _borrowAmount) {
            _borrowAmount = canBorrow;
        }

        if (_borrowAmount > 10) {
            // borrow available amount
            CErc20I(cWant).borrow(_borrowAmount);

            // deposit available want as collateral
            CErc20I(cWant).mint(balanceOfWant());
        }

        return _borrowAmount;
    }

    /**
     * @dev Gets the maximum amount allowed to be borrowed for a given collateral factor and amount supplied
     */
    function _getMaxBorrowFromSupplied(uint256 wantSupplied, uint256 collateralFactor) internal pure returns (uint256) {
        return ((wantSupplied * collateralFactor) / (MANTISSA - collateralFactor));
    }

    /**
     * @dev Returns if the strategy should leverage with the given ltv level
     */
    function _shouldLeverage(uint256 _ltv) internal view returns (bool) {
        return (targetLTV >= allowedLTVDrift && _ltv < targetLTV - allowedLTVDrift);
    }

    /**
     * @dev Returns if the strategy should deleverage with the given ltv level
     */
    function _shouldDeleverage(uint256 _ltv) internal view returns (bool) {
        return (_ltv > targetLTV + allowedLTVDrift);
    }

    /**
     * @dev Calculates what the LTV will be after withdrawing
     */
    function _calculateLTVAfterWithdraw(uint256 _withdrawAmount) internal returns (uint256 ltv) {
        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));
        supplied = supplied - _withdrawAmount;

        if (supplied == 0 || borrowed == 0) {
            return 0;
        }
        ltv = (MANTISSA * borrowed) / supplied;
    }

    /**
     * @dev Withdraws want to the vault by redeeming the underlying
     */
    function _withdrawUnderlyingToVault(uint256 _withdrawAmount) internal {
        uint256 initialWithdrawAmount = _withdrawAmount;
        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));
        uint256 realSupplied = supplied - borrowed;

        if (realSupplied == 0) {
            return;
        }

        if (_withdrawAmount > realSupplied) {
            _withdrawAmount = realSupplied;
        }

        uint256 tempColla = targetLTV + allowedLTVDrift;
        if (tempColla == 0) {
            tempColla = 1e15; // 0.001 * 1e18. lower we have issues
        }

        uint256 reservedAmount = (borrowed * MANTISSA) / tempColla;
        if (supplied >= reservedAmount) {
            uint256 redeemable = supplied - reservedAmount;
            uint256 balance = cWant.balanceOf(address(this));
            if (balance > 1) {
                if (redeemable < _withdrawAmount) {
                    _withdrawAmount = redeemable;
                }
            }
        }

        uint256 withdrawAmount = _withdrawAmount - 1;
        if (withdrawAmount < initialWithdrawAmount) {
            require(
                withdrawAmount >=
                    (initialWithdrawAmount * (PERCENT_DIVISOR - withdrawSlippageTolerance)) / PERCENT_DIVISOR
            );
        }

        CErc20I(cWant).redeemUnderlying(withdrawAmount);
        IERC20Upgradeable(want).safeTransfer(vault, withdrawAmount);
    }

    /**
     * @dev For a given withdraw amount, figures out how much we need to reduce borrow by to
     * maintain LTV at targetLTV.
     */
    function _getBorrowDifference(uint256 _withdrawAmount) internal returns (uint256 difference) {
        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));
        uint256 realSupply = supplied - borrowed;

        if (_withdrawAmount > realSupply) {
            _withdrawAmount = realSupply;
        }
        uint256 desiredSupply = realSupply - _withdrawAmount;

        // (ds *c)/(1-c)
        uint256 desiredBorrow = (desiredSupply * targetLTV) / (MANTISSA - targetLTV);
        if (desiredBorrow > 1e5) {
            //stop us going right up to the wire
            desiredBorrow = desiredBorrow - 1e5;
        }

        difference = borrowed - desiredBorrow;
    }

    /**
     * @dev For a given withdraw amount, deleverages to a borrow level
     * that will maintain the target LTV
     */
    function _deleverage(uint256 _withdrawAmount) internal {
        uint256 borrowDifference = _getBorrowDifference(_withdrawAmount);

        for (uint256 i = 0; i < borrowDepth && borrowDifference > minWantToLeverage; i++) {
            borrowDifference -= _leverDownStep(borrowDifference);
        }
    }

    /**
     * @dev Deleverages one step
     */
    function _leverDownStep(uint256 _releaseAmount) internal returns (uint256 deleveragedAmount) {
        uint256 supplied = cWant.balanceOfUnderlying(address(this));
        uint256 borrowed = cWant.borrowBalanceStored(address(this));
        (, uint256 collateralFactorMantissa, ) = comptroller.markets(address(cWant));

        uint256 minAllowedSupply = (borrowed * MANTISSA) / collateralFactorMantissa;
        uint256 maxAllowedDeleverageAmount = supplied - minAllowedSupply;

        deleveragedAmount = maxAllowedDeleverageAmount;

        if (deleveragedAmount > borrowed) {
            deleveragedAmount = borrowed;
        }
        if (deleveragedAmount > _releaseAmount) {
            deleveragedAmount = _releaseAmount;
        }

        uint256 exchangeRateStored = cWant.exchangeRateStored();
        // redeemTokens = redeemAmountIn * 1e18 / exchangeRate. must be more than 0
        // a rounding error means we need another small addition
        if (deleveragedAmount * MANTISSA >= exchangeRateStored && deleveragedAmount > 10) {
            deleveragedAmount -= 10; // Amount can be slightly off for tokens with less decimals (USDC), so redeem a bit less
            cWant.redeemUnderlying(deleveragedAmount);
            // our borrow has been increased by no more than _releaseAmount
            cWant.repayBorrow(deleveragedAmount);
        }
    }

    /**
     * @dev Gives the necessary allowances to mint cWant, swap rewards etc
     */
    function _giveAllowances() internal override {
        IERC20Upgradeable(want).safeApprove(address(cWant), 0);
        IERC20Upgradeable(want).safeApprove(address(cWant), type(uint256).max);
    }

    /**
     * @dev Removes all allowance that were given
     */
    function _removeAllowances() internal override {
        IERC20Upgradeable(want).safeApprove(address(cWant), 0);
    }

    /**
     * @dev Helper modifier for functions that need to update the internal balance at the end of their execution.
     */
    modifier doUpdateBalance() {
        _;
        updateBalance();
    }
}
