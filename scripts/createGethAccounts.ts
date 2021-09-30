import hre from "hardhat";
const ethers = hre.ethers;
import { hdNodeGen } from "../utils/ethers";

const MNEMONIC =
  process.env.MNEMONIC ||
  "moon moon moon moon moon moon moon moon moon moon moon walk";

const provider = new ethers.providers.IpcProvider("/tmp/geth.ipc");
const hdNode = ethers.utils.HDNode.fromMnemonic(MNEMONIC);

async function main() {
  await provider.send("admin_stopHTTP", []);
  await provider.send("admin_stopWS", []);

  for (const [_, newHdNode] of hdNodeGen(hdNode, 0, 10)) {
    const privKey = newHdNode.privateKey.slice(2);
    //CREATE
    try {
      const res = await provider.send("personal_importRawKey", [privKey, ""]);
      console.log(`Created account: ${res}`);
    } catch (err) {
      console.log(err);
    }
    //UNLOCK
    try {
      const res = await provider.send("personal_unlockAccount", [
        newHdNode.address,
        "",
        0,
      ]);
      console.log(`Unlock account: ${res}`);
    } catch (err) {
      console.log(err);
    }
  }

  await provider.send("admin_startHTTP", ["localhost"]);
  // await provider.send("admin_startWS", ["localhost", 8546]);
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
