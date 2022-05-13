async function main() {
  const vaultAddress = '0x3ea57D9EcDBfE1cDa19146641E227c07a6fcc574';
  const strategyAddress = '0x5822Bd137784182417B9c7dBC729427a508B348B';

  const Vault = await ethers.getContractFactory('ReaperVaultv1_3');
  const vault = Vault.attach(vaultAddress);

  await vault.initialize(strategyAddress);
  console.log('Vault initialized');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
