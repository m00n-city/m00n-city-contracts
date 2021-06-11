import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  getErc20Factory,
  increaseTime,
  blockTimestamp,
  time,
  mine,
  setAutomine,
  ERC20Factory,
} from "./utils";
import { LunarToken } from "../typechain/LunarToken";
import { LunarFarm } from "../typechain/LunarFarm";
import { ERC20Mock } from "../typechain/ERC20Mock";

const { utils } = ethers;
let minter: SignerWithAddress,
  team: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  carol: SignerWithAddress;
let lunar: LunarToken;
let lunarFarm: LunarFarm;
let erc20Factory: ERC20Factory;

const ACC_PRECISION = 1e12;
let TEAM_REWARD: number;

describe("LunarFarm", function () {
  before(async function () {
    [alice, bob, carol] = await ethers.getUnnamedSigners();
    ({ team, minter } = await ethers.getNamedSigners());
    erc20Factory = await getErc20Factory();
  });

  beforeEach(async function () {
    await deployments.fixture();

    lunar = (await ethers.getContract("LunarToken", team)) as LunarToken;
    lunarFarm = (await ethers.getContract("LunarFarm", team)) as LunarFarm;

    TEAM_REWARD = (await lunarFarm.TEAM_REWARD()).toNumber();

    const mintAmount = utils.parseEther("10000000");
    await lunar.mint(team.address, mintAmount);
    await lunar.approve(lunarFarm.address, mintAmount);
  });

  describe("#add()", function () {
    it("should allow only owner to add a new pool", async function () {
      const game1 = await erc20Factory.deploy(
        "Game1 Token",
        "GAME1",
        utils.parseEther("1000")
      );

      const start = await blockTimestamp();
      const end = start + time.days(10);

      await expect(
        lunarFarm
          .connect(alice)
          .add(lunar.address, 100, start, end, alice.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await lunarFarm.add(lunar.address, 100, start, end, team.address);
      expect(await lunarFarm.poolLength(), "test").to.be.equal(1);

      await lunarFarm.add(game1.address, 100, start, end, team.address);
      expect(await lunarFarm.poolLength()).to.be.equal(2);
    });

    it("should transfer appropriate amount of LUNARs to LunarFarm", async function () {
      const game1 = await erc20Factory.deploy(
        "Game1 Token",
        "GAME1",
        utils.parseEther("1000")
      );

      const g1LunarPerSec = 13;
      const g1Start = (await blockTimestamp()) + time.days(5);
      const g1End = g1Start + time.days(11);
      let g1ExpectedLunar = (g1End - g1Start) * g1LunarPerSec;
      g1ExpectedLunar += g1ExpectedLunar / TEAM_REWARD;

      await lunarFarm.add(
        game1.address,
        g1LunarPerSec,
        g1Start,
        g1End,
        team.address
      );

      expect(await lunar.balanceOf(lunarFarm.address)).to.be.equal(
        g1ExpectedLunar
      );

      const game2 = await erc20Factory.deploy(
        "Game2 Token",
        "GAME2",
        utils.parseEther("1000")
      );

      const g2LunarPerSec = 23;
      const g2Start = (await blockTimestamp()) + time.days(5);
      const g2End = g2Start + time.days(17);
      let g2ExpectedLunar = (g2End - g2Start) * g2LunarPerSec;
      g2ExpectedLunar += g2ExpectedLunar / TEAM_REWARD;

      await lunarFarm.add(
        game2.address,
        g2LunarPerSec,
        g2Start,
        g2End,
        team.address
      );

      expect(await lunar.balanceOf(lunarFarm.address)).to.be.equal(
        g1ExpectedLunar + g2ExpectedLunar
      );
    });
  });

  describe("#increaseEndTime()", function () {
    it("should allow only owner to increase pool endTime", async function () {
      const game1 = await erc20Factory.deploy(
        "Game1 Token",
        "GAME1",
        utils.parseEther("1000")
      );

      const g1LunarPerSec = 13;
      const g1Start = (await blockTimestamp()) + time.days(5);
      const g1End = g1Start + time.days(11);
      let g1ExpectedLunar = (g1End - g1Start) * g1LunarPerSec;
      g1ExpectedLunar += g1ExpectedLunar / TEAM_REWARD;

      await lunarFarm.add(
        game1.address,
        g1LunarPerSec,
        g1Start,
        g1End,
        team.address
      );

      expect(await lunar.balanceOf(lunarFarm.address)).to.be.equal(
        g1ExpectedLunar
      );

      let rewardAmount = time.days(1) * g1LunarPerSec;
      rewardAmount += rewardAmount / TEAM_REWARD;

      await lunarFarm.increaseEndTime(0, time.days(1), team.address);

      expect(await lunar.balanceOf(lunarFarm.address)).to.be.equal(
        g1ExpectedLunar + rewardAmount
      );
    });
  });

  describe("#getMultiplier()", function () {
    it("should return correct result", async function () {
      const start = (await blockTimestamp()) + time.days(5);
      const end = start + time.days(10);

      await lunarFarm.add(lunar.address, 100, start, end, team.address);

      // _to < start
      expect(
        await lunarFarm.getMultiplier(
          0,
          start - time.days(2),
          start - time.days(1)
        )
      ).to.be.equal(0);

      // _to == start
      expect(
        await lunarFarm.getMultiplier(0, start - time.days(2), start)
      ).to.be.equal(0);

      // _from > end
      expect(
        await lunarFarm.getMultiplier(0, end + time.days(1), end + time.days(2))
      ).to.be.equal(0);

      // _from == end
      expect(
        await lunarFarm.getMultiplier(0, end, end + time.days(2))
      ).to.be.equal(0);

      // _from < start, _to > end
      expect(
        await lunarFarm.getMultiplier(
          0,
          start - time.days(1),
          end + time.days(1)
        )
      ).to.be.equal(end - start);
    });
  });

  describe("#massUpdatePools()", function () {
    it("should be able to update multiple pools", async function () {
      const mintAmount = 1000000000;
      const transferAmount = 1000;
      const depositAmount = 10;
      const [game1Pid, game2Pid, game3Pid] = [0, 1, 2];
      const lunarPerSec = 20;

      const game1: ERC20Mock = await erc20Factory.deploy(
        "Game1 Token",
        "GAME1",
        mintAmount
      );
      const game2: ERC20Mock = await erc20Factory.deploy(
        "Game2 Token",
        "GAME2",
        mintAmount
      );
      const game3: ERC20Mock = await erc20Factory.deploy(
        "Game3 Token",
        "GAME3",
        mintAmount
      );

      await game1.transfer(alice.address, transferAmount);
      await game2.transfer(alice.address, transferAmount);
      await game3.transfer(alice.address, transferAmount);

      const start = await blockTimestamp();
      const end = start + time.days(10);
      await lunarFarm.add(game1.address, lunarPerSec, start, end, team.address);
      await lunarFarm.add(game2.address, lunarPerSec, start, end, team.address);
      await lunarFarm.add(game3.address, lunarPerSec, start, end, team.address);

      await game1.connect(alice).approve(lunarFarm.address, depositAmount);
      await game2.connect(alice).approve(lunarFarm.address, depositAmount);
      await game3.connect(alice).approve(lunarFarm.address, depositAmount);

      await lunarFarm
        .connect(alice)
        .deposit(game1Pid, depositAmount, alice.address);
      await lunarFarm
        .connect(alice)
        .deposit(game2Pid, depositAmount, bob.address);
      await lunarFarm
        .connect(alice)
        .deposit(game3Pid, depositAmount, carol.address);

      await increaseTime(time.days(11));

      await lunarFarm["massUpdatePools(uint256[])"]([game1Pid, game2Pid]);

      const update1 = await blockTimestamp();

      const { lastRewardTime: lastRewardTimeP1 } = await lunarFarm.poolInfo(
        game1Pid
      );

      const { lastRewardTime: lastRewardTimeP2 } = await lunarFarm.poolInfo(
        game2Pid
      );

      expect(lastRewardTimeP1.toNumber()).to.equals(update1);

      expect(lastRewardTimeP2.toNumber()).to.equals(update1);

      await increaseTime(time.days(5));

      await lunarFarm["massUpdatePools()"]();

      const update2 = await blockTimestamp();

      const { lastRewardTime: lastRewardTimeP1_1 } = await lunarFarm.poolInfo(
        game1Pid
      );

      const { lastRewardTime: lastRewardTimeP2_1 } = await lunarFarm.poolInfo(
        game2Pid
      );

      let { lastRewardTime: lastRewardTimeP3_1 } = await lunarFarm.poolInfo(
        game3Pid
      );

      expect(lastRewardTimeP1_1.toNumber()).to.equals(update2);
      expect(lastRewardTimeP2_1.toNumber()).to.equals(update2);
      expect(lastRewardTimeP3_1.toNumber()).to.equals(update2);
    });
  });

  context("With ERC20 tokens added", function () {
    let game1: ERC20Mock;
    const mintAmount = 1000000000;
    const transferAmount = 1000;
    const depositAmount = 10;
    const game1Pid = 0;
    const lunarPerSec = 20;

    beforeEach(async function () {
      //lunar.mint(lunarFarm.address, mintAmount);

      game1 = await erc20Factory.deploy("Game1 Token", "GAME1", mintAmount);

      await game1.transfer(alice.address, transferAmount);
      await game1.transfer(bob.address, transferAmount);
      await game1.transfer(carol.address, transferAmount);

      const start = await blockTimestamp();
      const end = start + time.days(10);
      await lunarFarm.add(game1.address, lunarPerSec, start, end, team.address);
    });

    afterEach(function () {
      // ensure automine is true before each test
      return setAutomine(true);
    });

    describe("#deposit()", function () {
      it("should emit Harvest and Deposit", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await expect(
          lunarFarm
            .connect(alice)
            .deposit(game1Pid, depositAmount, alice.address)
        )
          .to.emit(lunarFarm, "Harvest")
          .withArgs(alice.address, game1Pid, 0)
          .to.emit(lunarFarm, "Deposit")
          .withArgs(alice.address, game1Pid, depositAmount, alice.address);
      });

      it("should not give reward when outside of start & end", async function () {
        const game2 = await erc20Factory.deploy(
          "Game2 Token",
          "GAME2",
          mintAmount
        );
        await game2.transfer(alice.address, transferAmount);
        const start = (await blockTimestamp()) + time.days(5);
        const end = start + time.days(10);
        const game2Pid = 1;
        await lunarFarm.add(
          game2.address,
          lunarPerSec,
          start,
          end,
          team.address
        );

        await game2.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game2Pid, depositAmount, alice.address);

        await increaseTime(time.days(3));

        // outside reward period
        expect(
          await lunarFarm.pendingLunar(game2Pid, alice.address)
        ).to.be.equal(0);

        // inside reward period
        await increaseTime(time.days(3));

        expect(
          await lunarFarm.pendingLunar(game2Pid, alice.address)
        ).to.not.equal(0);

        // outside reward period
        await increaseTime(time.days(10));

        // reward should be equal to the pool max reward
        expect(
          await lunarFarm.pendingLunar(game2Pid, alice.address)
        ).to.be.equal((end - start) * lunarPerSec);

        await lunarFarm.connect(alice).harvest(game2Pid, alice.address);

        expect(
          await lunarFarm.pendingLunar(game2Pid, alice.address)
        ).to.be.equal(0);

        await increaseTime(time.days(10));

        expect(
          await lunarFarm.pendingLunar(game2Pid, alice.address)
        ).to.be.equal(0);
      });

      it("should update pool and make correct calculations", async function () {
        await setAutomine(false);

        //alice
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        const aliceBlock = await mine();

        const {
          amount: aliceAmount,
          rewardDebt: aliceRewardDept,
        } = await lunarFarm.userInfo(game1Pid, alice.address);

        const {
          lastRewardTime: aliceRewardTime,
          accLunarPerShare: aliceLunarPerShare,
        } = await lunarFarm.poolInfo(game1Pid);

        expect(aliceRewardTime).to.be.equal(aliceBlock.timestamp);
        expect(aliceAmount).to.be.equal(depositAmount);
        expect(aliceRewardDept).to.be.equal(0);
        expect(aliceLunarPerShare).to.be.equal(0);

        //bob
        await game1.connect(bob).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(bob)
          .deposit(game1Pid, depositAmount, bob.address);

        const bobBlock = await increaseTime(10);

        const {
          amount: bobAmount,
          rewardDebt: bobRewardDept,
        } = await lunarFarm.userInfo(game1Pid, bob.address);

        const {
          lastRewardTime: bobRewardTime,
          accLunarPerShare: bobLunarPerShare,
        } = await lunarFarm.poolInfo(game1Pid);

        const depositInterval = bobBlock.timestamp - aliceBlock.timestamp;
        expect(bobRewardTime).to.be.equal(bobBlock.timestamp);
        expect(bobAmount).to.be.equal(depositAmount);
        expect(bobLunarPerShare).to.be.equal(
          (depositInterval * lunarPerSec * ACC_PRECISION) / depositAmount
        );
        expect(bobRewardDept).to.be.equal(
          (depositAmount * bobLunarPerShare.toNumber()) / ACC_PRECISION
        );
      });
    });

    describe("#harvest()", function () {
      it("should emit harvest event", async function () {
        await expect(lunarFarm.connect(alice).harvest(game1Pid, alice.address))
          .to.emit(lunarFarm, "Harvest")
          .withArgs(alice.address, game1Pid, 0);
      });

      it("should reward the correct amount of LUNAR", async function () {
        await setAutomine(false);
        const bobDepositAmount = depositAmount * 3;

        // BLOCK1
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        // Nothing to harvest
        await lunarFarm.connect(alice).harvest(game1Pid, alice.address);
        const block1 = await mine();

        const { rewardDebt: aliceRewardDeptB1 } = await lunarFarm.userInfo(
          game1Pid,
          alice.address
        );

        expect(aliceRewardDeptB1).to.be.equal(0);
        expect(await lunar.balanceOf(alice.address)).to.be.equal(0);

        // BLOCK2
        await lunarFarm.connect(alice).harvest(game1Pid, alice.address);
        await game1.connect(bob).approve(lunarFarm.address, bobDepositAmount);
        await lunarFarm
          .connect(bob)
          .deposit(game1Pid, bobDepositAmount, bob.address);
        const block2 = await increaseTime(10);

        let aliceReward = (block2.timestamp - block1.timestamp) * lunarPerSec;
        expect(await lunar.balanceOf(alice.address)).to.be.equal(aliceReward);

        const { rewardDebt: aliceRewardDeptB2 } = await lunarFarm.userInfo(
          game1Pid,
          alice.address
        );
        expect(aliceRewardDeptB2).to.be.equal(aliceReward);

        const { rewardDebt: bobRewardDeptB2 } = await lunarFarm.userInfo(
          game1Pid,
          bob.address
        );

        // BLOCK3
        await lunarFarm.connect(alice).harvest(game1Pid, alice.address);
        await lunarFarm.connect(bob).harvest(game1Pid, bob.address);
        const block3 = await increaseTime(10);
        const reward = (block3.timestamp - block2.timestamp) * lunarPerSec;

        const aliceAmountB3 = await lunar.balanceOf(alice.address);
        const aliceRewardB3 = aliceAmountB3.toNumber() - aliceReward;
        const bobAmountB3 = await lunar.balanceOf(bob.address);
        const bobRewardB3 = bobAmountB3.toNumber();
        let { rewardDebt: bobRewardDeptB3 } = await lunarFarm.userInfo(
          game1Pid,
          bob.address
        );
        expect(reward).to.be.equal(bobRewardB3 + aliceRewardB3);
        expect(bobRewardB3).to.be.equal(aliceRewardB3 * 3);
        expect(bobRewardDeptB3.sub(bobRewardDeptB2)).to.be.equal(bobRewardB3);

        // BLOCK4 - harvest to different address
        await lunarFarm.connect(alice).harvest(game1Pid, alice.address);
        await lunarFarm.connect(bob).harvest(game1Pid, carol.address);
        const block4 = await increaseTime(10);
        const reward4 = (block4.timestamp - block3.timestamp) * lunarPerSec;

        const aliceAmountB4 = await lunar.balanceOf(alice.address);
        const aliceRewardB4 =
          aliceAmountB4.toNumber() - aliceReward - aliceRewardB3;
        const bobAmountB4 = await lunar.balanceOf(bob.address);
        const bobRewardB4 = bobAmountB4.toNumber() - bobRewardB3;
        const carolAmountB4 = await lunar.balanceOf(carol.address);
        const carolRewardB4 = carolAmountB4.toNumber();
        let { rewardDebt: bobRewardDeptB4 } = await lunarFarm.userInfo(
          game1Pid,
          bob.address
        );

        expect(reward4).to.be.equal(aliceRewardB4 + carolRewardB4);
        expect(bobRewardB4).to.be.equal(0);
        expect(carolRewardB4).to.be.equal(aliceRewardB4 * 3);
        expect(bobRewardDeptB4.sub(bobRewardDeptB3)).to.be.equal(carolRewardB4);
      });
    });

    describe("#withdraw()", function () {
      it("should be able to withdraw", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );

        await increaseTime(60);

        await lunarFarm
          .connect(alice)
          .withdraw(game1Pid, depositAmount, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(transferAmount);
      });

      it("should be able to deposit to different address", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, bob.address);

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );

        expect((await lunarFarm.userInfo(0, bob.address)).amount).to.equal(
          depositAmount
        );
      });

      it("should be able to harvest to different address", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );

        const block1 = await blockTimestamp();

        await increaseTime(60);

        await lunarFarm.connect(alice).harvest(game1Pid, bob.address);

        const block2 = await blockTimestamp();

        expect(await lunar.balanceOf(bob.address)).to.be.equal(
          (block2 - block1) * lunarPerSec
        );

        // expect(await game1.balanceOf(bob.address)).to.equal(
        //   transferAmount + depositAmount
        // );

        // expect(await game1.balanceOf(alice.address)).to.equal(
        //   transferAmount - depositAmount
        // );
      });

      it("should be able to withdraw to different address", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );

        await increaseTime(60);

        await lunarFarm
          .connect(alice)
          .withdraw(game1Pid, depositAmount, bob.address);

        expect(await game1.balanceOf(bob.address)).to.equal(
          transferAmount + depositAmount
        );

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );
      });

      it("should emit Harvest and Withdraw", async function () {
        await expect(
          lunarFarm.connect(alice).withdraw(game1Pid, 0, alice.address)
        )
          .to.emit(lunarFarm, "Harvest")
          .withArgs(alice.address, game1Pid, 0)
          .to.emit(lunarFarm, "Withdraw")
          .withArgs(alice.address, game1Pid, 0, alice.address);
      });

      it("should receive the correct amount of LUNAR as reward", async function () {
        await setAutomine(false);
        const aliceDepositAmount = depositAmount * 2;
        const bobDepositAmount = depositAmount * 3;

        // BLOCK1
        await game1
          .connect(alice)
          .approve(lunarFarm.address, aliceDepositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, aliceDepositAmount, alice.address);

        // Nothing to harvest
        await lunarFarm
          .connect(alice)
          .withdraw(game1Pid, depositAmount, alice.address);
        const block1 = await mine();

        const { rewardDebt: aliceRewardDeptB1 } = await lunarFarm.userInfo(
          game1Pid,
          alice.address
        );

        expect(aliceRewardDeptB1).to.be.equal(0);
        expect(await lunar.balanceOf(alice.address)).to.be.equal(0);

        // BLOCK2
        await game1.connect(bob).approve(lunarFarm.address, bobDepositAmount);
        await lunarFarm
          .connect(bob)
          .deposit(game1Pid, bobDepositAmount, bob.address);
        const block2 = await increaseTime(10);

        const aliceRewardB2 =
          (block2.timestamp - block1.timestamp) * lunarPerSec;
        expect(await lunarFarm.pendingLunar(game1Pid, alice.address)).to.equal(
          aliceRewardB2
        );

        // BLOCK3
        await lunarFarm
          .connect(alice)
          .withdraw(
            game1Pid,
            aliceDepositAmount - depositAmount,
            alice.address
          );
        await lunarFarm
          .connect(bob)
          .withdraw(game1Pid, bobDepositAmount, bob.address);
        const block3 = await increaseTime(10);
        const reward = (block3.timestamp - block1.timestamp) * lunarPerSec;

        const aliceAmountB3 = await lunar.balanceOf(alice.address);
        const aliceRewardB3 = aliceAmountB3.toNumber() - aliceRewardB2;
        const bobAmountB3 = await lunar.balanceOf(bob.address);
        const bobRewardB3 = bobAmountB3.toNumber();
        let {
          amount: bobGame1DepositAmount,
          rewardDebt: bobRewardDeptB3,
        } = await lunarFarm.userInfo(game1Pid, bob.address);
        expect(reward).to.be.equal(bobRewardB3 + aliceRewardB3 + aliceRewardB2);
        expect(bobRewardB3).to.be.equal(aliceRewardB3 * 3);
        expect(bobRewardDeptB3)
          .to.be.equal(bobGame1DepositAmount)
          .to.be.equal(0);
      });
    });

    describe("#emergencyWithdraw()", function () {
      it("should allow to emergency withdraw", async function () {
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(
          transferAmount - depositAmount
        );

        await lunarFarm
          .connect(alice)
          .emergencyWithdraw(game1Pid, alice.address);

        expect(await game1.balanceOf(alice.address)).to.equal(transferAmount);
      });
    });

    describe("#pendingLunar()", function () {
      it("should return correct amount", async function () {
        setAutomine(false);

        // BLOCK 1
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);
        const block1 = await mine();

        // BLOCK 2
        const block2 = await increaseTime(777);

        const expectedAliceRewardB2 =
          (block2.timestamp - block1.timestamp) * lunarPerSec;

        expect(
          await lunarFarm.pendingLunar(game1Pid, alice.address)
        ).to.be.equal(expectedAliceRewardB2);

        // BLOCK 3
        await lunarFarm.updatePool(game1Pid);
        const block3 = await increaseTime(123);

        const expectedAliceRewardB3 =
          (block3.timestamp - block1.timestamp) * lunarPerSec;
        expect(
          await lunarFarm.pendingLunar(game1Pid, alice.address)
        ).to.be.equal(expectedAliceRewardB3);
      });
    });

    describe("#withdrawRemainingReward()", function () {
      it("team should be able to withdraw the remaining reward", async function () {
        await increaseTime(time.days(1));
        await game1.connect(alice).approve(lunarFarm.address, depositAmount);
        await lunarFarm
          .connect(alice)
          .deposit(game1Pid, depositAmount, alice.address);
        const depositTime = await blockTimestamp();

        await expect(
          lunarFarm.withdrawRemainingReward(game1Pid, bob.address)
        ).to.be.revertedWith("LunarFarm: pool is active");

        await increaseTime(time.days(10));

        let {
          lastRewardTime,
          lunarAmount,
          startTime,
        } = await lunarFarm.poolInfo(game1Pid);

        const poolReward = time.days(10) * lunarPerSec;
        const teamReward = poolReward / TEAM_REWARD;
        expect(lastRewardTime).to.be.equal(depositTime);
        expect(lunarAmount).to.be.equal(poolReward + teamReward);

        await expect(
          lunarFarm.withdrawRemainingReward(game1Pid, bob.address)
        ).to.be.revertedWith("LunarFarm: pool is not empty");

        await lunarFarm
          .connect(alice)
          .withdraw(game1Pid, depositAmount, alice.address);

        ({ lastRewardTime, lunarAmount } = await lunarFarm.poolInfo(game1Pid));

        let remainingReward =
          (depositTime - startTime.toNumber()) * lunarPerSec;
        remainingReward += remainingReward / TEAM_REWARD;
        expect(lunarAmount).to.be.equal(remainingReward);

        await lunarFarm.withdrawRemainingReward(game1Pid, bob.address);
        ({ lastRewardTime, lunarAmount } = await lunarFarm.poolInfo(game1Pid));

        expect(lunarAmount).to.be.equal(0);
        expect(await lunar.balanceOf(bob.address)).to.be.equal(remainingReward);
      });
    });
  });

  describe("Team", function () {
    it("should be able to change team address", async function () {
      await expect(
        lunarFarm.connect(alice).setTeam(alice.address)
      ).to.be.revertedWith("LunarFarm: Only team can perform this action");

      await lunarFarm.connect(team).setTeam(alice.address);

      expect(await lunarFarm.team()).to.equal(alice.address);
    });

    it("should be able to withdraw team reward", async function () {
      await expect(
        lunarFarm.connect(alice).withdrawTeamReward()
      ).to.be.revertedWith("LunarFarm: Only team can perform this action");

      const teamLunarBalance = await lunar.balanceOf(team.address);

      await lunarFarm.connect(team).withdrawTeamReward();

      const teamRewardAmount = await lunarFarm.teamRewardAmount();

      expect(await lunar.balanceOf(team.address)).to.equal(
        BigNumber.from(teamLunarBalance).add(teamRewardAmount)
      );
    });
  });

  describe("Team", function () {
    it("should be able to change team address", async function () {
      await expect(
        lunarFarm.connect(alice).setTeam(alice.address)
      ).to.be.revertedWith("LunarFarm: Only team can perform this action");

      await lunarFarm.connect(team).setTeam(alice.address);

      expect(await lunarFarm.team()).to.equal(alice.address);
    });

    it("should be able to withdraw team reward", async function () {
      await expect(
        lunarFarm.connect(alice).withdrawTeamReward()
      ).to.be.revertedWith("LunarFarm: Only team can perform this action");

      const teamLunarBalance = await lunar.balanceOf(team.address);

      await lunarFarm.connect(team).withdrawTeamReward();

      const teamRewardAmount = await lunarFarm.teamRewardAmount();

      expect(await lunar.balanceOf(team.address)).to.equal(
        BigNumber.from(teamLunarBalance).add(teamRewardAmount)
      );
    });
  });
});
