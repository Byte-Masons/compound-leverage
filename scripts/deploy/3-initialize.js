async function main() {
  const vaultAddress = '0xBC29eB55b452bd28276a2119cb2465cE5996b2F8';
  const strategyAddress = '0xefcBf2bD622CE716d3344C09E77e7A74071E6CE2';

  const Vault = await ethers.getContractFactory('ReaperVaultv1_3');
  const vault = Vault.attach(vaultAddress);

  //const options = { gasPrice: 2000000000000, gasLimit: 9000000 };
  await vault.initialize(strategyAddress);
  console.log('Vault initialized');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
