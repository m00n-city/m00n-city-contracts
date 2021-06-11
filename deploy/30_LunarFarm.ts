import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getLunarTokenAddr } from "../helpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, ethers, network } = hre;
  const { deploy, get, log } = deployments;
  const { deployer, team } = await getNamedAccounts();

  const lunarTokenAddress = await getLunarTokenAddr(hre);
  if (!lunarTokenAddress) {
    console.log("Please set lunarToken.address in config.ts");
    return;
  }

  log(`Deploying LunarFarm(
    ${lunarTokenAddress}, 
    ${team} 
  )`);

  await deploy("LunarFarm", {
    from: deployer,
    args: [lunarTokenAddress, team],
    log: true,
  });

  const lunarFarm = await ethers.getContract("LunarFarm");
  const lunarOwner = await lunarFarm.owner();
  if (lunarOwner === deployer) {
    log(`Transfer LunarFarm ownership from ${lunarOwner} to ${team}`);
    let tx = await lunarFarm.transferOwnership(team);
    await tx.wait();
  }
};

export default func;

func.tags = ["LunarFarm"];
func.dependencies = ["LunarToken"];
