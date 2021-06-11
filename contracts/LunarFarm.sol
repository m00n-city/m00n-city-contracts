// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./LunarToken.sol";

/** LunarFarm is a building constructed by the early lunar settlers
 for the purpouse of producing resources needed to survive on the moon.

 We do some fancy math here. Basically, any point in time, the amount of LUNARs
 entitled to a user but is pending to be distributed is:

    pending reward = (user.amount * pool.accLunarPerShare) - user.rewardDebt

 Whenever a user deposits or withdraws deposit tokens to a pool. Here's what happens:
    1. The pool's `accLunarPerShare` (and `lastRewardTime`) gets updated.
    2. User receives the pending reward sent to his/her address.
    3. User's `amount` gets updated.
    4. User's `rewardDebt` gets updated.

 Have fun reading it. Hopefully it's bug-free. God bless.
*/
contract LunarFarm is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Info of each user.
    /// `amount` Amount of deposit tokens the user has provided.
    /// `rewardDept` Reaward dept.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    /// @notice Info of each pool.
    /// `dToken` Address of deposit token contract.
    /// `lunarPerSecond` Lunar rewards per second.
    /// `startTime` Start of rewards time.
    /// `endTime` End of rewards time.
    /// `lastRewardTime` Last timestamp that LUNARs distribution occurs.
    /// `accLunarPerShare` Accumulated LUNARs per share, times ACC_PRECISION. See below.
    /// `depositAmount` Amount of deposited dTokens.
    struct PoolInfo {
        IERC20 dToken;
        uint256 lunarPerSecond;
        uint256 startTime;
        uint256 endTime;
        uint256 lastRewardTime;
        uint256 accLunarPerShare;
        uint256 depositAmount;
        uint256 lunarAmount;
    }

    IERC20 public lunar;
    /// @notice M00N City treasury address
    address public team;
    /// @notice Team reward delimiter.
    uint256 public constant TEAM_REWARD = 10;
    uint256 public teamRewardAmount;
    /// @notice Info of each pool.
    PoolInfo[] public poolInfo;
    /// @notice Info of each user that stakes Deposit tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    uint256 private constant ACC_PRECISION = 1e12;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount, address indexed to);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount, address indexed to);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        address indexed to
    );
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event AddPool(
        uint256 indexed pid,
        IERC20 indexed dToken,
        uint256 lunarPerSecond,
        uint256 startTime,
        uint256 endTime,
        uint256 rewardAmount
    );
    event IncreasePoolEndTime(uint256 indexed pid, uint256 secs);
    event WithdrawRemainingReward(uint256 indexed pid, uint256 amount, address indexed to);
    event UpdatePool(uint256 indexed pid, uint256 lastRewardTime, uint256 accLunarPerShare);

    constructor(LunarToken _lunar, address _team) {
        lunar = _lunar;
        team = _team;
    }

    modifier onlyTeam() {
        require(msg.sender == team, "LunarFarm: Only team can perform this action");
        _;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /// @notice Add a new deposit token to the pool. Can only be called by the owner.
    /// @dev DO NOT add the same Deposit token more than once. Rewards will be messed up if you do.
    /// @param _dToken Address of deposit token contract.
    /// @param _lunarPerSecond Lunar rewards per second.
    /// @param _startTime Start of rewards time.
    /// @param _endTime End of rewards time.
    /// @param _from The address from which to take the LUNARs for the pool rewards.
    function add(
        IERC20 _dToken,
        uint256 _lunarPerSecond,
        uint256 _startTime,
        uint256 _endTime,
        address _from
    ) public onlyOwner {
        uint256 lastRewardTime = block.timestamp > _startTime ? block.timestamp : _startTime;
        uint256 rewardAmount = (_endTime - _startTime) * _lunarPerSecond;
        rewardAmount += rewardAmount / TEAM_REWARD;

        poolInfo.push(
            PoolInfo({
                dToken: _dToken,
                lunarPerSecond: _lunarPerSecond,
                startTime: _startTime,
                endTime: _endTime,
                lastRewardTime: lastRewardTime,
                accLunarPerShare: 0,
                depositAmount: 0,
                lunarAmount: rewardAmount
            })
        );

        lunar.safeTransferFrom(address(_from), address(this), rewardAmount);
        emit AddPool(
            poolInfo.length - 1,
            _dToken,
            _lunarPerSecond,
            _startTime,
            _endTime,
            rewardAmount
        );
    }

    /// @notice Increase pool endTime.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _seconds Numer of seconds to be added.
    function increaseEndTime(
        uint256 _pid,
        uint256 _seconds,
        address _from
    ) public onlyOwner {
        PoolInfo storage pool = poolInfo[_pid];

        updatePool(_pid);
        uint256 rewardAmount = _seconds * pool.lunarPerSecond;
        rewardAmount += rewardAmount / TEAM_REWARD;

        pool.endTime += _seconds;
        pool.lunarAmount += rewardAmount;

        lunar.safeTransferFrom(address(_from), address(this), rewardAmount);
        emit IncreasePoolEndTime(_pid, _seconds);
    }

    /// @notice Withdraw remaining lunar pool reward.
    /// @dev If deposit was empty at some point in time when the pool was active, it may happen to have LUNARs left that where not distributed.
    /// @dev Better ensure that the pool is never empty between startTime and endTime and don't use this function.
    function withdrawRemainingReward(uint256 _pid, address _to) public onlyOwner {
        PoolInfo storage pool = poolInfo[_pid];
        require(block.timestamp > pool.endTime, "LunarFarm: pool is active");
        require(pool.depositAmount == 0, "LunarFarm: pool is not empty");

        uint256 amount = pool.lunarAmount;
        pool.lunarAmount = 0;

        lunar.safeTransfer(_to, amount);
        emit WithdrawRemainingReward(_pid, amount, _to);
    }

    /// @notice Return reward multiplier over the given _from to _to timestamp.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _from From timestamp.
    /// @param _to To timestamp.
    function getMultiplier(
        uint256 _pid,
        uint256 _from,
        uint256 _to
    ) public view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        if (_from > pool.endTime || _to < pool.startTime) {
            return 0;
        }
        _from = _from > pool.startTime ? _from : pool.startTime;
        _to = _to > pool.endTime ? pool.endTime : _to;

        return _to - _from;
    }

    /// @notice View function to see pending LUNAR on frontend.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _user Address of user.
    /// @return pending LUNAR reward for a given user.
    function pendingLunar(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accLunarPerShare = pool.accLunarPerShare;

        if (block.timestamp > pool.lastRewardTime && pool.depositAmount != 0) {
            uint256 multiplier = getMultiplier(_pid, pool.lastRewardTime, block.timestamp);
            uint256 lunarReward = multiplier * pool.lunarPerSecond;
            accLunarPerShare += (lunarReward * ACC_PRECISION) / pool.depositAmount;
        }
        return (user.amount * accLunarPerShare) / ACC_PRECISION - user.rewardDebt;
    }

    /// @notice Update reward variables for all pools.
    /// @dev Be careful of gas spending!
    function massUpdatePools() external {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /// @notice Update reward variables for all pools. Be careful of gas spending!
    /// @param pids Pool IDs of all to be updated. Make sure to update all active pools.
    function massUpdatePools(uint256[] calldata pids) external {
        uint256 len = pids.length;
        for (uint256 i = 0; i < len; ++i) {
            updatePool(pids[i]);
        }
    }

    /// @notice Update reward variables of the given pool.
    /// @param _pid The index of the pool. See `poolInfo`.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        if (block.timestamp <= pool.lastRewardTime) {
            return;
        }

        if (pool.depositAmount > 0) {
            uint256 multiplier = getMultiplier(_pid, pool.lastRewardTime, block.timestamp);
            uint256 poolReward = multiplier * pool.lunarPerSecond;
            uint256 teamReward = poolReward / TEAM_REWARD;

            teamRewardAmount += teamReward;
            pool.accLunarPerShare += (poolReward * ACC_PRECISION) / pool.depositAmount;
            pool.lunarAmount -= poolReward + teamReward;
        }

        pool.lastRewardTime = block.timestamp;
        emit UpdatePool(_pid, pool.lastRewardTime, pool.accLunarPerShare);
    }

    /// @notice Deposit dTokens for LUNAR allocation.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _amount dToken amount to deposit.
    /// @param _to The receiver of `amount` deposit benefit.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_to];

        updatePool(_pid);
        uint256 pendingLunar_ =
            (user.amount * pool.accLunarPerShare) / ACC_PRECISION - user.rewardDebt;
        user.amount += _amount;
        user.rewardDebt = (user.amount * pool.accLunarPerShare) / ACC_PRECISION;
        pool.depositAmount += _amount;

        pool.dToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        emit Deposit(msg.sender, _pid, _amount, _to);
        _harvest(_pid, pendingLunar_, _to);
    }

    /// @notice Harvest proceeds for transaction sender to `_to`.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _to Receiver of LUNAR rewards.
    function harvest(uint256 _pid, address _to) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);
        uint256 accumulatedLunar = (user.amount * pool.accLunarPerShare) / ACC_PRECISION;
        uint256 pendingLunar_ = accumulatedLunar - user.rewardDebt;
        user.rewardDebt = accumulatedLunar;

        _harvest(_pid, pendingLunar_, _to);
    }

    /// @dev Internal function. Should be called at the end of the calling function.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _amount dToken amount to deposit.
    /// @param _to The receiver of `amount` deposit benefit.
    function _harvest(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) internal {
        if (_amount > 0) {
            lunar.safeTransfer(_to, _amount);
        }

        emit Harvest(msg.sender, _pid, _amount);
    }

    /// @notice Withdraw deposit tokens from LunarFarm and harvest proceeds for transaction sender to `to`.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _amount Deposit tokens amount to withdraw.
    /// @param _to Receiver of the deposit tokens and LUNAR rewards.
    function withdraw(
        uint256 _pid,
        uint256 _amount,
        address _to
    ) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);
        pool.depositAmount -= _amount;
        uint256 pendingLunar_ =
            (user.amount * pool.accLunarPerShare) / ACC_PRECISION - user.rewardDebt;
        user.amount -= _amount;
        user.rewardDebt = (user.amount * pool.accLunarPerShare) / ACC_PRECISION;

        pool.dToken.safeTransfer(_to, _amount);
        emit Withdraw(msg.sender, _pid, _amount, _to);
        _harvest(_pid, pendingLunar_, _to);
    }

    /// @notice Withdraw without caring about rewards. EMERGENCY ONLY.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _to Receiver of the dTokens.
    function emergencyWithdraw(uint256 _pid, address _to) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 amount = user.amount;

        user.amount = 0;
        user.rewardDebt = 0;

        pool.dToken.safeTransfer(address(msg.sender), amount);
        emit EmergencyWithdraw(msg.sender, _pid, amount, _to);
    }

    /// @notice Update team address.
    /// @param _team New team address.
    function setTeam(address _team) public onlyTeam {
        team = _team;
    }

    /// @notice Withdraw team reward.
    function withdrawTeamReward() public onlyTeam {
        lunar.safeTransfer(team, teamRewardAmount);
    }
}
