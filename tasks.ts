import { task } from "hardhat/config";
import { MaxUint256 } from "@ethersproject/constants";
// import { normalizeHardhatNetworkAccountsConfig } from "hardhat/internal/core/providers/util";
// import { BN, bufferToHex, privateToAddress, toBuffer } from "ethereumjs-util";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, { ethers }) => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task(
  "accounts:pkeys",
  "Print the list of accounsts private keys",
  async (args, hre) => {}
);

// task("accounts", "Prints the list of accounts").setAction(async function (
//   taskArguments,
//   hre,
//   runSuper
// ) {
//   const networkConfig = hre.config.networks["mainnet"];

//   console.log(networkConfig.accounts);

//   const accounts = normalizeHardhatNetworkAccountsConfig(
//     networkConfig.accounts
//   );

//   console.log("Accounts");
//   console.log("========");

//   for (const [index, account] of accounts.entries()) {
//     const address = bufferToHex(privateToAddress(toBuffer(account.privateKey)));
//     const privateKey = bufferToHex(toBuffer(account.privateKey));
//     const balance = new BN(account.balance)
//       .div(new BN(10).pow(new BN(18)))
//       .toString(10);
//     console.log(`Account #${index}: ${address} (${balance} ETH)
// Private Key: ${privateKey}
// `);
//   }
// });

task("gas-price", "Prints gas price").setAction(async function (
  { address },
  { ethers }
) {
  const price = await ethers.provider.getGasPrice();

  console.log(
    "Gas price",
    ethers.utils.formatUnits(price.toString(), "gwei"),
    "gwei"
  );

  return price;
});

task("bytecode", "Prints bytecode").setAction(async function (
  { address },
  { ethers }
) {
  console.log("Bytecode", await ethers.provider.getCode(address));
});

task("feeder:feed", "Feed account")
  .addOptionalParam("account", "Account (team, deployer, etc.)", "deployer")
  .addOptionalParam("amount", "Amount", "1")
  .setAction(async function (
    { amount, account },
    { getNamedAccounts, ethers }
  ) {
    const accounts = await getNamedAccounts();

    if (!process.env.FEEDER_PRIVATE_KEY) {
      console.log("Please set FEEDER_PRIVATE_KEY");
      return;
    }
    const feeder = new ethers.Wallet(
      process.env.FEEDER_PRIVATE_KEY,
      ethers.provider
    );

    console.log(
      `Feeding account:${account} address:${accounts[account]} with amount:${amount}`
    );

    await (
      await feeder.sendTransaction({
        to: accounts[account],
        value: ethers.utils.parseEther(amount),
      })
    ).wait();
  });

task("feeder:feedall", "Feed all named accounts")
  .addOptionalParam("amount", "Amount", "0.01")
  .setAction(async function ({ amount }, hre) {
    const accounts = await hre.ethers.getNamedSigners();
    const { parseEther, formatEther } = hre.ethers.utils;

    for (const account in accounts) {
      const signer = accounts[account];
      const balance = await signer.getBalance();
      console.log(
        `Check if account:${account} balance:${formatEther(
          balance
        )} > amount:${amount}`
      );
      if (balance.lt(parseEther(amount))) {
        await hre.run("feeder:feed", { account, amount });
      }
    }
  });

task("feeder:return", "Return funds to feeder")
  .addOptionalParam("account", "Account (team, deployer, etc.)", "deployer")
  .setAction(async function ({ account }, { ethers: { getNamedSigners } }) {
    const accounts = await getNamedSigners();
    const signer = accounts[account];

    await (
      await signer.sendTransaction({
        to: process.env.FEEDER_PUBLIC_KEY,
        value: await signer.getBalance(),
      })
    ).wait();
  });

task("erc20:approve", "ERC20 approve")
  .addParam("token", "Token")
  .addParam("spender", "Spender address")
  .addOptionalParam("account", "Account (team, deployer, etc.)", "team")
  .addOptionalParam("deadline", "Deadline", MaxUint256.toString())
  .setAction(async function (
    { token, spender, account, deadline },
    { ethers }
  ) {
    const erc20 = await ethers.getContractFactory("ERC20Mock");
    const dToken = erc20.attach(token);

    console.log(
      `Approve spender:${spender} to spend amount:${deadline} on behalf of account:${account}`
    );

    await (
      await dToken
        .connect(await ethers.getNamedSigner(account))
        .approve(spender, deadline)
    ).wait();
  });

task("factory:set-fee-to", "Factory set fee to")
  .addParam("feeTo", "Fee To")
  .setAction(async function ({ feeTo }, { ethers }, runSuper) {
    const factory = await ethers.getContract("UniswapV2Factory");
    console.log(`Setting factory feeTo to ${feeTo} address`);
    await (
      await factory.connect(await ethers.getNamedSigner("team")).setFeeTo(feeTo)
    ).wait();
  });

