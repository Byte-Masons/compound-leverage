async function main() {
  const vaultAddress = '0xc146363891192890e42ef503979a675D3991CD42';
  const ERC20 = await ethers.getContractFactory('contracts/ERC20.sol:ERC20');
  const wantAddress = '0xB12BFcA5A55806AaF64E99521918A4bf0fC40802';
  const want = await ERC20.attach(wantAddress);
  await want.approve(vaultAddress, ethers.constants.MaxUint256);
  console.log('want approved');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
