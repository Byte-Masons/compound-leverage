async function main() {
  const PaymentSplitter = await ethers.getContractFactory('PaymentSplitter');
  const payees = [
    '0x1a20d7a31e5b3bc5f02c8a146ef6f394502a10c4',
    '0x1E71AEE6081f62053123140aacC7a06021D77348',
    '0x81876677843D00a7D792E1617459aC2E93202576',
  ];
  const shares = [100, 100, 100];
  const paymentSplitter = await PaymentSplitter.deploy(payees, shares);
  await paymentSplitter.deployed();
  console.log('PaymentSplitter deployed to:', paymentSplitter.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
