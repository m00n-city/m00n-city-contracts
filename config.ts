export interface IConfig {
  network: INetwork;
}

export interface INetwork {
  [network: string]: any;
}

export const config: IConfig = {
  network: {
    "matic-mumbai": {
      lunarToken: {
        address: "0xfc6d7fed375e836168599e7316399c592232E40f",
      },
      ethL2: {
        address: "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa",
      },
    },
  },
};
