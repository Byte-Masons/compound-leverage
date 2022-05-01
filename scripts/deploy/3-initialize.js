async function main() {
  const vaultAddress = '0x4BbF1c510bFc7f3490BcB1Ae4e0851F7bA66e00F';
  const strategyAddress = '0x467A6D67E8Ac61a999Bc2c6AEA94DcE54160a7C2';

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
