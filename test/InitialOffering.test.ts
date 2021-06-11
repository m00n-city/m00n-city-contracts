import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { increaseTime, time } from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { LunarToken } from "../typechain/LunarToken";
import { InitialOffering } from "../typechain/InitialOffering";
import { BigNumber } from "@ethersproject/bignumber";

let team: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  carol: SignerWithAddress;
let lunar: LunarToken;
let initialOffering: InitialOffering;
let lunarDistributeAmount: BigNumber;

const { parseEther } = ethers.utils;

describe("InitialOffering", function () {
  before(async function () {
    [alice, bob, carol] = await ethers.getUnnamedSigners();
    ({ team } = await ethers.getNamedSigners());
    lunarDistributeAmount = parseEther("400000");
  });

  beforeEach(async function () {
    await deployments.fixture();

    lunar = (await ethers.getContract("LunarToken", team)) as LunarToken;
    initialOffering = (await ethers.getContract(
      "InitialOffering",
      team
    )) as InitialOffering;
  });

  it("IBCO amount is correct", async function () {
    const totalDistributeAmount = await initialOffering.totalDistributeAmount();

    expect(totalDistributeAmount).to.equal(lunarDistributeAmount);
  });

  it("should be able to receive ethers", async function () {
    const res = await alice
      .sendTransaction({
        to: initialOffering.address,
        value: 200,
      })
      .catch((err) => {
        return err.message;
      });

    expect(res).to.equal(
      "VM Exception while processing transaction: revert LUNAR IBCO: offering has not started yet"
    );

    await increaseTime(time.days(5));

    await expect(
      await alice.sendTransaction({
        to: initialOffering.address,
        value: parseEther("2"),
      })
    ).to.changeEtherBalance(alice, parseEther("-2"));

    const aliceDeposit = await initialOffering.provided(alice.address);

    expect(aliceDeposit).to.equal(parseEther("2"));

    await increaseTime(time.days(100));

    const res2 = await alice
      .sendTransaction({
        to: initialOffering.address,
        value: 200,
      })
      .catch((err) => {
        return err.message;
      });

    expect(res2).to.equal(
      "VM Exception while processing transaction: revert LUNAR IBCO: offering has already ended"
    );
  });

  it("team should be able to withdraw unclaimed lunars 30 days after IBCO ends", async function () {
    await expect(
      initialOffering.connect(alice).withdrawUnclaimedLUNAR()
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      initialOffering.connect(team).withdrawUnclaimedLUNAR()
    ).to.be.revertedWith("LUNAR IBCO: Withdrawal unavailable yet");

    // 30 days after Initial offering ends
    await increaseTime(time.days(50));

    await expect(() =>
      initialOffering.connect(team).withdrawUnclaimedLUNAR()
    ).to.changeTokenBalance(lunar, team, lunarDistributeAmount);
  });

  describe("Successful IBCO", function () {
    it("investors should be able to claim lunars", async function () {
      await expect(initialOffering.connect(alice).claim()).to.be.reverted;

      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("10"),
        })
      ).to.changeEtherBalance(alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      await expect(initialOffering.connect(alice).claim()).to.be.revertedWith(
        "LUNAR IBCO: offering must be completed"
      );

      // bob invest 50 ETH
      await expect(
        await bob.sendTransaction({
          to: initialOffering.address,
          value: parseEther("50"),
        })
      ).to.changeEtherBalance(bob, parseEther("-50"));

      const bobDeposit = await initialOffering.provided(bob.address);

      expect(bobDeposit).to.equal(parseEther("50"));

      // carol invest 40 ETH
      await expect(
        await carol.sendTransaction({
          to: initialOffering.address,
          value: parseEther("40"),
        })
      ).to.changeEtherBalance(carol, parseEther("-40"));

      const carolDeposit = await initialOffering.provided(carol.address);

      expect(carolDeposit).to.equal(parseEther("40"));

      // Initial offering ends
      await increaseTime(time.days(5));

      // claiming when IBCO min treshold is passed
      await initialOffering.connect(alice).claim();
      await initialOffering.connect(bob).claim();
      await initialOffering.connect(carol).claim();
      const aliceLunarBalance = await lunar
        .connect(alice)
        .balanceOf(alice.address);
      const bobLunarBalance = await lunar.connect(bob).balanceOf(bob.address);
      const carolLunarBalance = await lunar
        .connect(carol)
        .balanceOf(carol.address);

      const totalDistributeAmount = await initialOffering.totalDistributeAmount();

      // 10% of the IBCO
      expect(aliceLunarBalance).to.be.equal(
        totalDistributeAmount.mul(10).div(100)
      );
      // 50% of the IBCO
      expect(bobLunarBalance).to.be.equal(
        totalDistributeAmount.mul(50).div(100)
      );
      // 40% of the IBCO
      expect(carolLunarBalance).to.be.equal(
        totalDistributeAmount.mul(40).div(100)
      );

      // claiming 0 tokens
      await expect(initialOffering.connect(alice).claim()).to.be.revertedWith(
        "LUNAR IBCO: sender has nothing to claim"
      );
    });

    it("team should be able to claim ethers", async function () {
      await expect(
        initialOffering.connect(alice).withdrawProvidedETH()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(team).withdrawProvidedETH()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 100 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("100"),
        })
      ).to.changeEtherBalance(alice, parseEther("-100"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("100"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(
        await initialOffering.connect(team).withdrawProvidedETH()
      ).to.changeEtherBalance(team, parseEther("100"));
    });

    it("team should NOT be able to claim lunars", async function () {
      await expect(
        initialOffering.connect(alice).withdrawLUNAR()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(team).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 100 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("100"),
        })
      ).to.changeEtherBalance(alice, parseEther("-100"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("100"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(
        initialOffering.connect(team).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: The required amount has been provided");
    });
  });

  describe("Failed IBCO", function () {
    it("investors should be able to claim ethers", async function () {
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("10"),
        })
      ).to.changeEtherBalance(alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(5));

      // claiming when totalProvided < minimalProvideAmount -> refund ethers
      await expect(
        await initialOffering.connect(alice).claim()
      ).to.changeEtherBalance(alice, parseEther("10"));
    });

    it("team should NOT be able to claim ethers", async function () {
      await expect(
        initialOffering.connect(alice).withdrawProvidedETH()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(team).withdrawProvidedETH()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("10"),
        })
      ).to.changeEtherBalance(alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(
        initialOffering.connect(team).withdrawProvidedETH()
      ).to.be.revertedWith(
        "LUNAR IBCO: the required amount has not been provided"
      );
    });

    it("team should be able to claim lunars", async function () {
      await expect(
        initialOffering.connect(alice).withdrawLUNAR()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(team).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(
        await alice.sendTransaction({
          to: initialOffering.address,
          value: parseEther("10"),
        })
      ).to.changeEtherBalance(alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(() =>
        initialOffering.connect(team).withdrawLUNAR()
      ).to.changeTokenBalance(lunar, team, lunarDistributeAmount);
    });
  });
});
