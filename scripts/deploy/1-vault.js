async function main() {
  const Vault = await ethers.getContractFactory('ReaperVaultv1_3');

  const wantAddress = '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB';
  const tokenName = 'WETH BASTION Single Sided';
  const tokenSymbol = 'rf-cWETH';
  const approvalDelay = 0;
  const depositFee = 0;
  const tvlCap = ethers.utils.parseEther('5000');

  const vault = await Vault.deploy(wantAddress, tokenName, tokenSymbol, approvalDelay, depositFee, tvlCap);

  await vault.deployed();
  console.log('Vault deployed to:', vault.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
