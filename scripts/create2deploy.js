// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const {
  deployContract,
  deployFactory,
  getCreate2Address,
  isDeployed,
} = require("solidity-create2-deployer");
const lunarContract = hre.artifacts.readArtifactSync("LunarToken");

// declare deployment parameters
const salt = "notAnotherShitToken";
const bytecode = lunarContract.bytecode;
const privateKey = process.env.INIT_PKEY;
const constructorTypes = ["address", "address", "address", "address"];
const constructorArgs = [
  "0x2080EA03Eb19A1EC5826da4BFCb8Fe14A8CfA4c7",
  "0x2080EA03Eb19A1EC5826da4BFCb8Fe14A8CfA4c7",
  "0x2080EA03Eb19A1EC5826da4BFCb8Fe14A8CfA4c7",
  "0x2080EA03Eb19A1EC5826da4BFCb8Fe14A8CfA4c7",
];
const provider = hre.ethers.provider;
const signer = new ethers.Wallet(privateKey, provider);

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  // Calculate contract address
  const computedAddress = getCreate2Address({
    salt: salt,
    contractBytecode: bytecode,
    constructorTypes: constructorTypes,
    constructorArgs: constructorArgs,
  });

  debugger;
  // Deploy contract
  const { txHash, address, receipt } = await deployContract({
    salt: salt,
    contractBytecode: bytecode,
    constructorTypes: constructorTypes,
    constructorArgs: constructorArgs,
    signer: signer,
  });

  // Query if contract deployed at address
  const success = await isDeployed(address, provider);

  // Deploy create2 factory (for local chains only)
  // const factoryAddress = await deployFactory(provider);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
