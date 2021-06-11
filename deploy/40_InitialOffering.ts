import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { LunarToken } from "../typechain/LunarToken";
import { time } from "../test/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, ethers, network } = hre;
  const { deploy, get, log } = deployments;
  const { deployer, team, ido } = await getNamedAccounts();
  const idoSigner = await ethers.getSigner(ido);

  const lunarToken = (await ethers.getContract("LunarToken")) as LunarToken;

  // 5 days from now
  let start = time.now() + time.days(5);

  if (network.live) {
    // IBCO starts on 31.06.2021
    start = time.timestamp("2021-06-31");
  }
  // START + 5 days
  const end = start + time.days(5);
  // 4% from TOTAL_AMOUNT
  const totalDistributeAmount = ethers.utils.parseEther("400000");
  const minimalProvideAmount = ethers.utils.parseEther("35");

  log(`Deploying InitialOffering(
    ${lunarToken.address},     
    ${start},
    ${end},
    ${totalDistributeAmount},
    ${minimalProvideAmount}
  )`);

  await deploy("InitialOffering", {
    from: deployer,
    args: [
      lunarToken.address,
      start,
      end,
      totalDistributeAmount,
      minimalProvideAmount,
    ],
    log: true,
  });

  const initialOffering = await ethers.getContract("InitialOffering");
  const contractOwner = await initialOffering.owner();
  if (contractOwner === deployer) {
    log(`Transfer InitialOffering ownership from ${contractOwner} to ${team}`);
    let tx = await initialOffering.transferOwnership(team);
    await tx.wait();
  }

  const contractBalance = await lunarToken.balanceOf(initialOffering.address);
  const idoAddrBalance = await lunarToken.balanceOf(ido);
  log(
    `InitailOffering: ${
      initialOffering.address
    } has balance: ${contractBalance.toString()}`
  );
  log(`IDOAddress: ${ido} has balance: ${idoAddrBalance.toString()}`);

  if (
    idoAddrBalance.gte(totalDistributeAmount) &&
    contractBalance.lt(totalDistributeAmount)
  ) {
    const balanceInEthers = ethers.utils.formatEther(totalDistributeAmount);
    log(
      `Transfer ${balanceInEthers} LUNAR from ${ido} to ${initialOffering.address}`
    );
    lunarToken
      .connect(idoSigner)
      .transfer(initialOffering.address, totalDistributeAmount);
  }
};

export default func;

func.tags = ["InitialOffering"];
func.dependencies = ["LunarToken"];
