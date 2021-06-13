import { ethers } from "ethers";
import { HDNode } from "ethers/lib/utils";

export function* hdNodeGen(
  hdNode: HDNode,
  start = 0,
  end = 1000000,
  path = "m/44'/60'/0'/0/"
) {
  let count = 0;
  for (let i = start; i < end; i++) {
    count++;
    yield <[number, HDNode]>[i, hdNode.derivePath(`${path}${i}`)];
  }
  return count;
}

export function getMnemonicPKeys(mnemonic: string) {
  const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const pKeys = [];
  for (const [_, newHdNode] of hdNodeGen(hdNode, 0, 10)) {
    pKeys.push(newHdNode.privateKey);
  }
  return pKeys;
}

export function getAccountsPKeys() {
  if (!process.env.MNEMONIC) {
    throw "Set MNEMONIC environment variable";
  }
  if (!process.env.DEPLOYER_PKEY) {
    throw "Set DEPLOYER_PKEY environment variable";
  }

  const accounts = getMnemonicPKeys(process.env.MNEMONIC);
  accounts[0] = process.env.DEPLOYER_PKEY;

  return accounts;
}
