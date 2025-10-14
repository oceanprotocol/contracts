const { expect, assert } = require('chai');
const { ethers } = require('hardhat');

describe('EnterpriseFeeCollector', function () {
    let signers, owner, collector, user, token, feeCollector;

    beforeEach(async function () {
        signers = await ethers.getSigners();
        owner = signers[0];
        collector = signers[1];
        user = signers[2];

        // Deploy a mock ERC20 token
        const ERC20Mock = await ethers.getContractFactory('MockERC20');
        token = await ERC20Mock.deploy(owner.address,'TestToken', 'TT');
        await token.deployed();

        // Deploy EnterpriseFeeCollector
        const EnterpriseFeeCollector = await ethers.getContractFactory('EnterpriseFeeCollector');
        feeCollector = await EnterpriseFeeCollector.deploy(collector.address, owner.address);
        await feeCollector.deployed();
    });

    it('Should set collector and owner correctly', async function () {
        // Only owner can call owner() (from Ownable)
        expect(await feeCollector.owner()).to.equal(owner.address);
        // collector is private, so we can't read directly, but can test via withdraw
        await owner.sendTransaction({ to: feeCollector.address, value: ethers.utils.parseEther('1') });
        const collectorBalanceBefore = await ethers.provider.getBalance(collector.address);
        await feeCollector.connect(user).withdrawETH();
        const collectorBalanceAfter = await ethers.provider.getBalance(collector.address);
        expect(collectorBalanceAfter.sub(collectorBalanceBefore)).to.equal(ethers.utils.parseEther('1'));
    });

    it('Should allow owner to update token config and getToken', async function () {
        await expect(
            feeCollector.connect(user).updateToken(token.address, 1, 10, 5, false)
        ).to.be.revertedWith('Ownable: caller is not the owner');

        await expect(
            feeCollector.connect(owner).updateToken(ethers.constants.AddressZero, 1, 10, 5, false)
        ).to.be.revertedWith('OPFCommunityFeeCollector: invalid token contract address');

        await expect(
            feeCollector.connect(owner).updateToken(token.address, 10, 5, 5, false)
        ).to.be.revertedWith('OPFCommunityFeeCollector: minFee should be less than maxFee');

        await expect(
            feeCollector.connect(owner).updateToken(token.address, 1, 10, 0, false)
        ).to.be.revertedWith('OPFCommunityFeeCollector: feePercentage should be greater than 0 and less than or equal to 1e18');

        await feeCollector.connect(owner).updateToken(token.address, 1, 10, ethers.utils.parseEther('0.01'), true);
        const tokenInfo = await feeCollector.getToken(token.address);
        expect(tokenInfo.minFee).to.equal(1);
        expect(tokenInfo.maxFee).to.equal(10);
        expect(tokenInfo.feePercentage).to.equal(ethers.utils.parseEther('0.01'));
        expect(tokenInfo.allowed).to.equal(true);
    });

    it('Should check isTokenAllowed', async function () {
        await feeCollector.connect(owner).updateToken(token.address, 1, 10, ethers.utils.parseEther('0.01'), true);
        expect(await feeCollector.isTokenAllowed(token.address)).to.equal(true);
        await feeCollector.connect(owner).updateToken(token.address, 1, 10, ethers.utils.parseEther('0.01'), false);
        expect(await feeCollector.isTokenAllowed(token.address)).to.equal(false);
    });

    it('Should calculate fee correctly', async function () {
        // minFee = 5, maxFee = 100, feePercentage = 10% (0.1e18)
        await feeCollector.connect(owner).updateToken(token.address, 5, 100, ethers.utils.parseEther('0.1'), true);

        // fee = 10% of 20 = 2, but minFee is 5
        expect(await feeCollector.calculateFee(token.address, 20)).to.equal(5);

        // fee = 10% of 2000 = 200, but maxFee is 100
        expect(await feeCollector.calculateFee(token.address, 2000)).to.equal(100);

        // fee = 10% of 80 = 8, between min and max
        expect(await feeCollector.calculateFee(token.address, 80)).to.equal(8);
    });

    it('Should withdraw tokens to collector', async function () {
        await feeCollector.connect(owner).updateToken(token.address, 1, 10, ethers.utils.parseEther('0.01'), true);
        // Transfer tokens to contract
        await token.transfer(feeCollector.address, 100);
        const collectorBalanceBefore = await token.balanceOf(collector.address);
        await feeCollector.connect(user).withdrawToken(token.address);
        const collectorBalanceAfter = await token.balanceOf(collector.address);
        expect(collectorBalanceAfter.sub(collectorBalanceBefore)).to.equal(100);
    });

    it('Should revert withdrawToken with zero address', async function () {
        await expect(
            feeCollector.connect(user).withdrawToken(ethers.constants.AddressZero)
        ).to.be.revertedWith('OPFCommunityFeeCollector: invalid token contract address');
    });

    it('Should allow owner to change collector', async function () {
        await expect(
            feeCollector.connect(user).changeCollector(user.address)
        ).to.be.revertedWith('Ownable: caller is not the owner');

        await expect(
            feeCollector.connect(owner).changeCollector(ethers.constants.AddressZero)
        ).to.be.revertedWith('OPFCommunityFeeCollector: invalid collector address');

        await feeCollector.connect(owner).changeCollector(user.address);
    });
});