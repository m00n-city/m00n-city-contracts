import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  network,
}: HardhatRuntimeEnvironment) {
  const { deploy, log } = deployments;
  const { deployer, team } = await getNamedAccounts();

  // two days in seconds
  const delay = 60 * 60 * 24 * 2;

  await deploy("Timelock", {
    from: deployer,
    args: [team, delay],
    log: true,
  });
};

async function skip({ network, deployments }: HardhatRuntimeEnvironment) {
  if (network.tags?.l2) {
    deployments.log(`L2 network. Not deploying Timelock.`);
    return true;
  }
  return false;
}

export default func;

func.tags = ["Timelock"];
func.dependencies = [];
func.skip = skip;
