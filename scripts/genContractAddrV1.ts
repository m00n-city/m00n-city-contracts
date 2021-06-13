import * as hre from "hardhat";
import { hdNodeGen } from "../utils";
const ethers = hre.ethers;

const MNEMONIC =
  process.env.MNEMONIC ||
  "moon moon moon moon moon moon moon moon moon moon moon walk";

//lowercase
const PREFIX = "0xffff";

const hdNode = ethers.utils.HDNode.fromMnemonic(MNEMONIC);

let all = 0;
aLoop: for (const newHdNode of hdNodeGen(hdNode)) {
  const from = newHdNode.address;
  for (let nonce = 0; nonce <= 10; nonce++) {
    let contractAddr = ethers.utils.getContractAddress({ from, nonce });
    if (contractAddr.toLowerCase().startsWith(PREFIX)) {
      console.log(contractAddr);
      console.log(`path=${newHdNode.path}, nonce=${nonce}, all=${all}`);
      break aLoop;
    }
  }
  all++;
}
