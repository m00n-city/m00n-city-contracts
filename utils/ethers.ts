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
