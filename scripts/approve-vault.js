async function main() {
  const vaultAddress = '0xBC29eB55b452bd28276a2119cb2465cE5996b2F8';
  const ERC20 = await ethers.getContractFactory('contracts/ERC20.sol:ERC20');
  const wantAddress = '0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d';
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
