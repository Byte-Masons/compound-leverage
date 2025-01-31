const hre = require('hardhat');

async function main() {
  const vaultAddress = '0x4BbF1c510bFc7f3490BcB1Ae4e0851F7bA66e00F';

  const Strategy = await ethers.getContractFactory('ReaperStrategyCompoundLeverage');
  const treasuryAddress = '0x17D099fc623bd06CFE4861d874704Af184773c75';
  const paymentSplitterAddress = '0x65E45D2f3f43b613416614c73f18fDD3AA2b8391';
  const strategist1 = '0x1E71AEE6081f62053123140aacC7a06021D77348';
  const strategist2 = '0x81876677843D00a7D792E1617459aC2E93202576';
  const strategist3 = '0x1A20D7A31e5B3Bc5f02c8A146EF6f394502a10c4';
  const superAdmin = '0x04C710a1E8a738CDf7cAD3a52Ba77A784C35d8CE';
  const admin = '0x539eF36C804e4D735d8cAb69e8e441c12d4B88E0';
  const guardian = '0xf20E25f2AB644C8ecBFc992a6829478a85A98F2c';
  const cWant = '0xe5308dc623101508952948b141fD9eaBd3337D99';

  // const options = { gasPrice: 2000000000000, gasLimit: 9000000 };

  const strategy = await hre.upgrades.deployProxy(
    Strategy,
    [
      vaultAddress,
      [treasuryAddress, paymentSplitterAddress],
      [strategist1, strategist2, strategist3],
      [superAdmin, admin, guardian],
      cWant,
    ],
    { kind: 'uups' },
  );
  await strategy.deployed();
  console.log('Strategy deployed to:', strategy.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
