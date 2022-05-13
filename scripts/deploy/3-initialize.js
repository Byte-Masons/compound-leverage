async function main() {
  const vaultAddress = '0x91155c72ea13BcbF6066dD161BECED3EB7c35e35';
  const strategyAddress = '0xd4416E67a616161e23fF7bD9ab4BcD45d6896183';

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
