const hre = require('hardhat');
const chai = require('chai');
const { solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const moveTimeForward = async seconds => {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
};

const toWantUnit = (num, isUSDC = false) => {
  if (isUSDC) {
    return ethers.BigNumber.from(num * 10 ** 6);
  }
  return ethers.utils.parseEther(num);
};

const getTargetLtv = async(strategy) => await strategy.targetLTV();

describe('Vaults', function () {
  let Vault;
  let Strategy;
  let Treasury;
  let Want;
  let vault;
  let strategy;
  const paymentSplitterAddress = '0x63cbd4134c2253041F370472c130e92daE4Ff174';
  let treasury;
  let want;
  const wantAddress = '0xb12bfca5a55806aaf64e99521918a4bf0fc40802';
  const scWantAddress = '0xe5308dc623101508952948b141fd9eabd3337d99';
  let self;
  let wantWhale;
  let selfAddress;
  let strategist;
  let owner;

  beforeEach(async function () {
    //reset network
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: 'https://mainnet.aurora.dev/'
          },
        },
      ],
    });
    console.log('providers');
    //get signers
    [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();
    const wantHolder = '0xab57baBf2cE17f8a7661Cbc24fc515CeA77f930B';
    const wantWhaleAddress = '0x1d50a8c3295798fcebddd0c720bec4fbedc3d178';
    const strategistAddress = '0x3b410908e71Ee04e7dE2a87f8F9003AFe6c1c7cE';
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wantHolder],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wantWhaleAddress],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [strategistAddress],
    });
    self = await ethers.provider.getSigner(wantHolder);
    wantWhale = await ethers.provider.getSigner(wantWhaleAddress);
    strategist = await ethers.provider.getSigner(strategistAddress);
    selfAddress = await self.getAddress();
    ownerAddress = await owner.getAddress();
    console.log('addresses');

    //get artifacts
    Strategy = await ethers.getContractFactory('ReaperStrategyCompoundLeverage');
    Vault = await ethers.getContractFactory('ReaperVaultv1_3');
    Treasury = await ethers.getContractFactory('ReaperTreasury');
    Want = await ethers.getContractFactory('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20');
    console.log('artifacts');

    //deploy contracts
    treasury = await Treasury.deploy();
    console.log('treasury');
    want = await Want.attach(wantAddress);
    console.log('want attached');
    vault = await Vault.deploy(
      wantAddress,
      'Scream Single Stake Vault',
      'rfScream',
      0,
      ethers.utils.parseEther('999999'),
    );
    console.log('vault');

    console.log(`vault.address: ${vault.address}`);
    console.log(`treasury.address: ${treasury.address}`);

    console.log('strategy');
    const superAdminAddress = '0x04C710a1E8a738CDf7cAD3a52Ba77A784C35d8CE';
    const adminAddress = '0x539eF36C804e4D735d8cAb69e8e441c12d4B88E0';
    const guardianAddress = '0xf20E25f2AB644C8ecBFc992a6829478a85A98F2c';
    strategy = await hre.upgrades.deployProxy(
      Strategy,
      [
        vault.address,
        [treasury.address, paymentSplitterAddress],
        [strategistAddress],
        [superAdminAddress, adminAddress, guardianAddress],
        scWantAddress,
      ],
      { kind: 'uups' },
    );
    await strategy.deployed();

    await vault.initialize(strategy.address);

    console.log(`Strategy deployed to ${strategy.address}`);
    console.log(`Vault deployed to ${vault.address}`);
    console.log(`Treasury deployed to ${treasury.address}`);

    //approving LP token and vault share spend
    await want.approve(vault.address, ethers.utils.parseEther('1000000000'));
    await want.connect(wantWhale).approve(vault.address, ethers.utils.parseEther('1000000000'));
    await want.connect(self).approve(vault.address, ethers.utils.parseEther('1000000000'));
    // await want.connect(wantWhale).approve(vault.address, ethers.utils.parseEther('1000000000'));

    // await vault.connect(wantWhale).approve(vault.address, ethers.utils.parseEther('1000000000'));
  });

  describe('Deploying the vault and strategy', function () {
    xit('should initiate vault with a 0 balance', async function () {
      const totalBalance = await vault.balance();
      const availableBalance = await vault.available();
      const pricePerFullShare = await vault.getPricePerFullShare();
      expect(totalBalance).to.equal(0);
      expect(availableBalance).to.equal(0);
      const decimals = await vault.decimals();
      const expectedPrice = decimals == 18 ? ethers.utils.parseEther('1') : ethers.BigNumber.from(10 ** decimals);
      expect(pricePerFullShare).to.equal(expectedPrice);
    });
  });
  describe('Vault Tests', function () {
    xit('should allow deposits and account for them correctly', async function () {
      const userBalance = await want.balanceOf(selfAddress);
      console.log(`userBalance: ${userBalance}`);
      const vaultBalance = await vault.balance();
      console.log('vaultBalance');
      console.log(vaultBalance);
      const depositAmount = toWantUnit('0.1', true);
      console.log('depositAmount');
      console.log(depositAmount);
      await vault.connect(self).deposit(depositAmount);
      const newVaultBalance = await vault.balance();
      console.log(`newVaultBalance: ${newVaultBalance}`);
      console.log(`depositAmount: ${depositAmount}`);
      const newUserBalance = await want.balanceOf(selfAddress);

      console.log(`newUserBalance: ${newUserBalance}`);
      console.log(`userBalance - depositAmount: ${userBalance - depositAmount}`);
      console.log(`userBalance - newUserBalance: ${userBalance - newUserBalance}`);
      const deductedAmount = userBalance.sub(newUserBalance);
      console.log('deductedAmount');
      console.log(deductedAmount);
      await vault.connect(self).deposit(depositAmount);
      expect(vaultBalance).to.equal(0);
      // // Compound mint reduces balance by a small amount
      // const smallDifference = depositAmount * 0.00000001; // For 1e18
      const smallDifference = depositAmount * 0.000001; // For USDC or want with smaller decimals allow bigger difference
      const isSmallBalanceDifference = depositAmount.sub(newVaultBalance) < smallDifference;
      expect(isSmallBalanceDifference).to.equal(true);

      const ltv = await strategy.calculateLTV();
      console.log(`ltv: ${ltv}`);
      const allowedLTVDrift = toWantUnit('0.015');
      expect(ltv).to.be.closeTo(toWantUnit('0.83'), allowedLTVDrift);
    });

    it('should trigger deleveraging on deposit when LTV is too high', async function () {
      const depositAmount = toWantUnit('100', true);
      await vault.connect(self).deposit(depositAmount);
      const ltvBefore = await strategy.calculateLTV();
      // console.log(`ltvBefore: ${ltvBefore}`);
      // const allowedLTVDrift = toWantUnit('0.015');
      // const targetLTV = getTargetLtv(strategy);
      // expect(ltvBefore).to.be.closeTo(toWantUnit('0.73'), allowedLTVDrift);
      // const newLTV = toWantUnit('0');
      // await strategy.setTargetLtv(newLTV);
      // const smallDepositAmount = toWantUnit('1', true);
      // await vault.connect(self).deposit(smallDepositAmount);
      // const ltvAfter = await strategy.calculateLTV();
      // console.log(`ltvAfter: ${ltvAfter}`);
      // expect(ltvAfter).to.be.closeTo(newLTV, allowedLTVDrift);
    });

    xit('should not change leverage when LTV is within the allowed drift on deposit', async function () {
      const depositAmount = toWantUnit('1', true);
      const ltv = toWantUnit('0.73');
      await vault.connect(self).deposit(depositAmount);
      const ltvBefore = await strategy.calculateLTV();
      console.log(`ltvBefore: ${ltvBefore}`);
      const allowedLTVDrift = toWantUnit('0.015');
      expect(ltvBefore).to.be.closeTo(ltv, allowedLTVDrift);
      const smallDepositAmount = toWantUnit('0.005', true);
      await vault.connect(self).deposit(smallDepositAmount);
      const ltvAfter = await strategy.calculateLTV();
      console.log(`ltvAfter: ${ltvAfter}`);
      expect(ltvAfter).to.be.closeTo(ltv, allowedLTVDrift);
    });

    xit('should mint user their pool share', async function () {
      console.log('---------------------------------------------');
      const userBalance = await want.balanceOf(selfAddress);
      console.log(userBalance.toString());
      const selfDepositAmount = toWantUnit('0.005', true);
      await vault.connect(self).deposit(selfDepositAmount);
      console.log((await vault.balance()).toString());

      const whaleDepositAmount = toWantUnit('100', true);
      await vault.connect(wantWhale).deposit(whaleDepositAmount);
      const selfWantBalance = await vault.balanceOf(selfAddress);
      console.log(selfWantBalance.toString());
      const ownerDepositAmount = toWantUnit('1', true);
      await want.connect(self).transfer(ownerAddress, ownerDepositAmount);
      const ownerBalance = await want.balanceOf(ownerAddress);

      console.log(ownerBalance.toString());
      await vault.deposit(ownerDepositAmount);
      console.log((await vault.balance()).toString());
      const ownerVaultWantBalance = await vault.balanceOf(ownerAddress);
      console.log(`ownerVaultWantBalance.toString(): ${ownerVaultWantBalance.toString()}`);
      await vault.withdrawAll();
      const ownerWantBalance = await want.balanceOf(ownerAddress);
      console.log(`ownerWantBalance: ${ownerWantBalance}`);
      const ownerVaultWantBalanceAfterWithdraw = await vault.balanceOf(ownerAddress);
      console.log(`ownerVaultWantBalanceAfterWithdraw: ${ownerVaultWantBalanceAfterWithdraw}`);
      const allowedImprecision = toWantUnit('0.01', true);
      expect(ownerWantBalance).to.be.closeTo(ownerDepositAmount, allowedImprecision);
      expect(selfWantBalance).to.equal(selfDepositAmount);
    });

    xit('should allow withdrawals', async function () {
      const userBalance = await want.balanceOf(selfAddress);
      console.log(`userBalance: ${userBalance}`);
      const depositAmount = toWantUnit('1', true);
      await vault.connect(self).deposit(depositAmount);
      console.log(`await want.balanceOf(selfAddress): ${await want.balanceOf(selfAddress)}`);

      await vault.connect(self).withdrawAll();
      const newUserVaultBalance = await vault.balanceOf(selfAddress);
      console.log(`newUserVaultBalance: ${newUserVaultBalance}`);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = (depositAmount * securityFee) / percentDivisor;
      const expectedBalance = userBalance.sub(withdrawFee);
      const smallDifference = expectedBalance * 0.0000001;
      console.log(`expectedBalance.sub(userBalanceAfterWithdraw): ${expectedBalance.sub(userBalanceAfterWithdraw)}`);
      console.log(`smallDifference: ${smallDifference}`);
      const isSmallBalanceDifference = expectedBalance.sub(userBalanceAfterWithdraw) < smallDifference;
      expect(isSmallBalanceDifference).to.equal(true);
    });

    xit('should trigger leveraging on withdraw when LTV is too low', async function () {
      const startingLTV = toWantUnit('0.6');
      await strategy.setTargetLtv(startingLTV);
      const depositAmount = toWantUnit('100', true);

      await vault.connect(self).deposit(depositAmount);
      const ltvBefore = await strategy.calculateLTV();
      console.log(`ltvBefore: ${ltvBefore}`);
      const allowedLTVDrift = toWantUnit('0.01');
      expect(ltvBefore).to.be.closeTo(startingLTV, allowedLTVDrift);
      const newLTV = toWantUnit('0.7');
      await strategy.setTargetLtv(newLTV);
      const smallWithdrawAmount = toWantUnit('1', true);
      const userBalance = await want.balanceOf(selfAddress);
      await vault.connect(self).withdraw(smallWithdrawAmount);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const ltvAfter = await strategy.calculateLTV();
      console.log(`ltvAfter: ${ltvAfter}`);
      expect(ltvAfter).to.be.closeTo(newLTV, allowedLTVDrift);

      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = smallWithdrawAmount.mul(securityFee).div(percentDivisor);
      const expectedBalance = userBalance.add(smallWithdrawAmount).sub(withdrawFee);

      expect(userBalanceAfterWithdraw).to.be.closeTo(expectedBalance, toWantUnit('0.0000001', true));
    });

    xit('should trigger deleveraging on withdraw when LTV is too high', async function () {
      const startingLTV = toWantUnit('0.7');
      await strategy.setTargetLtv(startingLTV);
      const depositAmount = toWantUnit('100', true);

      await vault.connect(self).deposit(depositAmount);
      const ltvBefore = await strategy.calculateLTV();
      console.log(`ltvBefore: ${ltvBefore}`);
      const allowedLTVDrift = toWantUnit('0.01');
      expect(ltvBefore).to.be.closeTo(startingLTV, allowedLTVDrift);
      const newLTV = toWantUnit('0');
      await strategy.setTargetLtv(newLTV);
      const smallWithdrawAmount = toWantUnit('1', true);
      const userBalance = await want.balanceOf(selfAddress);
      await vault.connect(self).withdraw(smallWithdrawAmount);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const ltvAfter = await strategy.calculateLTV();
      console.log(`ltvAfter: ${ltvAfter}`);
      expect(ltvAfter).to.be.closeTo(newLTV, allowedLTVDrift);

      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = smallWithdrawAmount.mul(securityFee).div(percentDivisor);
      const expectedBalance = userBalance.add(smallWithdrawAmount).sub(withdrawFee);

      expect(userBalanceAfterWithdraw).to.be.closeTo(expectedBalance, toWantUnit('0.0000001', true));
    });

    xit('should not change leverage on withdraw when still in the allowed LTV', async function () {
      const startingLTV = toWantUnit('0.7');
      await strategy.setTargetLtv(startingLTV);
      const depositAmount = toWantUnit('100', true);

      await vault.connect(self).deposit(depositAmount);
      const ltvBefore = await strategy.calculateLTV();
      console.log(`ltvBefore: ${ltvBefore}`);
      const allowedLTVDrift = toWantUnit('0.01');
      expect(ltvBefore).to.be.closeTo(startingLTV, allowedLTVDrift);

      const userBalance = await want.balanceOf(selfAddress);
      const smallWithdrawAmount = toWantUnit('0.005', true);
      await vault.connect(self).withdraw(smallWithdrawAmount);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const ltvAfter = await strategy.calculateLTV();
      console.log(`ltvAfter: ${ltvAfter}`);
      expect(ltvAfter).to.be.closeTo(startingLTV, allowedLTVDrift);

      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = smallWithdrawAmount.mul(securityFee).div(percentDivisor);
      const expectedBalance = userBalance.add(smallWithdrawAmount).sub(withdrawFee);

      expect(userBalanceAfterWithdraw).to.be.closeTo(expectedBalance, toWantUnit('0.0000001', true));
    });

    xit('should allow small withdrawal', async function () {
      const userBalance = await want.balanceOf(selfAddress);
      console.log(`userBalance: ${userBalance}`);
      const depositAmount = toWantUnit('1', true);
      await vault.connect(self).deposit(depositAmount);
      console.log(`await want.balanceOf(selfAddress): ${await want.balanceOf(selfAddress)}`);

      const whaleDepositAmount = toWantUnit('10000', true);
      await vault.connect(wantWhale).deposit(whaleDepositAmount);

      await vault.connect(self).withdrawAll();
      const newUserVaultBalance = await vault.balanceOf(selfAddress);
      console.log(`newUserVaultBalance: ${newUserVaultBalance}`);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = (depositAmount * securityFee) / percentDivisor;
      const expectedBalance = userBalance.sub(withdrawFee);
      const smallDifference = depositAmount * 0.00001;
      console.log(`expectedBalance.sub(userBalanceAfterWithdraw): ${expectedBalance.sub(userBalanceAfterWithdraw)}`);
      console.log(`smallDifference: ${smallDifference}`);
      const isSmallBalanceDifference = expectedBalance.sub(userBalanceAfterWithdraw) < smallDifference;
      expect(isSmallBalanceDifference).to.equal(true);
    });

    xit('should handle small deposit + withdraw', async function () {
      const userBalance = await want.balanceOf(selfAddress);
      console.log(`userBalance: ${userBalance}`);
      // "0.0000000000001" for 1e18
      const depositAmount = toWantUnit('0.001', true);

      await vault.connect(self).deposit(depositAmount);
      console.log(`await want.balanceOf(selfAddress): ${await want.balanceOf(selfAddress)}`);

      await vault.connect(self).withdraw(depositAmount);
      console.log(`await want.balanceOf(selfAddress): ${await want.balanceOf(selfAddress)}`);
      const newUserVaultBalance = await vault.balanceOf(selfAddress);
      console.log(`newUserVaultBalance: ${newUserVaultBalance}`);
      const userBalanceAfterWithdraw = await want.balanceOf(selfAddress);
      const securityFee = 10;
      const percentDivisor = 10000;
      const withdrawFee = (depositAmount * securityFee) / percentDivisor;
      const expectedBalance = userBalance.sub(withdrawFee);
      const isSmallBalanceDifference = expectedBalance.sub(userBalanceAfterWithdraw) < 100;
      console.log(`expectedBalance: ${expectedBalance}`);
      console.log(`userBalanceAfterWithdraw: ${userBalanceAfterWithdraw}`);
      // expect(isSmallBalanceDifference).to.equal(true);
    });

    xit('should be able to harvest', async function () {
      await vault.connect(self).deposit(toWantUnit(1000, true));
      const estimatedGas = await strategy.estimateGas.harvest();
      console.log(`estimatedGas: ${estimatedGas}`);
      await strategy.connect(self).harvest();
    });

    xit('should provide yield', async function () {
      const timeToSkip = 3600;
      const initialUserBalance = await want.balanceOf(selfAddress);
      const depositAmount = initialUserBalance.div(10);

      await vault.connect(self).deposit(depositAmount);
      const initialVaultBalance = await vault.balance();

      await strategy.updateHarvestLogCadence(timeToSkip / 2);

      const numHarvests = 2;
      for (let i = 0; i < numHarvests; i++) {
        await moveTimeForward(timeToSkip);
        await vault.connect(self).deposit(depositAmount);
        await strategy.harvest();
      }

      const finalVaultBalance = await vault.balance();
      expect(finalVaultBalance).to.be.gt(initialVaultBalance);

      const averageAPR = await strategy.averageAPRAcrossLastNHarvests(numHarvests);
      console.log(`Average APR across ${numHarvests} harvests is ${averageAPR} basis points.`);
    });
  });
  xdescribe('Strategy', function () {
    it('should be able to pause and unpause', async function () {
      await strategy.pause();
      const depositAmount = toWantUnit('.05', true);
      await expect(vault.connect(self).deposit(depositAmount)).to.be.reverted;
      await strategy.unpause();
      await expect(vault.connect(self).deposit(depositAmount)).to.not.be.reverted;
    });

    it('should be able to panic', async function () {
      const depositAmount = toWantUnit('0.05', true);
      await vault.connect(self).deposit(depositAmount);
      const vaultBalance = await vault.balance();
      const strategyBalance = await strategy.balanceOf();
      await strategy.panic();
      expect(vaultBalance).to.equal(strategyBalance);
      const newVaultBalance = await vault.balance();
      // 1e18 "0.000000001"
      const allowedImprecision = toWantUnit('0.0000001', true);
      expect(newVaultBalance).to.be.closeTo(vaultBalance, allowedImprecision);
    });

    it('should be able to retire strategy', async function () {
      const depositAmount = toWantUnit('500', true);
      await vault.connect(self).deposit(depositAmount);
      const vaultBalance = await vault.balance();
      const strategyBalance = await strategy.balanceOf();
      expect(vaultBalance).to.equal(strategyBalance);
      // Test needs the require statement to be commented out during the test
      await expect(strategy.retireStrat()).to.not.be.reverted;
      const newVaultBalance = await vault.balance();
      const newStrategyBalance = await strategy.balanceOf();
      const allowedImprecision = toWantUnit('0.00000001');
      expect(newVaultBalance).to.be.closeTo(vaultBalance, allowedImprecision);
      expect(newStrategyBalance).to.be.lt(allowedImprecision);
    });

    it('should be able to retire strategy with no balance', async function () {
      // Test needs the require statement to be commented out during the test
      await expect(strategy.retireStrat()).to.not.be.reverted;
    });

    it('should be able to estimate harvest', async function () {
      const whaleDepositAmount = toWantUnit('27171', true);
      await vault.connect(wantWhale).deposit(whaleDepositAmount);
      const minute = 60;
      const hour = 60 * minute;
      const day = 24 * hour;
      await moveTimeForward(100 * day);
      await strategy.harvest();
      await moveTimeForward(10 * day);
      await vault.connect(wantWhale).deposit(toWantUnit('1', true));
      const [profit, callFeeToUser] = await strategy.estimateHarvest();
      console.log(`profit: ${profit}`);
      const hasProfit = profit.gt(0);
      const hasCallFee = callFeeToUser.gt(0);
      expect(hasProfit).to.equal(true);
      expect(hasCallFee).to.equal(true);
    });

    it('should be able to set withdraw slippage tolerance', async function () {
      const startingSlippageTolerance = await strategy.withdrawSlippageTolerance();
      console.log(`slippageTolerance ${startingSlippageTolerance}`);

      const newSlippage = 200;
      await strategy.setWithdrawSlippageTolerance(newSlippage);

      const endingSlippageTolerance = await strategy.withdrawSlippageTolerance();
      expect(endingSlippageTolerance).to.equal(newSlippage);
    });
  });
});
