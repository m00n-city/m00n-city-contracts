import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { LunarToken } from "../typechain/LunarToken";

let minter: SignerWithAddress,
  governance: SignerWithAddress,
  alice: SignerWithAddress,
  bob: SignerWithAddress,
  carol: SignerWithAddress;
let lunar: LunarToken;
let initialSupply: BigNumber;

describe("LunarToken", function () {
  before(async function () {
    [alice, bob, carol] = await ethers.getUnnamedSigners();
  });

  beforeEach(async function () {
    await deployments.fixture();

    lunar = (await ethers.getContract("LunarToken")) as LunarToken;

    const minterAddr = await lunar.minter();
    minter = await ethers.getSigner(minterAddr);

    const governanceAddr = await lunar.governance();
    governance = await ethers.getSigner(governanceAddr);

    lunar = lunar.connect(minter);

    initialSupply = await lunar.totalSupply();
  });

  it("should be able to set new governance", async function () {
    await expect(
      lunar.connect(bob).setGovernance(bob.address)
    ).to.be.revertedWith("LunarToken: only governance can perform this action");

    lunar.connect(governance).setGovernance(bob.address);

    const newGovernanceAddr = await lunar.governance();

    expect(newGovernanceAddr).to.equal(bob.address);
  });

  it("should be able to set new minter", async function () {
    await expect(lunar.connect(bob).setMinter(bob.address)).to.be.revertedWith(
      "LunarToken: only governance can perform this action"
    );

    lunar.connect(governance).setMinter(bob.address);

    const newMinterAddr = await lunar.minter();

    expect(newMinterAddr).to.equal(bob.address);
  });

  it("should have correct name, symbol and decimal", async function () {
    const name = await lunar.name();
    const symbol = await lunar.symbol();
    const decimals = await lunar.decimals();

    expect(name).to.equal("Lunar Token");
    expect(symbol).to.equal("LUNAR");
    expect(decimals).to.equal(18);
  });

  it("should only allow minter to mint token", async function () {
    await lunar.mint(alice.address, "100");
    await lunar.mint(bob.address, "1000");

    await expect(
      lunar.connect(bob).mint(carol.address, "1000")
    ).to.be.revertedWith("LunarToken: only minter can perform this action");

    const totalSupply = await lunar.totalSupply();
    const mintedSupply = totalSupply.sub(initialSupply);
    const aliceBal = await lunar.balanceOf(alice.address);
    const bobBal = await lunar.balanceOf(bob.address);
    const carolBal = await lunar.balanceOf(carol.address);

    expect(mintedSupply).to.equal("1100");
    expect(aliceBal).to.equal("100");
    expect(bobBal).to.equal("1000");
    expect(carolBal).to.equal("0");
  });

  it("should supply token transfers properly", async function () {
    await lunar.mint(alice.address, "100");
    await lunar.mint(bob.address, "1000");
    await lunar.connect(alice).transfer(carol.address, "10");
    await lunar.connect(bob).transfer(carol.address, "100");

    const totalSupply = await lunar.totalSupply();
    const mintedSupply = totalSupply.sub(initialSupply);
    const aliceBal = await lunar.balanceOf(alice.address);
    const bobBal = await lunar.balanceOf(bob.address);
    const carolBal = await lunar.balanceOf(carol.address);

    expect(mintedSupply).to.equal("1100");
    expect(aliceBal).to.equal("90");
    expect(bobBal).to.equal("900");
    expect(carolBal).to.equal("110");
  });

  it("should fail if you try to do bad transfers", async function () {
    await lunar.mint(alice.address, "100");

    await expect(
      lunar.connect(alice).transfer(carol.address, "110")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    await expect(
      lunar.connect(bob).transfer(carol.address, "1")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("should be able to burn your tokens", async function () {
    await lunar.mint(alice.address, "1000");

    let totalSupply = await lunar.totalSupply();
    let mintedSupply = totalSupply.sub(initialSupply);

    expect(mintedSupply).to.equal("1000");
    lunar.connect(alice).burn("500");

    totalSupply = await lunar.totalSupply();
    mintedSupply = totalSupply.sub(initialSupply);

    expect(mintedSupply).to.equal("500");
  });

  it("should fail if you try to burn more than you have", async function () {
    await lunar.mint(alice.address, "100");

    await expect(lunar.connect(alice).burn("110")).to.be.revertedWith(
      "ERC20: burn amount exceeds balance"
    );

    await expect(lunar.connect(bob).burn("1")).to.be.revertedWith(
      "ERC20: burn amount exceeds balance"
    );
  });

  it("should rescue ETH or ERC20 tokens sent to the smart contract by mistake", async function () {
    await lunar.mint(minter.address, "200");

    await lunar.connect(minter).transfer(lunar.address, 200);

    // only governance
    await expect(
      lunar.connect(alice).rescueTokens(lunar.address, bob.address, 200)
    ).to.be.revertedWith("LunarToken: only governance can perform this action");

    // try to send fund to 0 address
    await expect(
      lunar
        .connect(governance)
        .rescueTokens(
          alice.address,
          "0x0000000000000000000000000000000000000000",
          1000
        )
    ).to.be.revertedWith("LunarToken: can not send to zero address");

    // rescue all ETH from contract
    await expect(
      lunar
        .connect(governance)
        .rescueTokens(
          "0x0000000000000000000000000000000000000000",
          bob.address,
          0
        )
    ).to.be.revertedWith("LunarToken: trying to send 0 ethers");

    // rescue 100 tokens from contract
    await lunar
      .connect(governance)
      .rescueTokens(lunar.address, bob.address, 100);

    let bobBal = await lunar.balanceOf(bob.address);
    expect(bobBal).to.equal("100");

    // rescue the remaining tokens
    await lunar.connect(governance).rescueTokens(lunar.address, bob.address, 0);

    bobBal = await lunar.balanceOf(bob.address);

    expect(bobBal).to.equal("200");

    // try to rescue 0 tokens
    await expect(
      lunar.connect(governance).rescueTokens(lunar.address, bob.address, 0)
    ).to.be.revertedWith("LunarToken: trying to send 0 tokens");
  });
});
