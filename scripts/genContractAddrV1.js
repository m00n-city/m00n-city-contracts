// require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const MNEMONIC =
  process.env.MNEMONIC ||
  "moon moon moon moon moon moon moon moon moon moon moon walk";

//lowercase
const PREFIX = "0xff";

function pathStr(index, path = "m/44'/60'/0'/0/") {
  return `${path}${index}`;
}

function* addrGen(hdNode, start = 0, end = 1000000) {
  let count = 0;
  for (let i = start; i < end; i++) {
    count++;
    yield hdNode.derivePath(pathStr(i));
  }
  return count;
}

const hdNode = ethers.utils.HDNode.fromMnemonic(MNEMONIC);

let all = 0;
aLoop: for (const newHdNode of addrGen(hdNode)) {
  const from = newHdNode.address;
  for (let nonce = 0; nonce <= 100; nonce++) {
    let contractAddr = ethers.utils.getContractAddress({ from, nonce });
    if (contractAddr.toLowerCase().startsWith(PREFIX)) {
      console.log(contractAddr);
      console.log(`path=${newHdNode.path}, nonce=${nonce}, all=${all}`);
      break aLoop;
    }
  }
  all++;
}
