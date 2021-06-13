import { ethers, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { increaseTime, time, getErc20Factory, ERC20Factory } from "../utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { LunarToken } from "../typechain/LunarToken";
import { InitialOfferingERC20 } from "../typechain/InitialOfferingERC20";
import { ERC20Mock } from "../typechain/ERC20Mock";
import { BigNumber } from "@ethersproject/bignumber";

let teamSigner: SignerWithAddress,
  idoSigner: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  carol: SignerWithAddress;
let lunar: LunarToken;
let initialOffering: InitialOfferingERC20;
let erc20Factory: ERC20Factory;
let ethL2: ERC20Mock;
let lunarDistributeAmount: BigNumber;

const { parseEther } = ethers.utils;
const { MaxUint256, Zero } = ethers.constants;

describe("InitialOfferingERC20", function () {
  before(async function () {
    [alice, bob, carol] = await ethers.getUnnamedSigners();
    ({ team: teamSigner, ido: idoSigner } = await ethers.getNamedSigners());
    erc20Factory = await getErc20Factory();
    lunarDistributeAmount = parseEther("400000");
  });

  beforeEach(async function () {
    const mintAmount = parseEther("15000");
    const transferAmount = parseEther("5000");

    await deployments.fixture();

    const contractFatory = await ethers.getContractFactory(
      "InitialOfferingERC20",
      teamSigner
    );

    lunar = (await ethers.getContract("LunarToken", teamSigner)) as LunarToken;

    ethL2 = await erc20Factory.deploy("ETH L2", "ETH", mintAmount);

    const start = time.now() + time.days(5);
    // START + 5 days
    const end = start + time.days(5);
    // 4% from TOTAL_AMOUNT
    const totalDistributeAmount = lunarDistributeAmount;
    const minimalProvideAmount = ethers.utils.parseEther("75");
    initialOffering = (await contractFatory.deploy(
      lunar.address,
      ethL2.address,
      start,
      end,
      totalDistributeAmount,
      minimalProvideAmount
    )) as InitialOfferingERC20;

    await lunar.mint(initialOffering.address, lunarDistributeAmount);

    await ethL2.transfer(alice.address, transferAmount);
    await ethL2.transfer(bob.address, transferAmount);
    await ethL2.transfer(carol.address, transferAmount);

    await ethL2.connect(alice).approve(initialOffering.address, MaxUint256);
    await ethL2.connect(bob).approve(initialOffering.address, MaxUint256);
    await ethL2.connect(carol).approve(initialOffering.address, MaxUint256);
  });

  it("IBCO amount is correct", async function () {
    const totalDistributeAmount = await initialOffering.totalDistributeAmount();

    expect(totalDistributeAmount).to.equal(lunarDistributeAmount);
  });

  it("should be able to receive wrapped ethers", async function () {
    const depositAmount = parseEther("1000");

    await expect(
      initialOffering.connect(alice).deposit(depositAmount)
    ).to.be.revertedWith("LUNAR IBCO: offering has not started yet");

    await increaseTime(time.days(5));

    await expect(() =>
      initialOffering.connect(alice).deposit(depositAmount)
    ).to.changeTokenBalance(ethL2, alice, Zero.sub(depositAmount));

    const aliceDeposit = await initialOffering.provided(alice.address);

    expect(aliceDeposit).to.equal(depositAmount);
    expect(await ethL2.balanceOf(initialOffering.address)).to.be.equal(
      depositAmount
    );

    await increaseTime(time.days(100));

    await expect(
      initialOffering.connect(alice).deposit(depositAmount)
    ).to.be.revertedWith("LUNAR IBCO: offering has already ended");
  });

  it("team should be able to withdraw unclaimed lunars 30 days after IBCO ends", async function () {
    await expect(
      initialOffering.connect(alice).withdrawUnclaimedLUNAR()
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      initialOffering.connect(teamSigner).withdrawUnclaimedLUNAR()
    ).to.be.revertedWith("LUNAR IBCO: Withdrawal unavailable yet");

    // 30 days after Initial offering ends
    await increaseTime(time.days(50));

    await expect(() =>
      initialOffering.connect(teamSigner).withdrawUnclaimedLUNAR()
    ).to.changeTokenBalance(lunar, teamSigner, lunarDistributeAmount);
  });

  describe("Successful IBCO", function () {
    it("investors should be able to claim lunars", async function () {
      await expect(initialOffering.connect(alice).claim()).to.be.reverted;

      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("10"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      await expect(initialOffering.connect(alice).claim()).to.be.revertedWith(
        "LUNAR IBCO: offering must be completed"
      );

      // bob invest 50 ETH
      await expect(() =>
        initialOffering.connect(bob).deposit(parseEther("50"))
      ).to.changeTokenBalance(ethL2, bob, parseEther("-50"));

      const bobDeposit = await initialOffering.provided(bob.address);

      expect(bobDeposit).to.equal(parseEther("50"));

      // carol invest 40 ETH
      await expect(() =>
        initialOffering.connect(carol).deposit(parseEther("40"))
      ).to.changeTokenBalance(ethL2, carol, parseEther("-40"));

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
        initialOffering.connect(teamSigner).withdrawProvidedETH()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 100 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("100"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-100"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("100"));

      // Initial offering ends
      await increaseTime(time.days(15));

      expect(await ethL2.balanceOf(initialOffering.address)).to.be.equal(
        parseEther("100")
      );

      await expect(async () => {
        await initialOffering.connect(teamSigner).withdrawProvidedETH();
      }).to.changeTokenBalance(ethL2, teamSigner, parseEther("100"));

      expect(await ethL2.balanceOf(initialOffering.address)).to.be.equal(0);
    });

    it("team should NOT be able to claim lunars", async function () {
      await expect(
        initialOffering.connect(alice).withdrawLUNAR()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(teamSigner).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 100 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("100"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-100"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("100"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(
        initialOffering.connect(teamSigner).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: The required amount has been provided");
    });
  });

  describe("Failed IBCO", function () {
    it("investors should be able to claim ethers", async function () {
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("10"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(5));

      // claiming when totalProvided < minimalProvideAmount -> refund ethers
      await expect(
        async () => await initialOffering.connect(alice).claim()
      ).to.changeTokenBalance(ethL2, alice, parseEther("10"));
    });

    it("team should NOT be able to claim ethers", async function () {
      await expect(
        initialOffering.connect(alice).withdrawProvidedETH()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(teamSigner).withdrawProvidedETH()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("10"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(
        initialOffering.connect(teamSigner).withdrawProvidedETH()
      ).to.be.revertedWith(
        "LUNAR IBCO: the required amount has not been provided"
      );
    });

    it("team should be able to claim lunars", async function () {
      await expect(
        initialOffering.connect(alice).withdrawLUNAR()
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        initialOffering.connect(teamSigner).withdrawLUNAR()
      ).to.be.revertedWith("LUNAR IBCO: offering must be completed");

      // Initial offering starts
      await increaseTime(time.days(5));

      // alice invest 10 ETH
      await expect(() =>
        initialOffering.connect(alice).deposit(parseEther("10"))
      ).to.changeTokenBalance(ethL2, alice, parseEther("-10"));

      const aliceDeposit = await initialOffering.provided(alice.address);

      expect(aliceDeposit).to.equal(parseEther("10"));

      // Initial offering ends
      await increaseTime(time.days(15));

      await expect(() =>
        initialOffering.connect(teamSigner).withdrawLUNAR()
      ).to.changeTokenBalance(lunar, teamSigner, lunarDistributeAmount);
    });
  });
});
