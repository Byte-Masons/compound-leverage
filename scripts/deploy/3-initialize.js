async function main() {
  const vaultAddress = '0x4d6e4da4E7c3484544ccA52cAf1f8b4A75fE4928';
  const strategyAddress = '0x090D39F96c9e470f7eBb2B606b5BED4c7d1d304d';

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
