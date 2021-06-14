import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  network,
}: HardhatRuntimeEnvironment) {
  const { deploy, get, log } = deployments;
  const { deployer, team, ido } = await getNamedAccounts();

  let [governance, minter, treasury] = [team, team, team];

  if (network.live) {
    const timelock = await get("Timelock");
    governance = minter = timelock.address;
  }

  log(`Deploying LunarToken(
      governance=${governance}, 
      minter=${minter}, 
      treasury=${treasury}, 
      ido=${ido}
  )`);

  await deploy("LunarToken", {
    from: deployer,
    args: [governance, minter, treasury, ido],
    log: true,
  });
};

async function skip({ network, deployments }: HardhatRuntimeEnvironment) {
  if (network.tags?.l2) {
    deployments.log(`L2 network. Not deploying LunarToken.`);
    return true;
  }
  return false;
}

export default func;

func.tags = ["LunarToken"];
func.dependencies = ["Timelock"];
func.skip = skip;
