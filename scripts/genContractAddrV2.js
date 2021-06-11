let hre = require("hardhat");
const ethers = hre.ethers;

// ethers.Wallet.createRandom().privateKey;
const initPrivKey = process.env.INIT_PKEY;

const POST_LEN = 9;
const INX = initPrivKey.length - POST_LEN;

function splitKey(privKey) {
  let prefix = privKey.substr(0, INX);
  let genPart = privKey.substr(INX);
  return [prefix, genPart];
}

let [prefix, gen] = splitKey(initPrivKey);
let genInt = parseInt(gen, 16);

for (let i = genInt; i <= 16 ** POST_LEN; i++) {
  let postfix = i.toString(16);
  let newPrivKey = `${prefix}${postfix}`;
  let from = ethers.utils.computeAddress(newPrivKey);
  let contractAddr = ethers.utils.getContractAddress({ from, nonce: 0 });
  if (contractAddr.toLowerCase().startsWith("0xABCDEF")) {
    console.log(contractAddr);
    console.log(`privKey=${newPrivKey}, nonce=${0}, all=${i - genInt}`);
    break;
  }
}
