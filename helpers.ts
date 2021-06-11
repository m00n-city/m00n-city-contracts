import { HardhatRuntimeEnvironment } from "hardhat/types";
import { config } from "./config";

export async function getLunarTokenAddr(
  hre: HardhatRuntimeEnvironment
): Promise<string | undefined> {
  const { network, deployments } = hre;

  let lunarTokenAddress: string | undefined;
  if (network.tags.l2) {
    lunarTokenAddress = config.network[network.name]?.lunarToken?.address;
  } else {
    lunarTokenAddress = (await deployments.get("LunarToken")).address;
  }

  return lunarTokenAddress;
}
