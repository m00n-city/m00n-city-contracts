import "dotenv/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "solidity-coverage";

import { removeConsoleLog } from "hardhat-preprocessor";
import { HardhatUserConfig } from "hardhat/types";

//// FIXME: Typechain used in tasks. First compile before uncomment the following line.
// import "./tasks";

const accounts = {
  mnemonic:
    process.env.MNEMONIC ||
    "moon moon moon moon moon moon moon moon moon moon moon walk",
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
          },
        },
      },
    ],
  },

  networks: {
    mainnet: {
      url: "https://cloudflare-eth.com",
      accounts,
      chainId: 1,
      tags: ["l1"],
    },
    localhost: {
      live: false,
      tags: ["local"],
    },
    hardhat: {
      forking: {
        enabled: process.env.HARDHAT_NETWORK_FORKING === "true",
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: Number(process.env.HARDHAT_NETWORK_BLOCK),
      },
      live: false,
      tags: ["local"],
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
      chainId: 3,
      tags: ["l1"],
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
      chainId: 4,
      tags: ["staging", "l1"],
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
      chainId: 5,
      tags: ["staging", "l1"],
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts,
      chainId: 42,
      tags: ["l1"],
    },
    moonbeam: {
      url: "https://rpc.testnet.moonbeam.network",
      accounts,
      chainId: 1287,
      tags: ["l2"],
    },
    arbitrum: {
      url: "https://kovan3.arbitrum.io/rpc",
      accounts,
      chainId: 79377087078960,
      tags: ["l2"],
    },
    fantom: {
      url: "https://rpcapi.fantom.network",
      accounts,
      chainId: 250,
      tags: ["l2"],
    },
    "fantom-testnet": {
      url: "https://rpc.testnet.fantom.network",
      accounts,
      chainId: 4002,
      tags: ["staging", "l2"],
    },
    matic: {
      url: "https://rpc-mainnet.maticvigil.com",
      accounts,
      chainId: 137,
      tags: ["l2"],
    },
    "matic-mumbai": {
      url: "https://rpc-mumbai.maticvigil.com/",
      accounts,
      chainId: 80001,
      tags: ["staging", "l2"],
    },
    xdai: {
      url: "https://rpc.xdaichain.com",
      accounts,
      chainId: 100,
      tags: ["l2"],
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      accounts,
      chainId: 56,
      tags: ["l2"],
    },
    "bsc-testnet": {
      url: "https://data-seed-prebsc-2-s3.binance.org:8545",
      accounts,
      chainId: 97,
      tags: ["staging", "l2"],
    },
  },

  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
      // 1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
    },
    team: {
      default: 1, // here this will by default take the second account as team (so in the test this will be a different account than the deployer)
      // 1: "", // on the mainnet the team could be a multi sig
      // 4: "", // on rinkeby
    },
    treasury: {
      default: 2,
    },
    ido: {
      default: 3,
    },
  },
  preprocess: {
    eachLine: removeConsoleLog(
      (hre) =>
        hre.network.name !== "hardhat" && hre.network.name !== "localhost"
    ),
  },

  gasReporter: {
    currency: "USD",
    enabled: process.env.GAS_REPORTER === "true",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    excludeContracts: ["contracts/mocks/"],
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
