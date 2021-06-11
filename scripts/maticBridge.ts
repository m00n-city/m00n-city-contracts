import "dotenv/config";
process.env.HARDHAT_NETWORK = "goerli";

import hre from "hardhat";
import { MaticPOSClient } from "@maticnetwork/maticjs";
import { BigNumber } from "@ethersproject/bignumber";
import HDWalletProvider from "@truffle/hdwallet-provider";

const MNEMONIC = process.env.MNEMONIC;

if (!MNEMONIC) {
  console.log("Plese set MNEMONICS environment variable");
  process.exit(1);
}

const parentProvider = new HDWalletProvider({
  mnemonic: MNEMONIC,
  providerOrUrl: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
});

const maticProvider = new HDWalletProvider({
  mnemonic: MNEMONIC,
  providerOrUrl: `https://rpc-mumbai.maticvigil.com/v1/${process.env.MATICVIGIL_API_KEY}`,
});

const maticPOSClient = new MaticPOSClient({
  network: "testnet",
  version: "mumbai",
  parentProvider: parentProvider,
  maticProvider: maticProvider,
});

async function main() {
  const lunarDeployment = await hre.deployments.get("LunarToken");
  const lunarTokenAddr = lunarDeployment.address;
  const { treasury } = await hre.getNamedAccounts();
  const amount = hre.ethers.utils.parseEther("1000");

  const allowance = BigNumber.from(
    await maticPOSClient.getERC20Allowance(treasury, lunarTokenAddr)
  );

  if (allowance.lt(amount)) {
    console.log(`approveMaxERC20ForDeposit(
    ${lunarTokenAddr},
    {from: ${treasury}}
  )`);

    await maticPOSClient.approveMaxERC20ForDeposit(lunarTokenAddr, {
      from: treasury,
    });
  }

  console.log(`depositERC20ForUser(
    ${lunarTokenAddr},
    ${treasury}
    ${amount},
    {from: ${treasury}}
  )`);

  await maticPOSClient.depositERC20ForUser(
    lunarTokenAddr,
    treasury,
    amount.toString(),
    {
      from: treasury,
      // gasPrice: "10000000000",
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
