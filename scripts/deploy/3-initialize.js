async function main() {
  const vaultAddress = '0xc146363891192890e42ef503979a675D3991CD42';
  const strategyAddress = '0x45BE5642e9C511a05e0b3a6560F8DC710aafdAA7';

  const Vault = await ethers.getContractFactory('ReaperVaultv1_3');
  const vault = Vault.attach(vaultAddress);

  // const options = { gasPrice: 2000000000000, gasLimit: 9000000 };
  await vault.initialize(strategyAddress);
  console.log('Vault initialized');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
