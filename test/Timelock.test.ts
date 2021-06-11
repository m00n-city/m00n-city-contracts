import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { increaseTime, blockTimestamp, time } from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Timelock } from "../typechain/Timelock";
import { LunarToken } from "../typechain/LunarToken";
import { AbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";
import { BytesLike } from "@ethersproject/bytes";

let team: SignerWithAddress,
  deployer: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  carol: SignerWithAddress;
let lunar: LunarToken;
let timelock: Timelock;
let abiCoder: AbiCoder;

describe("Timelock", function () {
  before(async function () {
    [alice, bob, carol] = await ethers.getUnnamedSigners();
    ({ team, deployer } = await ethers.getNamedSigners());
    abiCoder = new ethers.utils.AbiCoder();
  });

  beforeEach(async function () {
    await deployments.fixture();

    lunar = (await ethers.getContract("LunarToken", team)) as LunarToken;
    timelock = (await ethers.getContract("Timelock", team)) as Timelock;

    await lunar.setGovernance(timelock.address);
  });

  it("should be deployed with valid delay", async function () {
    const { deploy } = deployments;

    await expect(
      deploy("Timelock", {
        from: deployer.address,
        args: [team.address, time.days(1)],
        log: true,
      })
    ).to.be.revertedWith(
      "Timelock::constructor: Delay must exceed minimum delay."
    );

    await expect(
      deploy("Timelock", {
        from: deployer.address,
        args: [team.address, time.days(31)],
        log: true,
      })
    ).to.be.revertedWith(
      "Timelock::setDelay: Delay must not exceed maximum delay."
    );
  });

  it("should be able to set delay", async function () {
    await expect(timelock.setDelay(time.days(4))).to.be.revertedWith(
      "Timelock::setDelay: Call must come from Timelock."
    );

    const eta = (await blockTimestamp()) + time.days(3);

    // Delay must exceed minimum delay
    await timelock.queueTransaction(
      timelock.address,
      0,
      "setDelay(uint256)",
      abiCoder.encode(["uint256"], [time.days(1)]),
      eta
    );

    // Delay must not exceed maximum delay
    await timelock.queueTransaction(
      timelock.address,
      0,
      "setDelay(uint256)",
      abiCoder.encode(["uint256"], [time.days(31)]),
      eta
    );

    // Valid delay
    await timelock.queueTransaction(
      timelock.address,
      0,
      "setDelay(uint256)",
      abiCoder.encode(["uint256"], [time.days(4)]),
      eta
    );

    // move 3 day to pass timelock
    await increaseTime(time.days(3));

    // Delay must exceed minimum delay
    await expect(
      timelock.executeTransaction(
        timelock.address,
        0,
        "setDelay(uint256)",
        abiCoder.encode(["uint256"], [time.days(1)]),
        eta
      )
    ).to.be.reverted;

    // Delay must not exceed maximum delay
    await expect(
      timelock.executeTransaction(
        timelock.address,
        0,
        "setDelay(uint256)",
        abiCoder.encode(["uint256"], [time.days(31)]),
        eta
      )
    ).to.be.reverted;

    // Valid delay
    await timelock.executeTransaction(
      timelock.address,
      0,
      "setDelay(uint256)",
      abiCoder.encode(["uint256"], [time.days(4)]),
      eta
    );

    expect(await timelock.delay()).to.equal(time.days(4));
  });

  it("should be able to set new Admin", async function () {
    await expect(timelock.setPendingAdmin(alice.address)).to.be.revertedWith(
      "Timelock::setPendingAdmin: Call must come from Timelock."
    );

    const eta = (await blockTimestamp()) + time.days(3);

    await timelock.queueTransaction(
      timelock.address,
      0,
      "setPendingAdmin(address)",
      abiCoder.encode(["address"], [alice.address]),
      eta
    );

    // move 3 day to pass timelock
    await increaseTime(time.days(3));

    await timelock.executeTransaction(
      timelock.address,
      0,
      "setPendingAdmin(address)",
      abiCoder.encode(["address"], [alice.address]),
      eta
    );

    expect(await timelock.pendingAdmin()).to.equal(alice.address);

    // try to accept Admin
    await expect(timelock.acceptAdmin()).to.be.revertedWith(
      "Timelock::acceptAdmin: Call must come from pendingAdmin."
    );

    await timelock.connect(alice).acceptAdmin();

    expect(await timelock.admin()).to.equal(alice.address);
    expect(await timelock.pendingAdmin()).to.equal(
      "0x0000000000000000000000000000000000000000"
    );
  });

  it("should allow only admin to queueTransaction", async function () {
    const eta = (await blockTimestamp()) + time.days(4);
    const invalidEta = (await blockTimestamp()) + time.days(1);

    await expect(
      timelock
        .connect(alice)
        .queueTransaction(
          lunar.address,
          0,
          "setMinter(address)",
          abiCoder.encode(["address"], [alice.address]),
          eta
        )
    ).to.be.revertedWith(
      "Timelock::queueTransaction: Call must come from admin."
    );

    await expect(
      timelock.queueTransaction(
        lunar.address,
        0,
        "setMinter(address)",
        abiCoder.encode(["address"], [alice.address]),
        invalidEta
      )
    ).to.be.revertedWith(
      "Timelock::queueTransaction: Estimated execution block must satisfy delay."
    );

    const tx = await timelock.queueTransaction(
      lunar.address,
      0,
      "setMinter(address)",
      abiCoder.encode(["address"], [alice.address]),
      eta
    );
    await tx.wait();
  });

  it("should allow only admin to cancelTransaction", async function () {
    const eta = (await blockTimestamp()) + time.days(4);

    const tx = await timelock
      .connect(team)
      .queueTransaction(
        lunar.address,
        0,
        "setMinter(address)",
        abiCoder.encode(["address"], [alice.address]),
        eta
      );

    const res = await tx.wait();
    const txHash =
      (res &&
        res.events &&
        res.events[0] &&
        res.events[0].args &&
        res.events[0].args[0]) ||
      "";

    const txIsQueued = await timelock.queuedTransactions(txHash);

    expect(txIsQueued).to.equal(true);

    await expect(
      timelock
        .connect(alice)
        .cancelTransaction(
          lunar.address,
          0,
          "setMinter(address)",
          abiCoder.encode(["address"], [alice.address]),
          eta
        )
    ).to.be.revertedWith(
      "Timelock::queueTransaction: Call must come from admin."
    );

    const cancelTx = await timelock
      .connect(team)
      .cancelTransaction(
        lunar.address,
        0,
        "setMinter(address)",
        abiCoder.encode(["address"], [alice.address]),
        eta
      );

    const cancelTxRes = await cancelTx.wait();
    const cancelTxHash =
      (cancelTxRes &&
        cancelTxRes.events &&
        cancelTxRes.events[0] &&
        cancelTxRes.events[0].args &&
        cancelTxRes.events[0].args[0]) ||
      "";

    const cancelTxIsQueued = await timelock.queuedTransactions(cancelTxHash);

    expect(cancelTxIsQueued).to.equal(false);

    await expect(
      timelock
        .connect(team)
        .executeTransaction(
          lunar.address,
          0,
          "setMinter(address)",
          abiCoder.encode(["address"], [alice.address]),
          eta
        )
    ).to.be.revertedWith(
      "Timelock::executeTransaction: Transaction hasn't been queued."
    );
  });

  it("should do the timelock thing", async function () {
    const eta = (await blockTimestamp()) + time.days(4);
    const txArgs: [string, BigNumberish, string, BytesLike, BigNumberish] = [
      lunar.address,
      0,
      "setMinter(address)",
      abiCoder.encode(["address"], [alice.address]),
      eta,
    ];

    const txArgsStale: [
      string,
      BigNumberish,
      string,
      BytesLike,
      BigNumberish
    ] = [
      lunar.address,
      0,
      "setMinter(address)",
      abiCoder.encode(["address"], [alice.address]),
      eta + time.days(1),
    ];

    const txArgsNoSignature: [
      string,
      BigNumberish,
      string,
      BytesLike,
      BigNumberish
    ] = [
      lunar.address,
      0,
      "",
      abiCoder.encode(["address"], [alice.address]),
      eta,
    ];

    await timelock.queueTransaction(...txArgs);
    await timelock.queueTransaction(...txArgsStale);
    await timelock.queueTransaction(...txArgsNoSignature);

    await increaseTime(time.days(1));
    await expect(timelock.executeTransaction(...txArgs)).to.be.revertedWith(
      "Timelock::executeTransaction: Transaction hasn't surpassed time lock."
    );

    await increaseTime(time.days(4));
    await timelock.executeTransaction(...txArgs);
    expect(await lunar.minter()).to.equal(alice.address);

    const res = await timelock
      .executeTransaction(...txArgsNoSignature)
      .catch((err) => {
        return err.message;
      });

    expect(res).to.equal(
      "VM Exception while processing transaction: revert Timelock::executeTransaction: Transaction execution reverted."
    );

    await increaseTime(time.days(20));
    await expect(
      timelock.executeTransaction(...txArgsStale)
    ).to.be.revertedWith("Timelock::executeTransaction: Transaction is stale.");
  });
});