// TODO: Test
task("router:add-liquidity", "Router add liquidity")
  .addParam("tokenA", "Token A")
  .addParam("tokenB", "Token B")
  .addParam("tokenADesired", "Token A Desired")
  .addParam("tokenBDesired", "Token B Desired")
  .addParam("tokenAMinimum", "Token A Minimum")
  .addParam("tokenBMinimum", "Token B Minimum")
  .addParam("to", "To")
  .addOptionalParam("deadline", "Deadline", MaxUint256.toString())
  .setAction(async function (
    {
      tokenA,
      tokenB,
      tokenADesired,
      tokenBDesired,
      tokenAMinimum,
      tokenBMinimum,
      to,
      deadline,
    },
    hre
  ) {
    const router = await hre.ethers.getContract("UniswapV2Router");
    await hre.run("erc20:approve", { token: tokenA, spender: router.address });
    await hre.run("erc20:approve", { token: tokenB, spender: router.address });
    await (
      await router
        .connect(await hre.ethers.getNamedSigner("team"))
        .addLiquidity(
          tokenA,
          tokenB,
          tokenADesired,
          tokenBDesired,
          tokenAMinimum,
          tokenBMinimum,
          to,
          deadline
        )
    ).wait();
  });

// TODO: Test
task("router:add-liquidity-eth", "Router add liquidity eth")
  .addParam("token", "Token")
  .addParam("tokenDesired", "Token Desired")
  .addParam("tokenMinimum", "Token Minimum")
  .addParam("ethMinimum", "ETH Minimum")
  .addParam("to", "To")
  .addOptionalParam("deadline", "Deadline", MaxUint256.toString())
  .setAction(async function (
    { token, tokenDesired, tokenMinimum, ethMinimum, to, deadline },
    hre
  ) {
    const router = await hre.ethers.getContract("UniswapV2Router");
    await hre.run("erc20:approve", { token, spender: router.address });
    await (
      await router
        .connect(await hre.ethers.getNamedSigner("team"))
        .addLiquidityETH(
          token,
          tokenDesired,
          tokenMinimum,
          ethMinimum,
          to,
          deadline
        )
    ).wait();
  });

task("lunarfarm:add", "Add pool to LunarFarm")
  .addParam("dtoken", "Deposit Token")
  .addParam("start", "Rewards start time")
  .addParam("end", "Rewards end time")
  .addOptionalParam("lps", "LUNAR per second (lps * 1e18)", "0.01")
  .addOptionalParam(
    "from",
    "Account to send LUNAR for the pool (team, deployer, etc.)",
    "treasury"
  )
  .addOptionalParam("account", "Account (team, deployer, etc.)", "team")
  .setAction(async function ({ dtoken, lps, start, end, from, account }, hre) {
    const lunarFarm = await hre.ethers.getContract("LunarFarm");
    const aSigner = await hre.ethers.getNamedSigner(account);
    const fromSigner = await hre.ethers.getNamedSigner(from);

    await hre.run("erc20:approve", {
      token: dtoken,
      spender: lunarFarm.address,
      account: from,
    });

    await (
      await lunarFarm
        .connect(aSigner)
        .add(
          dtoken,
          hre.ethers.utils.parseEther(lps),
          start,
          end,
          fromSigner.address
        )
    ).wait();
  });

task("lunarfarm:deposit", "LunarFarm deposit")
  .addParam("pid", "Pool ID")
  .addParam("amount", "Amount")
  .addOptionalParam("account", "Account (team, deployer, etc.)", "team")
  .addOptionalParam("to", "Address to deposit")
  .setAction(async function ({ pid, amount, account, to }, hre) {
    const lunarFarm = await hre.ethers.getContract("LunarFarm");
    const signer = await hre.ethers.getNamedSigner(account);
    if (!to) {
      to = signer.address;
    }
    const { dToken } = await lunarFarm.poolInfo(pid);

    await hre.run("erc20:approve", {
      token: dToken,
      spender: lunarFarm.address,
    });

    await (
      await lunarFarm.connect(signer).deposit(pid, amount, signer.address)
    ).wait();
  });

task("lunarfarm:withdraw", "LunarFarm withdraw")
  .addParam("pid", "Pool ID")
  .addParam("amount", "Amount")
  .addOptionalParam("account", "Account (team, deployer, etc.)", "team")
  .addOptionalParam("to", "Address to withdraw")
  .setAction(async function ({ pid, amount, account, to }, hre) {
    const lunarFarm = await hre.ethers.getContract("LunarFarm");
    const signer = await hre.ethers.getNamedSigner(account);
    if (!to) {
      to = signer.address;
    }
    const { dToken } = await lunarFarm.poolInfo(pid);

    await hre.run("erc20:approve", {
      token: dToken,
      spender: lunarFarm.address,
    });

    await (await lunarFarm.connect(signer).withdraw(pid, amount, to)).wait();
  });
