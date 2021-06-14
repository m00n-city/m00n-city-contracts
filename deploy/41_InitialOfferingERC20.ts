import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { LunarToken } from "../typechain/LunarToken";
import { time } from "../utils";
import { getLunarTokenAddr } from "../helpers";
import { config } from "../config";
import { InitialOfferingERC20 } from "../typechain/InitialOfferingERC20";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, ethers, network } = hre;
  const { deploy, get, log } = deployments;
  const { deployer, team, ido } = await getNamedAccounts();
  const idoSigner = await ethers.getSigner(ido);

  const lunarTokenAddress = await getLunarTokenAddr(hre);
  if (!lunarTokenAddress) {
    console.log("Please set lunarToken.address in config.ts");
    return;
  }
  const lunarToken = (await ethers.getContractAt(
    "LunarToken",
    lunarTokenAddress
  )) as LunarToken;

  const ethL2Addr = config.network[network.name]?.ethL2?.address;

  if (!ethL2Addr) {
    console.log("Please set ethL2.address in config.ts");
    return;
  }

  // 5 days from now
  let start = time.now() + time.days(5);

  if (network.live) {
    // IBCO starts on 31.06.2021
    start = time.timestamp("2021-06-31");
  }
  // START + 5 days
  const end = start + time.days(5);
  // 4% from TOTAL_AMOUNT
  const totalDistributeAmount = ethers.utils.parseEther("800000");
  const minimalProvideAmount = ethers.utils.parseEther("75");

  log(`Deploying InitialOfferingERC20(
    ${lunarToken.address},
    ${ethL2Addr},    
    ${start},
    ${end},
    ${totalDistributeAmount},
    ${minimalProvideAmount}
  )`);

  await deploy("InitialOfferingERC20", {
    from: deployer,
    args: [
      lunarToken.address,
      ethL2Addr,
      start,
      end,
      totalDistributeAmount,
      minimalProvideAmount,
    ],
    log: true,
  });

  const initialOfferingERC20 = (await ethers.getContract(
    "InitialOfferingERC20"
  )) as InitialOfferingERC20;
  const contractOwner = await initialOfferingERC20.owner();
  if (contractOwner === deployer) {
    log(
      `Transfer InitialOfferingERC20 ownership from ${contractOwner} to ${team}`
    );
    let tx = await initialOfferingERC20.transferOwnership(team);
    await tx.wait();
  }

  const idoAddrBalance = await lunarToken.balanceOf(ido);
  if (!idoAddrBalance.isZero()) {
    const balanceInEthers = ethers.utils.formatEther(idoAddrBalance);
    log(
      `Transfer ${balanceInEthers} LUNAR from ${ido} to ${initialOfferingERC20.address}`
    );
    lunarToken
      .connect(idoSigner)
      .transfer(initialOfferingERC20.address, idoAddrBalance);
  }
};

async function skip({ network, deployments }: HardhatRuntimeEnvironment) {
  if (!network.tags?.l2) {
    deployments.log(`Not L2 network. Not deploying InitialOfferingERC20.`);
    return true;
  }

  return false;
}

export default func;

func.tags = ["InitialOfferingERC20"];
func.skip = skip;
