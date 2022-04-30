async function main() {
  const Treasury = await ethers.getContractFactory('ReaperTreasury');
  const treasury = await Treasury.deploy();

  await treasury.deployed();
  console.log('Treasury deployed to:', treasury.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
